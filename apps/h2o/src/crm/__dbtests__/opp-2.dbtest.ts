import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { loadNextActions, NEXT_ACTIONS_PAGE_SIZE } from '../workspace/nextActions'
import { loadRfq } from '../workspace/queries'
import { replyDueLabel } from '../workspace/replyDue'
import { repliedRfqIds } from '../workspace/replyEvidence'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, userWith, type TestUser } from './harness'

/**
 * OPP-2 — My Work next actions. Synthetic data only; every workspace call runs as the user with access control on.
 */

let admin: TestUser, sales: TestUser, sales2: TestUser
let A: CrmSession, S: CrmSession, S2: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>
const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!

async function account(name: string) {
  const p = await payload()
  return String((await p.create({ collection: 'crm-accounts', data: { canonical_name: name, domains: [], provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })).id)
}
async function inquiry(s: CrmSession, extra: Record<string, unknown> = {}) {
  const r = await createManualInquiry(s, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request.', company: 'Reply Test Co (synthetic)', firstName: 'Pat', lastName: 'Rivera', ...extra })
  if (!r.ok) throw new Error(`manual failed: ${r.code}`)
  return String(r.id)
}
const firstResponse = async (rfqId: string) => {
  const p = await payload()
  return (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: rfqId } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
}
const replyOf = async (rfqId: string) => {
  const d = await loadRfq(S, rfqId)
  return d!.row.reply
}

beforeAll(async () => {
  await resetCrm()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  sales2 = await userWith('sales.two@example.test', 'sales')
  A = await session(admin)
  S = await session(sales)
  S2 = await session(sales2)
})

describe('OPP-2 a finished task is not "a human reply was sent"', () => {
  it('ticking off the first-response task alone says "Task done, no reply recorded"', async () => {
    const id = await inquiry(S)
    const t = await firstResponse(id)
    expect((await m.completeTask(S, { taskId: String(t.id) })).ok).toBe(true)
    const r = await replyOf(id)
    expect(r).toMatchObject({ state: 'DONE', replyRecorded: false })
    expect(replyDueLabel(r, new Date())).toBe('Task done, no reply recorded')
    expect(replyDueLabel(r, new Date())).not.toBe('Replied')
  })
  it('a logged call is evidence: the same finished task reads "Replied"', async () => {
    const id = await inquiry(S)
    const t = await firstResponse(id)
    await m.completeTask(S, { taskId: String(t.id) })
    expect((await m.logActivity(S, { rfqId: id, type: 'CALL', summary: 'Called the plant manager back.' })).ok).toBe(true)
    const r = await replyOf(id)
    expect(r).toMatchObject({ state: 'DONE', replyRecorded: true })
    expect(replyDueLabel(r, new Date())).toBe('Replied')
  })
  it('"Record my reply" (L06) leaves evidence by itself: the first response is Done and reads "Replied"', async () => {
    const id = await inquiry(S)
    expect((await m.recordReply(S, { rfqId: id, summary: 'Answered by email from my mailbox' })).ok).toBe(true)
    const r = await replyOf(id)
    expect(r).toMatchObject({ state: 'DONE', replyRecorded: true })
    expect(replyDueLabel(r, new Date())).toBe('Replied')
  })
  it('a sent outbound email is evidence; queued, failed, not-sent and inbound mail are not', async () => {
    const p = await payload()
    const id = await inquiry(S)
    const mk = (status: string, direction: string) =>
      p.create({
        collection: 'crm-email-messages',
        data: { direction, rfq: id, status, from_address: 'sales@example.test', to_address: 'pat@example.test', subject: 'Re: your request', body_text: 'Synthetic body.', message_id: `<${uuidv7()}@example.test>`, idempotency_key: uuidv7(), occurred_at: new Date().toISOString() } as never,
        context: { crmServer: {} },
        ...sys,
      })
    for (const st of ['QUEUED', 'FAILED', 'NOT_SENT']) await mk(st, 'OUTBOUND')
    await mk('RECEIVED', 'INBOUND')
    expect((await repliedRfqIds(S, [id])).has(id)).toBe(false)
    await mk('SENT', 'OUTBOUND')
    expect((await repliedRfqIds(S, [id])).has(id)).toBe(true)
    const t = await firstResponse(id)
    await m.completeTask(S, { taskId: String(t.id) })
    expect(replyDueLabel(await replyOf(id), new Date())).toBe('Replied')
  })
  it('an open first-response task is unchanged, and a finished one on another inquiry does not borrow evidence', async () => {
    const open = await inquiry(S)
    expect((await replyOf(open)).state).toBe('OPEN')
    const done = await inquiry(S)
    await m.completeTask(S, { taskId: String((await firstResponse(done)).id) })
    expect((await repliedRfqIds(S, [open, done])).has(done)).toBe(false)
    expect((await replyOf(done)).replyRecorded).toBe(false)
  })
})

describe('OPP-2 follow-ups say who they are about', () => {
  it('a contact-only task and an inquiry task both carry the person, linked by id', async () => {
    const p = await payload()
    const id = await inquiry(S, { email: `pat.${uuidv7().slice(-8)}@example.test` })
    const rfq = (await p.findByID({ collection: 'crm-rfqs', id, ...sys })) as unknown as Doc
    const contactId = String(typeof rfq.contact === 'object' ? (rfq.contact as Doc).id : rfq.contact)
    expect(contactId).toBeTruthy()
    const acc = await account('Person Link Co (synthetic)')
    await m.linkAccount(S, { rfqId: id, accountId: acc })
    expect((await m.createFollowUp(S, { contactId, title: 'Call Pat back', due: '2026-10-20' })).ok).toBe(true)
    // Team: the inquiry's first-response task has no owner yet, so it is not "mine".
    const first = await loadNextActions(S, { who: 'team', page: 1 })
    const rows = (await Promise.all(Array.from({ length: first.pages }, (_, i) => loadNextActions(S, { who: 'team', page: i + 1 })))).flatMap((r) => r.rows)
    const t = rows.find((r) => r.task?.title === 'Call Pat back')!
    expect(t.personId).toBe(contactId)
    expect(t.personName).toBe('Pat Rivera')
    // The inquiry's own first-response task has no contact of its own: the inquiry's contact is used.
    const fr = rows.find((r) => r.task?.rfqId === id && r.task.kind === 'RFQ_FIRST_RESPONSE')!
    expect(fr.personId).toBe(contactId)
  })
})

describe('OPP-2 the next-action queue is complete, ordered and counted', () => {
  it('merges follow-ups and open deals, overdue first, with the real total across pages (sales is capped at 100 per read)', async () => {
    const p = await payload()
    const acc = await account('Queue Co (synthetic)')
    const contact = String(
      (await p.create({ collection: 'crm-contacts', data: { first_name: 'Quinn', last_name: 'Ng', account: acc, account_link_confidence: 'HIGH_CONFIDENCE', email: 'quinn.ng@example.test', provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })).id,
    )
    const base = await loadNextActions(S, { who: 'mine', page: 1 })
    const baseTeam = await loadNextActions(S, { who: 'team', page: 1 })
    const day = 86_400_000
    const t0 = Date.UTC(2026, 9, 1)
    const mkTask = (i: number, extra: Doc = {}) =>
      p.create({ collection: 'crm-tasks', data: { title: `Queue task ${i}`, kind: 'FOLLOW_UP', status: 'OPEN', priority: 'NORMAL', assignee: S.userId, contact, account: acc, due_at: new Date(t0 + (i % 40) * day).toISOString(), source: 'MANUAL', ...extra } as never, context: { crmServer: {} }, ...sys })
    const mkDeal = (i: number, extra: Doc = {}) =>
      p.create({ collection: 'crm-opportunities', data: { name: `Queue deal ${i} (synthetic)`, account: acc, owner: S.userId, motion: 'REPAIR', stage: 'PROPOSAL', office: i % 2 ? 'TH' : 'US', next_step: 'Chase the quote', next_step_due_at: new Date(t0 + (i % 40) * day + 3_600_000).toISOString(), provenance: { source_system: 'SYNTHETIC_FIXTURE' }, ...extra } as never, context: { crmServer: {} }, ...sys })
    const batch = async (n: number, fn: (i: number) => Promise<unknown>) => {
      for (let i = 0; i < n; i += 10) await Promise.all(Array.from({ length: Math.min(10, n - i) }, (_, k) => fn(i + k)))
    }
    await batch(120, (i) => mkTask(i))
    await batch(40, (i) => mkDeal(i))
    // Not next actions: a waiting-for-customer task, a done task, a closed deal, another person's items.
    await mkTask(900, { kind: 'MISSING_INFORMATION' })
    await mkTask(901, { status: 'DONE' })
    await mkDeal(902, { stage: 'WON' })
    await mkTask(903, { assignee: S2.userId })
    await mkDeal(904, { owner: S2.userId })
    const first = await loadNextActions(S, { who: 'mine', page: 1 }, new Date(Date.UTC(2026, 9, 10)))
    expect(first.total).toBe(base.total + 160)
    expect(first.rows).toHaveLength(NEXT_ACTIONS_PAGE_SIZE)
    // Every item on every page, exactly once; 160 items per source > 100 per read, so deep pages merge across reads.
    const keys: string[] = []
    const dues: number[] = []
    for (let page = 1; page <= first.pages; page++) {
      const res = await loadNextActions(S, { who: 'mine', page }, new Date(Date.UTC(2026, 9, 10)))
      for (const r of res.rows) {
        keys.push(r.key)
        dues.push(r.dueAt ? new Date(r.dueAt).getTime() : Number.POSITIVE_INFINITY)
      }
    }
    expect(keys).toHaveLength(first.total)
    expect(new Set(keys).size).toBe(first.total)
    for (let i = 1; i < dues.length; i++) expect(dues[i]! >= dues[i - 1]!).toBe(true)
    // Overdue first: everything before the first not-yet-due row is overdue.
    const all = (await Promise.all(Array.from({ length: first.pages }, (_, i) => loadNextActions(S, { who: 'mine', page: i + 1 }, new Date(Date.UTC(2026, 9, 10)))))).flatMap((r) => r.rows)
    const firstFuture = all.findIndex((r) => !r.overdue)
    expect(firstFuture).toBeGreaterThan(0)
    expect(all.slice(0, firstFuture).every((r) => r.overdue)).toBe(true)
    expect(all.slice(firstFuture).every((r) => !r.overdue)).toBe(true)
    expect(first.overdue).toBe(firstFuture)
    // Excluded kinds never appear; both offices' deals do (no hidden office filter); deals carry their person and next action.
    expect(all.some((r) => r.task?.title === 'Queue task 900' || r.task?.title === 'Queue task 901' || r.task?.title === 'Queue task 903')).toBe(false)
    expect(all.some((r) => r.deal?.name.startsWith('Queue deal 902') || r.deal?.name.startsWith('Queue deal 904'))).toBe(false)
    expect(new Set(all.filter((r) => r.deal?.name.startsWith('Queue deal ')).map((r) => r.deal!.office))).toEqual(new Set(['US', 'TH']))
    const queueTask = all.find((r) => r.task?.title === 'Queue task 7')!
    expect(queueTask).toMatchObject({ personId: contact, personName: 'Quinn Ng' })
    const queueDeal = all.find((r) => r.deal?.name === 'Queue deal 7 (synthetic)')!
    expect(queueDeal.deal!.nextStep).toBe('Chase the quote')
    // Team sees the other person's items too, and its total says so.
    const team = await loadNextActions(S, { who: 'team', page: 1 })
    expect(team.total).toBe(baseTeam.total + 160 + 2)
    expect(team.total).toBeGreaterThan(first.total)
  }, 240_000)
  it('a page past the end is empty with the true total, not an error', async () => {
    const res = await loadNextActions(S, { who: 'mine', page: 9999 })
    expect(res.rows).toHaveLength(0)
    expect(res.total).toBeGreaterThan(0)
  })
  it('admins see the same counts', async () => {
    const mine = await loadNextActions(A, { who: 'team', page: 1 })
    const team = await loadNextActions(S, { who: 'team', page: 1 })
    expect(mine.total).toBe(team.total)
  })
})
