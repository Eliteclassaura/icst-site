import type { Payload } from 'payload'
import { readInboundConfig } from '../../email/config'
import { officeCalendar } from '../offices'
import { officeSettings } from '../officeSettings'
import { ENROLLMENT_EXIT_REASON } from '../vocabulary'
import { businessDaysBetween } from './calendar'
import { bounceHealth, type BounceHealth } from './feedback'
import { capForDay, ersSettings, inboundFresh, type ErsSettings } from './settings'

/**
 * Revenue Engine slice 1 — the one report (LEAN CUT 7): per sequence, enrolled · sent · replied · reply % · stopped by
 * reason · unsubscribed · bounced; and the engine's state (switch, health, reply detection, today's cap and sends,
 * the bounce ratio with its ≥2% warning). Counts only; no personal data. Reply % = replied ÷ enrollments that were
 * sent at least one email.
 */
type Doc = Record<string, unknown>
export type SequenceRow = {
  id: string
  key: string
  name: string
  runState: string
  version: number | null
  enrolled: number
  live: number
  completed: number
  held: number
  sent: number
  replied: number
  replyPct: number | null
  unsubscribed: number
  bounced: number
  exits: Record<string, number>
}

export async function sequenceReport(payload: Payload): Promise<SequenceRow[]> {
  const seqs = (await payload.find({ collection: 'crm-sequences', sort: 'name', limit: 100, depth: 1, overrideAccess: true })).docs as unknown as Doc[]
  const out: SequenceRow[] = []
  for (const seq of seqs) {
    const enrs = (await payload.find({ collection: 'crm-enrollments', where: { sequence: { equals: String(seq.id) } } as never, limit: 5000, depth: 0, overrideAccess: true, pagination: false })).docs as unknown as Doc[]
    const ids = enrs.map((e) => String(e.id))
    const sentRows = ids.length
      ? ((await payload.find({ collection: 'crm-email-outbox', where: { and: [{ enrollment: { in: ids } }, { status: { equals: 'SENT' } }] } as never, limit: 20000, depth: 0, overrideAccess: true, pagination: false })).docs as unknown as Doc[])
      : []
    const sentEnrollments = new Set(sentRows.map((r) => String(typeof r.enrollment === 'object' && r.enrollment ? (r.enrollment as Doc).id : r.enrollment)))
    const exits = Object.fromEntries(ENROLLMENT_EXIT_REASON.map((r) => [r, enrs.filter((e) => e.exit_reason === r).length]))
    const replied = exits.REPLIED ?? 0
    const pv = seq.published_version as Doc | null
    out.push({
      id: String(seq.id),
      key: String(seq.key),
      name: String(seq.name),
      runState: String(seq.run_state),
      version: pv && typeof pv === 'object' ? Number(pv.version_number) : null,
      enrolled: enrs.length,
      live: enrs.filter((e) => ['ACTIVE', 'AWAITING_SEND'].includes(String(e.status))).length,
      completed: enrs.filter((e) => e.status === 'COMPLETED').length,
      held: enrs.filter((e) => e.status === 'PAUSED' || e.status === 'DEAD_LETTER').length,
      sent: sentRows.length,
      replied,
      replyPct: sentEnrollments.size ? Math.round((1000 * replied) / sentEnrollments.size) / 10 : null,
      unsubscribed: exits.UNSUBSCRIBED ?? 0,
      bounced: exits.BOUNCED ?? 0,
      exits,
    })
  }
  return out
}

export type EngineStatus = { settings: ErsSettings; inboundLive: boolean; sentLast24h: number; capToday: number; bounce: BounceHealth }

export async function engineStatus(payload: Payload, now = new Date()): Promise<EngineStatus> {
  const s = await ersSettings(payload, now.getTime())
  const cal = officeCalendar('US', await officeSettings(payload))
  const sentLast24h = (
    await payload.count({
      collection: 'crm-email-outbox',
      where: { and: [{ kind: { equals: 'SEQUENCE_EMAIL' } }, { status: { equals: 'SENT' } }, { sent_at: { greater_than: new Date(now.getTime() - 24 * 3600_000).toISOString() } }] } as never,
      overrideAccess: true,
    })
  ).totalDocs
  const capToday = capForDay(s, s.compliance.warmup, s.warmupStartedOn ? businessDaysBetween(new Date(s.warmupStartedOn), now, cal) : null)
  return { settings: s, inboundLive: inboundFresh(s, readInboundConfig().enabled, now.getTime()), sentLast24h, capToday, bounce: await bounceHealth(payload, s) }
}
