import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, type Payload } from 'payload'
import { messageIdFor, recordEmailActivity, recordEmailEvent } from '../crm/notify'
import { emailKey } from '../crm/normalize'
import { countryName } from '../crm/countries'
import { OFFICE_TIME_ZONE } from '../crm/offices'
import { evaluateTransactionalSend, ledgerFor } from '../crm/suppression'
import type { EmailKind, EmailOutboxStatus } from '../crm/vocabulary'
import { kindAllowed, readEmailConfig, readInboundConfig, type EmailConfig } from './config'
import { resolveSalesAddressLive } from './routing-read'
import { ersAdmission, isAddressBounce } from './ers-admission'
import { onSequenceRowTerminal } from '../crm/ers/engine'
import { checkHealth, recordHardBounce } from '../crm/ers/feedback'
import { ersSettings, inboundFresh } from '../crm/ers/settings'
import { resolveSending, withSending, type Resolved } from './profiles'
import { MAX_ATTEMPTS, classifyRefusal, failureCode, gateRecipient, nextAttemptAt, recipientRef, submissionOutcome } from './gate'
import { renderSalesAlert, textToHtml, type Rendered } from './messages'
import { isApproved, templateByCode, textOf } from '../crm/settings/templates'
import { greetingFor, renderTemplate, responseSentence } from './templates'
import { ensureReplyToken, replyToAddress } from '../crm/reply'
import { createTransport, formatFrom, type MailResult, type MailTransport } from './transport'

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
 *
 * SEND-FIX-1a (review R2-02, R2-03; owner 2026-10-08):
 *   - only the allowed kinds (H2O_EMAIL_ALLOWED_KINDS; launch = RFQ alert + T1) are submitted — checked again here,
 *     immediately before the mail server, so work queued before a switch-off never goes out (→ SUPPRESSED_BY_MODE);
 *   - every claim carries an owner token (fencing): only the worker that holds the lease may hand the row over;
 *   - before the message is handed over, the attempt intent and the transport identity are recorded (SUBMITTING);
 *   - an SMTP 250 is persisted (SENT) at once, before any other bookkeeping;
 *   - a definite refusal or a failure before DATA → RETRY / DEAD as before; anything else (no reply after DATA, a
 *     database failure after acceptance, a crash while SUBMITTING) → UNCERTAIN, held for a person and never sent
 *     again automatically ("Delivery unconfirmed — not automatically retried").
 * Every outcome writes an email event (ids and codes) and, when terminal, an RFQ timeline entry.
 *
 * Logs carry the outbox id, kind and outcome code only.
 */

export const LEASE_MS = 5 * 60_000
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle

export async function claimBatch(payload: Payload, now: Date, limit = 10, owner: string = randomUUID()): Promise<string[]> {
  const nowIso = now.toISOString()
  const lease = new Date(now.getTime() + LEASE_MS).toISOString()
  // SEND-FIX-1a: a SENDING row was never handed to the mail server (SUBMITTING is written first), so reclaiming an
  // expired one is safe. An expired SUBMITTING row is never claimed (holdInterrupted makes it UNCERTAIN).
  const res = await db(payload).execute(
    sql`UPDATE "crm_email_outbox" SET "status" = 'SENDING', "lease_until" = ${lease}, "lease_owner" = ${owner}, "attempts" = "attempts" + 1
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

/**
 * SEND-FIX-1a: rows left SUBMITTING by a worker that died (or whose database write failed) after handing the message
 * over may have been delivered: they become UNCERTAIN — held for a person, never sent again — with an event and an RFQ
 * timeline entry. Returns how many.
 */
export async function holdInterrupted(payload: Payload, now: Date): Promise<number> {
  const res = await db(payload).execute(
    sql`UPDATE "crm_email_outbox" SET "status" = 'UNCERTAIN', "lease_until" = NULL, "lease_owner" = NULL, "last_error_code" = 'SUBMISSION_INTERRUPTED'
        WHERE "status" = 'SUBMITTING' AND ("lease_until" IS NULL OR "lease_until" < ${now.toISOString()})
        RETURNING "id", "kind", "rfq_id", "recipient_ref", "attempts"`,
  )
  for (const r of res.rows ?? []) {
    const rfq = r.rfq_id == null ? null : String(r.rfq_id)
    await recordEmailEvent({ payload }, { event: 'UNCERTAIN', kind: String(r.kind), code: 'SUBMISSION_INTERRUPTED', outbox: String(r.id), rfq, recipient_ref: String(r.recipient_ref), attempt: Number(r.attempts) })
    if (rfq) await recordEmailActivity({ payload }, { id: rfq, ...(await rfqLinks(payload, rfq)) }, String(r.id), r.kind as EmailKind, 'UNCERTAIN', 'SUBMISSION_INTERRUPTED')
  }
  return (res.rows ?? []).length
}

/** SEND-FIX-1a: the transport identity of one lane, recorded on every attempt. Never a password or secret. */
export type AttemptIdentity = {
  lane: 'TRANSACTIONAL' | 'REVENUE'
  source: 'profile' | 'env' | 'none' | 'injected'
  profile_id: string | null
  host: string | null
  port: number | null
  account: string | null
  tls_servername: string | null
  envelope_from: string
  from: string
}
export function attemptIdentity(lane: AttemptIdentity['lane'], cfg: EmailConfig, r?: Resolved | null): AttemptIdentity {
  return {
    lane,
    source: r ? r.source : 'injected',
    profile_id: r?.profileId ?? null,
    host: cfg.smtp?.host ?? null,
    port: cfg.smtp?.port ?? null,
    account: cfg.smtp?.user ?? null,
    tls_servername: cfg.smtp?.servername ?? null,
    // nodemailer's envelope sender is the From address (no separate envelope is set)
    envelope_from: cfg.fromAddress,
    from: formatFrom(cfg),
  }
}

type Row = {
  id: string
  idempotency_key: string
  kind: EmailKind
  status: EmailOutboxStatus
  rfq: string | { id: string } | null
  conversation_message?: string | { id: string } | null
  to_address: string | null
  recipient_ref: string
  message_id: string | null
  attempts: number
  // Revenue Engine slice 1 (SEQUENCE_EMAIL rows carry their own render, reply address and unsubscribe link).
  enrollment?: string | { id: string } | null
  step_key?: string | null
  subject?: string | null
  body_text?: string | null
  body_html?: string | null
  reply_to?: string | null
  list_unsubscribe?: string | null
  recipient_domain?: string | null
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
): Promise<{ rendered: Rendered; rfq: Record<string, unknown>; reply?: ReplyMeta; ackReplyTo?: string | null } | { rfq: Record<string, unknown>; suppressed: string } | null> {
  // SEND-FIX-1a: the unprocessed-request alert has no RFQ; its words are on the row (no customer data)
  if (row.kind === 'INTAKE_FAILED_ALERT')
    return row.subject && row.body_text ? { rfq: {}, rendered: { subject: row.subject, text: row.body_text, html: textToHtml(row.body_text) } } : null
  const rfqId = rfqIdOf(row)
  if (!rfqId) return null
  if (row.kind === 'SEQUENCE_EMAIL')
    return row.subject && row.body_text
      ? { rfq: {}, rendered: { subject: row.subject, text: row.body_text, html: row.body_html ?? '' } }
      : null
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
    // SEND-FIX-1a (owner 2026-10-08): a customer who answers T1 (it invites drawings and photos) must reach a mailbox
    // people read. While inbound mail is off (launch), Reply-To is the monitored sales mailbox (ALERTS-1's live value:
    // Settings → Email routing, else H2O_RFQ_SALES_EMAIL, else the default);
    // once inbound is on, it is the RFQ's reply-token address (T-R3), so the answer threads onto the RFQ. A token that
    // can't be issued now throws: the row is claimed again later rather than sent without one.
    let ackReplyTo: string | null = await resolveSalesAddressLive(payload)
    if (readInboundConfig().enabled) {
      const token = await ensureReplyToken(await createLocalReq({}, payload), rfqId, new Date())
      ackReplyTo = cfg.fromAddress ? replyToAddress(cfg.fromAddress, token, cfg.replyTag) : ackReplyTo
    }
    return { rfq, rendered: { subject: r.subject, text: r.text, html: textToHtml(r.text) }, ackReplyTo }
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
  const submitted = (rfq.submitted ?? {}) as Record<string, unknown>
  const other = (submitted.other_answers ?? {}) as Record<string, unknown>
  const attribution = (rfq.attribution ?? {}) as { page_path?: unknown; cta_placement?: unknown }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  const office = str(rfq.office)
  const customer = emailKey(submitted.email)
  return {
    rfq,
    rendered: renderSalesAlert({
      rfqNumber: number,
      email: str(submitted.email),
      firstName: str(submitted.first_name),
      lastName: str(submitted.last_name),
      company: str(submitted.company),
      interest: str(other.interest),
      products,
      phone: str(submitted.phone),
      country: countryName(str(submitted.country_code)) ?? str(submitted.country_code),
      message: str(submitted.message),
      pageUrl: str(attribution.page_path) ? publicUrl(String(attribution.page_path)) : null,
      ctaPlacement: str(attribution.cta_placement),
      office,
      receivedAt: str(rfq.received_at) ?? str(rfq.createdAt),
      timeZone: office === 'TH' || office === 'US' ? OFFICE_TIME_ZONE[office] : 'UTC',
      crmUrl: crmRfqUrl(rfqId),
    }),
    // Owner launch requirement: sales answer the customer straight from the alert (validated address only)
    ackReplyTo: customer?.canonical ?? null,
  }
}

/** The public URL of a site path (the same origin as the CRM link). */
const publicUrl = (path: string, base = process.env.NEXT_PUBLIC_SERVER_URL ?? ''): string =>
  /^\/[^\s]*$/.test(path) ? `${base.replace(/\/+$/, '')}${path}` : path

type ReplyMeta = {
  messageId: string
  replyTo: string | null
  inReplyTo: string | null
  references: string | null
}

export type DrainResult = { claimed: number; sent: number; retried: number; dead: number; suppressed: number; deferred: number; uncertain: number }

/** Revenue Engine slice 1: the sequence send path (REVENUE profile) and whether reply detection is live. */
export type SequenceLane = { cfg: EmailConfig; transport: MailTransport | null; noTransportCode?: string; inboundOk: boolean }

export async function processRow(
  payload: Payload,
  id: string,
  txCfg: EmailConfig,
  txTransport: MailTransport | null,
  now: Date,
  txNoTransportCode?: string,
  seq?: SequenceLane,
  fence: { owner?: string; txIdentity?: AttemptIdentity; seqIdentity?: AttemptIdentity } = {},
): Promise<keyof Omit<DrainResult, 'claimed'>> {
  const row = (await payload.findByID({
    collection: 'crm-email-outbox',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Row
  const rfqId = rfqIdOf(row)
  const isSeq = row.kind === 'SEQUENCE_EMAIL'
  // Sequence rows send through the REVENUE profile (Patch C); everything else through the TRANSACTIONAL one.
  const cfg = isSeq && seq ? seq.cfg : txCfg
  const transport = isSeq && seq ? seq.transport : txTransport
  const noTransportCode = isSeq && seq ? seq.noTransportCode : txNoTransportCode
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
    event: 'SUPPRESSED' | 'SENT' | 'DEAD_LETTERED' | 'UNCERTAIN',
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
          // an UNCERTAIN reply keeps its QUEUED status with the code: it may have been delivered
          ...(status === 'UNCERTAIN' ? {} : { status: status === 'SENT' ? 'SENT' : status === 'DEAD' ? 'FAILED' : 'NOT_SENT' }),
          status_code: code,
          ...(status === 'SENT' ? { sent_at: now.toISOString() } : {}),
        } as never,
        depth: 0,
        overrideAccess: true,
        context: { crmServer: {} },
      })
    if (isSeq && status === 'UNCERTAIN') {
      // held: the enrollment stays waiting on this row until a person decides (never advanced on a guess)
    } else if (isSeq) {
      // The engine records the sequence timeline entry, advances or stops the enrollment, and checks identity health.
      await onSequenceRowTerminal(payload, row as never, status, code, now)
      await checkHealth(payload, now)
    } else if (rfqId)
      await recordEmailActivity(
        { payload },
        { id: rfqId, ...(await rfqLinks(payload, rfqId)) },
        id,
        row.kind,
        status,
        code,
      )
  }

  // SEND-FIX-1a (R2-02): a kind outside the allowed set never goes out, even if it was queued before the switch.
  if (!kindAllowed(row.kind, txCfg)) {
    await terminal('SUPPRESSED_BY_MODE', 'KIND_NOT_ALLOWED', 'SUPPRESSED')
    return 'suppressed'
  }

  if (isSeq) {
    const a = await ersAdmission(payload, row as never, cfg, now, { inboundOk: seq?.inboundOk ?? false })
    if (a.action === 'DEFER') {
      // Not a failure and not an attempt: the row waits for its window, cap or switch.
      await setRow(payload, id, { status: 'PENDING', attempts: Math.max(0, row.attempts - 1), lease_until: null, next_attempt_at: a.until.toISOString(), last_error_code: a.code })
      return 'deferred'
    }
    if (a.action === 'EXIT') {
      await terminal('SUPPRESSED_BY_SUPPRESSION', `EXIT_${a.reason}`, 'SUPPRESSED')
      return 'suppressed'
    }
  }

  // the team alert carries the whole list in one To; every address is checked again against the current gate
  const team = row.kind === 'RFQ_SALES_ALERT' || row.kind === 'INTAKE_FAILED_ALERT' ? (row.to_address ?? '').split(',').map((a) => a.trim()).filter((a) => gateRecipient(cfg, a) === 'SEND') : null
  const to = team ? team.join(', ') : (row.to_address ?? '')
  const gate = team ? (team.length ? 'SEND' : 'SUPPRESSED_BY_MODE') : gateRecipient(cfg, to)
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
    ...(r.ackReplyTo ? { reply_to: r.ackReplyTo } : {}),
  })
  // SEND-FIX-1a (R2-03): record the attempt intent and the transport identity, and take the row to SUBMITTING — only if
  // this worker still owns the lease. From here on the row is never sent again automatically.
  const identity = (isSeq ? fence.seqIdentity : fence.txIdentity) ?? attemptIdentity(isSeq ? 'REVENUE' : 'TRANSACTIONAL', cfg, null)
  await recordEmailEvent({ payload }, { ...base, event: 'SUBMITTED', code: null })
  const owned = await db(payload).execute(
    sql`UPDATE "crm_email_outbox" SET "status" = 'SUBMITTING', "submitted_at" = ${now.toISOString()}, "attempt_identity" = ${JSON.stringify(identity)}::jsonb
        WHERE "id" = ${id} AND "status" = 'SENDING' AND ${fence.owner ? sql`"lease_owner" = ${fence.owner}` : sql`TRUE`}
        RETURNING "id"`,
  )
  if ((owned.rows ?? []).length !== 1) return 'deferred' // the lease moved to another worker: hand nothing over
  let accepted: MailResult
  try {
    accepted = await transport.send({
      from: formatFrom(cfg),
      to,
      subject: r.rendered.subject,
      text: r.rendered.text,
      html: r.rendered.html,
      messageId: row.message_id ?? undefined,
      ...(isSeq
        ? {
            // Revenue Engine: replies thread back to the RFQ by its token address; one-click unsubscribe (RFC 8058) is
            // always offered — the floor. Not Auto-Submitted: it reads as a person's follow-up and may be answered.
            replyTo: row.reply_to ?? undefined,
            headers: row.list_unsubscribe
              ? { 'List-Unsubscribe': `<${row.list_unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
              : {},
          }
        : r.reply
        ? {
            // M2: a person's reply. Replies route back by the RFQ's token address; threading follows the
            // conversation. Not marked Auto-Submitted: a human wrote it, and the customer may answer it.
            replyTo: r.reply.replyTo ?? undefined,
            inReplyTo: r.reply.inReplyTo ?? undefined,
            references: r.reply.references ?? undefined,
          }
        : // RFC 3834: an automatic message. Receiving autoresponders must not answer it. T1 (T-R3) also carries the
          // RFQ's reply-token address, so a person's answer threads onto the RFQ.
          { ...(r.ackReplyTo ? { replyTo: r.ackReplyTo } : {}), headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' } }),
    })
  } catch (err) {
    // SEND-FIX-1a (review R4-03): only a confirmed invalid destination suppresses the address — a sequence email, or the
    // T1 acknowledgement to the customer. The team alert never suppresses a colleague.
    if ((isSeq || row.kind === 'RFQ_CUSTOMER_ACK') && isAddressBounce(err)) {
      // A definitive "no such address": a hard bounce (suppression, never cleared; an enrollment stops).
      await recordHardBounce(payload, { address: to, sourceEventId: `send:${id}`, outboxId: id }, now)
      await terminal('DEAD', 'HARD_BOUNCE', 'DEAD_LETTERED')
      return 'dead'
    }
    const f = failureCode(err)
    if (submissionOutcome(err) === 'UNCERTAIN') {
      // No reply after the message was handed over: it may have been delivered. Held, never retried automatically.
      await terminal('UNCERTAIN', `UNCERTAIN_${f.code}`.slice(0, 60), 'UNCERTAIN')
      return 'uncertain'
    }
    // R4-03: a permanent refusal is never retried unchanged; its class (policy, size, unknown) is kept for review. A
    // failed login is ours to fix, not the message's: it waits and retries while an admin fixes the sending profile.
    const why = classifyRefusal(err)
    if (why === 'AUTH') return retryOrDead(payload, row, id, base, now, `AUTH:${f.code}`.slice(0, 60), 'TRANSIENT', terminal)
    if (f.klass === 'PERMANENT') return retryOrDead(payload, row, id, base, now, `${why}:${f.code}`.slice(0, 60), 'PERMANENT', terminal)
    return retryOrDead(payload, row, id, base, now, f.code, f.klass, terminal)
  }
  // Accepted (SMTP 250): persisted before anything else. If this write fails, the row stays SUBMITTING and becomes
  // UNCERTAIN (holdInterrupted) — it is never sent twice.
  // ER-07: a multi-recipient message keeps each address's outcome; refused ones are recorded, accepted ones are never
  // sent again (the whole row is SENT)
  const results = recipientResults(to, accepted)
  const refused = results.filter((r) => r.outcome === 'REJECTED')
  try {
    await db(payload).execute(
      sql`UPDATE "crm_email_outbox" SET "status" = 'SENT', "sent_at" = ${now.toISOString()}, "lease_until" = NULL, "lease_owner" = NULL,
            "accepted_response" = ${acceptedResponse(accepted)}, "recipient_results" = ${JSON.stringify(results)}::jsonb,
            "last_error_code" = ${refused.length ? `RCPT_REJECTED_${refused.length}` : null}
          WHERE "id" = ${id} AND "status" = 'SUBMITTING'`,
    )
  } catch {
    console.error(`[h2o] email outbox: row ${id} accepted but not recorded; held as uncertain`)
    return 'uncertain'
  }
  // Review Q2: addresses refused only for now (4xx at RCPT TO) get a new message of their own, later; the accepted ones
  // are never sent it again. Created after SENT is durable; a failure here leaves them recorded as refused.
  const again = refused.filter((r) => r.retryable).map((r) => r.address)
  if (again.length && row.attempts < MAX_ATTEMPTS)
    await payload
      .create({
        collection: 'crm-email-outbox',
        data: {
          idempotency_key: `${row.idempotency_key}#rcpt${row.attempts}`,
          kind: row.kind,
          status: 'RETRY',
          rfq: rfqId,
          recipient_ref: recipientRef(again.join(', ')),
          to_address: again.join(', '),
          message_id: messageIdFor(cfg),
          attempts: row.attempts,
          next_attempt_at: nextAttemptAt(row.attempts, now)?.toISOString() ?? null,
          last_error_code: 'RCPT_RETRY',
          ...(row.kind === 'INTAKE_FAILED_ALERT' ? { subject: row.subject, body_text: row.body_text } : {}),
        } as never,
        context: { crmServer: {} },
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => console.error(`[h2o] email outbox: row ${id} could not queue the retry for refused recipients`))
  // The rest is history (event, timeline, conversation status): a failure here never changes what was sent.
  try {
    for (const r of refused) await recordEmailEvent({ payload }, { ...base, event: 'ATTEMPT_FAILED', code: 'RCPT_REJECTED', recipient_ref: recipientRef(r.address) })
    await terminal('SENT', refused.length ? `RCPT_REJECTED_${refused.length}` : null, 'SENT', { sent_at: now.toISOString() })
  } catch {
    console.error(`[h2o] email outbox: row ${id} sent; history not fully recorded`)
  }
  return 'sent'
}

/** Each address in To and whether the server accepted it (when it said; otherwise accepted, as the send succeeded). */
export function recipientResults(
  to: string,
  r: { acceptedAddresses?: string[]; rejectedAddresses?: string[]; rejectedCodes?: Record<string, number> },
): Array<{ address: string; outcome: 'ACCEPTED' | 'REJECTED'; code?: number; retryable?: boolean }> {
  const key = (a: string) => a.trim().toLowerCase()
  const refused = new Set((r.rejectedAddresses ?? []).map(key))
  return to
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((address) => {
      if (!refused.has(key(address))) return { address, outcome: 'ACCEPTED' as const }
      const code = r.rejectedCodes?.[key(address)]
      // review Q2: only a temporary refusal (4xx) of that one address may be tried again, and only for that address
      return { address, outcome: 'REJECTED' as const, ...(code ? { code } : {}), retryable: code !== undefined && code >= 400 && code < 500 }
    })
}

/** The server's acceptance, kept short and free of addresses: the Message-ID and the reply's status code words. */
const acceptedResponse = (a: { messageId: string | null; response?: string }): string =>
  [a.response ? a.response.replace(/[^\x20-\x7e]/g, '').replace(/\S+@\S+/g, '<addr>').slice(0, 160) : '250', a.messageId ?? ''].filter(Boolean).join(' · ').slice(0, 240)

type Terminal = (status: EmailOutboxStatus, code: string | null, event: 'SUPPRESSED' | 'SENT' | 'DEAD_LETTERED' | 'UNCERTAIN') => Promise<void>

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
  opts: { cfg?: EmailConfig; transport?: MailTransport | null; now?: Date; limit?: number; ersInboundOk?: boolean } = {},
): Promise<DrainResult> {
  const envCfg = opts.cfg ?? readEmailConfig()
  const now = opts.now ?? new Date()
  const ownTransport = opts.transport === undefined
  // Patch C: the transport and sender come from the active sending profile (else the environment profile).
  let cfg = envCfg
  let noTransportCode: string | undefined
  let txResolved: Resolved | null = null
  let seqResolved: Resolved | null = null
  if (ownTransport && envCfg.mode !== 'off') {
    const r = await resolveSending(payload, envCfg, 'TRANSACTIONAL')
    txResolved = r
    cfg = withSending(envCfg, r)
    if (!r.ok) noTransportCode = r.code
  }
  const transport = ownTransport ? createTransport(cfg) : (opts.transport ?? null)
  // Revenue Engine slice 1: sequence rows use the REVENUE profile (falls back to TRANSACTIONAL, Patch C).
  let seqCfg = envCfg
  let seqCode: string | undefined
  let seqTransport = transport
  if (ownTransport && envCfg.mode !== 'off') {
    const r2 = await resolveSending(payload, envCfg, 'REVENUE')
    seqResolved = r2
    seqCfg = withSending(envCfg, r2)
    if (!r2.ok) seqCode = r2.code
    const same = r2.ok && cfg.smtp && r2.smtp.host === cfg.smtp.host && r2.smtp.user === cfg.smtp.user && r2.smtp.port === cfg.smtp.port
    seqTransport = same ? transport : createTransport(seqCfg)
  } else if (ownTransport) seqCfg = cfg
  const inboundOk = opts.ersInboundOk ?? (readInboundConfig().enabled && inboundFresh(await ersSettings(payload, now.getTime()), true, now.getTime()))
  const seq: SequenceLane = { cfg: seqCfg, transport: seqTransport, noTransportCode: seqCode, inboundOk }
  const result: DrainResult = { claimed: 0, sent: 0, retried: 0, dead: 0, suppressed: 0, deferred: 0, uncertain: 0 }
  const owner = randomUUID()
  const fence = { owner, txIdentity: attemptIdentity('TRANSACTIONAL', cfg, ownTransport ? txResolved : null), seqIdentity: attemptIdentity('REVENUE', seqCfg, ownTransport ? seqResolved : null) }
  try {
    result.uncertain += await holdInterrupted(payload, now)
    const ids = await claimBatch(payload, now, opts.limit ?? 10, owner)
    result.claimed = ids.length
    for (const id of ids) {
      try {
        result[await processRow(payload, id, cfg, transport, now, noTransportCode, seq, fence)]++
      } catch (err) {
        // A failure before SUBMITTING leaves the row SENDING (nothing was handed over): its lease expires and it is
        // claimed again. A failure after it leaves SUBMITTING, which becomes UNCERTAIN — never sent twice.
        console.error(`[h2o] email outbox: row ${id} processing error ${failureCode(err).code}`)
      }
    }
  } finally {
    if (ownTransport) {
      transport?.close()
      if (seqTransport !== transport) seqTransport?.close()
    }
  }
  if (result.claimed > 0)
    console.warn(
      `[h2o] email outbox: claimed=${result.claimed} sent=${result.sent} retried=${result.retried} dead=${result.dead} suppressed=${result.suppressed} deferred=${result.deferred} uncertain=${result.uncertain}`,
    )
  return result
}
