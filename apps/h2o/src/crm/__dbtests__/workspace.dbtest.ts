import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { createManualInquiry, MANUAL_KEY_PREFIX } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { loadAccount, loadFollowUps, loadInbox, loadMyWork, loadPipeline, loadRfq, parseInboxParams } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, rest, user, userWith, type TestUser } from './harness'

/**
 * UI-1 MVP — Sales Workspace behaviour against the isolated synthetic database. Everything is synthetic
 * (example.test / example.com, 555-01xx numbers, invented companies). Every workspace call runs as the
 * user with access control on; crafted REST requests prove the collection hooks are the control.
 */

let admin: TestUser, sales: TestUser, sales2: TestUser, viewer: TestUser, editor: TestUser
let A: CrmSession, S: CrmSession, S2: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>

const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!

async function manual(s: CrmSession, over: Record<string, unknown> = {}) {
  const r = await createManualInquiry(s, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request for fan blades.', company: 'Synthetic Towers Co', ...over })
  if (!r.ok) throw new Error(`manual failed: ${r.code} ${r.message}`)
  return String(r.id)
}
const rfq = async (id: string) => (await (await payload()).findByID({ collection: 'crm-rfqs', id, ...sys })) as unknown as Doc
async function account(name: string, domain?: string) {
  const p = await payload()
  const a = await p.create({
    collection: 'crm-accounts',
    data: {
      canonical_name: name,
      domains: domain ? [{ domain, domain_status: 'VERIFIED_OWNED' }] : [],
      provenance: { source_system: 'SYNTHETIC_FIXTURE' },
    } as never,
    context: { crmServer: {} },
    ...sys,
  })
  return String(a.id)
}

beforeAll(async () => {
  await resetCrm()
  ;[admin, sales, viewer, editor] = await Promise.all([user('platform-admin'), user('sales'), user('viewer'), user('editor')])
  sales2 = await userWith('sales.two@example.test', 'sales')
  A = await session(admin)
  S = await session(sales)
  S2 = await session(sales2)
})

describe('W1 access: Admin + Sales only', () => {
  it('admins and sales get a workspace session; viewer, editor and no user do not', async () => {
    const p = await payload()
    expect(A.isAdmin).toBe(true)
    expect(S.isAdmin).toBe(false)
    expect(crmSessionFor(p, viewer.user)).toBeNull()
    expect(crmSessionFor(p, editor.user)).toBeNull()
    expect(crmSessionFor(p, null)).toBeNull()
    expect(crmSessionFor(p, { id: 'x', roles: ['viewer'] })).toBeNull()
  })
  it('anti-abuse fields are admin-only at the API (not merely hidden)', async () => {
    const id = await manual(S)
    const asSales = await rest.get(`crm-rfqs/${id}`, sales.token)
    expect(asSales.status).toBe(200)
    for (const f of ['submission_key', 'content_fingerprint', 'raw_payload_hash', 'client_submission_id'])
      expect(asSales.body[f], f).toBeUndefined()
    const asAdmin = await rest.get(`crm-rfqs/${id}`, admin.token)
    expect(String(asAdmin.body.submission_key)).toMatch(new RegExp(`^${MANUAL_KEY_PREFIX}`))
    // The workspace loader, running as Sales, therefore never holds them either.
    const d = await loadRfq(S, id)
    expect(d!.rfq.submission_key).toBeUndefined()
    expect(d!.rfq.content_fingerprint).toBeUndefined()
  })
  it('viewer and editor cannot read RFQs through REST (CRM-1 boundary unchanged)', async () => {
    for (const u of [viewer, editor]) expect([401, 403]).toContain((await rest.get('crm-rfqs', u.token)).status)
  })
})

describe('W2 assignment (server-enforced)', () => {
  it('assignment collision: two users claim the same version at once — exactly one wins, the other is STALE', async () => {
    const id = await manual(S)
    const v = String((await rfq(id)).updatedAt)
    const [a, b] = await Promise.all([
      m.assignRfq(S, { rfqId: id, assigneeId: 'me', expectedUpdatedAt: v }),
      m.assignRfq(S2, { rfqId: id, assigneeId: 'me', expectedUpdatedAt: v }),
    ])
    expect([a, b].filter((r) => r.ok)).toHaveLength(1)
    const loser = [a, b].find((r) => !r.ok)
    expect(loser && !loser.ok ? loser.code : '').toBe('STALE')
    const owner = String((await rfq(id)).assignee)
    expect(a.ok ? S.userId : S2.userId).toBe(owner)
  })
  it('Sales may assign themselves and another CRM user; assigned_at is stamped and logged', async () => {
    const id = await manual(S)
    expect((await m.assignRfq(S, { rfqId: id, assigneeId: 'me' })).ok).toBe(true)
    let r = await rfq(id)
    expect(String(r.assignee)).toBe(S.userId)
    expect(r.assigned_at).toBeTruthy()
    expect((await m.assignRfq(S, { rfqId: id, assigneeId: S2.userId })).ok).toBe(true)
    r = await rfq(id)
    expect(String(r.assignee)).toBe(S2.userId)
    const p = await payload()
    const acts = await p.find({ collection: 'crm-activities', where: { and: [{ rfq: { equals: id } }, { type: { equals: 'RFQ_ASSIGNED' } }] }, ...sys })
    expect(acts.totalDocs).toBeGreaterThanOrEqual(2)
  })
  it('a non-CRM user can never be the assignee — workspace and crafted REST alike', async () => {
    const id = await manual(S)
    const out = await m.assignRfq(S, { rfqId: id, assigneeId: viewer.id })
    expect(out.ok).toBe(false)
    expect(out.ok ? '' : out.code).toBe('RFQ_ASSIGNEE_NOT_CRM_USER')
    const crafted = await rest.patch(`crm-rfqs/${id}`, sales.token, { assignee: editor.id })
    expect(crafted.status).toBe(400)
    expect((await rfq(id)).assignee ?? null).toBeNull()
  })
  it('a malformed assignee id is refused without poisoning the request transaction', async () => {
    const id = await manual(S)
    const crafted = await rest.patch(`crm-rfqs/${id}`, sales.token, { assignee: 'not-a-uuid' })
    expect([400, 404]).toContain(crafted.status)
    expect((await m.assignRfq(S, { rfqId: id, assigneeId: 'me' })).ok).toBe(true)
  })
  it('Sales cannot remove an owner; an admin can', async () => {
    const id = await manual(S, { assigneeId: S.userId })
    const out = await m.assignRfq(S, { rfqId: id, assigneeId: '' })
    expect(out.ok ? '' : out.code).toBe('RFQ_UNASSIGN_PRIVILEGED')
    expect((await rest.patch(`crm-rfqs/${id}`, sales.token, { assignee: null })).status).toBe(403)
    expect((await m.assignRfq(A, { rfqId: id, assigneeId: '' })).ok).toBe(true)
    expect((await rfq(id)).assignee ?? null).toBeNull()
  })
  it('the open first-response task follows the RFQ owner', async () => {
    const id = await manual(S)
    const p = await payload()
    const task = async () =>
      (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: id } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    expect((await task()).assignee ?? null).toBeNull()
    await m.assignRfq(S, { rfqId: id, assigneeId: 'me' })
    expect(String((await task()).assignee)).toBe(S.userId)
    await m.assignRfq(S, { rfqId: id, assigneeId: S2.userId })
    expect(String((await task()).assignee)).toBe(S2.userId)
  })
  it('task assignees must hold a CRM role too (crafted REST)', async () => {
    const id = await manual(S)
    const p = await payload()
    const t = (await p.find({ collection: 'crm-tasks', where: { rfq: { equals: id } }, ...sys })).docs[0]!
    expect((await rest.patch(`crm-tasks/${t.id}`, sales.token, { assignee: viewer.id })).status).toBe(400)
  })
  it('a stale assignment is refused with the change that won', async () => {
    const id = await manual(S)
    const before = String((await rfq(id)).updatedAt)
    await new Promise((r) => setTimeout(r, 5))
    expect((await m.assignRfq(S2, { rfqId: id, assigneeId: 'me', expectedUpdatedAt: before })).ok).toBe(true)
    const late = await m.assignRfq(S, { rfqId: id, assigneeId: 'me', expectedUpdatedAt: before })
    expect(late.ok).toBe(false)
    if (!late.ok) {
      expect(late.code).toBe('STALE')
      expect(late.message).toMatch(/changed while you were working/)
    }
    expect(String((await rfq(id)).assignee)).toBe(S2.userId)
  })
})

describe('W3 lifecycle: qualify, close, reopen', () => {
  it('qualification needs a linked account — server-enforced, including crafted REST', async () => {
    const id = await manual(S)
    await m.startReview(S, { rfqId: id })
    const out = await m.qualifyRfq(S, { rfqId: id, motion: 'PARTS' })
    expect(out.ok ? '' : out.code).toBe('RFQ_QUALIFIED_WITHOUT_ACCOUNT')
    expect((await rest.patch(`crm-rfqs/${id}`, sales.token, { status: 'QUALIFIED', motion: 'PARTS' })).status).toBe(400)
    const acc = await account('Qualify Target (synthetic)')
    expect((await m.linkAccount(S, { rfqId: id, accountId: acc })).ok).toBe(true)
    expect((await m.qualifyRfq(S, { rfqId: id, motion: 'PARTS' })).ok).toBe(true)
    const r = await rfq(id)
    expect(r.status).toBe('QUALIFIED')
    expect(r.opportunity ?? null).toBeNull() // Convert is deferred: qualifying creates nothing
    expect(r.account_match_state).toBe('MANUAL')
  })
  it('closing needs a reason; a duplicate needs a real RFQ number', async () => {
    const id = await manual(S)
    const noReason = await m.closeRfq(S, { rfqId: id, outcome: 'CLOSED', reason: '' })
    expect(noReason.ok ? {} : noReason.fields).toHaveProperty('reason')
    const badDup = await m.closeRfq(S, { rfqId: id, outcome: 'DUPLICATE_OF_EXISTING', reason: 'same request', duplicateOfNumber: 'RFQ-20260101-ZZZZZZZZ' })
    expect(badDup.ok ? {} : badDup.fields).toHaveProperty('duplicateOfNumber')
    expect((await m.closeRfq(S, { rfqId: id, outcome: 'REJECTED_NON_CORE', reason: 'Residential HVAC, not industrial' })).ok).toBe(true)
  })
  it('reopening a terminal RFQ is admin-only (workspace and crafted REST)', async () => {
    const id = await manual(S)
    await m.closeRfq(S, { rfqId: id, outcome: 'CLOSED', reason: 'Customer withdrew' })
    const out = await m.reopenRfq(S, { rfqId: id })
    expect(out.ok ? '' : out.code).toBe('RFQ_REOPEN_PRIVILEGED')
    expect((await rest.patch(`crm-rfqs/${id}`, sales.token, { status: 'IN_REVIEW' })).status).toBe(403)
    expect((await rfq(id)).status).toBe('CLOSED')
    expect((await m.reopenRfq(A, { rfqId: id })).ok).toBe(true)
    expect((await rfq(id)).status).toBe('IN_REVIEW')
  })
})

describe('W4 identity review and suppression permissions', () => {
  it('identity-review resolution is admin-only', async () => {
    const acc = await account('Harbor Cooling Works (synthetic)')
    void acc
    const id = await manual(S, { email: 'buyer@harbor-synthetic.example.com', company: 'Harbor Cooling Works (synthetic)' })
    const p = await payload()
    const review = (await p.find({ collection: 'crm-identity-reviews', where: { rfq: { equals: id } }, ...sys })).docs[0]!
    expect(review).toBeTruthy()
    expect((await rest.patch(`crm-identity-reviews/${review.id}`, sales.token, { state: 'DISMISSED' })).status).toBe(403)
    const bySales = await m.resolveReview(S, { reviewId: review.id, state: 'DISMISSED', note: 'n/a' })
    expect(bySales.ok).toBe(false)
    expect((await m.resolveReview(A, { reviewId: review.id, state: 'CONFIRMED_DISTINCT', note: 'Different company' })).ok).toBe(true)
  })
  it('Sales may apply do-not-contact; only an admin may clear it', async () => {
    const id = await manual(S, { email: 'dnc.person@example.test', phone: '' })
    const contact = String((await rfq(id)).contact)
    expect((await m.applyDoNotContact(S, { contactId: contact, note: 'Asked not to be called' })).ok).toBe(true)
    const d = await loadRfq(S, id)
    expect(d!.suppressions).toHaveLength(1)
    expect(d!.row.flags.doNotContact).toBe(true)
    const sup = String(d!.suppressions[0]!.id)
    const bySales = await m.clearSuppression(S, { contactId: contact, suppressionId: sup, note: 'Customer asked again' })
    expect(bySales.ok ? '' : bySales.code).toBe('SUPPRESSION_CLEAR_PRIVILEGED')
    expect((await m.clearSuppression(A, { contactId: contact, suppressionId: sup, note: 'Customer asked to be contacted again' })).ok).toBe(true)
    expect((await loadRfq(S, id))!.suppressions).toHaveLength(0)
    // Recording a past call is still possible for a suppressed contact.
    await m.applyDoNotContact(S, { contactId: contact, note: 'Asked again not to be called' })
    expect((await m.logActivity(S, { rfqId: id, type: 'CALL', summary: 'Customer called us back' })).ok).toBe(true)
  })
})

describe('W5 follow-ups / tasks', () => {
  it('create, complete (idempotent, race-safe), admin-only reopen, change due date', async () => {
    const id = await manual(S)
    expect((await m.createFollowUp(S, { title: 'x', due: '2026-10-01' })).ok).toBe(false) // no subject
    const bad = await m.createFollowUp(S, { rfqId: id, title: '', due: 'soon' })
    expect(bad.ok ? {} : bad.fields).toMatchObject({ title: expect.any(String), due: expect.any(String) })
    expect((await m.createFollowUp(S, { rfqId: id, title: 'Send drawings', due: '2026-10-01' })).ok).toBe(true)
    const p = await payload()
    const t = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: id } }, { kind: { equals: 'FOLLOW_UP' } }] }, ...sys })).docs[0]!
    expect(String((t as unknown as Doc).assignee)).toBe(S.userId)
    const results = await Promise.all([1, 2, 3].map(() => m.completeTask(S, { taskId: t.id })))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(results.filter((r) => r.ok && r.message === 'Follow-up done.')).toHaveLength(1)
    const done = await p.find({ collection: 'crm-activities', where: { and: [{ task: { equals: t.id } }, { type: { equals: 'TASK_COMPLETED' } }] }, ...sys })
    expect(done.totalDocs).toBe(1)
    expect((await m.reopenTask(S, { taskId: t.id })).ok ? '' : 'refused').toBe('refused')
    expect((await rest.patch(`crm-tasks/${t.id}`, sales.token, { status: 'OPEN' })).status).toBe(403)
    const reopened = await Promise.all([1, 2].map(() => m.reopenTask(A, { taskId: t.id })))
    expect(reopened.every((r) => r.ok)).toBe(true)
    expect(reopened.filter((r) => r.ok && r.message === 'Follow-up reopened.')).toHaveLength(1)
    const fresh = (await p.findByID({ collection: 'crm-tasks', id: t.id, ...sys })) as unknown as Doc
    expect(fresh.status).toBe('OPEN')
    expect((await m.changeDueDate(S, { taskId: t.id, due: '2026-10-05', expectedUpdatedAt: String(fresh.updatedAt) })).ok).toBe(true)
    const stale = await m.changeDueDate(S, { taskId: t.id, due: '2026-10-06', expectedUpdatedAt: String(fresh.updatedAt) })
    expect(stale.ok ? '' : stale.code).toBe('STALE')
  })
  it('request information → waiting for customer → customer replied', async () => {
    const id = await manual(S, { assigneeId: S.userId })
    await m.startReview(S, { rfqId: id })
    expect((await m.requestInformation(S, { rfqId: id, missing: 'Fan diameter and hub type', due: '2026-10-02' })).ok).toBe(true)
    expect((await rfq(id)).qualification_state).toBe('INCOMPLETE')
    const inbox = await loadInbox(S, parseInboxParams({ view: 'waiting' }))
    expect(inbox.rows.map((r) => r.id)).toContain(id)
    const work = await loadMyWork(S, 'mine')
    expect(work.waiting.status === 'ok' && work.waiting.data.rows.some((t) => t.rfqId === id)).toBe(true)
    const task = work.waiting.status === 'ok' ? work.waiting.data.rows.find((t) => t.rfqId === id)! : null
    const replies = await Promise.all([1, 2].map(() => m.customerReplied(S, { taskId: task!.id })))
    expect(replies.every((r) => r.ok)).toBe(true)
    const p = await payload()
    const reply = await p.find({ collection: 'crm-activities', where: { and: [{ rfq: { equals: id } }, { type: { equals: 'REPLY_REFERENCE' } }] }, ...sys })
    expect(reply.totalDocs).toBe(1)
    const follow = await loadFollowUps(S, { who: 'mine', when: 'done' })
    expect(follow.rows.some((t) => t.id === task!.id)).toBe(true)
  })
})

describe('W6 manual New Inquiry', () => {
  it('phone-only: saved as MANUAL_ENTRY, no contact, no items, no fabricated links; actor recorded', async () => {
    const out = await createManualInquiry(S, { token: uuidv7(), firstName: 'Pat', lastName: 'Example', phone: '+1 (555) 0101', message: 'Needs a gearbox quote.', company: 'Nowhere Mills (synthetic)', motion: 'PARTS' })
    if (!out.ok) throw new Error(out.message)
    const r = await rfq(String(out.id))
    expect(r.source_system).toBe('MANUAL_ENTRY')
    expect(r.contact ?? null).toBeNull()
    expect(r.account ?? null).toBeNull()
    expect(r.contact_match_state).toBe('NO_VALID_EMAIL')
    expect(r.motion).toBe('PARTS')
    const p = await payload()
    expect((await p.count({ collection: 'crm-rfq-items', where: { rfq: { equals: String(out.id) } } })).totalDocs).toBe(0)
    const created = (await p.find({ collection: 'crm-activities', where: { and: [{ rfq: { equals: String(out.id) } }, { type: { equals: 'RFQ_CREATED' } }] }, ...sys })).docs[0] as unknown as Doc
    expect(String(created.actor)).toBe(S.userId)
    expect(created.actor_kind).toBe('USER')
  })
  it('email-only: a contact is created by the CRM-1 exact-email rule', async () => {
    const out = await createManualInquiry(S, { token: uuidv7(), email: 'new.person@example.test', message: 'Fill media question.' })
    const r = await rfq(String(out.ok ? out.id : ''))
    expect(r.contact_match_state).toBe('CREATED_NEW_CONTACT')
    expect(r.contact).toBeTruthy()
  })
  it('validation: a way to reach the customer and the request are required; phone must be complete', async () => {
    const none = await createManualInquiry(S, { token: uuidv7(), message: '' })
    expect(none.ok).toBe(false)
    if (!none.ok) expect(Object.keys(none.fields ?? {})).toEqual(expect.arrayContaining(['email', 'phone', 'message']))
    const shortPhone = await createManualInquiry(S, { token: uuidv7(), phone: '555-01', message: 'x' })
    expect(shortPhone.ok ? {} : shortPhone.fields).toHaveProperty('phone')
    const badToken = await createManualInquiry(S, { token: 'nope', phone: '+1 555 0102', message: 'x' })
    expect(badToken.ok ? '' : badToken.code).toBe('INVALID_TOKEN')
  })
  it('double submit (sequential and concurrent) creates exactly one RFQ', async () => {
    const token = uuidv7()
    const input = { token, phone: '+1 555 0103', message: 'Drift eliminator replacement.' }
    const results = await Promise.all([createManualInquiry(S, input), createManualInquiry(S, input), createManualInquiry(S, input)])
    const ids = new Set(results.map((r) => (r.ok ? r.id : 'x')))
    expect(ids.size).toBe(1)
    const again = await createManualInquiry(S, input)
    expect(again.ok && again.id).toBe([...ids][0])
    const p = await payload()
    expect((await p.count({ collection: 'crm-rfqs', where: { submission_key: { equals: `${MANUAL_KEY_PREFIX}${token}` } }, overrideAccess: true })).totalDocs).toBe(1)
  })
  it('amendment B: same email with a different name stays UNLINKED and opens a CRM-1 identity review', async () => {
    await createManualInquiry(S, { token: uuidv7(), email: 'shared.inbox@example.test', firstName: 'Alex', lastName: 'Original', message: 'first' })
    const out = await createManualInquiry(S, { token: uuidv7(), email: 'shared.inbox@example.test', firstName: 'Jordan', lastName: 'Different', message: 'second' })
    const r = await rfq(String(out.ok ? out.id : ''))
    expect(r.contact ?? null).toBeNull()
    expect(r.status).toBe('NEEDS_REVIEW')
    expect(out.ok && out.notices).toContain('EMAIL_NAME_MISMATCH')
    const p = await payload()
    const reviews = await p.find({ collection: 'crm-identity-reviews', where: { rfq: { equals: String(r.id) } }, ...sys })
    expect(reviews.docs.map((x) => (x as unknown as Doc).reason)).toContain('EMAIL_MATCH_NAME_MISMATCH')
  })
  it('a verified domain links the account deterministically; a similar company name does not', async () => {
    const acc = await account('Verified Domain Plant Co (synthetic)', 'verified-plant.example.com')
    const linked = await createManualInquiry(S, { token: uuidv7(), email: 'eng@verified-plant.example.com', message: 'Rebuild quote.' })
    expect(String((await rfq(String(linked.ok ? linked.id : ''))).account)).toBe(acc)
    await account('Prairie Thermal Systems (synthetic)')
    const similar = await createManualInquiry(S, { token: uuidv7(), email: 'ops@unrelated-domain.example.com', company: 'Prairie Thermal Systems (synthetic)', message: 'Repair visit.' })
    const r = await rfq(String(similar.ok ? similar.id : ''))
    expect(r.account ?? null).toBeNull()
    expect(similar.ok && similar.notices).toContain('COMPANY_SIMILAR')
  })
  it('a non-CRM owner is refused at create', async () => {
    const out = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555 0104', message: 'x', assigneeId: viewer.id })
    expect(out.ok ? '' : out.code).toBe('RFQ_ASSIGNEE_NOT_CRM_USER')
  })
})

describe('W7 grouped pipeline (no totals, unknown values named)', () => {
  it('groups by stage in the accepted order and never sums amounts', async () => {
    const p = await payload()
    const acc = await account('Pipeline Account (synthetic)')
    const mk = (name: string, stage: string, extra: Doc = {}) =>
      p.create({
        collection: 'crm-opportunities',
        data: { name, account: acc, owner: S.userId, motion: 'REPAIR', stage, provenance: { source_system: 'SYNTHETIC_FIXTURE' }, ...extra } as never,
        context: { crmServer: {} },
        ...sys,
      })
    await mk('Cell 3 repair (synthetic)', 'QUALIFIED')
    await mk('Fan stack replacement (synthetic)', 'PROPOSAL', { amount_status: 'KNOWN', amount: 12500, currency: 'USD' })
    const groups = await loadPipeline(S, { owner: null, includeClosed: false })
    const stages = groups.map((g) => g.stage)
    expect(stages.indexOf('QUALIFIED')).toBeLessThan(stages.indexOf('PROPOSAL'))
    expect(stages).not.toContain('WON')
    const q = groups.find((g) => g.stage === 'QUALIFIED')!
    expect(q.rows[0]!.value.kind).not.toBe('KNOWN')
    expect(JSON.stringify(groups)).not.toMatch(/"total"|"sum"/i)
    const mine = await loadPipeline(S2, { owner: 'me', includeClosed: false })
    expect(mine.every((g) => g.count === 0)).toBe(true)
  })
})

describe('W8 malformed / cross-record relationship ids', () => {
  it('bad ids never reach a query; missing records are not found; cross-account site is refused', async () => {
    const id = await manual(S)
    const bad = await m.linkAccount(S, { rfqId: id, accountId: 'not-a-uuid' })
    expect(bad.ok ? '' : bad.code).toBe('INVALID_ID')
    const nf = await m.linkAccount(S, { rfqId: id, accountId: '0190f7a2-0000-7000-8000-000000000000' })
    expect(nf.ok ? '' : nf.code).toBe('NOT_FOUND')
    const inj = await m.assignRfq(S, { rfqId: "1' OR 1=1 --", assigneeId: 'me' })
    expect(inj.ok ? '' : inj.code).toBe('INVALID_ID')
    const badOwner = await m.assignRfq(S, { rfqId: id, assigneeId: '../../users/1' })
    expect(badOwner.ok ? '' : badOwner.code).toBe('INVALID_ID')
    expect(await loadRfq(S, 'garbage')).toBeNull()
    expect(await loadAccount(S, '../etc')).toBeNull()
    expect(parseInboxParams({ account: 'x', contact: '1', owner: 'drop table' })).toMatchObject({ account: null, contact: null, owner: null })
    const p = await payload()
    const accA = await account('Site Owner A (synthetic)')
    const accB = await account('Site Owner B (synthetic)')
    const siteB = await p.create({ collection: 'crm-sites', data: { account: accB, site_name: 'B Plant (synthetic)', provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })
    await m.linkAccount(S, { rfqId: id, accountId: accA })
    const cross = await m.associateSite(S, { rfqId: id, siteId: String(siteB.id) })
    expect(cross.ok ? '' : cross.code).toBe('RFQ_SITE_OTHER_ACCOUNT')
  })
})

describe('W9 read models', () => {
  it('My Work keeps new & unassigned visible under Mine; inbox search and views work', async () => {
    const id = await manual(S2, { company: 'Searchable Unique Mills (synthetic)' })
    const mine = await loadMyWork(S, 'mine')
    expect(mine.unassigned.status === 'ok' && mine.unassigned.data.rows.some((r) => r.id === id)).toBe(true)
    const r = await rfq(id)
    const byNumber = await loadInbox(S, parseInboxParams({ q: String(r.rfq_number) }))
    expect(byNumber.rows.map((x) => x.id)).toEqual([id])
    const byCompany = await loadInbox(S, parseInboxParams({ q: 'Searchable Unique' }))
    expect(byCompany.rows.map((x) => x.id)).toContain(id)
    const unassigned = await loadInbox(S, parseInboxParams({ view: 'unassigned' }))
    expect(unassigned.rows.every((x) => x.ownerId === null)).toBe(true)
    expect(unassigned.viewCounts.unassigned).toBeGreaterThan(0)
  })
  it('account context lists related inquiries without fabricating plants or towers', async () => {
    const acc = await account('Context Account (synthetic)', 'context-account.example.com')
    await manual(S, { email: 'buyer@context-account.example.com', phone: '' })
    const a = await loadAccount(S, acc)
    expect(a!.rfqs.length).toBe(1)
    expect(a!.sites).toEqual([])
    expect(a!.contacts.length).toBe(1)
  })
})
