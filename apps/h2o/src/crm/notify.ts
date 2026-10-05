import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { readEmailConfig, type EmailConfig } from '../email/config'
import { gateRecipient, recipientRef } from '../email/gate'
import { recordActivity } from './activity'
import { relId } from './guards'
import { emailKey } from './normalize'
import { evaluateTransactionalSend, ledgerFor } from './suppression'
import type { EmailEvent, EmailKind, EmailOutboxStatus } from './vocabulary'

/**
 * CRM email M1 — E1 enqueue. Runs inside the RFQ's create transaction (collections/rfqs.ts `timeline`), so the
 * outbox rows commit or roll back with the RFQ. Nothing is transmitted here: a row is either PENDING (the
 * runner's outbox worker sends it, src/email/outbox-worker.ts) or terminal SUPPRESSED_* with the reason.
 *
 * Who gets what, for an RFQ received through the website (source_system TYPEFORM):
 *   - RFQ_SALES_ALERT  one row per H2O_SALES_ALERT_TO address (internal);
 *   - RFQ_CUSTOMER_ACK one row for the submitted address, once per RFQ, only if H2O_EMAIL_CUSTOMER_ACK=on.
 * Manually entered inquiries get neither: staff entered them, and the customer did not submit a form.
 *
 * Every decision is recorded: an email event (ids and codes only) and an RFQ timeline entry.
 */

type RfqDoc = Record<string, unknown> & { id: string | number; canonical_id?: string; rfq_number?: string }
type Ctx = PayloadRequest | { payload: Payload; user?: null }

const txOf = (req: Ctx) => ('headers' in req ? { req: req as PayloadRequest } : {})

export const messageIdFor = (cfg: Pick<EmailConfig, 'fromAddress'>): string => {
  const domain = cfg.fromAddress.includes('@')
    ? cfg.fromAddress.slice(cfg.fromAddress.lastIndexOf('@') + 1)
    : 'localhost'
  return `<${randomUUID()}@${domain}>`
}

export async function recordEmailEvent(
  req: Ctx,
  e: {
    event: EmailEvent
    kind: string
    code?: string | null
    outbox?: string | null
    rfq?: string | null
    recipient_ref?: string | null
    attempt?: number | null
  },
): Promise<void> {
  await req.payload.create({
    collection: 'crm-email-events',
    data: { ...e, occurred_at: new Date().toISOString() } as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
    ...txOf(req),
  })
}

const KIND_LABEL: Record<EmailKind, string> = {
  RFQ_SALES_ALERT: 'Sales alert',
  RFQ_CUSTOMER_ACK: 'Customer acknowledgement',
}

export async function recordEmailActivity(
  req: Ctx,
  rfq: RfqDoc | { id: string | number },
  outboxId: string,
  kind: EmailKind,
  status: EmailOutboxStatus,
  code?: string | null,
): Promise<void> {
  const r = rfq as RfqDoc
  const verb = status === 'SENT' ? 'sent' : status === 'DEAD' ? 'failed' : `not sent (${status})`
  await recordActivity(req, {
    type: 'EMAIL_NOTIFICATION',
    summary: `${KIND_LABEL[kind]} ${verb}`.slice(0, 240),
    idempotency_key: `email:${outboxId}:${status}`,
    rfq: String(r.id),
    account: relId(r.account),
    contact: relId(r.contact),
    detail: { outbox: outboxId, kind, status, code: code ?? null },
    actor_kind: 'SYSTEM',
  })
}

type Planned = {
  kind: EmailKind
  key: string
  to: string | null
  status: EmailOutboxStatus
  code: string | null
}

/** Pure planning step (unit-tested): which rows to write, and each row's initial status. */
export function planRfqNotifications(
  cfg: Pick<EmailConfig, 'mode' | 'allowlist' | 'salesAlertTo' | 'customerAck'>,
  rfq: { canonicalId: string; sourceSystem: unknown; submittedEmail: unknown },
  suppression: { allowed: boolean; blockedBy?: string[] },
  secret?: string,
): Planned[] {
  if (rfq.sourceSystem !== 'TYPEFORM') return []
  const out: Planned[] = []
  const gateStatus = (to: string): { status: EmailOutboxStatus; code: string | null } => {
    const g = gateRecipient(cfg, to)
    if (g === 'SEND') return { status: 'PENDING', code: null }
    if (g === 'INVALID_RECIPIENT') return { status: 'SUPPRESSED_NO_RECIPIENT', code: 'INVALID_RECIPIENT' }
    return { status: 'SUPPRESSED_BY_MODE', code: `MODE_${cfg.mode.toUpperCase()}` }
  }
  if (cfg.salesAlertTo.length === 0)
    out.push({
      kind: 'RFQ_SALES_ALERT',
      key: `rfq-sales-alert:${rfq.canonicalId}:none`,
      to: null,
      status: 'SUPPRESSED_NO_RECIPIENT',
      code: 'SALES_ALERT_TO_UNSET',
    })
  for (const to of cfg.salesAlertTo)
    out.push({
      kind: 'RFQ_SALES_ALERT',
      key: `rfq-sales-alert:${rfq.canonicalId}:${recipientRef(to, secret)}`,
      to,
      ...gateStatus(to),
    })

  const ackKey = `rfq-customer-ack:${rfq.canonicalId}`
  const email = emailKey(rfq.submittedEmail)
  if (!email)
    out.push({
      kind: 'RFQ_CUSTOMER_ACK',
      key: ackKey,
      to: null,
      status: 'SUPPRESSED_NO_RECIPIENT',
      code: 'NO_VALID_ADDRESS',
    })
  else if (!cfg.customerAck)
    out.push({
      kind: 'RFQ_CUSTOMER_ACK',
      key: ackKey,
      to: email.canonical,
      status: 'SUPPRESSED_ACK_DISABLED',
      code: 'CUSTOMER_ACK_OFF',
    })
  else if (!suppression.allowed)
    out.push({
      kind: 'RFQ_CUSTOMER_ACK',
      key: ackKey,
      to: email.canonical,
      status: 'SUPPRESSED_BY_SUPPRESSION',
      code: (suppression.blockedBy ?? ['SUPPRESSED'])[0] ?? 'SUPPRESSED',
    })
  else
    out.push({ kind: 'RFQ_CUSTOMER_ACK', key: ackKey, to: email.canonical, ...gateStatus(email.canonical) })
  return out
}

export async function enqueueRfqNotifications(
  req: Ctx,
  rfq: RfqDoc,
  cfg: EmailConfig = readEmailConfig(),
): Promise<number> {
  if (rfq.source_system !== 'TYPEFORM') return 0
  const submitted = (rfq.submitted ?? {}) as { email?: unknown }
  const email = emailKey(submitted.email)
  const suppression = email
    ? evaluateTransactionalSend(await ledgerFor(req as PayloadRequest, email.matchKey), true)
    : { allowed: false as const, blockedBy: ['NO_VALID_ADDRESS'] }
  const plan = planRfqNotifications(
    cfg,
    {
      canonicalId: String(rfq.canonical_id),
      sourceSystem: rfq.source_system,
      submittedEmail: submitted.email,
    },
    suppression,
  )
  let written = 0
  for (const p of plan) {
    const existing = await req.payload.find({
      collection: 'crm-email-outbox',
      where: { idempotency_key: { equals: p.key } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      ...txOf(req),
    })
    if (existing.docs.length > 0) continue
    const pending = p.status === 'PENDING'
    const ref = p.to ? recipientRef(p.to) : 'r_none'
    const row = await req.payload.create({
      collection: 'crm-email-outbox',
      data: {
        idempotency_key: p.key,
        kind: p.kind,
        status: p.status,
        rfq: String(rfq.id),
        recipient_ref: ref,
        // Suppressed rows keep no address: nothing will be sent, so nothing personal is retained for it.
        to_address: pending ? p.to : null,
        message_id: pending ? messageIdFor(cfg) : null,
        attempts: 0,
        next_attempt_at: pending ? new Date().toISOString() : null,
        last_error_code: p.code,
      } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      ...txOf(req),
    })
    const id = String((row as { id: string | number }).id)
    await recordEmailEvent(req, {
      event: pending ? 'QUEUED' : 'SUPPRESSED',
      kind: p.kind,
      code: pending ? null : p.code,
      outbox: id,
      rfq: String(rfq.id),
      recipient_ref: ref,
    })
    if (!pending) await recordEmailActivity(req, rfq, id, p.kind, p.status, p.code)
    written++
  }
  return written
}
