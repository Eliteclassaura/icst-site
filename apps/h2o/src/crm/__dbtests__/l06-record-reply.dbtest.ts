import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { recordActivity } from '../activity'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * L06 (launch review): "Record my reply and complete first response" is the one deliberate way to finish the first
 * response. A call, a meeting, a logged email and an incoming email must not complete it. Synthetic data only.
 */
let sales: TestUser, viewer: TestUser
let S: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>

async function inquiry(n = 1) {
  const r = await createManualInquiry(S, { token: uuidv7(), firstName: 'Ana', lastName: `Ruiz${n}`, email: `ana${n}.${Date.now()}@example.test`, phone: '+1 555-0100', message: 'Synthetic request.', company: `Reply Co ${n} (synthetic)` })
  if (!r.ok) throw new Error(r.code)
  return String(r.id)
}
const tasks = async (rfqId: string) => (await (await payload()).find({ collection: 'crm-tasks', where: { rfq: { equals: rfqId } }, ...sys, limit: 50 })).docs as unknown as Doc[]
const firstResponse = async (rfqId: string) => (await tasks(rfqId)).find((t) => t.kind === 'RFQ_FIRST_RESPONSE')!
const activities = async (rfqId: string, type?: string) =>
  (await (await payload()).find({ collection: 'crm-activities', where: type ? { and: [{ rfq: { equals: rfqId } }, { type: { equals: type } }] } : { rfq: { equals: rfqId } }, ...sys, limit: 100 })).docs as unknown as Doc[]
const replyRows = async (rfqId: string) => (await activities(rfqId, 'EMAIL_REFERENCE')).filter((a) => (a.detail as Doc | null)?.kind === 'first_response_reply')

beforeAll(async () => {
  ;[sales, viewer] = await Promise.all([user('sales'), user('viewer')])
  S = crmSessionFor(await payload(), sales.user)!
})
beforeEach(async () => {
  await resetCrm()
})

describe('L06 record my reply', () => {
  it('logs the email, completes the first response and creates the next follow-up, in that order of effect', async () => {
    const id = await inquiry(1)
    expect((await firstResponse(id)).status).toBe('OPEN')
    const out = await m.recordReply(S, { rfqId: id, summary: 'Sent the fan blade lead time and asked for the tower model', followUp: 'on', followUpTitle: 'Ask about the tower model', followUpDue: '2026-10-20' })
    expect(out).toMatchObject({ ok: true })
    expect((await firstResponse(id)).status).toBe('DONE')
    const rows = await replyRows(id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ summary: 'Sent the fan blade lead time and asked for the tower model' })
    expect(String(rows[0]!.task)).toBe(String((await firstResponse(id)).id))
    const follow = (await tasks(id)).filter((t) => t.title === 'Ask about the tower model')
    expect(follow).toHaveLength(1)
    expect(follow[0]).toMatchObject({ status: 'OPEN', kind: 'FOLLOW_UP' })
  })

  it('without a follow-up it creates none', async () => {
    const id = await inquiry(2)
    const before = (await tasks(id)).length
    expect(await m.recordReply(S, { rfqId: id, summary: 'Answered by email', followUp: undefined })).toMatchObject({ ok: true })
    expect((await tasks(id)).length).toBe(before)
    expect((await firstResponse(id)).status).toBe('DONE')
  })

  it('a call, a meeting, a logged email and an incoming email do NOT complete the first response', async () => {
    const id = await inquiry(3)
    for (const type of ['CALL', 'MEETING', 'EMAIL_REFERENCE'])
      expect(await m.logActivity(S, { rfqId: id, type, summary: `Synthetic ${type}` })).toMatchObject({ ok: true })
    expect((await firstResponse(id)).status).toBe('OPEN')
    // An incoming email arrives as a system-written activity on the inquiry; it is not a sent reply either.
    const p = await payload()
    await recordActivity({ payload: p }, { type: 'EMAIL_RECEIVED', summary: 'Customer email received (synthetic)', idempotency_key: `email-in:${uuidv7()}`, occurred_at: new Date().toISOString(), rfq: id, actor_kind: 'INTEGRATION' })
    expect((await firstResponse(id)).status).toBe('OPEN')
    expect(await replyRows(id)).toHaveLength(0)
  })

  it('a second click or a second tab records one reply and one completion', async () => {
    const id = await inquiry(4)
    const [a, b] = await Promise.all([m.recordReply(S, { rfqId: id, summary: 'Replied from the mailbox' }), m.recordReply(S, { rfqId: id, summary: 'Replied from the mailbox' })])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(await replyRows(id)).toHaveLength(1)
    const again = await m.recordReply(S, { rfqId: id, summary: 'Replied again' })
    expect(again).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    expect(await replyRows(id)).toHaveLength(1)
    expect((await activities(id, 'TASK_COMPLETED')).length).toBe(1)
  })

  it('nothing is written when the form is incomplete', async () => {
    const id = await inquiry(5)
    expect(await m.recordReply(S, { rfqId: id, summary: '   ' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await m.recordReply(S, { rfqId: id, summary: 'Replied', occurredAt: '2099-01-01T10:00' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await m.recordReply(S, { rfqId: id, summary: 'Replied', followUp: 'on', followUpTitle: '', followUpDue: '' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await m.recordReply(S, { rfqId: 'not-an-id', summary: 'Replied' })).toMatchObject({ ok: false })
    expect((await firstResponse(id)).status).toBe('OPEN')
    expect(await replyRows(id)).toHaveLength(0)
  })

  it('refuses when there is no open first response, and writes nothing', async () => {
    const id = await inquiry(6)
    await m.completeTask(S, { taskId: String((await firstResponse(id)).id) })
    const out = await m.recordReply(S, { rfqId: id, summary: 'Late reply' })
    expect(out).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    expect(await replyRows(id)).toHaveLength(0)
  })

  it('only CRM roles can use it: a viewer has no session', async () => {
    const p = await payload()
    expect(crmSessionFor(p, viewer.user)).toBeNull()
    const id = await inquiry(7)
    expect((await firstResponse(id)).status).toBe('OPEN')
  })

  it('it sends nothing: no outbox row is created', async () => {
    const id = await inquiry(8)
    await m.recordReply(S, { rfqId: id, summary: 'Answered by email' })
    const rows = await (await payload()).find({ collection: 'crm-email-outbox' as never, where: { rfq: { equals: id } } as never, ...sys, limit: 5 }).catch(() => ({ docs: [] as unknown[] }))
    expect(rows.docs.filter((r) => String((r as Doc).type ?? '') !== 'INTERNAL_ALERT')).toHaveLength(0)
  })
})
