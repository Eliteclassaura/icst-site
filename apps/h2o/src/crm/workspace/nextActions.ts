import type { Where } from 'payload'
import { hydrateDeals, type DealRow } from './deals'
import { crmUsers, hydrateTasks, type TaskRow } from './queries'
import { asUser, type CrmSession } from './session'

/**
 * OPP-2 next actions: one queue of what a person has to do next, made of open follow-ups and the next action of every
 * open deal. Overdue first (an overdue item is simply the earliest due), then by due time, undated last.
 *
 * Nothing is capped or filtered behind the person's back: no office filter, no query limit. The total is the real
 * number of matching items; any page of it can be opened. A page merges the two sources by reading only as many rows
 * from each as the page needs, in reads of at most 100 (the most a non-admin read returns).
 *
 * "Waiting for the customer" tasks stay in their own list: they are not something to do next.
 */
type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const relId = (v: unknown): string | null => (v ? String(typeof v === 'object' ? D(v).id : v) : null)

export const NEXT_ACTIONS_PAGE_SIZE = 25
export type Who = 'mine' | 'team'

export type NextAction = {
  key: string
  kind: 'task' | 'deal'
  dueAt: string | null
  overdue: boolean
  /** The person this is about, when one is recorded. */
  personId: string | null
  personName: string | null
  task: TaskRow | null
  deal: DealRow | null
}

const OPEN_TASK = { status: { in: ['OPEN', 'IN_PROGRESS'] } }
const TERMINAL = ['WON', 'LOST', 'CANCELLED']

const taskWhere = (s: CrmSession, who: Who): Where => ({
  and: [OPEN_TASK, { kind: { not_equals: 'MISSING_INFORMATION' } }, ...(who === 'mine' ? [{ assignee: { equals: s.userId } }] : [])],
})
const dealWhere = (s: CrmSession, who: Who): Where => ({ and: [{ stage: { not_in: TERMINAL } }, ...(who === 'mine' ? [{ owner: { equals: s.userId } }] : [])] })

/** The first `need` rows of a collection in due order, read in pages of at most 100. */
async function firstRows(s: CrmSession, collection: 'crm-tasks' | 'crm-opportunities', where: Where, sort: string, need: number): Promise<{ total: number; docs: Doc[] }> {
  const docs: Doc[] = []
  let total = 0
  for (let page = 1; docs.length < need; page++) {
    const res = await s.payload.find({ collection, where, sort: [sort, 'id'] as never, page, limit: 100, depth: 0, ...asUser(s) })
    total = res.totalDocs
    docs.push(...(res.docs as unknown as Doc[]))
    if (!res.hasNextPage) break
  }
  return { total, docs: docs.slice(0, need) }
}

const dueMs = (v: unknown): number => {
  const t = v ? new Date(String(v)).getTime() : Number.NaN
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

export async function loadNextActions(s: CrmSession, opts: { who: Who; page: number }, now: Date = new Date()) {
  const size = NEXT_ACTIONS_PAGE_SIZE
  const page = Math.max(1, opts.page)
  const need = page * size
  const [tasks, deals, overdueTasks, overdueDeals] = await Promise.all([
    firstRows(s, 'crm-tasks', taskWhere(s, opts.who), 'due_at', need),
    firstRows(s, 'crm-opportunities', dealWhere(s, opts.who), 'next_step_due_at', need),
    s.payload.find({ collection: 'crm-tasks', where: { and: [taskWhere(s, opts.who), { due_at: { less_than: now.toISOString() } }] }, limit: 1, depth: 0, ...asUser(s) }),
    s.payload.find({ collection: 'crm-opportunities', where: { and: [dealWhere(s, opts.who), { next_step_due_at: { less_than: now.toISOString() } }] }, limit: 1, depth: 0, ...asUser(s) }),
  ])
  const merged = [
    ...tasks.docs.map((d) => ({ kind: 'task' as const, d, due: dueMs(d.due_at) })),
    ...deals.docs.map((d) => ({ kind: 'deal' as const, d, due: dueMs(d.next_step_due_at) })),
  ].sort((a, b) => (a.due === b.due ? 0 : a.due < b.due ? -1 : 1) || a.kind.localeCompare(b.kind) || String(a.d.id).localeCompare(String(b.d.id)))
  const slice = merged.slice((page - 1) * size, page * size)
  const people = await crmUsers(s)
  const taskRows = new Map((await hydrateTasks(s, slice.filter((x) => x.kind === 'task').map((x) => x.d), people, now)).map((t) => [t.id, t]))
  const dealRows = new Map((await hydrateDeals(s, slice.filter((x) => x.kind === 'deal').map((x) => x.d), now)).map((d) => [d.id, d]))
  // A deal's person is the contact on the inquiry it came from.
  const originIds = [...new Set(slice.filter((x) => x.kind === 'deal').map((x) => relId(x.d.origin_rfq)).filter(Boolean))] as string[]
  const originContact = new Map<string, string | null>()
  if (originIds.length) {
    const rfqs = await s.payload.find({ collection: 'crm-rfqs', where: { id: { in: originIds } }, limit: 100, pagination: false, depth: 0, ...asUser(s) })
    for (const r of rfqs.docs) originContact.set(String(r.id), relId(D(r).contact))
  }
  const dealContactIds = [...new Set([...originContact.values()].filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (dealContactIds.length) {
    const cs = await s.payload.find({ collection: 'crm-contacts', where: { id: { in: dealContactIds } }, limit: 100, pagination: false, depth: 0, ...asUser(s) })
    for (const c of cs.docs) names.set(String(c.id), String(D(c).display_name ?? '').trim())
  }
  const rows: NextAction[] = slice.map((x) => {
    if (x.kind === 'task') {
      const t = taskRows.get(String(x.d.id))!
      return { key: `task:${t.id}`, kind: 'task', dueAt: t.dueAt, overdue: t.overdue, personId: t.contactId ?? null, personName: t.contactName ?? null, task: t, deal: null }
    }
    const d = dealRows.get(String(x.d.id))!
    const cid = d.originRfqId ? (originContact.get(d.originRfqId) ?? null) : null
    return { key: `deal:${d.id}`, kind: 'deal', dueAt: d.nextDue, overdue: d.overdue, personId: cid, personName: cid ? names.get(cid) || null : null, task: null, deal: d }
  })
  const total = tasks.total + deals.total
  return {
    total,
    overdue: overdueTasks.totalDocs + overdueDeals.totalDocs,
    pages: Math.max(1, Math.ceil(total / size)),
    page,
    rows,
    people,
  }
}
