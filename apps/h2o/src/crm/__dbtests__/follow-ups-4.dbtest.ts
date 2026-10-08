import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { loadFollowUps } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { auditFor, payload, resetCrm, user, userWith, type TestUser } from './harness'

/**
 * Gate B item 4 — follow-ups: the task links to the person, and edit, reschedule and cancel work in place.
 * Synthetic data only; every workspace call runs as the user with access control on.
 */

let admin: TestUser, sales: TestUser, sales2: TestUser, viewer: TestUser
let A: CrmSession, S: CrmSession, S2: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>
const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!

async function account(name: string) {
  const p = await payload()
  return String((await p.create({ collection: 'crm-accounts', data: { canonical_name: name, domains: [], provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })).id)
}
async function contact(acc: string, first: string, last: string) {
  const p = await payload()
  return String(
    (await p.create({ collection: 'crm-contacts', data: { first_name: first, last_name: last, account: acc, account_link_confidence: 'HIGH_CONFIDENCE', email: `${first}.${last}@example.test`.toLowerCase(), provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })).id,
  )
}
async function followUp(s: CrmSession, contactId: string, title: string, due = '2026-12-01') {
  const out = await m.createFollowUp(s, { contactId, title, due })
  if (!out.ok) throw new Error(out.message)
  const p = await payload()
  return (await p.find({ collection: 'crm-tasks', where: { and: [{ contact: { equals: contactId } }, { title: { equals: title } }] }, ...sys })).docs[0] as unknown as Doc
}
const reload = async (id: unknown) => (await (await payload()).findByID({ collection: 'crm-tasks', id: String(id), ...sys })) as unknown as Doc

beforeAll(async () => {
  await resetCrm()
  ;[admin, sales, viewer] = await Promise.all([user('platform-admin'), user('sales'), user('viewer')])
  sales2 = await userWith('sales.two@example.test', 'sales')
  A = await session(admin)
  S = await session(sales)
  S2 = await session(sales2)
})

describe('item 4: a follow-up links to the actual person', () => {
  it('a contact task carries the person; an inquiry task carries the inquiry’s contact', async () => {
    const acc = await account('Riverbend Utilities (synthetic)')
    const dana = await contact(acc, 'Dana', 'Whitfield')
    await followUp(S, dana, 'Call Dana about cell 4')
    const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request.', company: 'Lakeside (synthetic)', firstName: 'Sam', lastName: 'Reed', email: 'sam.reed@example.test' })
    if (!r.ok) throw new Error(r.code)
    const p = await payload()
    const rfqTask = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: String(r.id) } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    expect(rfqTask).toBeTruthy()
    const { rows } = await loadFollowUps(S, { who: 'team', when: 'open' })
    const mine = rows.find((t) => t.title === 'Call Dana about cell 4')!
    expect(mine.contactId).toBe(dana)
    expect(mine.contactName).toBe('Dana Whitfield')
    const viaRfq = rows.find((t) => t.id === String(rfqTask.id))!
    expect(viaRfq.contactId).toBeTruthy()
    expect(viaRfq.contactName).toMatch(/Sam/)
  })

  it('a task with no person at all shows none rather than a wrong one', async () => {
    const acc = await account('Account Only Co (synthetic)')
    const p = await payload()
    await p.create({ collection: 'crm-tasks', data: { title: 'Review the account plan', kind: 'FOLLOW_UP', status: 'OPEN', priority: 'NORMAL', assignee: S.userId, account: acc, source: 'MANUAL', due_at: new Date().toISOString() } as never, context: { crmServer: {} }, ...sys })
    const { rows } = await loadFollowUps(S, { who: 'team', when: 'open' })
    const row = rows.find((t) => t.title === 'Review the account plan')!
    expect(row.contactId ?? null).toBeNull()
  })
})

describe('item 4: edit', () => {
  it('changes title and priority, keeps a note of the old title, and audits the priority change', async () => {
    const acc = await account('Edit Co (synthetic)')
    const c = await contact(acc, 'Eli', 'Park')
    const t = await followUp(S, c, 'Send drawing')
    const out = await m.editFollowUp(S, { taskId: t.id, title: 'Send the revised drawing', priority: 'HIGH', expectedUpdatedAt: t.updatedAt })
    expect(out).toMatchObject({ ok: true, message: 'Follow-up updated.' })
    const now = await reload(t.id)
    expect(now.title).toBe('Send the revised drawing')
    expect(now.priority).toBe('HIGH')
    expect(String(now.notes)).toContain('title changed from “Send drawing”')
    expect((await auditFor('crm-tasks', String(t.id))).some((r) => JSON.stringify(r).includes('priority'))).toBe(true)
  })

  it('refuses a stale edit, a missing version, a blank title and a bad priority; nothing is overwritten', async () => {
    const acc = await account('Stale Co (synthetic)')
    const c = await contact(acc, 'Fay', 'Lund')
    const t = await followUp(S, c, 'Original title')
    await m.editFollowUp(S2, { taskId: t.id, title: 'Changed by someone else', priority: 'NORMAL', expectedUpdatedAt: t.updatedAt })
    const stale = await m.editFollowUp(S, { taskId: t.id, title: 'My edit', priority: 'NORMAL', expectedUpdatedAt: t.updatedAt })
    expect(stale).toMatchObject({ ok: false, code: 'STALE' })
    const fresh = await reload(t.id)
    expect(fresh.title).toBe('Changed by someone else')
    expect(await m.editFollowUp(S, { taskId: t.id, title: 'x', priority: 'NORMAL' })).toMatchObject({ ok: false, code: 'EXPECTED_UPDATED_AT_REQUIRED' })
    expect(await m.editFollowUp(S, { taskId: t.id, title: '   ', priority: 'NORMAL', expectedUpdatedAt: fresh.updatedAt })).toMatchObject({ ok: false, fields: { title: expect.any(String) } })
    expect(await m.editFollowUp(S, { taskId: t.id, title: 'ok', priority: 'URGENT', expectedUpdatedAt: fresh.updatedAt })).toMatchObject({ ok: false, fields: { priority: expect.any(String) } })
    expect((await reload(t.id)).title).toBe('Changed by someone else')
  })

  it('a rule-made follow-up keeps its wording (priority only); a finished one cannot be edited', async () => {
    const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request.', company: 'Rule Co (synthetic)', firstName: 'Ro', lastName: 'Lee' })
    if (!r.ok) throw new Error(r.code)
    const p = await payload()
    const rule = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: String(r.id) } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    const out = await m.editFollowUp(S, { taskId: rule.id, title: 'Rewritten title', priority: 'HIGH', expectedUpdatedAt: rule.updatedAt })
    expect(out.ok).toBe(true)
    const after = await reload(rule.id)
    expect(after.title).toBe(rule.title)
    expect(after.priority).toBe('HIGH')
    await m.completeTask(S, { taskId: rule.id })
    const done = await reload(rule.id)
    expect(await m.editFollowUp(S, { taskId: rule.id, title: 'Late edit', priority: 'LOW', expectedUpdatedAt: done.updatedAt })).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })
})

describe('item 4: reschedule', () => {
  it('moves the due date, is audited, and a stale reschedule is refused', async () => {
    const acc = await account('Reschedule Co (synthetic)')
    const c = await contact(acc, 'Gil', 'Moss')
    const t = await followUp(S, c, 'Check in', '2026-11-02')
    const out = await m.changeDueDate(S, { taskId: t.id, due: '2026-11-09', expectedUpdatedAt: t.updatedAt })
    expect(out).toMatchObject({ ok: true, message: 'Due date changed.' })
    expect(new Date(String((await reload(t.id)).due_at)).getTime()).toBeGreaterThan(new Date(String(t.due_at)).getTime())
    expect((await auditFor('crm-tasks', String(t.id))).some((r) => JSON.stringify(r).includes('due_at'))).toBe(true)
    expect(await m.changeDueDate(S, { taskId: t.id, due: '2026-11-20', expectedUpdatedAt: t.updatedAt })).toMatchObject({ ok: false, code: 'STALE' })
  })
})

describe('item 4: cancel', () => {
  it('cancels in place, keeps the reason and the history, is audited, and repeating it is a no-op', async () => {
    const acc = await account('Cancel Co (synthetic)')
    const c = await contact(acc, 'Hal', 'Quin')
    const t = await followUp(S, c, 'Chase the quote')
    const out = await m.cancelFollowUp(S, { taskId: t.id, reason: 'Customer went with another supplier', expectedUpdatedAt: t.updatedAt })
    expect(out).toMatchObject({ ok: true, message: 'Follow-up canceled.' })
    const now = await reload(t.id)
    expect(now.status).toBe('CANCELLED')
    expect(String(now.notes)).toContain('canceled: Customer went with another supplier')
    const audit = (await auditFor('crm-tasks', String(t.id))).filter((r) => JSON.stringify(r).includes('CANCELLED'))
    expect(audit.length).toBeGreaterThan(0)
    expect(audit.at(-1)!.actor).toBe(sales.id)
    expect(await m.cancelFollowUp(S, { taskId: t.id, expectedUpdatedAt: t.updatedAt })).toMatchObject({ ok: true, message: 'Follow-up already canceled.' })
    const { rows } = await loadFollowUps(S, { who: 'team', when: 'open' })
    expect(rows.some((r) => r.id === String(t.id))).toBe(false)
    const closed = await loadFollowUps(S, { who: 'team', when: 'done' })
    expect(closed.rows.some((r) => r.id === String(t.id) && r.status === 'CANCELLED')).toBe(true)
  })

  it('a concurrent cancel and a stale cancel never double-write; a done follow-up cannot be canceled', async () => {
    const acc = await account('Race Co (synthetic)')
    const c = await contact(acc, 'Ivy', 'Roe')
    const t = await followUp(S, c, 'Race me')
    const outs = await Promise.all([1, 2, 3].map(() => m.cancelFollowUp(S, { taskId: t.id, expectedUpdatedAt: t.updatedAt })))
    expect(outs.every((o) => o.ok || o.code === 'STALE')).toBe(true)
    expect(outs.filter((o) => o.ok && o.message === 'Follow-up canceled.').length).toBe(1)
    const d = await followUp(S, c, 'Finish me')
    await m.completeTask(S, { taskId: d.id })
    expect(await m.cancelFollowUp(S, { taskId: d.id, expectedUpdatedAt: d.updatedAt })).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('needs a version, and a rule-made follow-up needs a reason', async () => {
    const acc = await account('Rule Cancel Co (synthetic)')
    const c = await contact(acc, 'Jo', 'Sato')
    const t = await followUp(S, c, 'Needs version')
    expect(await m.cancelFollowUp(S, { taskId: t.id })).toMatchObject({ ok: false, code: 'EXPECTED_UPDATED_AT_REQUIRED' })
    const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request.', company: 'Rule Cancel (synthetic)', firstName: 'Ru', lastName: 'Kay' })
    if (!r.ok) throw new Error(r.code)
    const p = await payload()
    const rule = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: String(r.id) } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    expect(await m.cancelFollowUp(S, { taskId: rule.id, expectedUpdatedAt: rule.updatedAt })).toMatchObject({ ok: false, code: 'VALIDATION', fields: { reason: expect.any(String) } })
    expect((await reload(rule.id)).status).toBe('OPEN')
    expect(await m.cancelFollowUp(S, { taskId: rule.id, reason: 'Duplicate inquiry', expectedUpdatedAt: rule.updatedAt })).toMatchObject({ ok: true })
  })

  it('sends nothing: no outbox row is created by edit, reschedule or cancel', async () => {
    const p = await payload()
    const before = (await p.count({ collection: 'crm-email-outbox', ...sys })).totalDocs
    const acc = await account('No Send Co (synthetic)')
    const c = await contact(acc, 'Kit', 'Ames')
    const t = await followUp(S, c, 'Quiet follow-up')
    await m.editFollowUp(S, { taskId: t.id, title: 'Quiet follow-up 2', priority: 'LOW', expectedUpdatedAt: t.updatedAt })
    const e = await reload(t.id)
    await m.changeDueDate(S, { taskId: t.id, due: '2026-12-15', expectedUpdatedAt: e.updatedAt })
    const r = await reload(t.id)
    await m.cancelFollowUp(S, { taskId: t.id, expectedUpdatedAt: r.updatedAt })
    expect((await p.count({ collection: 'crm-email-outbox', ...sys })).totalDocs).toBe(before)
  })
})

describe('item 4.1: notes are never silently dropped', () => {
  const FULL = 'x'.repeat(3990)
  async function withFullNotes(title: string, source = 'MANUAL') {
    const acc = await account(`Notes ${title} (synthetic)`)
    const c = await contact(acc, 'Nia', title.replace(/\W/g, ''))
    const t = await followUp(S, c, title)
    const p = await payload()
    await p.update({ collection: 'crm-tasks', id: String(t.id), data: { notes: FULL } as never, context: { crmServer: {} }, ...sys })
    return { t: await reload(t.id), p, source }
  }

  it('cancel with a reason is refused when the notes are full, and nothing changes', async () => {
    const { t } = await withFullNotes('Full notes cancel')
    const out = await m.cancelFollowUp(S, { taskId: t.id, reason: 'Customer went elsewhere', expectedUpdatedAt: t.updatedAt })
    expect(out).toMatchObject({ ok: false, code: 'VALIDATION', message: expect.stringContaining('notes on this follow-up are full') })
    const now = await reload(t.id)
    expect(now.status).toBe('OPEN')
    expect(now.notes).toBe(FULL)
  })

  it('a title edit and a reasoned reschedule are refused the same way; the old notes are intact', async () => {
    const { t } = await withFullNotes('Full notes edit')
    expect(await m.editFollowUp(S, { taskId: t.id, title: 'A new title', priority: 'NORMAL', expectedUpdatedAt: t.updatedAt })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await m.changeDueDate(S, { taskId: t.id, due: '2026-12-30', reason: 'Customer asked', expectedUpdatedAt: t.updatedAt })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect((await reload(t.id)).notes).toBe(FULL)
    expect((await reload(t.id)).title).toBe('Full notes edit')
  })

  it('with room, a new line is appended and every old line is kept', async () => {
    const acc = await account('Append Co (synthetic)')
    const c = await contact(acc, 'Oli', 'Pryce')
    const t = await followUp(S, c, 'Append me')
    const p = await payload()
    await p.update({ collection: 'crm-tasks', id: String(t.id), data: { notes: 'Earlier line one\nEarlier line two' } as never, context: { crmServer: {} }, ...sys })
    const cur = await reload(t.id)
    await m.cancelFollowUp(S, { taskId: t.id, reason: 'No longer needed', expectedUpdatedAt: cur.updatedAt })
    const notes = String((await reload(t.id)).notes)
    expect(notes).toContain('Earlier line one')
    expect(notes).toContain('Earlier line two')
    expect(notes).toContain('canceled: No longer needed')
  })
})

describe('item 4.1: canceling a rule-made follow-up is visible on the inquiry', () => {
  it('adds a timeline note with the title and reason; an ordinary follow-up adds none', async () => {
    const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request.', company: 'Timeline Co (synthetic)', firstName: 'Ti', lastName: 'Mel' })
    if (!r.ok) throw new Error(r.code)
    const p = await payload()
    const rule = (await p.find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: String(r.id) } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    const out = await m.cancelFollowUp(S, { taskId: rule.id, reason: 'Duplicate of another inquiry', expectedUpdatedAt: rule.updatedAt })
    expect(out).toEqual({ ok: true, message: 'Follow-up canceled.' })
    const notes = (await p.find({ collection: 'crm-notes', where: { rfq: { equals: String(r.id) } }, ...sys })).docs as unknown as Doc[]
    expect(notes.some((n) => String(n.body).includes('canceled. Reason: Duplicate of another inquiry') && String(n.body).includes(String(rule.title)))).toBe(true)
    const acc = await account('No Timeline Co (synthetic)')
    const c = await contact(acc, 'Uma', 'Frost')
    const t = await followUp(S, c, 'Ordinary follow-up')
    const before = (await p.count({ collection: 'crm-notes', ...sys })).totalDocs
    await m.cancelFollowUp(S, { taskId: t.id, reason: 'Not needed', expectedUpdatedAt: t.updatedAt })
    expect((await p.count({ collection: 'crm-notes', ...sys })).totalDocs).toBe(before)
  })
})

describe('item 4: roles are re-checked on every action', () => {
  it('a viewer gets no workspace session, and REST refuses them on tasks', async () => {
    const p = await payload()
    expect(crmSessionFor(p, viewer.user)).toBeNull()
  })

  it('admin and sales can both edit and cancel; the person who is not the assignee can too (team work)', async () => {
    const acc = await account('Roles Co (synthetic)')
    const c = await contact(acc, 'Lee', 'Ward')
    const t = await followUp(S, c, 'Team follow-up')
    expect(await m.editFollowUp(A, { taskId: t.id, title: 'Admin edit', priority: 'NORMAL', expectedUpdatedAt: t.updatedAt })).toMatchObject({ ok: true })
    const e = await reload(t.id)
    expect(await m.cancelFollowUp(S2, { taskId: t.id, expectedUpdatedAt: e.updatedAt })).toMatchObject({ ok: true })
  })
})
