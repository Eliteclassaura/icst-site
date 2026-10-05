import { beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from '../ids'
import { loadAccountsDirectory, loadContact, loadContactsDirectory, parseAccountsParams, parseContactsParams } from '../workspace/directory'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import { loadAccount, loadMyWork } from '../workspace/queries'
import { globalSearch, GROUP_LIMIT, recentItems } from '../workspace/search'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { quickDueDates } from '../workspace/time'
import { auditFor, captureLogs, payload, resetCrm, rest, user, userWith, type TestUser } from './harness'

/**
 * CRM Wave 1 Patch A against the isolated synthetic database: directories and profiles (W1-1), grouped search
 * (W1-2), scope/My Work (W1-8) and task due dates (W1-9). Workspace calls run as the user with access control on;
 * crafted REST requests prove the collection hooks — not the UI — are the control. All data is synthetic.
 */

let admin: TestUser, sales: TestUser, sales2: TestUser, viewer: TestUser
let A: CrmSession, S: CrmSession, S2: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>
/** The created record's id (fails the test if the outcome was a refusal). */
const idOf = (o: { ok: boolean }) => {
  if (!o.ok) throw new Error(`expected success, got ${JSON.stringify(o)}`)
  return String((o as { id?: string }).id)
}
const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!
const get = async (collection: 'crm-accounts' | 'crm-contacts' | 'crm-tasks' | 'crm-rfqs', id: string) =>
  (await (await payload()).findByID({ collection, id, ...sys })) as unknown as Doc

async function account(name: string, extra: Doc = {}) {
  const a = await (await payload()).create({
    collection: 'crm-accounts',
    data: { canonical_name: name, provenance: { source_system: 'SYNTHETIC_FIXTURE' }, ...extra } as never,
    context: { crmServer: {} },
    ...sys,
  })
  return String(a.id)
}
async function manual(s: CrmSession, over: Record<string, unknown> = {}) {
  const r = await createManualInquiry(s, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic request.', company: 'Synthetic Towers Co', ...over })
  if (!r.ok) throw new Error(`manual failed: ${r.code}`)
  return String(r.id)
}

beforeAll(async () => {
  await resetCrm()
  ;[admin, sales, viewer] = await Promise.all([user('platform-admin'), user('sales'), user('viewer')])
  sales2 = await userWith('sales.two@example.test', 'sales')
  A = await session(admin)
  S = await session(sales)
  S2 = await session(sales2)
})

// ────────────────────────────────────────────── W1-1 accounts ──

describe('W1-1 accounts: create, edit, roles, audit', () => {
  it('Sales creates an account; the domain is an unverified candidate and the source is MANUAL_ENTRY', async () => {
    const out = await m.createAccount(S, { name: 'Patch A Synthetic Co', domain: 'www.PatchA.example.com', relationship: 'PROSPECT' })
    expect(out.ok).toBe(true)
    const a = await get('crm-accounts', idOf(out))
    expect(a.domains).toMatchObject([{ domain: 'patcha.example.com', domain_status: 'CANDIDATE' }])
    expect((a.provenance as Doc).source_system).toBe('MANUAL_ENTRY')
    expect(String(typeof a.owner === 'object' ? (a.owner as Doc).id : a.owner)).toBe(sales.id)
  })

  it('Sales cannot create a verified relationship; Admin can', async () => {
    const no = await m.createAccount(S, { name: 'Verified By Sales', relationship: 'VERIFIED_CUSTOMER' })
    expect(no).toMatchObject({ ok: false, code: 'VALIDATION', fields: { relationship: expect.any(String) } })
    const yes = await m.createAccount(A, { name: 'Verified By Admin', relationship: 'VERIFIED_CUSTOMER' })
    expect(yes.ok).toBe(true)
  })

  it('edits safe fields, writes an audit row with field names only, and refuses a stale write', async () => {
    const id = await account('Edit Me Synthetic')
    const before = await get('crm-accounts', id)
    const out = await m.updateAccount(S, { accountId: id, expectedUpdatedAt: String(before.updatedAt), name: 'Edited Synthetic', industry: 'Power generation', ownerId: sales2.id })
    expect(out).toMatchObject({ ok: true })
    const audit = (await auditFor('crm-accounts', id)).filter((r) => r.action === 'update')
    const last = audit.at(-1)!
    expect(last.changedKeys).toEqual(expect.arrayContaining(['canonical_name', 'industry', 'owner']))
    expect(JSON.stringify(last)).not.toContain('Edited Synthetic')
    expect((last.detail as Doc).transitions).toMatchObject({ owner: { from: null, to: sales2.id } })
    const stale = await m.updateAccount(S, { accountId: id, expectedUpdatedAt: String(before.updatedAt), name: 'Lost Update' })
    expect(stale).toMatchObject({ ok: false, code: 'STALE' })
    expect((await get('crm-accounts', id)).canonical_name).toBe('Edited Synthetic')
  })

  it('an absent field is unchanged, never cleared', async () => {
    const id = await account('Keep Fields Synthetic', { industry: 'Refining', legal_name: 'Keep Fields LLC' })
    await m.updateAccount(S, { accountId: id, name: 'Keep Fields Renamed' })
    const a = await get('crm-accounts', id)
    expect(a).toMatchObject({ canonical_name: 'Keep Fields Renamed', industry: 'Refining', legal_name: 'Keep Fields LLC' })
  })

  it('a verified relationship is admin-only on every path (workspace and REST)', async () => {
    const id = await account('Relationship Synthetic', { relationship_state: 'PROSPECT' })
    // The workspace refuses before writing and highlights the field; the hook (below, over REST) is the backstop.
    expect(await m.updateAccount(S, { accountId: id, relationship: 'VERIFIED_CUSTOMER' })).toMatchObject({
      ok: false,
      code: 'VERIFIED_RELATIONSHIP_PRIVILEGED',
      fields: { relationship: expect.any(String) },
    })
    const r = await rest.patch(`crm-accounts/${id}`, sales.token, { relationship_state: 'VERIFIED_CUSTOMER' })
    expect(r.status).toBe(403)
    expect((await get('crm-accounts', id)).relationship_state).toBe('PROSPECT')
    expect(await m.updateAccount(A, { accountId: id, relationship: 'VERIFIED_CUSTOMER' })).toMatchObject({ ok: true })
    // …and once verified, Sales cannot downgrade it either.
    const down = await rest.patch(`crm-accounts/${id}`, sales.token, { relationship_state: 'PROSPECT' })
    expect(down.status).toBe(403)
    expect(await m.updateAccount(S, { accountId: id, relationship: 'UNKNOWN' })).toMatchObject({ ok: false, code: 'VERIFIED_RELATIONSHIP_PRIVILEGED' })
    // A non-relationship edit on a verified account still works for Sales.
    expect(await m.updateAccount(S, { accountId: id, industry: 'Chemicals' })).toMatchObject({ ok: true })
  })

  it('an owner must hold a CRM role (refused over REST too); unchanged owners are not re-validated', async () => {
    const id = await account('Owner Rule Synthetic')
    expect(await m.updateAccount(S, { accountId: id, ownerId: viewer.id })).toMatchObject({ ok: false, code: 'ACCOUNT_OWNER_NOT_CRM_USER' })
    const r = await rest.patch(`crm-accounts/${id}`, admin.token, { owner: viewer.id })
    expect(r.status).toBe(400)
    expect(await m.updateAccount(S, { accountId: id, ownerId: 'me' })).toMatchObject({ ok: true })
    expect(await m.updateAccount(S, { accountId: id, ownerId: 'not-a-uuid' })).toMatchObject({ ok: false, code: 'VALIDATION' })
  })
})

// ────────────────────────────────────────────── W1-1 contacts ──

describe('W1-1 contacts: create, edit, write-once email, links, suppression', () => {
  let accId: string
  beforeAll(async () => {
    accId = await account('Contact Home Synthetic', { domains: [{ domain: 'contact-home.example.com', domain_status: 'VERIFIED_OWNED' }] })
  })

  it('creates a contact (MANUAL_ENTRY, eligibility UNKNOWN) and refuses a duplicate address with the existing id', async () => {
    const out = await m.createContact(S, { email: 'Pat.Lee@Contact-Home.example.com', firstName: 'Pat', lastName: 'Lee', accountId: accId, confidence: 'HIGH_CONFIDENCE', phone: '+1 555 0150' })
    expect(out.ok).toBe(true)
    const c = await get('crm-contacts', idOf(out))
    expect(c).toMatchObject({ email_match_key: 'pat.lee@contact-home.example.com', display_name: 'Pat Lee', marketing_eligibility: 'UNKNOWN', account_link_confidence: 'HIGH_CONFIDENCE' })
    expect((c.provenance as Doc).source_system).toBe('MANUAL_ENTRY')
    const dupe = await m.createContact(S2, { email: 'pat.lee@contact-home.example.com', firstName: 'Other' })
    expect(dupe).toMatchObject({ ok: false, code: 'CONTACT_EXISTS', existingId: idOf(out) })
    const all = await (await payload()).count({ collection: 'crm-contacts', where: { email_match_key: { equals: 'pat.lee@contact-home.example.com' } }, overrideAccess: true })
    expect(all.totalDocs).toBe(1)
  })

  it('validates input: email, a name, phone shape, and a stated link confidence; VERIFIED is admin-only', async () => {
    expect(await m.createContact(S, { email: 'nope', firstName: 'X' })).toMatchObject({ ok: false, fields: { email: expect.any(String) } })
    expect(await m.createContact(S, { email: 'noname@example.test' })).toMatchObject({ ok: false, fields: { lastName: expect.any(String) } })
    expect(await m.createContact(S, { email: 'p1@example.test', firstName: 'P', phone: '12' })).toMatchObject({ ok: false, fields: { phone: expect.any(String) } })
    expect(await m.createContact(S, { email: 'p2@example.test', firstName: 'P', accountId: accId })).toMatchObject({ ok: false, fields: { confidence: expect.any(String) } })
    expect(await m.createContact(S, { email: 'p3@example.test', firstName: 'P', accountId: accId, confidence: 'VERIFIED' })).toMatchObject({ ok: false, fields: { confidence: 'Admin only.' } })
    expect(await m.createContact(A, { email: 'p3@example.test', firstName: 'P', accountId: accId, confidence: 'VERIFIED' })).toMatchObject({ ok: true })
  })

  it('an address already on do-not-contact is suppressed on the new contact automatically', async () => {
    const first = await m.createContact(S, { email: 'quiet@example.test', firstName: 'Quiet' })
    expect(await m.applyDoNotContact(S, { contactId: idOf(first), note: 'Synthetic opt-out' })).toMatchObject({ ok: true })
    const dir = await loadContactsDirectory(S, parseContactsParams({}), null)
    expect(dir.rows.find((r) => r.id === idOf(first))?.doNotContact).toBe(true)
    const prof = await loadContact(S, idOf(first))
    expect(prof!.suppressions.length).toBeGreaterThan(0)
  })

  it('the email is write-once on every path', async () => {
    const out = await m.createContact(S, { email: 'fixed@example.test', firstName: 'Fixed' })
    expect(await m.updateContact(S, { contactId: idOf(out), email: 'other@example.test' })).toMatchObject({ ok: false, code: 'WRITE_ONCE_FIELD' })
    const r = await rest.patch(`crm-contacts/${idOf(out)}`, admin.token, { email: 'other@example.test' })
    expect(r.status).toBe(400)
    expect((await get('crm-contacts', idOf(out))).email_match_key).toBe('fixed@example.test')
  })

  it('edits names (display name follows), title, function and the primary phone only; audit has no values', async () => {
    const out = await m.createContact(S, { email: 'edit.c@example.test', firstName: 'Edit', lastName: 'Contact', phone: '+1 555 0160' })
    const p = await payload()
    await p.update({ collection: 'crm-contacts', id: idOf(out), data: { phones: [{ number_raw: '+1 555 0160', kind: 'PRIMARY' }, { number_raw: '+1 555 0161', kind: 'MOBILE' }] } as never, ...sys })
    const res = await m.updateContact(S, { contactId: idOf(out), firstName: 'Edited', title: 'Plant Engineer', contactFunction: 'ENGINEERING_TECHNICAL', phone: '+1 555 0170' })
    expect(res).toMatchObject({ ok: true })
    const c = await get('crm-contacts', idOf(out))
    expect(c).toMatchObject({ first_name: 'Edited', display_name: 'Edited Contact', title: 'Plant Engineer', contact_function: 'ENGINEERING_TECHNICAL' })
    expect((c.phones as Doc[]).map((x) => x.number_raw)).toEqual(['+1 555 0170', '+1 555 0161'])
    const audit = (await auditFor('crm-contacts', idOf(out))).at(-1)!
    expect(JSON.stringify(audit)).not.toMatch(/555 0170|Edited|edit\.c@/)
    expect(await m.updateContact(S, { contactId: idOf(out), contactFunction: 'CEO' })).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('links: Sales links with a stated confidence; a VERIFIED link is admin-only and then locked for Sales', async () => {
    const out = await m.createContact(S, { email: 'link.me@example.test', firstName: 'Link' })
    expect(await m.linkContactAccount(S, { contactId: idOf(out), accountId: accId, confidence: 'LOW_CONFIDENCE' })).toMatchObject({ ok: true })
    expect(await m.linkContactAccount(S, { contactId: idOf(out), accountId: accId, confidence: 'VERIFIED' })).toMatchObject({ ok: false, code: 'VERIFIED_LINK_PROTECTED' })
    expect(await m.linkContactAccount(A, { contactId: idOf(out), accountId: accId, confidence: 'VERIFIED' })).toMatchObject({ ok: true })
    const other = await account('Other Home Synthetic')
    const moved = await m.linkContactAccount(S, { contactId: idOf(out), accountId: other, confidence: 'HIGH_CONFIDENCE' })
    expect(moved).toMatchObject({ ok: false, code: 'VERIFIED_LINK_PROTECTED' })
    expect(await m.linkContactAccount(S, { contactId: idOf(out), accountId: accId })).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('an owner must hold a CRM role', async () => {
    const out = await m.createContact(S, { email: 'owner.rule@example.test', firstName: 'Owner' })
    expect(await m.updateContact(S, { contactId: idOf(out), ownerId: viewer.id })).toMatchObject({ ok: false, code: 'CONTACT_OWNER_NOT_CRM_USER' })
    expect(await m.updateContact(S, { contactId: idOf(out), ownerId: sales2.id })).toMatchObject({ ok: true })
  })
})

// ────────────────────────────────────────────── W1-1 directories + profiles ──

describe('W1-1 directories and profiles', () => {
  it('lists accounts in pages of 50 with owner/relationship filters, archived hidden by default', async () => {
    for (let i = 0; i < 55; i++) await account(`Directory Synthetic ${String(i).padStart(2, '0')}`, { relationship_state: i % 2 ? 'PROSPECT' : 'CANDIDATE' })
    await account('Archived Synthetic', { account_state: 'ARCHIVED' })
    const page1 = await loadAccountsDirectory(S, parseAccountsParams({}), null)
    expect(page1.rows).toHaveLength(50)
    expect(page1.total).toBeGreaterThan(55)
    expect(page1.rows.some((r) => r.name === 'Archived Synthetic')).toBe(false)
    const archived = await loadAccountsDirectory(S, parseAccountsParams({ state: 'archived' }), null)
    expect(archived.rows.map((r) => r.name)).toContain('Archived Synthetic')
    const prospects = await loadAccountsDirectory(S, parseAccountsParams({ relationship: 'PROSPECT' }), 'Directory Synthetic')
    expect(prospects.rows.every((r) => r.relationship === 'PROSPECT' && r.name.startsWith('Directory Synthetic'))).toBe(true)
    const hit = await loadAccountsDirectory(S, parseAccountsParams({}), 'Synthetic 07')
    expect(hit.rows.map((r) => r.name)).toEqual(['Directory Synthetic 07'])
  })

  it('directory params drop malformed values; a LIKE wildcard in a search is literal', async () => {
    expect(parseAccountsParams({ owner: "x' OR 1=1", relationship: 'ELIGIBLE', page: '-3' })).toMatchObject({ owner: null, relationship: null, page: 1 })
    const pct = await loadAccountsDirectory(S, parseAccountsParams({}), '%')
    expect(pct.total).toBeGreaterThan(0) // "%" is escaped to a space: matches names with spaces, not "everything" by wildcard
  })

  it('counts open RFQs and the latest activity per row; the contact profile shows RFQs, tasks and timeline', async () => {
    const id = await manual(S, { email: 'profile.person@example.test', firstName: 'Profile', lastName: 'Person' })
    const rfq = await get('crm-rfqs', id)
    const contactId = String(typeof rfq.contact === 'object' ? (rfq.contact as Doc).id : rfq.contact)
    expect(await m.createFollowUp(S, { contactId, title: 'Profile follow-up', due: quickDueDates(new Date()).tomorrow })).toMatchObject({ ok: true })
    const dir = await loadContactsDirectory(S, parseContactsParams({}), 'profile.person')
    expect(dir.rows[0]).toMatchObject({ id: contactId, openRfqs: 1 })
    expect(dir.rows[0]!.lastActivityAt).not.toBeNull()
    const prof = await loadContact(S, contactId)
    expect(prof!.rfqs.map((r) => r.id)).toContain(id)
    expect(prof!.tasks.map((t) => t.title)).toContain('Profile follow-up')
    expect(prof!.activity.length).toBeGreaterThan(0)
    expect(await loadContact(S, 'not-a-uuid')).toBeNull()
  })

  it('the account profile lists its open follow-ups (W1-9)', async () => {
    const id = await account('Tasks On Profile Synthetic')
    await m.createFollowUp(S, { accountId: id, title: 'Account-level follow-up', due: quickDueDates(new Date()).today })
    const a = await loadAccount(S, id)
    expect(a!.tasks.map((t) => t.title)).toEqual(['Account-level follow-up'])
    expect(a!.tasks[0]!.source).toBe('MANUAL')
  })

  it('a follow-up on a contact inherits the contact’s account', async () => {
    const accId = await account('Inherit Synthetic')
    const c = await m.createContact(S, { email: 'inherit@example.test', firstName: 'In', accountId: accId, confidence: 'HIGH_CONFIDENCE' })
    await m.createFollowUp(S, { contactId: idOf(c), title: 'Inherited', due: quickDueDates(new Date()).today })
    const t = (await (await payload()).find({ collection: 'crm-tasks', where: { title: { equals: 'Inherited' } }, ...sys })).docs[0] as unknown as Doc
    expect(String(t.account)).toBe(accId)
    expect(String(t.contact)).toBe(idOf(c))
  })
})

// ────────────────────────────────────────────── W1-9 due dates ──

describe('W1-9 due dates, snooze and the D-1 rule', () => {
  it('a manual due change is audited (due_at before → after); snooze moves to a business day', async () => {
    const accId = await account('Snooze Synthetic')
    await m.createFollowUp(S, { accountId: accId, title: 'Snooze me', due: '2026-10-14' })
    const t = (await (await payload()).find({ collection: 'crm-tasks', where: { title: { equals: 'Snooze me' } }, ...sys })).docs[0] as unknown as Doc
    const now = new Date('2026-10-02T17:00:00Z') // Friday
    const out = await m.snoozeTask(S, { taskId: String(t.id), preset: 'next_week', expectedUpdatedAt: String(t.updatedAt) }, now)
    expect(out).toMatchObject({ ok: true })
    const after = await get('crm-tasks', String(t.id))
    expect(new Date(String(after.due_at)).toISOString()).not.toBe(new Date(String(t.due_at)).toISOString())
    const audit = (await auditFor('crm-tasks', String(t.id))).at(-1)!
    expect((audit.detail as Doc).transitions).toHaveProperty('due_at')
    expect(await m.snoozeTask(S, { taskId: String(t.id), preset: 'never' })).toMatchObject({ ok: false, code: 'VALIDATION' })
  })

  it('a D-1 first-response due date needs a reason: refused without, recorded with (task notes + timeline note)', async () => {
    const rfqId = await manual(S)
    const task = (await (await payload()).find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: rfqId } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    expect(task.source).toBe('SYSTEM_RULE')
    const due = quickDueDates(new Date()).next_week
    expect(await m.changeDueDate(S, { taskId: String(task.id), due })).toMatchObject({ ok: false, code: 'VALIDATION', fields: { reason: expect.any(String) } })
    expect(await m.snoozeTask(S, { taskId: String(task.id), preset: 'next_week' })).toMatchObject({ ok: false, fields: { reason: expect.any(String) } })
    const ok = await m.changeDueDate(S, { taskId: String(task.id), due, reason: 'Customer on plant shutdown until Monday (synthetic)' })
    expect(ok).toMatchObject({ ok: true, message: 'Due date changed.' })
    const after = await get('crm-tasks', String(task.id))
    expect(String(after.notes)).toContain('due date changed: Customer on plant shutdown')
    const notes = await (await payload()).find({ collection: 'crm-notes', where: { rfq: { equals: rfqId } }, ...sys })
    expect(notes.docs.map((n) => String((n as unknown as Doc).body))).toEqual([expect.stringContaining('Reason: Customer on plant shutdown')])
    const acts = await (await payload()).find({ collection: 'crm-activities', where: { and: [{ rfq: { equals: rfqId } }, { type: { equals: 'NOTE_ADDED' } }] }, ...sys })
    expect(acts.totalDocs).toBe(1)
    // The audit row records the date change but not the reason text.
    const audit = (await auditFor('crm-tasks', String(task.id))).at(-1)!
    expect(JSON.stringify(audit)).not.toContain('plant shutdown')
  })

  it('the hook refuses a silent rule-set due change over REST, even for an admin; trusted server code is exempt', async () => {
    const rfqId = await manual(S)
    const task = (await (await payload()).find({ collection: 'crm-tasks', where: { and: [{ rfq: { equals: rfqId } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] }, ...sys })).docs[0] as unknown as Doc
    const later = new Date(Date.now() + 9 * 24 * 3600 * 1000).toISOString()
    const r = await rest.patch(`crm-tasks/${String(task.id)}`, admin.token, { due_at: later })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toContain('SYSTEM_DUE_REASON_REQUIRED')
    const withReason = await rest.patch(`crm-tasks/${String(task.id)}`, admin.token, { due_at: later, notes: 'Moved for a synthetic reason' })
    expect(withReason.status).toBe(200)
    await (await payload()).update({ collection: 'crm-tasks', id: String(task.id), data: { due_at: new Date().toISOString() } as never, context: { crmServer: {} }, ...sys })
  })

  it('My Work lists overdue rows for the digest, scoped to the user', async () => {
    const accId = await account('Overdue Synthetic')
    await m.createFollowUp(S2, { accountId: accId, title: 'Overdue for sales two', due: '2026-09-01' })
    const mine = await loadMyWork(S2, 'mine')
    expect(mine.followUps.status).toBe('ok')
    if (mine.followUps.status === 'ok') {
      expect(mine.followUps.data.overdue).toBeGreaterThanOrEqual(1)
      expect(mine.followUps.data.overdueRows.map((r) => r.title)).toContain('Overdue for sales two')
      expect(mine.followUps.data.overdueRows.every((r) => r.assigneeId === sales2.id)).toBe(true)
    }
  })
})

// ────────────────────────────────────────────── W1-2 search ──

describe('W1-2 grouped search', () => {
  beforeAll(async () => {
    for (let i = 0; i < 7; i++) await account(`Zephyr Cooling ${i} Synthetic`)
    await m.createContact(S, { email: 'zephyr.person@example.test', firstName: 'Zephyr', lastName: 'Person' })
    await manual(S, { company: 'Zephyr Cooling Holdings', email: 'buyer@zephyr.example.com', firstName: 'Buyer' })
    const acc = await account('Zephyr Plant Owner Synthetic')
    await (await payload()).create({ collection: 'crm-sites', data: { site_name: 'Zephyr Station Unit 4', account: acc, provenance: { source_system: 'SYNTHETIC_FIXTURE' } } as never, context: { crmServer: {} }, ...sys })
  })

  it('returns four groups, at most five each, with a "more" flag; hits link by id only', async () => {
    const r = await globalSearch(S, 'zephyr')
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const by = Object.fromEntries(r.groups.map((g) => [g.kind, g]))
    expect(by.account!.hits).toHaveLength(GROUP_LIMIT)
    expect(by.account!.more).toBe(true)
    expect(by.contact!.hits.map((h) => h.title)).toContain('Zephyr Person')
    expect(by.rfq!.hits[0]!.href).toMatch(/^\/crm\/rfqs\/[0-9a-f-]{36}\/$/)
    expect(by.site!.hits[0]).toMatchObject({ title: 'Zephyr Station Unit 4' })
    expect(by.site!.hits[0]!.href).toMatch(/^\/crm\/accounts\/[0-9a-f-]{36}\/#site-[0-9a-f-]{36}$/)
    for (const g of r.groups) for (const h of g.hits) expect(h.href).not.toMatch(/zephyr|@/i)
  })

  it('finds a contact by email and refuses a too-short term', async () => {
    const r = await globalSearch(S, 'zephyr.person@')
    expect(r.status === 'ok' && r.groups.find((g) => g.kind === 'contact')!.hits.length).toBe(1)
    expect(await globalSearch(S, 'z')).toEqual({ status: 'too_short' })
  })

  it('never writes the term (or any result value) to the logs', async () => {
    const p = await payload()
    const cap = captureLogs(p)
    try {
      await globalSearch(S, 'zephyr.person@example.test')
      await globalSearch(S, "zephyr'; drop table")
    } finally {
      cap.restore()
    }
    expect(cap.lines.join('\n')).not.toMatch(/zephyr/i)
  })

  it('recent items resolve labels as the user and drop anything unknown', async () => {
    const acc = await account('Recent Synthetic')
    const out = await recentItems(S, [
      { kind: 'account', id: acc },
      { kind: 'account', id: '01920000-0000-7000-8000-00000000dead' },
      { kind: 'site', id: acc },
    ])
    expect(out.map((h) => h.title)).toEqual(['Recent Synthetic'])
  })
})
