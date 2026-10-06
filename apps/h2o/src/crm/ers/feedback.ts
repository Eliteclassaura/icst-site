import type { Payload } from 'payload'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import type { EnrollmentExitReason } from '../vocabulary'
import { exitForAddress, floorExit } from './engine'
import { ersSettings, invalidateErsSettings, type ErsSettings } from './settings'

/**
 * Revenue Engine slice 1 — the feedback loop: bounces, complaints, identity health (E0.1 §17 reduced; owner override).
 *
 *   - A hard bounce (a 550/551/553 address refusal at send, or an RFC 3464 DSN with 5.x.x) records a
 *     HARD_BOUNCE suppression for the address (never cleared) and marks the sequence row bounced.
 *   - Any suppression recorded for an address stops that address's live enrollments at once (ledger hook).
 *   - Health: over the last 100 sequence sends, hard bounces > 5% (with at least 20 sends) → PAUSED; any COMPLAINT
 *     suppression → PAUSED. ≥2% is a warning only. Only an admin resumes (audited through the settings global).
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }

export async function setHealth(payload: Payload, state: 'ACTIVE' | 'PAUSED', reason: string | null, now: Date): Promise<void> {
  await payload.updateGlobal({ slug: 'crm-ers-settings' as never, data: { health: { state, reason, changed_at: now.toISOString() } } as never, ...sys })
  invalidateErsSettings()
}

export type BounceHealth = { total: number; bounced: number; ratio: number; warn: boolean; pause: boolean }

export async function bounceHealth(payload: Payload, s: ErsSettings): Promise<BounceHealth> {
  const rows = (
    await payload.find({
      collection: 'crm-email-outbox',
      where: { and: [{ kind: { equals: 'SEQUENCE_EMAIL' } }, { or: [{ sent_at: { exists: true } }, { last_error_code: { equals: 'HARD_BOUNCE' } }] }] } as never,
      sort: '-updatedAt',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Doc[]
  const total = rows.length
  const bounced = rows.filter((r) => r.bounced_at || r.last_error_code === 'HARD_BOUNCE').length
  const ratio = total ? bounced / total : 0
  const enough = total >= s.minSendsForRatio
  return { total, bounced, ratio, warn: enough && ratio >= s.bounceWarnRatio, pause: enough && ratio > s.bouncePauseRatio }
}

/** After every sequence outcome: auto-pause on the bounce ratio (owner override thresholds). */
export async function checkHealth(payload: Payload, now: Date): Promise<BounceHealth> {
  const s = await ersSettings(payload, now.getTime())
  const h = await bounceHealth(payload, s)
  if (h.pause && s.health.state !== 'PAUSED') await setHealth(payload, 'PAUSED', 'HARD_BOUNCE_RATE', now)
  return h
}

export async function resumeHealth(s: CrmSession, now = new Date()): Promise<Outcome> {
  if (!s.isAdmin) return { ok: false, code: 'FORBIDDEN', message: 'Only an admin resumes sequence sending.' }
  await setHealth(s.payload, 'ACTIVE', null, now)
  return { ok: true, message: 'Sequence sending resumed.' }
}

/** Record a hard bounce for an address (idempotent per source event); the ledger hook stops its enrollments. */
export async function recordHardBounce(payload: Payload, input: { address: string; sourceEventId: string; outboxId?: string | null }, now: Date): Promise<void> {
  const prior = await payload.find({ collection: 'crm-suppressions', where: { source_event_id: { equals: input.sourceEventId } } as never, limit: 1, depth: 0, overrideAccess: true })
  if (!prior.docs.length)
    await payload.create({
      collection: 'crm-suppressions',
      data: { address: input.address, action: 'APPLY', reason: 'HARD_BOUNCE', source: 'PROVIDER_EVENT', source_event_id: input.sourceEventId } as never,
      ...sys,
    })
  if (input.outboxId) await payload.update({ collection: 'crm-email-outbox', id: input.outboxId, data: { bounced_at: now.toISOString() } as never, ...sys })
  await checkHealth(payload, now)
}

/** The suppression ledger's afterChange hook: stop enrollments; a complaint also pauses sending (owner override). */
export async function onSuppressionRecorded(payload: Payload, doc: Doc, now = new Date()): Promise<void> {
  if (doc.action !== 'APPLY' || typeof doc.email_match_key !== 'string') return
  const reason = floorExit([String(doc.reason)]) as EnrollmentExitReason
  await exitForAddress(payload, doc.email_match_key, reason, now)
  if (doc.reason === 'COMPLAINT') await setHealth(payload, 'PAUSED', 'COMPLAINT', now)
}
