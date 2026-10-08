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

export type SweepResult = { found: number; finished: number; skipped: number; failed: number }

export async function sweepStrandedIntake(payload: Payload, now: Date = new Date()): Promise<SweepResult> {
  const res = await payload.find({ collection: 'crm-intake-events', where: strandedWhere(now), sort: 'received_at', limit: SWEEP_BATCH, ...sys })
  const out: SweepResult = { found: res.docs.length, finished: 0, skipped: 0, failed: 0 }
  const reg = fixtureRegistry()
  for (const doc of res.docs as unknown as Array<{ id: string | number; source_event_id: string; raw_payload?: Record<string, unknown>; raw_payload_hash: string; received_at: string }>) {
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

/** How many intake events (any source) are stranded now (the CRM overview shows admins the same count). */
export const countStranded = async (payload: Payload, now: Date = new Date()): Promise<number> =>
  (await payload.count({ collection: 'crm-intake-events', where: strandedWhere(now, true), overrideAccess: true })).totalDocs
