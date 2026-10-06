import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { recordEmailActivity, recordEmailEvent } from '../crm/notify'
import { emailKey } from '../crm/normalize'
import { evaluateTransactionalSend, ledgerFor } from '../crm/suppression'
import type { EmailKind, EmailOutboxStatus } from '../crm/vocabulary'
import { readEmailConfig, type EmailConfig } from './config'
import { resolveSending, withSending } from './profiles'
import { MAX_ATTEMPTS, failureCode, gateRecipient, nextAttemptAt } from './gate'
import { renderSalesAlert, textToHtml, type Rendered } from './messages'
import { isApproved, templateByCode, textOf } from '../crm/settings/templates'
import { greetingFor, renderTemplate, responseSentence } from './templates'
import { createTransport, formatFrom, type MailTransport } from './transport'

/**
 * Outbox worker (CRM email M1). Runs only in the runner role (exactly one replica), but is safe with more:
 * rows are claimed with `FOR UPDATE SKIP LOCKED` and a lease, so two workers never take the same row.
 *
 * For each claimed row, in order:
 *   1. the send gate is re-checked against the CURRENT configuration (a switch to `off`, or an address
 *      taken off the allowlist, wins over a row queued earlier) → SUPPRESSED_BY_MODE;
 *   2. for the customer acknowledgement, the suppression ledger is re-checked → SUPPRESSED_BY_SUPPRESSION;
 *   3. the message is rendered from the RFQ as it is now and sent with the row's fixed Message-ID (a retry
 *      after a crash re-sends the same Message-ID, which receiving systems treat as one message);
 *   4. success → SENT; a permanent SMTP failure (5xx) or the last attempt → DEAD (dead-letter);
 *      anything else → RETRY at the next backoff step.
 * Every outcome writes an email event (ids and codes) and, when terminal, an RFQ timeline entry.
 *
 * Logs carry the outbox id, kind and outcome code only.
 */

export const LEASE_MS = 5 * 60_000
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle

export async function claimBatch(payload: Payload, now: Date, limit = 10): Promise<string[]> {
  const nowIso = now.toISOString()
  const lease = new Date(now.getTime() + LEASE_MS).toISOString()
  const res = await db(payload).execute(
    sql`UPDATE "crm_email_outbox" SET "status" = 'SENDING', "lease_until" = ${lease}, "attempts" = "attempts" + 1
        WHERE "id" IN (
          SELECT "id" FROM "crm_email_outbox"
          WHERE ("status" IN ('PENDING', 'RETRY') AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= ${nowIso}))
             OR ("status" = 'SENDING' AND ("lease_until" IS NULL OR "lease_until" < ${nowIso}))
          ORDER BY "created_at" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
        RETURNING "id"`,
  )
  return (res.rows ?? []).map((r) => String(r.id))
}

type Row = {
  id: string
  kind: EmailKind
  status: EmailOutboxStatus
  rfq: string | { id: string } | null
  conversation_message?: string | { id: string } | null
  to_address: string | null
  recipient_ref: string
  message_id: string | null
  attempts: number
}

const rfqIdOf = (r: Row): string | null =>
  r.rfq == null ? null : typeof r.rfq === 'object' ? String(r.rfq.id) : String(r.rfq)

async function setRow(payload: Payload, id: string, data: Record<string, unknown>): Promise<void> {
  await payload.update({
    collection: 'crm-email-outbox',
    id,
    data: data as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
  })
}

export function crmRfqUrl(rfqId: string, base = process.env.NEXT_PUBLIC_SERVER_URL ?? ''): string {
  return `${base.replace(/\/+$/, '')}/crm/rfqs/${encodeURIComponent(rfqId)}/`
}

async function render(
  payload: Payload,
  row: Row,
  cfg: EmailConfig,
): Promise<{ rendered: Rendered; rfq: Record<string, unknown>; reply?: ReplyMeta } | { rfq: Record<string, unknown>; suppressed: string } | null> {
  const rfqId = rfqIdOf(row)
  if (!rfqId) return null
  const rfq = (await payload.findByID({
    collection: 'crm-rfqs',
    id: rfqId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  const number = String(rfq.rfq_number ?? '')
  if (row.kind === 'RFQ_REPLY') {
    const mid =
      row.conversation_message == null
        ? null
        : typeof row.conversation_message === 'object'
          ? String(row.conversation_message.id)
          : String(row.conversation_message)
    if (!mid) return null
    const m = (await payload.findByID({
      collection: 'crm-email-messages',
      id: mid,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    return {
      rfq,
      rendered: {
        subject: String(m.subject ?? ''),
        text: String(m.body_text ?? ''),
        html: String(m.body_html ?? ''),
      },
      reply: {
        messageId: mid,
        replyTo: typeof m.reply_to === 'string' ? m.reply_to : null,
        inReplyTo: typeof m.in_reply_to === 'string' ? m.in_reply_to : null,
        references: typeof m.references === 'string' ? m.references : null,
      },
    }
  }
  if (row.kind === 'RFQ_CUSTOMER_ACK') {
    // Patch C: T1 is the approved template (the owner's wording). Unapproved, or a required field empty: not sent.
    const t1 = await templateByCode(payload, 'T1')
    if (!t1 || !isApproved(t1)) return { rfq, suppressed: 'T1_NOT_APPROVED' }
    const r = renderTemplate(textOf(t1), {
      rfq_number: number,
      greeting: greetingFor(((rfq.submitted ?? {}) as Record<string, unknown>).first_name),
      response_sentence: responseSentence(cfg.responsePromise),
    })
    if (!r.ok) return { rfq, suppressed: r.code }
    return { rfq, rendered: { subject: r.subject, text: r.text, html: textToHtml(r.text) } }
  }
  const items = await payload.find({
    collection: 'crm-rfq-items',
    where: { rfq: { equals: rfqId } },
    depth: 1,
    limit: 20,
    overrideAccess: true,
  })
  const products = items.docs
    .map((i) => {
      const item = i as unknown as {
        product?: { title?: unknown } | string | null
        product_title_source?: unknown
      }
      const p = item.product
      if (p && typeof p === 'object' && typeof p.title === 'string') return p.title
      return typeof item.product_title_source === 'string' ? item.product_title_source : null
    })
    .filter((t): t is string => Boolean(t))
  const submitted = (rfq.submitted ?? {}) as { company?: unknown }
  const attribution = (rfq.attribution ?? {}) as { page_path?: unknown; cta_placement?: unknown }
  return {
    rfq,
    rendered: renderSalesAlert({
      rfqNumber: number,
      company: typeof submitted.company === 'string' ? submitted.company : null,
      products,
      pagePath: typeof attribution.page_path === 'string' ? attribution.page_path : null,
      ctaPlacement: typeof attribution.cta_placement === 'string' ? attribution.cta_placement : null,
      crmUrl: crmRfqUrl(rfqId),
    }),
  }
}

type ReplyMeta = {
  messageId: string
  replyTo: string | null
  inReplyTo: string | null
  references: string | null
}

export type DrainResult = { claimed: number; sent: number; retried: number; dead: number; suppressed: number }

export async function processRow(
  payload: Payload,
  id: string,
  cfg: EmailConfig,
  transport: MailTransport | null,
  now: Date,
  noTransportCode?: string,
): Promise<keyof Omit<DrainResult, 'claimed'>> {
  const row = (await payload.findByID({
    collection: 'crm-email-outbox',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Row
  const rfqId = rfqIdOf(row)
  const base = {
    kind: row.kind,
    outbox: id,
    rfq: rfqId,
    recipient_ref: row.recipient_ref,
    attempt: row.attempts,
  }
  const terminal = async (
    status: EmailOutboxStatus,
    code: string | null,
    event: 'SUPPRESSED' | 'SENT' | 'DEAD_LETTERED',
    extra: Record<string, unknown> = {},
  ) => {
    const suppressed = status.startsWith('SUPPRESSED_')
    await setRow(payload, id, {
      status,
      lease_until: null,
      next_attempt_at: null,
      last_error_code: code,
      ...(suppressed ? { to_address: null, subject: null, body_text: null, body_html: null } : {}),
      ...extra,
    })
    await recordEmailEvent({ payload }, { ...base, event, code })
    const mid =
      row.conversation_message == null
        ? null
        : typeof row.conversation_message === 'object'
          ? String(row.conversation_message.id)
          : String(row.conversation_message)
    if (row.kind === 'RFQ_REPLY' && mid)
      await payload.update({
        collection: 'crm-email-messages',
        id: mid,
        data: {
          status: status === 'SENT' ? 'SENT' : status === 'DEAD' ? 'FAILED' : 'NOT_SENT',
          status_code: code,
          ...(status === 'SENT' ? { sent_at: now.toISOString() } : {}),
        } as never,
        depth: 0,
        overrideAccess: true,
        context: { crmServer: {} },
      })
    if (rfqId)
      await recordEmailActivity(
        { payload },
        { id: rfqId, ...(await rfqLinks(payload, rfqId)) },
        id,
        row.kind,
        status,
        code,
      )
  }

  const to = row.to_address ?? ''
  const gate = gateRecipient(cfg, to)
  if (gate !== 'SEND') {
    await terminal(
      gate === 'INVALID_RECIPIENT' ? 'SUPPRESSED_NO_RECIPIENT' : 'SUPPRESSED_BY_MODE',
      gate === 'INVALID_RECIPIENT' ? 'INVALID_RECIPIENT' : `MODE_${cfg.mode.toUpperCase()}`,
      'SUPPRESSED',
    )
    return 'suppressed'
  }
  if (row.kind === 'RFQ_CUSTOMER_ACK' && !cfg.customerAck) {
    await terminal('SUPPRESSED_ACK_DISABLED', 'CUSTOMER_ACK_OFF', 'SUPPRESSED')
    return 'suppressed'
  }
  if (row.kind === 'RFQ_CUSTOMER_ACK' || row.kind === 'RFQ_REPLY') {
    const key = emailKey(to)
    const decision = key
      ? evaluateTransactionalSend(await ledgerFor({ payload } as never, key.matchKey), true)
      : { allowed: false, blockedBy: ['NO_VALID_ADDRESS'] }
    if (!decision.allowed) {
      await terminal(
        'SUPPRESSED_BY_SUPPRESSION',
        ('blockedBy' in decision ? decision.blockedBy[0] : null) ?? 'SUPPRESSED',
        'SUPPRESSED',
      )
      return 'suppressed'
    }
  }

  if (!transport) {
    // Patch C: sending is on but no transport is usable (no active profile and no environment profile, or the active
    // profile fails closed). Not the message's fault: it waits and retries while an admin fixes the profile.
    return retryOrDead(payload, row, id, base, now, noTransportCode ?? 'NO_TRANSPORT', 'TRANSIENT', terminal)
  }

  const r = await render(payload, row, cfg)
  if (!r) {
    await terminal('DEAD', 'RFQ_MISSING', 'DEAD_LETTERED')
    return 'dead'
  }
  if ('suppressed' in r) {
    await terminal('SUPPRESSED_TEMPLATE', r.suppressed, 'SUPPRESSED')
    return 'suppressed'
  }
  await setRow(payload, id, {
    subject: r.rendered.subject,
    body_text: r.rendered.text,
    body_html: r.rendered.html,
  })
  try {
    await transport.send({
      from: formatFrom(cfg),
      to,
      subject: r.rendered.subject,
      text: r.rendered.text,
      html: r.rendered.html,
      messageId: row.message_id ?? undefined,
      ...(r.reply
        ? {
            // M2: a person's reply. Replies route back by the RFQ's token address; threading follows the
            // conversation. Not marked Auto-Submitted: a human wrote it, and the customer may answer it.
            replyTo: r.reply.replyTo ?? undefined,
            inReplyTo: r.reply.inReplyTo ?? undefined,
            references: r.reply.references ?? undefined,
          }
        : // RFC 3834: an automatic message. Receiving autoresponders must not answer it.
          { headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' } }),
    })
    await terminal('SENT', null, 'SENT', { sent_at: now.toISOString() })
    return 'sent'
  } catch (err) {
    const f = failureCode(err)
    return retryOrDead(payload, row, id, base, now, f.code, f.klass, terminal)
  }
}

type Terminal = (status: EmailOutboxStatus, code: string | null, event: 'SUPPRESSED' | 'SENT' | 'DEAD_LETTERED') => Promise<void>

/** A failed attempt: dead-letter on a permanent failure or the last attempt, otherwise retry at the next backoff step. */
async function retryOrDead(
  payload: Payload,
  row: Row,
  id: string,
  base: { kind: string; outbox: string; rfq: string | null; recipient_ref: string; attempt: number },
  now: Date,
  code: string,
  klass: string,
  terminal: Terminal,
): Promise<'retried' | 'dead'> {
  if (klass === 'PERMANENT' || row.attempts >= MAX_ATTEMPTS) {
    await terminal('DEAD', code, 'DEAD_LETTERED')
    return 'dead'
  }
  const next = nextAttemptAt(row.attempts, now)
  await setRow(payload, id, {
    status: 'RETRY',
    lease_until: null,
    next_attempt_at: next?.toISOString() ?? null,
    last_error_code: code,
  })
  await recordEmailEvent({ payload }, { ...base, event: 'ATTEMPT_FAILED', code })
  return 'retried'
}

async function rfqLinks(payload: Payload, rfqId: string): Promise<Record<string, unknown>> {
  try {
    const r = (await payload.findByID({
      collection: 'crm-rfqs',
      id: rfqId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    return { account: r.account, contact: r.contact }
  } catch {
    return {}
  }
}

export async function drainOutbox(
  payload: Payload,
  opts: { cfg?: EmailConfig; transport?: MailTransport | null; now?: Date; limit?: number } = {},
): Promise<DrainResult> {
  const envCfg = opts.cfg ?? readEmailConfig()
  const now = opts.now ?? new Date()
  const ownTransport = opts.transport === undefined
  // Patch C: the transport and sender come from the active sending profile (else the environment profile).
  let cfg = envCfg
  let noTransportCode: string | undefined
  if (ownTransport && envCfg.mode !== 'off') {
    const r = await resolveSending(payload, envCfg, 'TRANSACTIONAL')
    cfg = withSending(envCfg, r)
    if (!r.ok) noTransportCode = r.code
  }
  const transport = ownTransport ? createTransport(cfg) : (opts.transport ?? null)
  const result: DrainResult = { claimed: 0, sent: 0, retried: 0, dead: 0, suppressed: 0 }
  try {
    const ids = await claimBatch(payload, now, opts.limit ?? 10)
    result.claimed = ids.length
    for (const id of ids) {
      try {
        result[await processRow(payload, id, cfg, transport, now, noTransportCode)]++
      } catch (err) {
        // A bookkeeping failure leaves the row SENDING; its lease expires and it is claimed again.
        console.error(`[h2o] email outbox: row ${id} processing error ${failureCode(err).code}`)
      }
    }
  } finally {
    if (ownTransport) transport?.close()
  }
  if (result.claimed > 0)
    console.warn(
      `[h2o] email outbox: claimed=${result.claimed} sent=${result.sent} retried=${result.retried} dead=${result.dead} suppressed=${result.suppressed}`,
    )
  return result
}
