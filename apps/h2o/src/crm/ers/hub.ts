import type { Payload } from 'payload'
import { sequenceReport, type SequenceRow } from './report'
import { displayNameOf, type CrmSession } from '../workspace/session'
import type { Step } from './engine'

/**
 * ERS-HUB-1 — the read side of the Email Revenue Overview and the sequence screens. Reads only; nothing here writes or
 * sends. Counts, ids and the names a CRM user already sees on the record (contact, company, sequence, who acted); never message bodies. Every figure says what it measures; a figure with no source in this build
 * is returned as `null` and shown as "Not available yet", never as 0 (DD §14/§15, E3: unknown is not zero).
 */
type Doc = Record<string, unknown>
const ro = { overrideAccess: true as const, depth: 0 }
const idOf = (v: unknown): string => String(v && typeof v === 'object' ? (v as Doc).id : (v ?? ''))

export type FunnelRow = {
  key: 'contacted' | 'replies' | 'qualified' | 'won' | 'revenue'
  count: number | null
  /** Native-currency totals for the revenue row: one entry per currency; never summed across currencies. */
  money?: Array<{ currency: string; amount: number }> | null
  /** Counts that sit beside revenue and are never zero-filled. */
  side?: { unknown: number; awaiting: number; unattributed: number } | null
}
/** Turn timeline rows into one plain sentence each: "Ana Ruiz paused in RFQ follow-up by J. Smith". */
async function sentences(payload: Payload, docs: Doc[]): Promise<Recent[]> {
  const enrIds = [...new Set(docs.map((a) => String(((a.detail ?? {}) as Doc).enrollment ?? '')).filter(Boolean))]
  const enrs = enrIds.length ? ((await payload.find({ collection: 'crm-enrollments', where: { id: { in: enrIds } } as never, limit: 500, depth: 1, overrideAccess: true })).docs as unknown as Doc[]) : []
  const byEnr = new Map(enrs.map((e) => [String(e.id), e]))
  const contactIds = [...new Set(docs.map((a) => (a.contact ? idOf(a.contact) : '')).filter(Boolean))]
  const contacts = contactIds.length ? ((await payload.find({ collection: 'crm-contacts', where: { id: { in: contactIds } } as never, limit: 500, ...ro })).docs as unknown as Doc[]) : []
  const cName = new Map(contacts.map((c) => [String(c.id), String(c.display_name ?? 'A contact')]))
  const userIds = [...new Set(docs.map((a) => String(((a.detail ?? {}) as Doc).by ?? '')).filter(Boolean))]
  const users = userIds.length ? ((await payload.find({ collection: 'users', where: { id: { in: userIds } } as never, limit: 100, ...ro })).docs as unknown as Doc[]) : []
  const uName = new Map(users.map((u) => [String(u.id), displayNameOf(u)]))
  const VERB: Record<string, string> = { paused: 'paused', resumed: 'resumed', stopped: 'stopped' }
  return docs.map((a) => {
    const d = (a.detail ?? {}) as Doc
    const enr = byEnr.get(String(d.enrollment ?? ''))
    const seq = enr?.sequence && typeof enr.sequence === 'object' ? String((enr.sequence as Doc).name ?? '') : ''
    const who = a.contact ? (cName.get(idOf(a.contact)) ?? 'A contact') : 'A contact'
    const by = d.by ? uName.get(String(d.by)) : null
    const verb = VERB[String(d.action ?? '')]
    const summary = verb
      ? `${who} ${verb}${seq ? ` in ${seq}` : ''}${by ? ` by ${by}` : ''}`
      : `${who}: ${String(a.summary)}${seq ? ` (${seq})` : ''}`
    return { id: String(a.id), at: String(a.occurred_at ?? a.createdAt), summary, rfq: a.rfq ? idOf(a.rfq) : null }
  })
}

export type Attention = { key: string; count: number; href: string }
export type Recent = { id: string; at: string; summary: string; rfq: string | null }
export type Overview = { sequences: SequenceRow[]; funnel: FunnelRow[]; attention: Attention[]; recent: Recent[] }

/** Sourced credit: an opportunity counts for outreach when its immutable origin RFQ is one a sequence email was sent for. */
export async function funnel(payload: Payload): Promise<FunnelRow[]> {
  const sent = (
    await payload.find({
      collection: 'crm-email-outbox',
      where: { and: [{ kind: { equals: 'SEQUENCE_EMAIL' } }, { status: { equals: 'SENT' } }, { enrollment: { exists: true } }] } as never,
      limit: 20000,
      pagination: false,
      ...ro,
    })
  ).docs as unknown as Doc[]
  const enrIds = [...new Set(sent.map((r) => idOf(r.enrollment)))]
  const enrs = enrIds.length
    ? ((await payload.find({ collection: 'crm-enrollments', where: { id: { in: enrIds } } as never, limit: 20000, pagination: false, ...ro })).docs as unknown as Doc[])
    : []
  const contacted = new Set(enrs.map((e) => idOf(e.contact))).size
  const replies = new Set(enrs.filter((e) => e.exit_reason === 'REPLIED').map((e) => idOf(e.contact))).size
  const rfqIds = [...new Set(enrs.map((e) => idOf(e.rfq)))]
  const opps = rfqIds.length
    ? ((await payload.find({ collection: 'crm-opportunities', where: { origin_rfq: { in: rfqIds } } as never, limit: 20000, pagination: false, ...ro })).docs as unknown as Doc[])
    : []
  const won = opps.filter((o) => o.outcome_status === 'WON')
  const confirmed = won.filter((o) => o.revenue_truth_state === 'WON_REVENUE_CONFIRMED' && o.amount_status === 'KNOWN' && o.currency)
  const byCur = new Map<string, number>()
  for (const o of confirmed) byCur.set(String(o.currency), (byCur.get(String(o.currency)) ?? 0) + Number(o.amount ?? 0))
  const awaiting = won.filter((o) => o.revenue_truth_state !== 'WON_REVENUE_CONFIRMED' && o.revenue_truth_state !== 'REVENUE_UNKNOWN' && o.revenue_truth_state != null).length
  const unknown = won.filter((o) => o.revenue_truth_state == null || o.revenue_truth_state === 'REVENUE_UNKNOWN').length
  const allWon = (await payload.count({ collection: 'crm-opportunities', where: { outcome_status: { equals: 'WON' } } as never, overrideAccess: true })).totalDocs
  return [
    { key: 'contacted', count: contacted },
    { key: 'replies', count: replies },
    { key: 'qualified', count: opps.length },
    { key: 'won', count: won.length },
    {
      key: 'revenue',
      count: confirmed.length,
      money: [...byCur.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)),
      side: { unknown, awaiting, unattributed: Math.max(0, allWon - won.length) },
    },
  ]
}

export async function overview(s: CrmSession): Promise<Overview> {
  const p = s.payload
  const [sequences, fn, held, dead, recent] = await Promise.all([
    sequenceReport(p),
    funnel(p),
    p.count({ collection: 'crm-enrollments', where: { and: [{ status: { equals: 'PAUSED' } }, { pause_reason: { in: ['LINT_HOLD', 'RENDER_HOLD'] } }] } as never, overrideAccess: true }),
    p.count({ collection: 'crm-enrollments', where: { status: { equals: 'DEAD_LETTER' } } as never, overrideAccess: true }),
    p.find({ collection: 'crm-activities', where: { type: { equals: 'SEQUENCE_EVENT' } } as never, sort: '-occurred_at', limit: 10, ...ro }),
  ])
  const attention: Attention[] = []
  if (held.totalDocs) attention.push({ key: 'held', count: held.totalDocs, href: '/crm/email-revenue/sequences/' })
  if (dead.totalDocs) attention.push({ key: 'dead', count: dead.totalDocs, href: '/crm/email-revenue/sequences/' })
  return {
    sequences,
    funnel: fn,
    attention,
    recent: await sentences(p, recent.docs as unknown as Doc[]),
  }
}

export type EnrolledRow = {
  id: string
  contactId: string
  contactName: string
  company: string | null
  /** What happens next ("Email: RFQ routing follow-up", "Wait 3 business days"), or null once it has ended. */
  nextAction: string | null
  rfqId: string
  status: string
  step: number
  pauseReason: string | null
  holdCode: string | null
  exitReason: string | null
  nextActionAt: string | null
  ownerId: string | null
  canPause: boolean
  canResume: boolean
  canStop: boolean
}

/** Enrollments of one sequence with what the viewer may do to each (the actions re-check; this only shapes the buttons). */
export async function enrolled(s: CrmSession, sequenceId: string, limit = 200): Promise<EnrolledRow[]> {
  const rows = (
    await s.payload.find({ collection: 'crm-enrollments', where: { sequence: { equals: sequenceId } } as never, sort: '-enrolled_at', limit, ...ro })
  ).docs as unknown as Doc[]
  const cIds = [...new Set(rows.map((e) => idOf(e.contact)))]
  const contacts = cIds.length ? ((await s.payload.find({ collection: 'crm-contacts', where: { id: { in: cIds } } as never, limit: 500, depth: 1, overrideAccess: true })).docs as unknown as Doc[]) : []
  const cInfo = new Map(contacts.map((c) => [String(c.id), { name: String(c.display_name ?? 'Contact'), company: c.account && typeof c.account === 'object' ? String((c.account as Doc).name ?? '') || null : null }]))
  const vIds = [...new Set(rows.map((e) => idOf(e.version)))]
  const versions = vIds.length ? ((await s.payload.find({ collection: 'crm-sequence-versions', where: { id: { in: vIds } } as never, limit: 50, ...ro })).docs as unknown as Doc[]) : []
  const stepsOf = new Map(versions.map((v) => [String(v.id), (v.steps ?? []) as Step[]]))
  const tpls = (await s.payload.find({ collection: 'crm-email-templates', limit: 500, ...ro })).docs as unknown as Doc[]
  const subjectOf = (id: unknown) => String(tpls.find((t) => String(t.id) === String(idOf(id)))?.subject ?? 'Email')
  return rows.map((e) => {
    const status = String(e.status)
    const live = ['ACTIVE', 'AWAITING_SEND', 'PAUSED'].includes(status)
    const own = idOf(e.owner) === s.userId
    const st = live ? stepsOf.get(idOf(e.version))?.[Number(e.current_step ?? 0)] : undefined
    const nextAction = !live
      ? null
      : !st
        ? 'Finishing'
        : st.type === 'WAIT'
          ? `Wait ${st.business_days} business day${Number(st.business_days) === 1 ? '' : 's'}`
          : st.type === 'EMAIL'
            ? `Email: ${subjectOf(st.template)}`
            : `Task: ${String(st.task_title ?? '')}`
    return {
      id: String(e.id),
      contactId: idOf(e.contact),
      contactName: cInfo.get(idOf(e.contact))?.name ?? 'Contact',
      company: cInfo.get(idOf(e.contact))?.company ?? null,
      nextAction,
      rfqId: idOf(e.rfq),
      status,
      step: Number(e.current_step ?? 0),
      pauseReason: (e.pause_reason as string | null) ?? null,
      holdCode: (e.hold_code as string | null) ?? null,
      exitReason: (e.exit_reason as string | null) ?? null,
      nextActionAt: (e.next_action_at as string | null) ?? null,
      ownerId: e.owner ? idOf(e.owner) : null,
      canPause: status === 'ACTIVE',
      canResume: status === 'PAUSED' && (s.isAdmin || (own && e.pause_reason === 'MANUAL')),
      canStop: live,
    }
  })
}

/** Sequence history: the timeline entries about this sequence's enrollments, one plain sentence each. */
export async function history(s: CrmSession, sequenceId: string, limit = 50): Promise<Recent[]> {
  const ids = (
    await s.payload.find({ collection: 'crm-enrollments', where: { sequence: { equals: sequenceId } } as never, limit: 5000, pagination: false, ...ro })
  ).docs.map((e) => String((e as unknown as Doc).id))
  if (!ids.length) return []
  const all = (
    await s.payload.find({ collection: 'crm-activities', where: { type: { equals: 'SEQUENCE_EVENT' } } as never, sort: '-occurred_at', limit: 1000, ...ro })
  ).docs as unknown as Doc[]
  const set = new Set(ids)
  return sentences(
    s.payload,
    all.filter((a) => set.has(String(((a.detail ?? {}) as Doc).enrollment ?? ''))).slice(0, limit),
  )
}

/** The sequences the viewer's contact, RFQ or deal is in (the panel on the record). */
export async function panel(s: CrmSession, input: { contactId?: string; rfqId?: string }): Promise<Array<{ id: string; sequenceId: string; sequenceName: string; status: string; pauseReason: string | null; canPause: boolean; canResume: boolean; canStop: boolean }>> {
  const where = input.contactId ? { contact: { equals: input.contactId } } : input.rfqId ? { rfq: { equals: input.rfqId } } : null
  if (!where) return []
  const rows = (await s.payload.find({ collection: 'crm-enrollments', where: where as never, sort: '-enrolled_at', limit: 20, depth: 1, overrideAccess: false, user: s.user as never })).docs as unknown as Doc[]
  return rows.map((e) => {
    const status = String(e.status)
    const own = idOf(e.owner) === s.userId
    const seq = (e.sequence ?? {}) as Doc
    return {
      id: String(e.id),
      sequenceId: idOf(e.sequence),
      sequenceName: String(seq.name ?? 'Sequence'),
      status,
      pauseReason: (e.pause_reason as string | null) ?? null,
      canPause: status === 'ACTIVE',
      canResume: status === 'PAUSED' && (s.isAdmin || (own && e.pause_reason === 'MANUAL')),
      canStop: ['ACTIVE', 'AWAITING_SEND', 'PAUSED'].includes(status),
    }
  })
}
