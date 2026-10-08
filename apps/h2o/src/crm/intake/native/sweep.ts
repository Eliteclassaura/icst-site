import { sql } from '@payloadcms/db-postgres'
import { kindAllowed, readEmailConfig } from '../../../email/config'
import { gateRecipient, recipientRef } from '../../../email/gate'
import { resolveAlertRecipients } from '../../../email/routing-read'
import { messageIdFor } from '../../notify'
import type { Payload, Where } from 'payload'
import { fixtureRegistry } from '../../../rfq-native/registry'
import { ingestParsed, intakeLog } from '../typeform/ingest'
import { parseEnvelope, storedPayload, toDelivery, validateAnswers } from './normalize'

/**
 * RFQ-FIX-1 (quote-form audit R6): native requests stranded part-way are finished by the runner.
 *
 * A native request is stored (intake event) before it is processed. If processing then fails (FAILED_RETRYABLE) or the
 * process dies mid-way (PROCESSING with an expired lease), the visitor saw an error and may never retry — so nothing
 * would finish it. Every minute the runner re-ingests such events from their stored payload, through the same canonical
 * pipeline: the atomic claim (claim.ts) lets exactly one worker finish an event, and every step is idempotent, so a
 * sweep racing a visitor's own retry cannot duplicate an RFQ or an alert.
 *
 * Typeform events are left to Typeform's own redelivery. A stored payload that no longer validates (an old registry) is
 * left as it is and counted, for an admin to read. Logs carry codes and event ids only.
 */
const sys = { overrideAccess: true as const, depth: 0 }
export const SWEEP_BATCH = 20
/** RFQ-FIX-1.1: give up after this many sweeps (→ FAILED_PERMANENT); between sweeps wait 2^attempts minutes, ≤ 1 hour. */
export const SWEEP_MAX_ATTEMPTS = 10
export const sweepBackoffMs = (attempts: number): number => Math.min(2 ** attempts, 60) * 60_000
/** RFQ-FIX-1.1: quarantined honeypot requests are kept this long, then removed by the sweeper. */
export const SPAM_KEEP_DAYS = 30
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle
const NATIVE: Where = { source_system: { in: ['NATIVE_FORM', 'NATIVE_CHAT'] } }

/** Events that need finishing: failed, or processing with an expired lease (any source when `allSources`). */
export const strandedWhere = (now: Date, allSources = false): Where => ({
  and: [
    ...(allSources ? [] : [NATIVE]),
    {
      or: [
        { processing_state: { equals: 'FAILED_RETRYABLE' } },
        { and: [{ processing_state: { equals: 'PROCESSING' } }, { or: [{ processing_lease_until: { less_than: now.toISOString() } }, { processing_lease_until: { exists: false } }] }] },
      ],
    },
  ],
})

export type SweepResult = { found: number; finished: number; skipped: number; failed: number; gaveUp?: number; prunedSpam?: number }

/** SEND-FIX-1a (auditor note on 1.1): spam pruning runs at most hourly (the state and received_at columns are indexed). */
let lastPruneAt = 0
export const PRUNE_EVERY_MS = 60 * 60_000

export async function sweepStrandedIntake(payload: Payload, now: Date = new Date()): Promise<SweepResult> {
  // RFQ-FIX-1.1: quarantined honeypot requests older than SPAM_KEEP_DAYS are removed (raw SQL: intake events are
  // otherwise never deleted; these are not evidence of a customer request)
  let prunedSpam = 0
  if (now.getTime() - lastPruneAt >= PRUNE_EVERY_MS || now.getTime() < lastPruneAt) {
    lastPruneAt = now.getTime()
    const pruned = await db(payload).execute(
      sql`DELETE FROM "crm_intake_events" WHERE "processing_state" = 'QUARANTINED_SPAM' AND "received_at" < ${new Date(now.getTime() - SPAM_KEEP_DAYS * 86_400_000).toISOString()} RETURNING "id"`,
    )
    prunedSpam = (pruned.rows ?? []).length
  }
  // SEND-FIX-1a (auditor note on 1.1): the backoff is part of the query — an event is due only once 2^attempts minutes
  // (≤ 1 h) have passed since its last sweep — so rows that are backing off never fill the batch ahead of due ones.
  const nowIso = now.toISOString()
  const ids = await db(payload).execute(
    sql`SELECT "id" FROM "crm_intake_events"
        WHERE "source_system" IN ('NATIVE_FORM', 'NATIVE_CHAT')
          AND ("processing_state" = 'FAILED_RETRYABLE'
               OR ("processing_state" = 'PROCESSING' AND ("processing_lease_until" IS NULL OR "processing_lease_until" < ${nowIso})))
          AND ("last_sweep_at" IS NULL
               OR "last_sweep_at" <= ${nowIso}::timestamptz - LEAST(POWER(2, COALESCE("sweep_attempts", 0)), 60) * INTERVAL '1 minute')
        ORDER BY "received_at" ASC
        LIMIT ${SWEEP_BATCH}`,
  )
  const dueIds = (ids.rows ?? []).map((r) => String(r.id))
  type Ev = { id: string | number; source_event_id: string; raw_payload?: Record<string, unknown>; raw_payload_hash: string; received_at: string; sweep_attempts?: number | null; last_sweep_at?: string | null }
  const due = dueIds.length
    ? ((await payload.find({ collection: 'crm-intake-events', where: { id: { in: dueIds } }, sort: 'received_at', limit: SWEEP_BATCH, ...sys })).docs as unknown as Ev[])
    : []
  const out: SweepResult = { found: due.length, finished: 0, skipped: 0, failed: 0, gaveUp: 0, prunedSpam }
  const reg = fixtureRegistry()
  for (const doc of due) {
    // RFQ-FIX-1.1: count the attempt first; the one past the cap gives up for good (FAILED_PERMANENT, admin overview)
    const attempts = Number(doc.sweep_attempts ?? 0) + 1
    if (attempts > SWEEP_MAX_ATTEMPTS) {
      await db(payload).execute(sql`UPDATE "crm_intake_events" SET "processing_state" = 'FAILED_PERMANENT', "failure_code" = 'SWEEP_GAVE_UP', "processing_lease_until" = NULL WHERE "id" = ${String(doc.id)} AND "processing_state" IN ('FAILED_RETRYABLE', 'PROCESSING')`)
      out.gaveUp!++
      intakeLog(payload, 'error', { code: 'INTAKE_SWEEP_GAVE_UP', event_id: doc.source_event_id })
      // SEND-FIX-1a (auditor note on 1.1): a lead that could not be processed is never silent
      await enqueueIntakeFailedAlert(payload, { id: String(doc.id), eventId: doc.source_event_id, receivedAt: doc.received_at }, now)
      continue
    }
    await db(payload).execute(sql`UPDATE "crm_intake_events" SET "sweep_attempts" = ${attempts}, "last_sweep_at" = ${now.toISOString()} WHERE "id" = ${String(doc.id)}`)
    const submissionId = String(doc.source_event_id).replace(/^native:/, '')
    const raw = doc.raw_payload ?? {}
    const r = parseEnvelope({ ...raw, submissionId, antiAbuse: {} })
    if (!r || Object.keys(validateAnswers(reg, r)).length > 0) {
      out.skipped++
      intakeLog(payload, 'warn', { code: 'INTAKE_SWEEP_UNREADABLE', event_id: doc.source_event_id, source: r?.source })
      continue
    }
    const receivedAt = new Date(doc.received_at)
    const { delivery } = toDelivery(reg, r, receivedAt)
    try {
      // the stored hash is the event's identity (the claim and the replay check compare it), whatever the payload's age
      const result = await ingestParsed(payload, { d: delivery, hash: doc.raw_payload_hash, rawPayload: storedPayload(r), receivedAt, signatureState: 'FORM_TOKEN_VERIFIED', conflict: 'refuse', now })
      if (result.status === 200 && result.outcome !== 'DUPLICATE_DELIVERY_NOOP') out.finished++
      else if (result.status === 200) out.skipped++
      else out.failed++
      intakeLog(payload, result.status === 200 ? 'info' : 'error', { code: 'INTAKE_SWEEP', event_id: doc.source_event_id, outcome: result.outcome, status: result.status, source: r.source })
    } catch {
      out.failed++
      intakeLog(payload, 'error', { code: 'INTAKE_SWEEP_FAILED', event_id: doc.source_event_id, source: r.source })
    }
  }
  return out
}

/** RFQ-FIX-1.1: requests the sweeper gave up on (FAILED_PERMANENT), for the admin overview. */
export const failedPermanentWhere: Where = { processing_state: { equals: 'FAILED_PERMANENT' } }

/** How many intake events (any source) are stranded now (the CRM overview shows admins the same count). */
export const countStranded = async (payload: Payload, now: Date = new Date()): Promise<number> =>
  (await payload.count({ collection: 'crm-intake-events', where: strandedWhere(now, true), overrideAccess: true })).totalDocs

/**
 * SEND-FIX-1a (auditor note on RFQ-FIX-1.1): when a quote request is given up on, the team gets one internal alert —
 * "A quote request could not be processed: check CRM → overview" — to the same list as the new-RFQ alert, through the
 * outbox (allowlisted kind INTAKE_FAILED_ALERT). It names the intake event id and when it arrived; no customer data.
 */
export async function enqueueIntakeFailedAlert(payload: Payload, ev: { id: string; eventId: string; receivedAt: string }, now: Date = new Date()): Promise<void> {
  const cfg = readEmailConfig()
  // ALERTS-1: the live lists (Settings → Email routing, else H2O_SALES_ALERT_TO). The request never reached an office,
  // so both offices' lists and the copy list hear about it, each address once.
  const [us, th] = await Promise.all([resolveAlertRecipients(payload, 'US', cfg), resolveAlertRecipients(payload, 'TH', cfg)])
  const team = [...new Map([...us.all, ...th.all].map((a) => [a.trim().toLowerCase(), a.trim()])).values()]
  const key = `intake-failed:${ev.id}`
  const existing = await payload.find({ collection: 'crm-email-outbox', where: { idempotency_key: { equals: key } }, limit: 1, ...sys })
  if (existing.docs.length) return
  const sendable = team.filter((to) => gateRecipient(cfg, to) === 'SEND')
  const allowed = kindAllowed('INTAKE_FAILED_ALERT', cfg)
  const pending = sendable.length > 0 && allowed
  const base = (process.env.NEXT_PUBLIC_SERVER_URL ?? '').replace(/\/+$/, '')
  const text = [
    'A quote request could not be processed: check CRM → overview.',
    `Intake event: ${ev.eventId}\nReceived: ${ev.receivedAt}`,
    `The request is kept in the CRM (admins: CRM overview → quote requests given up): ${base}/admin/`,
  ].join('\n\n')
  await payload.create({
    collection: 'crm-email-outbox',
    data: {
      idempotency_key: key,
      kind: 'INTAKE_FAILED_ALERT',
      status: pending ? 'PENDING' : allowed ? (team.length ? 'SUPPRESSED_BY_MODE' : 'SUPPRESSED_NO_RECIPIENT') : 'SUPPRESSED_BY_MODE',
      recipient_ref: sendable.length ? recipientRef(sendable.join(', ')) : 'r_none',
      to_address: pending ? sendable.join(', ') : null,
      message_id: pending ? messageIdFor(cfg) : null,
      subject: pending ? 'A quote request could not be processed' : null,
      body_text: pending ? `${text}\n` : null,
      attempts: 0,
      next_attempt_at: pending ? now.toISOString() : null,
      last_error_code: pending ? null : allowed ? (team.length ? `MODE_${cfg.mode.toUpperCase()}` : 'SALES_ALERT_TO_UNSET') : 'KIND_NOT_ALLOWED',
    } as never,
    context: { crmServer: {} },
    ...sys,
  })
}
