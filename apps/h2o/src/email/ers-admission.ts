import { classifyRefusal } from './gate'
import type { Payload } from 'payload'
import { businessDaysBetween, inWindow, nextWindowOpen } from '../crm/ers/calendar'
import { CLOSED_RFQ, exitReasonFor } from '../crm/ers/engine'
import { capForDay, effectiveToggle, ersSettings, hourlyCap, invalidateErsSettings } from '../crm/ers/settings'
import { relId } from '../crm/guards'
import { officeCalendar } from '../crm/offices'
import { officeSettings } from '../crm/officeSettings'
import type { EnrollmentExitReason } from '../crm/vocabulary'
import type { EmailConfig } from './config'

/**
 * Revenue Engine slice 1 — the one admission check for sequence rows, run by the outbox worker when it claims a
 * SEQUENCE_EMAIL row (LEAN CUT 5; E0.1 gates re-run at handoff). Transactional rows never come here.
 *
 *   DEFER (stays queued, tried again later, not a failure):
 *     email mode off · engine switched off · identity health PAUSED · reply detection not live (inbound off or the
 *     last poll older than 15 minutes, CT ruling 3) · sequence paused · outside the office's business window (toggle)
 *     · the daily cap (warm-up adjusted), the hourly cap, or the recipient domain's daily / hourly cap reached.
 *   EXIT (the row is not sent; the enrollment stops): any exit goal is now true (reply, new RFQ, RFQ closed or
 *     qualified, owner responded, suppression floor).
 *   SEND.
 * Counts are database counts of sent sequence rows (rolling 24 h / 1 h), so they hold across restarts.
 */
export type Admission = { action: 'SEND' } | { action: 'DEFER'; until: Date; code: string } | { action: 'EXIT'; reason: EnrollmentExitReason }

type Doc = Record<string, unknown>
const HOUR = 3600_000
const jitter = (rand: () => number, minMin: number, maxMin: number) => (minMin + rand() * (maxMin - minMin)) * 60_000

export async function ersAdmission(
  payload: Payload,
  row: Doc,
  cfg: Pick<EmailConfig, 'mode'>,
  now: Date,
  opts: { inboundOk: boolean; rand?: () => number },
): Promise<Admission> {
  const rand = opts.rand ?? Math.random
  const later = (code: string, min = 15, max = 30): Admission => ({ action: 'DEFER', until: new Date(now.getTime() + jitter(rand, min, max)), code })
  if (cfg.mode === 'off') return later('MODE_OFF', 30, 60)
  const s = await ersSettings(payload, now.getTime())
  if (!s.enabled) return later('ERS_OFF')
  if (s.health.state === 'PAUSED') return later('HEALTH_PAUSED')
  if (!opts.inboundOk) return later('INBOUND_STALE')
  const enr = (await payload.findByID({ collection: 'crm-enrollments', id: String(relId(row.enrollment)), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  if (!enr || enr.status !== 'AWAITING_SEND') return { action: 'EXIT', reason: 'MANUAL_STOP' }
  const sequence = (await payload.findByID({ collection: 'crm-sequences', id: String(relId(enr.sequence)), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  if (!sequence || sequence.run_state !== 'ACTIVE') return later('SEQUENCE_PAUSED', 60, 90)
  const exit = await exitReasonFor(payload, { contactId: String(relId(enr.contact)), rfqId: String(relId(enr.rfq)), since: new Date(String(enr.enrolled_at)) })
  if (exit) return { action: 'EXIT', reason: exit }

  const rfq = (await payload.findByID({ collection: 'crm-rfqs', id: String(relId(row.rfq)), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  if (!rfq || CLOSED_RFQ.includes(String(rfq.status))) return { action: 'EXIT', reason: 'RFQ_CLOSED' }
  const cal = officeCalendar(rfq.office === 'TH' ? 'TH' : 'US', await officeSettings(payload))
  if (effectiveToggle(s, sequence, 'business_hours') && !inWindow(now, cal, s.windowStartHour, s.windowEndHour)) {
    const open = nextWindowOpen(now, cal, s.windowStartHour, s.windowEndHour)
    return { action: 'DEFER', until: new Date(open.getTime() + jitter(rand, 0, 20)), code: 'OUTSIDE_WINDOW' }
  }

  const warmup = effectiveToggle(s, sequence, 'warmup')
  if (warmup && !s.warmupStartedOn) {
    // The warm-up clock starts with the first sequence email ever admitted.
    await payload.updateGlobal({ slug: 'crm-ers-settings' as never, data: { warmup_started_on: now.toISOString() } as never, depth: 0, overrideAccess: true, context: { crmServer: {} } })
    invalidateErsSettings()
  }
  const started = s.warmupStartedOn ? new Date(s.warmupStartedOn) : now
  const daily = capForDay(s, warmup, businessDaysBetween(started, now, cal))
  const count = async (since: number, domain?: string) =>
    (
      await payload.count({
        collection: 'crm-email-outbox',
        where: {
          and: [
            { kind: { equals: 'SEQUENCE_EMAIL' } },
            { status: { equals: 'SENT' } },
            { sent_at: { greater_than: new Date(now.getTime() - since).toISOString() } },
            ...(domain ? [{ recipient_domain: { equals: domain } }] : []),
          ],
        } as never,
        overrideAccess: true,
      })
    ).totalDocs
  if ((await count(24 * HOUR)) >= daily) return later('DAILY_CAP', 30, 60)
  if ((await count(HOUR)) >= hourlyCap(daily, s)) return later('HOURLY_CAP', 10, 20)
  const domain = typeof row.recipient_domain === 'string' ? row.recipient_domain : ''
  if (domain) {
    if ((await count(24 * HOUR, domain)) >= s.domainDailyCap) return later('DOMAIN_DAILY_CAP', 60, 120)
    if ((await count(HOUR, domain)) >= s.domainHourlyCap) return later('DOMAIN_HOURLY_CAP', 20, 40)
  }
  return { action: 'SEND' }
}

/**
 * A definitive "no such address" refusal at send — not a policy, content, size or login refusal. SEND-FIX-1a (review
 * R4-03): from the SMTP stage and the enhanced code (gate.ts classifyRefusal); a bare 553 is no longer enough.
 */
export const isAddressBounce = (err: unknown): boolean => classifyRefusal(err) === 'INVALID_MAILBOX'
