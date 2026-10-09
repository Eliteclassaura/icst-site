import type { Payload } from 'payload'
import { relId } from '../guards'

/**
 * ENGINE-SCOPE-1c — manual reply mode (R4-01, DD §15.1). While replies are not monitored in the CRM, an admin-set named
 * owner checks the reply mailbox by hand. The mode releases ONE bounded initial batch of first emails and HOLDS every
 * later (reply-dependent) email until the owner has recorded a reply check; a check counts only while it is recent, the
 * owner is within their coverage hours, and no inbound mail is waiting unprocessed. The UI never claims replies are
 * handled automatically in this mode. Pure rules plus two small reads; the writes are in seq/reply.ts.
 */
type Doc = Record<string, unknown>

/** Instance policy: how old a reply check may be and still release follow-ups. Shown to people as text, not edited per program. */
export const MANUAL_CHECK_MAX_AGE_MS = 24 * 3600_000
export const REPLY_HOLD_RECHECK_MS = 15 * 60_000

export type Coverage = { days: 'MON_FRI' | 'EVERY_DAY'; startHour: number; endHour: number; zone: string }

export function coverageOf(seq: Doc): Coverage | null {
  const c = (seq.reply_coverage ?? {}) as Doc
  const start = Number(c.start_hour)
  const end = Number(c.end_hour)
  const zone = String(c.zone ?? '')
  if (!Number.isFinite(start) || !Number.isFinite(end) || !zone || end <= start) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    return null
  }
  return { days: c.days === 'EVERY_DAY' ? 'EVERY_DAY' : 'MON_FRI', startHour: start, endHour: end, zone }
}

export function inCoverage(now: Date, c: Coverage): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: c.zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1)
  if (c.days === 'MON_FRI' && (weekday === 'Sat' || weekday === 'Sun')) return false
  return hour >= c.startHour && hour < c.endHour
}

/** Everything manual mode needs to be on: an owner, coverage hours and zone, and a first-email batch size. */
export function manualConfigured(seq: Doc): boolean {
  return seq.reply_mode === 'MANUAL' && Boolean(relId(seq.reply_owner)) && coverageOf(seq) !== null && Number(seq.initial_batch) >= 1
}

export type CheckReason = 'OK' | 'INCOMPLETE' | 'NO_CHECK' | 'OLD_CHECK' | 'OUTSIDE_COVERAGE' | 'UNPROCESSED'
/** May follow-ups run now? A fresh check, the owner within coverage, and nothing waiting unprocessed. */
export function checkVerdict(seq: Doc, now: Date, unprocessed: number): { ok: boolean; reason: CheckReason } {
  if (!manualConfigured(seq)) return { ok: false, reason: 'INCOMPLETE' }
  const at = seq.reply_last_check_at ? new Date(String(seq.reply_last_check_at)).getTime() : null
  if (!at) return { ok: false, reason: 'NO_CHECK' }
  if (now.getTime() - at > MANUAL_CHECK_MAX_AGE_MS) return { ok: false, reason: 'OLD_CHECK' }
  if (!inCoverage(now, coverageOf(seq)!)) return { ok: false, reason: 'OUTSIDE_COVERAGE' }
  if (unprocessed > 0) return { ok: false, reason: 'UNPROCESSED' }
  return { ok: true, reason: 'OK' }
}

/** Inbound mail that arrived but has not been linked or discarded by a person. */
export async function unprocessedInbound(payload: Payload): Promise<number> {
  return (await payload.count({ collection: 'crm-email-review', where: { state: { equals: 'OPEN' } } as never, overrideAccess: true })).totalDocs
}

/** How many first emails this program has released so far (outbox rows for its first email step). */
export async function releasedFirstEmails(payload: Payload, sequenceId: string, firstStepKey: string): Promise<number> {
  const ids = (await payload.find({ collection: 'crm-enrollments', where: { sequence: { equals: sequenceId } } as never, limit: 5000, pagination: false, depth: 0, overrideAccess: true })).docs.map((e) => String((e as unknown as Doc).id))
  if (!ids.length) return 0
  return (await payload.count({ collection: 'crm-email-outbox', where: { and: [{ kind: { equals: 'SEQUENCE_EMAIL' } }, { step_key: { equals: firstStepKey } }, { enrollment: { in: ids } }] } as never, overrideAccess: true })).totalDocs
}

export const CHECK_REASON_TEXT: Record<CheckReason, string> = {
  OK: 'The owner’s last reply check is recent.',
  INCOMPLETE: 'Manual reply handling is not fully set up.',
  NO_CHECK: 'Waiting for the owner to check replies.',
  OLD_CHECK: 'No reply check in the last day.',
  OUTSIDE_COVERAGE: 'The owner is outside their coverage hours.',
  UNPROCESSED: 'Inbound mail is waiting to be handled.',
}
