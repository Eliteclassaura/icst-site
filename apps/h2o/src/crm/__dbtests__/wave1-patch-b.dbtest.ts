import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as exportGET } from '../../app/(crm)/crm/export/route'
import { POST as importPOST } from '../../app/(crm)/crm/import/run/route'
import { intakeConfig, signed, typeformDelivery, SYNTHETIC_FIELD_MAP, SYNTHETIC_SECRET } from '../fixtures/synthetic'
import { applyImport, nameFromDomain, planDomains, planImport, undoImport, undoRun, type Summary } from '../import/engine'
import { ingestTypeformDelivery } from '../intake/typeform/ingest'
import { matchAccount } from '../identity'
import { uuidv7 } from '../ids'
import { createManualInquiry } from '../workspace/manualInquiry'
import * as m from '../workspace/mutations'
import * as bulk from '../workspace/bulk'
import { deleteView, loadViews, saveView } from '../workspace/savedViews'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { auditFor, captureLogs, payload, resetCrm, rest, user, userWith, type TestUser } from './harness'

/**
 * CRM Wave 1 Patch B against the isolated synthetic database: import (W1-3, including CT's legacy-import conditions),
 * export (W1-4), bulk actions (W1-5) and saved views (W1-6). Everything synthetic (example.test / example.com and
 * public-provider probe addresses). Workspace calls run as the user; REST and route calls prove the server controls.
 */

let admin: TestUser, sales: TestUser, sales2: TestUser
let A: CrmSession, S: CrmSession
const sys = { overrideAccess: true as const, depth: 0 }
type Doc = Record<string, unknown>
const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!
const count = async (collection: 'crm-contacts' | 'crm-accounts' | 'crm-import-batches' | 'crm-tasks' | 'crm-identity-reviews' | 'crm-suppressions' | 'audit-log', where: Doc = {}) =>
  (await (await payload()).count({ collection, where: where as never, overrideAccess: true })).totalDocs
const find = async (collection: 'crm-contacts' | 'crm-accounts', where: Doc) =>
  (await (await payload()).find({ collection, where: where as never, ...sys, limit: 100 })).docs as unknown as Doc[]
const ATTESTED = { createAccounts: true, attested: true, source: 'synthetic export 2026-10-05', basis: 'owner-attested existing customers (synthetic)' }
const MAP = { first_name: 0, last_name: 1, email: 2, mobile_phone: 3, phone: 4, company: 5 }
const HEADER = 'first_name,last_name,email,mobile_phone,primary_phone,company_name'
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n') + '\n'

async function account(name: string, extra: Doc = {}) {
  const a = await (await payload()).create({ collection: 'crm-accounts', data: { canonical_name: name, provenance: { source_system: 'SYNTHETIC_FIXTURE' }, ...extra } as never, context: { crmServer: {} }, ...sys })
  return String(a.id)
}
async function plan(s: CrmSession, text: string, options: Doc = ATTESTED) {
  const r = await planImport(s, text, MAP, options)
  if ('error' in r) throw new Error(r.error.code)
  return r.plan
}
async function applyOk(text: string, options: Doc = ATTESTED) {
  const p = await plan(A, text, options)
  const out = await applyImport(A, text, MAP, options, p.approval)
  if (!out.ok) throw new Error(out.code)
  return { plan: p, out }
}

beforeAll(async () => {
  process.env.H2O_IMPORT_PAUSE_MS = '0'
  process.env.H2O_IMPORT_MIN_FREE_MB = '0'
  process.env.H2O_OWN_EMAIL_DOMAINS = 'ics-own.example.com'
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  sales2 = await userWith('sales.two@example.test', 'sales')
  A = await session(admin)
  S = await session(sales)
})
beforeEach(async () => {
  await resetCrm()
  await (await payload()).delete({ collection: 'crm-saved-views', where: {}, overrideAccess: true })
})

// ────────────────────────────────────────────── W1-3 import ──

describe('W1-3 import: admin only, dry run writes nothing', () => {
  it('Sales cannot plan, apply or undo an import', async () => {
    const r = await planImport(S, csv('A,B,a@example.test,no,no,Acme'), MAP, {})
    expect(r).toMatchObject({ error: { code: 'FORBIDDEN' } })
    expect(await applyImport(S, csv('A,B,a@example.test,no,no,Acme'), MAP, {}, {})).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await undoImport(S, { batchId: uuidv7(), note: 'x' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('a dry run writes nothing (contacts, accounts, batches, tasks, reviews, audit unchanged)', async () => {
    const before = await Promise.all([count('crm-contacts'), count('crm-accounts'), count('crm-import-batches'), count('crm-tasks'), count('crm-identity-reviews'), count('audit-log')])
    const p = await plan(A, csv('Avery Quinn,,avery@acme-import.example.com,no,+1 303 555 0101,Acme Thermal', 'Jo,Ray,jo@free-probe.example.com,no,no,no'))
    expect(p.summary).toMatchObject({ rows: 2, create: 2, accountsCreate: 2 })
    const after = await Promise.all([count('crm-contacts'), count('crm-accounts'), count('crm-import-batches'), count('crm-tasks'), count('crm-identity-reviews'), count('audit-log')])
    expect(after).toEqual(before)
  })

  // CSV-FIX-1 (review R2-07): apply is bound to the plan's approval token, not to client-sent counts.
  it('apply refuses a dry run that no longer matches (data changed, or a tampered approval)', async () => {
    const text = csv('Avery,Quinn,stale@example.test,no,no,no')
    const p = await plan(A, text)
    await m.createContact(S, { email: 'stale@example.test', firstName: 'Avery', lastName: 'Quinn' })
    expect(await applyImport(A, text, MAP, ATTESTED, p.approval)).toMatchObject({ ok: false, code: 'STALE_DRY_RUN' })
    const p2 = await plan(A, text)
    expect(await applyImport(A, text, MAP, ATTESTED, '0'.repeat(64))).toMatchObject({ ok: false, code: 'STALE_DRY_RUN' })
    expect(await applyImport(A, text, MAP, ATTESTED, p2.summary)).toMatchObject({ ok: false, code: 'STALE_DRY_RUN' })
    expect(await count('crm-import-batches')).toBe(0)
  })
})

describe('W1-3 import: what an apply writes (CT legacy conditions)', () => {
  it('creates tagged contacts, accounts per corporate domain, never from free mail, no tasks, eligibility UNKNOWN', async () => {
    const tasksBefore = await count('crm-tasks')
    const text = csv(
      'Avery Jo Quinn,,avery@acme-import.example.com,no,(303) 555-0101,Acme Thermal Inc',
      'Blake,Ray,blake@acme-import.example.com,no,no,ACME Thermal',
      'Casey,Morgan,casey@nameless-import.example.com,no,9.17E+11,no',
      'Dana,Lee,dana.synthetic.probe@gmail.com,no,no,Some Co',
      'Eli,Ng,eli.synthetic.probe@gmx.de,no,no,no',
    )
    const { plan: p, out } = await applyOk(text)
    expect(out.summary).toMatchObject({ create: 5, accountsCreate: 2, contactsOnNewAccounts: 3 })
    expect(p.summary).toMatchObject({ unlinkedFreeMail: 2, phonesNormalised: 1, phonesDropped: 1, namesSplit: 1, accountsNamedFromDomain: 1 })
    const contacts = (await (await payload()).find({ collection: 'crm-contacts', ...sys, limit: 50 })).docs as unknown as Doc[]
    for (const c of contacts) {
      expect(c.marketing_eligibility).toBe('UNKNOWN')
      // CT ruling (E1.3): the attestation is a basis, not relationship evidence.
      expect(c.relationship_evidence).toBe('UNKNOWN')
      expect(c.relationship_basis).toBe('OWNER_ATTESTED_BATCH')
      expect(c.relationship_basis_batch).toBe((c.provenance as Doc).import_batch_id)
      expect(String((c.provenance as Doc).evidence_ref)).toContain('Owner attestation, legacy import')
      expect((c.provenance as Doc).source_system).toBe('LEGACY_IMPORT')
      expect((c.provenance as Doc).import_batch_id).toBeTruthy()
      expect((c.provenance as Doc).source_event_id).toBe(`import-file:${p.sha256.slice(0, 16)}`)
    }
    const avery = contacts.find((c) => c.email_match_key === 'avery@acme-import.example.com')!
    expect(avery).toMatchObject({ first_name: 'Avery Jo', last_name: 'Quinn', account_link_confidence: 'HIGH_CONFIDENCE' })
    expect((avery.phones as Doc[]).map((x) => [x.number_raw, x.kind])).toEqual([['+13035550101', 'PRIMARY']])
    expect(contacts.find((c) => String(c.email_match_key).endsWith('@gmail.com'))!.account ?? null).toBeNull()
    expect(contacts.find((c) => String(c.email_match_key).endsWith('@gmx.de'))!.account ?? null).toBeNull()
    const acme = (await find('crm-accounts', { 'domains.domain': { equals: 'acme-import.example.com' } }))[0]!
    expect(acme).toMatchObject({ canonical_name: 'Acme Thermal Inc', relationship_state: 'CANDIDATE', relationship_basis: 'OWNER_ATTESTED_BATCH', name_from_domain: false })
    expect((acme.domains as Doc[])[0]).toMatchObject({ domain_status: 'VERIFIED_OWNED', evidence_ref: expect.stringContaining('Owner attestation, legacy import') })
    const nameless = (await find('crm-accounts', { 'domains.domain': { equals: 'nameless-import.example.com' } }))[0]!
    // Named from the registrable label (on these reserved test domains that label is "example").
    expect(nameless).toMatchObject({ canonical_name: nameFromDomain('nameless-import.example.com'), name_from_domain: true })
    expect(await count('crm-tasks')).toBe(tasksBefore) // no follow-ups, no first-response tasks, no review tasks
  })

  it('without attestation, new accounts stay unverified candidates with an unknown relationship', async () => {
    await applyOk(csv('Avery,Quinn,avery@plain-import.example.com,no,no,Plain Co'), { createAccounts: true })
    const a = (await find('crm-accounts', { 'domains.domain': { equals: 'plain-import.example.com' } }))[0]!
    expect(a.relationship_state).toBe('UNKNOWN')
    expect((a.domains as Doc[])[0]!.domain_status).toBe('CANDIDATE')
  })

  it('a shared/role inbox is loaded unlinked with an identity review (no task) and does not create an account (E1.3 AR-007)', async () => {
    const { plan: p, out } = await applyOk(csv('Sales,Team,sales@role-import.example.com,no,no,Role Co', 'Info,Desk,info2@role-import.example.com,no,no,Role Co'))
    expect(p.summary).toMatchObject({ genericInboxReviews: 2, accountsCreate: 0 })
    expect(out.ok && out.summary.genericInboxReviews).toBe(2)
    const contacts = await find('crm-contacts', { email_domain: { equals: 'role-import.example.com' } })
    expect(contacts.every((c) => (c.account ?? null) === null)).toBe(true)
    expect(await count('crm-identity-reviews', { reason: { equals: 'GENERIC_SHARED_INBOX' } })).toBe(2)
    expect(await count('crm-tasks')).toBe(0)
  })

  it('the domain list takes a review decision from the non-generic rows even when a shared inbox comes first', async () => {
    const r = await planImport(A, csv('Info,Desk,info@mixed-import.example.com,no,no,Mixed Co', 'Ana,Ruiz,ana@mixed-import.example.com,no,no,Mixed Co', 'Ben,Ode,ben@mixed-import.example.com,no,no,Other Co'), MAP, { createAccounts: true })
    if ('error' in r) throw new Error(r.error.code)
    expect(r.plan.summary.accountReviews).toBe(1)
    expect(planDomains(r.plan)).toEqual([expect.objectContaining({ domain: 'mixed-import.example.com', contacts: 3, genericInboxes: 1, decision: 'DOMAIN_REVIEW' })])
  })

  it('a shared inbox naming another company neither sends the domain to review nor names the new account', async () => {
    const r = await planImport(A, csv('Info,Desk,info@hint-import.example.com,no,no,Other Co', 'Ana,Ruiz,ana@hint-import.example.com,no,no,Real Co'), MAP, { createAccounts: true })
    if ('error' in r) throw new Error(r.error.code)
    expect(r.plan.summary).toMatchObject({ accountsCreate: 1, accountReviews: 0, genericInboxReviews: 1 })
    expect(r.plan.newAccounts.get('hint-import.example.com')).toBe('Real Co')
  })

  it('a company cell that is an address or a pasted paragraph never names the new account', async () => {
    const r = await planImport(A, csv('Ana,Ruiz,ana@pasted-import.example.com,no,no,"Orders: write to orders@pasted-import.example.com, we reply in 2 days"'), MAP, { createAccounts: true })
    if ('error' in r) throw new Error(r.error.code)
    expect(r.plan.summary).toMatchObject({ accountsCreate: 1, accountsNamedFromDomain: 1 })
    expect(r.plan.newAccounts.get('pasted-import.example.com')).toBe(nameFromDomain('pasted-import.example.com'))
  })

  it('typo, disposable and own-domain addresses load flagged as written, never link or create an account (CT spot-check)', async () => {
    const { plan: p } = await applyOk(csv('Ana,Ruiz,ana@gmai.com,no,no,Ana Co', 'Bo,Li,bo@yopmail.com,no,no,Bo Co', 'Cy,Ng,cy@ics-own.example.com,no,no,ICS'))
    expect(p.summary).toMatchObject({ create: 3, accountsCreate: 0, addressSuspectTypo: 1, addressDisposable: 1, addressInternal: 1, unlinkedFreeMail: 0 })
    const byEmail = new Map((await find('crm-contacts', {})).map((c) => [String(c.email_match_key), c]))
    expect(byEmail.get('ana@gmai.com')).toMatchObject({ address_quality: 'SUSPECT_TYPO', account: null })
    expect(byEmail.get('bo@yopmail.com')).toMatchObject({ address_quality: 'DISPOSABLE', account: null })
    expect(byEmail.get('cy@ics-own.example.com')).toMatchObject({ address_quality: 'INTERNAL', internal_test_candidate: true, account: null })
    expect(await count('crm-accounts')).toBe(0)
  })

  it('a spam-pattern domain with no company name gets no account and one review (no task)', async () => {
    const { plan: p } = await applyOk(csv('Dee,Fox,dee@qx.spam-import.example.com,no,no,no', 'Eli,Fox,eli@qx.spam-import.example.com,no,no,no'))
    expect(p.summary).toMatchObject({ accountsCreate: 0, suspectDomainReviews: 1, addressSpamPattern: 2, accountReviews: 0 })
    expect(await count('crm-identity-reviews', { reason: { equals: 'SUSPECT_ADDRESS_DOMAIN' } })).toBe(1)
    expect((await find('crm-contacts', {})).every((c) => c.address_quality === 'SPAM_PATTERN' && (c.account ?? null) === null)).toBe(true)
    expect(await count('crm-tasks')).toBe(0)
  })

  it('the new account is named by the most frequent spelling, title-cased when all lowercase', async () => {
    const p = await plan(A, csv('A,One,a@freq-import.example.com,no,no,ACME Thermal', 'B,Two,b@freq-import.example.com,no,no,acme thermal', 'C,Three,c@freq-import.example.com,no,no,acme thermal'))
    expect(p.newAccounts.get('freq-import.example.com')).toBe('Acme Thermal')
  })

  it("creating accounts fails closed while ICS's own domains are not configured", async () => {
    const prev = process.env.H2O_OWN_EMAIL_DOMAINS
    delete process.env.H2O_OWN_EMAIL_DOMAINS
    try {
      expect(await planImport(A, csv('A,B,a@acme-import.example.com,no,no,Acme'), MAP, ATTESTED)).toMatchObject({ error: { code: 'OWN_DOMAINS_UNSET' } })
      expect('plan' in (await planImport(A, csv('A,B,a@acme-import.example.com,no,no,Acme'), MAP, {}))).toBe(true)
    } finally {
      process.env.H2O_OWN_EMAIL_DOMAINS = prev
    }
  })

  it('address quality is derived on create for everyone, changeable only by an admin, and blocks eligibility', async () => {
    const c = (await m.createContact(S, { email: 'typo@gmsil.com', firstName: 'Typo' })) as { id?: string }
    const id = String(c.id)
    const p = await payload()
    expect(((await p.findByID({ collection: 'crm-contacts', id, ...sys })) as unknown as Doc).address_quality).toBe('SUSPECT_TYPO')
    await rest.patch(`crm-contacts/${id}`, sales.token, { address_quality: null })
    expect(((await p.findByID({ collection: 'crm-contacts', id, ...sys })) as unknown as Doc).address_quality).toBe('SUSPECT_TYPO')
    await expect(
      p.update({ collection: 'crm-contacts', id, data: { marketing_eligibility: 'ELIGIBLE', relationship_evidence: 'ACTIVE_CUSTOMER' } as never, user: admin.user, overrideAccess: false, depth: 0 }),
    ).rejects.toThrow(/ELIGIBILITY_BLOCKED_BY_ADDRESS_QUALITY/)
  })

  it('intake never matches an account on a typo, disposable or own domain, even one recorded as verified', async () => {
    const p = await payload()
    for (const domain of ['gmai.com', 'yopmail.com', 'ics-own.example.com']) {
      await account(`Holder ${domain}`, { domains: [{ domain, domain_status: 'VERIFIED_OWNED', evidence_ref: 'synthetic' }] })
      expect((await matchAccount(p, domain, null)).kind, domain).toBe('FREE_EMAIL_DOMAIN')
    }
    await account('Control', { domains: [{ domain: 'control-import.example.com', domain_status: 'VERIFIED_OWNED', evidence_ref: 'synthetic' }] })
    expect((await matchAccount(p, 'control-import.example.com', null)).kind).not.toBe('FREE_EMAIL_DOMAIN')
  })

  it('Sales cannot set the owner-attested basis over REST (admin-only field)', async () => {
    const c = await m.createContact(S, { email: 'basis@example.test', firstName: 'Basis' })
    await rest.patch(`crm-contacts/${(c as { id?: string }).id}`, sales.token, { relationship_basis: 'OWNER_ATTESTED_BATCH', relationship_basis_batch: 'forged' })
    const after = (await (await payload()).findByID({ collection: 'crm-contacts', id: String((c as { id?: string }).id), ...sys })) as unknown as Doc
    expect(after.relationship_basis ?? null).toBeNull()
    expect(after.relationship_basis_batch ?? null).toBeNull()
  })

  it('attestation without a source and basis is refused', async () => {
    const r = await planImport(A, csv('A,B,a@example.test,no,no,no'), MAP, { attested: true })
    expect(r).toMatchObject({ error: { code: 'ATTESTATION_INCOMPLETE' } })
  })

  it('a domain whose rows name different companies opens one identity review (no task) and creates no account', async () => {
    await applyOk(csv('A,One,a1@split-import.example.com,no,no,Alpha Cooling', 'B,Two,b2@split-import.example.com,no,no,Beta Towers'))
    expect(await find('crm-accounts', { 'domains.domain': { equals: 'split-import.example.com' } })).toEqual([])
    const reviews = (await (await payload()).find({ collection: 'crm-identity-reviews', ...sys })).docs as unknown as Doc[]
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ reason: 'CONTACT_ACCOUNT_CONFLICT', state: 'OPEN' })
    expect(await count('crm-tasks')).toBe(0)
  })

  it('links by verified domain and never changes an existing account (CT ruling)', async () => {
    const unknownAcc = await account('Known Unknown', { domains: [{ domain: 'known-unknown.example.com', domain_status: 'VERIFIED_OWNED' }] })
    const prospect = await account('Known Prospect', { relationship_state: 'PROSPECT', domains: [{ domain: 'known-prospect.example.com', domain_status: 'VERIFIED_OWNED' }] })
    await applyOk(csv('A,B,a@known-unknown.example.com,no,no,whatever', 'C,D,c@known-prospect.example.com,no,no,whatever'))
    const [u, pr] = await Promise.all([(await payload()).findByID({ collection: 'crm-accounts', id: unknownAcc, ...sys }), (await payload()).findByID({ collection: 'crm-accounts', id: prospect, ...sys })])
    expect((u as unknown as Doc).relationship_state).toBe('UNKNOWN')
    expect((u as unknown as Doc).relationship_basis ?? null).toBeNull()
    expect((pr as unknown as Doc).relationship_state).toBe('PROSPECT')
    const c = (await find('crm-contacts', { email_match_key: { equals: 'c@known-prospect.example.com' } }))[0]!
    expect(String(c.account)).toBe(prospect)
  })

  it('fill-empty only: an existing value is kept; a name mismatch opens a review and writes nothing', async () => {
    const existing = await m.createContact(S, { email: 'keep@example.test', firstName: 'Kim', title: 'Plant Engineer' })
    const other = await m.createContact(S, { email: 'mismatch@example.test', firstName: 'Lee', lastName: 'Original' })
    await applyOk(csv('Kim,Fill,keep@example.test,no,(303) 555-0111,no', 'Someone,Else,mismatch@example.test,no,(303) 555-0122,no'))
    const kept = (await (await payload()).findByID({ collection: 'crm-contacts', id: String((existing as { id?: string }).id), ...sys })) as unknown as Doc
    expect(kept).toMatchObject({ first_name: 'Kim', last_name: 'Fill', title: 'Plant Engineer' })
    const mm = (await (await payload()).findByID({ collection: 'crm-contacts', id: String((other as { id?: string }).id), ...sys })) as unknown as Doc
    expect(mm).toMatchObject({ first_name: 'Lee', last_name: 'Original' })
    expect(mm.phones).toEqual([])
    expect(await count('crm-identity-reviews', { reason: { equals: 'EMAIL_MATCH_NAME_MISMATCH' } })).toBe(1)
  })

  it('re-applying the same file creates nothing', async () => {
    const text = csv('A,B,again@example.test,no,no,no')
    await applyOk(text)
    const p = await plan(A, text)
    expect(p.summary).toMatchObject({ create: 0, unchanged: 1 })
  })

  it('a do-not-contact column is honoured as a ledger suppression (source LEGACY_IMPORT)', async () => {
    const text = ['email,first_name,do_not_contact', 'quiet@example.test,Q,yes', 'loud@example.test,L,no'].join('\n')
    const map = { email: 0, first_name: 1, do_not_contact: 2 }
    const p = await planImport(A, text, map, {})
    if ('error' in p) throw new Error('plan')
    expect(p.plan.summary.suppressAdd).toBe(1)
    const out = await applyImport(A, text, map, {}, p.plan.approval)
    expect(out.ok).toBe(true)
    const sup = (await (await payload()).find({ collection: 'crm-suppressions', ...sys })).docs as unknown as Doc[]
    expect(sup).toHaveLength(1)
    expect(sup[0]).toMatchObject({ email_match_key: 'quiet@example.test', action: 'APPLY', reason: 'DO_NOT_CONTACT', source: 'LEGACY_IMPORT' })
  })

  it('stops before writing when available memory is under the limit', async () => {
    process.env.H2O_IMPORT_MIN_FREE_MB = String(10 ** 9)
    try {
      const text = csv('A,B,mem@example.test,no,no,no')
      const p = await plan(A, text)
      const out = await applyImport(A, text, MAP, ATTESTED, p.approval)
      expect(out).toMatchObject({ ok: true, batchIds: [], stopped: { code: 'LOW_MEMORY', fromRow: 1 } })
      expect(await count('crm-contacts')).toBe(0)
    } finally {
      process.env.H2O_IMPORT_MIN_FREE_MB = '0'
    }
  })
})

describe('W1-3 undo', () => {
  it('archives what the batch created, reverts untouched fills, keeps changed records and suppressions; audited', async () => {
    const filled = await m.createContact(S, { email: 'filled@example.test', firstName: 'Fil' })
    const touched = await m.createContact(S, { email: 'touched@example.test', firstName: 'Tou' })
    const { out } = await applyOk(csv('Fil,Last,filled@example.test,no,no,no', 'Tou,Last,touched@example.test,no,no,no', 'New,Person,new@undo-import.example.com,no,no,Undo Co'))
    if (!out.ok) throw new Error('apply')
    await new Promise((r) => setTimeout(r, 20))
    await m.updateContact(S, { contactId: (touched as { id?: string }).id, title: 'Changed after import' })
    expect(await undoImport(A, { batchId: out.batchIds[0], note: '' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    const u = await undoImport(A, { batchId: out.batchIds[0], note: 'Synthetic undo' })
    // Two accounts: one for undo-import.example.com, one for example.test (the corporate domain of the filled rows).
    expect(u).toMatchObject({ ok: true, counts: { contactsArchived: 1, accountsArchived: 2, fillsReverted: 1, fillsKeptChanged: 1 } })
    const f = (await (await payload()).findByID({ collection: 'crm-contacts', id: String((filled as { id?: string }).id), ...sys })) as unknown as Doc
    expect(f.last_name ?? null).toBeNull()
    const t = (await (await payload()).findByID({ collection: 'crm-contacts', id: String((touched as { id?: string }).id), ...sys })) as unknown as Doc
    expect(t.last_name).toBe('Last')
    const created = (await find('crm-contacts', { email_match_key: { equals: 'new@undo-import.example.com' } }))[0]!
    expect(created.record_state).toBe('ARCHIVED')
    expect(await count('crm-contacts')).toBe(3) // archived, never deleted
    const batch = (await (await payload()).findByID({ collection: 'crm-import-batches', id: out.batchIds[0]!, ...sys })) as unknown as Doc
    expect(batch).toMatchObject({ status: 'UNDONE', undo_note: 'Synthetic undo' })
    const audit = await auditFor('crm-import-batches', out.batchIds[0]!)
    expect(audit.some((r) => (r.detail as Doc)?.event === 'IMPORT_UNDONE')).toBe(true)
    expect(JSON.stringify(audit)).not.toMatch(/filled@|touched@|new@undo/)
    expect(await undoImport(A, { batchId: out.batchIds[0], note: 'again' })).toMatchObject({ ok: true, message: 'This batch was already undone.' })
  })

  it('a file over 2,000 rows is written as several batches, and the whole run can be undone together', async () => {
    const rows = Array.from({ length: 2005 }, (_, i) => `P${i},Probe,bulk${i}.synthetic.probe@gmail.com,no,no,no`)
    const { out } = await applyOk(csv(...rows))
    if (!out.ok) throw new Error('apply')
    expect(out.batchIds).toHaveLength(2)
    const batches = (await (await payload()).find({ collection: 'crm-import-batches', ...sys, sort: 'createdAt' })).docs as unknown as Doc[]
    expect(batches.map((b) => b.row_count)).toEqual([2000, 5])
    expect(batches.every((b) => b.source_label === ATTESTED.source && b.basis === ATTESTED.basis)).toBe(true)
    const r = await undoRun(A, { sha: String(batches[0]!.file_sha256), note: 'Synthetic run undo' })
    expect(r).toMatchObject({ ok: true })
    expect(await count('crm-contacts', { record_state: { equals: 'ACTIVE' } })).toBe(0)
  }, 300_000)
})

describe('W1-3 import route', () => {
  const req = (token: string | null, body: unknown, headers: Record<string, string> = {}) =>
    importPOST(new Request('http://127.0.0.1:3200/crm/import/run/', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `JWT ${token}` } : {}), ...headers }, body: JSON.stringify(body) }))
  it('refuses cross-site requests, anonymous users and Sales; admin dry run returns the plan; nothing logged', async () => {
    const body = { mode: 'dry', csv: csv('A,B,route@example.test,no,no,no'), mapping: MAP, options: {} }
    expect((await req(admin.token, body, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await req(null, body)).status).toBe(403)
    expect((await req(sales.token, body)).status).toBe(403)
    const cap = captureLogs(await payload())
    let res: Response
    try {
      res = await req(admin.token, body)
    } finally {
      cap.restore()
    }
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, plan: { summary: { rows: 1, create: 1 } } })
    expect(cap.lines.join('\n')).not.toContain('route@example.test')
  })
  it('apply streams progress then the result', async () => {
    const text = csv('A,B,stream@example.test,no,no,no')
    const p = await plan(A, text, {})
    const res = await req(admin.token, { mode: 'apply', csv: text, mapping: MAP, options: {}, approval: p.approval })
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as Doc)
    expect(lines.at(-1)).toMatchObject({ type: 'result', ok: true })
  })
})

describe('Free mail in intake (CT ruling §8.3)', () => {
  it('a Typeform inquiry from an extended free-mail domain never links an account, even one claiming the domain', async () => {
    const p = await payload()
    vi.spyOn(p, 'sendEmail').mockImplementation(async () => {
      throw new Error('EMAIL_FORBIDDEN')
    })
    await account('Probe Provider (synthetic)', { domains: [{ domain: 'comcast.net', domain_status: 'VERIFIED_OWNED' }] })
    for (const email of ['synthetic.probe@comcast.net', 'synthetic.probe@gmx.de']) {
      const s = signed(typeformDelivery({ email }), SYNTHETIC_SECRET)
      await ingestTypeformDelivery(p, { rawBody: s.raw, signature: s.signature, config: intakeConfig() })
    }
    const rfqs = (await p.find({ collection: 'crm-rfqs', ...sys })).docs as unknown as Doc[]
    expect(rfqs).toHaveLength(2)
    for (const r of rfqs) {
      expect(r.account ?? null).toBeNull()
      expect(r.account_match_state).toBe('FREE_EMAIL_DOMAIN')
    }
    vi.restoreAllMocks()
  })
})

// ────────────────────────────────────────────── W1-4 export ──

describe('W1-4 export', () => {
  const get = (token: string | null, qs: string, headers: Record<string, string> = {}) =>
    exportGET(new Request(`http://127.0.0.1:3200/crm/export/?${qs}`, { headers: { ...(token ? { authorization: `JWT ${token}` } : {}), ...headers } }))

  it('is admin-only and same-origin only', async () => {
    expect((await get(sales.token, 'list=contacts')).status).toBe(403)
    expect((await get(null, 'list=contacts')).status).toBe(403)
    expect((await get(admin.token, 'list=contacts', { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await get(admin.token, 'list=users')).status).toBe(400)
  })

  it('exports the filtered list with chosen columns, marks do-not-contact, neutralises formulas, audits without values', async () => {
    const a = await m.createContact(S, { email: 'formula@example.test', firstName: '=HYPERLINK("http://bad.example")', title: '+SUM(A1)' })
    await m.createContact(S, { email: 'plain@example.test', firstName: 'Plain' })
    await m.applyDoNotContact(S, { contactId: (a as { id?: string }).id, note: 'synthetic' })
    const res = await get(admin.token, 'list=contacts&cols=first_name,email,title,password')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const text = (await res.text()).replace(/^\uFEFF/, '')
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toBe('First name,Email,Title,Do not contact')
    expect(lines).toHaveLength(3)
    const f = lines.find((l) => l.includes('formula@'))!
    expect(f).toContain(`"'=HYPERLINK(""http://bad.example"")"`)
    expect(f).toContain("'+SUM(A1)")
    expect(f.endsWith('Do not contact')).toBe(true)
    const audit = (await (await payload()).find({ collection: 'audit-log', where: { action: { equals: 'export' } }, overrideAccess: true })).docs as unknown as Doc[]
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actor: admin.id, collection: 'crm-contacts' })
    expect(audit[0]!.detail).toMatchObject({ list: 'contacts', rowCount: 2, complete: true, columns: ['first_name', 'email', 'title', 'do_not_contact'] })
    expect(JSON.stringify(audit[0])).not.toMatch(/formula@|plain@|HYPERLINK/)
  })

  it('applies the on-screen search from the list-search cookie (never the URL) and filters', async () => {
    await m.createContact(S, { email: 'zz.find@example.test', firstName: 'Zed' })
    await m.createContact(S, { email: 'other@example.test', firstName: 'Other' })
    const res = await get(admin.token, 'list=contacts&cols=email&s=1', { cookie: 'crm_q_contacts=zz.find' })
    const lines = (await res.text()).trim().split('\r\n')
    expect(lines.slice(1)).toEqual(['zz.find@example.test,'])
    const audit = (await (await payload()).find({ collection: 'audit-log', where: { action: { equals: 'export' } }, overrideAccess: true })).docs as unknown as Doc[]
    expect((audit[0]!.detail as Doc).searchApplied).toBe(true)
    expect(JSON.stringify(audit)).not.toContain('zz.find')
  })
})

// ────────────────────────────────────────────── W1-5 bulk ──

describe('W1-5 bulk actions', () => {
  const manual = async (company: string) => {
    const r = await createManualInquiry(S, { token: uuidv7(), phone: '+1 555-0100', message: 'Synthetic.', company })
    if (!r.ok) throw new Error(r.code)
    return String(r.id)
  }
  const at = async (id: string) => String(((await (await payload()).findByID({ collection: 'crm-rfqs', id, ...sys })) as unknown as Doc).updatedAt)

  it('assigns many through the single-record path; a row changed since loading is reported, not overwritten', async () => {
    const ids = [await manual('Bulk One'), await manual('Bulk Two'), await manual('Bulk Three')]
    const stamps = await Promise.all(ids.map(at))
    await m.assignRfq(A, { rfqId: ids[2], assigneeId: admin.id })
    const out = await bulk.bulkAssignRfqs(S, { ids: ids.map((id, i) => `${id}|${stamps[i]}`).join(','), assigneeId: sales2.id })
    expect(out).toMatchObject({ ok: true, done: 2, failures: [{ id: ids[2], code: 'STALE' }] })
    expect(out.ok && out.message).toContain('changed by someone else')
    for (const id of ids.slice(0, 2)) {
      const audit = await auditFor('crm-rfqs', id)
      expect(audit.some((r) => (r.detail as Doc & { transitions?: Doc }).transitions && JSON.stringify(r.detail).includes(sales2.id))).toBe(true)
    }
  })

  it('closes many with one reason; refuses more than 100 or an empty reason', async () => {
    const ids = [await manual('Close One'), await manual('Close Two')]
    expect(await bulk.bulkCloseRfqs(S, { ids: ids.join(','), outcome: 'REJECTED_NON_CORE', reason: '' })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await bulk.bulkCloseRfqs(S, { ids: ids.join(','), outcome: 'DUPLICATE_OF_EXISTING', reason: 'x' })).toMatchObject({ ok: false })
    const out = await bulk.bulkCloseRfqs(S, { ids: ids.join(','), outcome: 'REJECTED_NON_CORE', reason: 'Synthetic bulk close' })
    expect(out).toMatchObject({ ok: true, done: 2, failures: [] })
    const many = Array.from({ length: 101 }, (_, i) => `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`).join(',')
    expect(await bulk.bulkCloseRfqs(S, { ids: many, outcome: 'CLOSED', reason: 'x' })).toMatchObject({ ok: false })
  })

  it('reschedules follow-ups in bulk; a rule-set (D-1) date without a reason is reported, the manual one moves', async () => {
    const rfq = await manual('Due Bulk')
    const first = ((await (await payload()).find({ collection: 'crm-tasks', where: { rfq: { equals: rfq } }, ...sys })).docs[0] as unknown as Doc)!
    await m.createFollowUp(S, { rfqId: rfq, title: 'Manual bulk task', due: '2026-10-07' })
    const manualTask = ((await (await payload()).find({ collection: 'crm-tasks', where: { title: { equals: 'Manual bulk task' } }, ...sys })).docs[0] as unknown as Doc)!
    const out = await bulk.bulkSetDue(S, { ids: `${String(first.id)},${String(manualTask.id)}`, due: '2026-10-20' })
    expect(out).toMatchObject({ ok: true, done: 1, failures: [{ id: String(first.id), code: 'VALIDATION' }] })
    expect(out.ok && out.message).toContain('need a reason')
  })

  it('marks follow-ups done and sets contact owners in bulk', async () => {
    const c1 = await m.createContact(S, { email: 'b1@example.test', firstName: 'B1' })
    const c2 = await m.createContact(S, { email: 'b2@example.test', firstName: 'B2' })
    const out = await bulk.bulkAssignContacts(S, { ids: `${(c1 as { id?: string }).id},${(c2 as { id?: string }).id}`, ownerId: sales2.id })
    expect(out).toMatchObject({ ok: true, done: 2 })
    const rfq = await manual('Done Bulk')
    const t = ((await (await payload()).find({ collection: 'crm-tasks', where: { rfq: { equals: rfq } }, ...sys })).docs[0] as unknown as Doc)!
    expect(await bulk.bulkCompleteTasks(S, { ids: String(t.id) })).toMatchObject({ ok: true, done: 1 })
  })
})

// ────────────────────────────────────────────── W1-6 saved views ──

describe('W1-6 saved views', () => {
  it('stores filters only (never a search term) and lists own + shared views', async () => {
    const out = await saveView(S, { list: 'inbox', name: '  My   unassigned ', query: 'view=unassigned&q=jane%40example.test&s=1&page=2&bogus=1' })
    expect(out).toMatchObject({ ok: true })
    const v = ((await (await payload()).find({ collection: 'crm-saved-views', ...sys })).docs[0] as unknown as Doc)!
    expect(v).toMatchObject({ name: 'My unassigned', query: 'view=unassigned', shared: false, list: 'inbox' })
    expect(String(v.owner)).toBe(sales.id)
  })

  it('only admins share; Sales cannot see or delete another user’s private view, can see but not change shared ones', async () => {
    expect(await saveView(S, { list: 'contacts', name: 'Shared by sales', query: '', shared: 'on' })).toMatchObject({ ok: false, code: 'VIEW_SHARE_PRIVILEGED' })
    const r = await rest.post('crm-saved-views', sales.token, { list: 'contacts', name: 'REST share', query: '', shared: true })
    expect(r.status).toBe(403)
    const shared = await saveView(A, { list: 'contacts', name: 'Team view', query: 'linked=no', shared: 'on' })
    const priv = await saveView(await session(sales2), { list: 'contacts', name: 'Private of sales2', query: '' })
    const seen = await loadViews(S, 'contacts')
    expect(seen.map((x) => x.name)).toEqual(['Team view'])
    expect((await rest.get(`crm-saved-views/${(priv as { id?: string }).id}`, sales.token)).status).toBe(404)
    expect(await deleteView(S, { viewId: (shared as { id?: string }).id })).toMatchObject({ ok: false })
    expect((await rest.patch(`crm-saved-views/${(shared as { id?: string }).id}`, sales.token, { name: 'Hijacked' })).status).toBeGreaterThanOrEqual(403)
    const mine = await saveView(S, { list: 'contacts', name: 'Mine', query: '' })
    expect(await deleteView(S, { viewId: (mine as { id?: string }).id })).toMatchObject({ ok: true })
  })

  it('caps saved views per user', async () => {
    for (let i = 0; i < 25; i++) expect(await saveView(S, { list: 'accounts', name: `V${i}`, query: '' })).toMatchObject({ ok: true })
    expect(await saveView(S, { list: 'accounts', name: 'One too many', query: '' })).toMatchObject({ ok: false, code: 'VIEW_LIMIT' })
  })
})

// ────────────────────────────────────────────── inbox country / type ──

describe('Inbox country and type (owner request 2026-10-05)', () => {
  const MAPPED = { ...SYNTHETIC_FIELD_MAP, ref_interest: 'other:interest', ref_dest: 'other:destination_country' } as const
  const deliver = async (spec: { interest?: string; destination?: string; phone?: string | null; email: string }) => {
    const p = await payload()
    const extra = [
      ...(spec.interest ? [{ type: 'choice', choice: { label: spec.interest }, field: { id: 'id_int', ref: 'ref_interest', type: 'multiple_choice' } }] : []),
      ...(spec.destination ? [{ type: 'text', text: spec.destination, field: { id: 'id_dest', ref: 'ref_dest', type: 'short_text' } }] : []),
    ]
    const s = signed(typeformDelivery({ email: spec.email, phone: spec.phone, extraAnswers: extra }), SYNTHETIC_SECRET)
    await ingestTypeformDelivery(p, { rawBody: s.raw, signature: s.signature, config: intakeConfig({ fieldMap: { ...MAPPED } }) })
    const r = (await p.find({ collection: 'crm-rfqs', where: { 'submitted.email': { equals: spec.email } }, ...sys })).docs[0] as unknown as Doc
    return r
  }
  beforeEach(async () => {
    vi.spyOn(await payload(), 'sendEmail').mockImplementation(async () => {
      throw new Error('EMAIL_FORBIDDEN')
    })
  })

  it('intake derives country (destination answer, else phone) and type (customer interest); never defaults to US', async () => {
    const th = await deliver({ email: 'th@example.test', interest: 'Cooling Tower Parts', destination: 'Thailand', phone: '+66 81 234 5678' })
    expect(th).toMatchObject({ country_code: 'TH', country_source: 'DESTINATION_ANSWER', inquiry_type: 'PARTS', inquiry_type_source: 'CUSTOMER_INTEREST' })
    const gb = await deliver({ email: 'gb@example.test', interest: 'New Cooling Tower', phone: '+44 20 7946 0958' })
    expect(gb).toMatchObject({ country_code: 'GB', country_source: 'PHONE_INFERRED', inquiry_type: 'NEW_TOWER' })
    const us = await deliver({ email: 'nanp@example.test', phone: '+1 303 555 0100' })
    expect(us.country_code ?? null).toBeNull()
    expect(us).toMatchObject({ country_source: 'UNKNOWN', inquiry_type: 'UNKNOWN' })
    vi.restoreAllMocks()
  })

  it('the staff motion overrides the customer interest; REST cannot set the derived fields', async () => {
    const r = await deliver({ email: 'mo@example.test', interest: 'Cooling Tower Parts', destination: 'Japan' })
    const acc = await account('Motion Account', { domains: [{ domain: 'motion.example.com', domain_status: 'VERIFIED_OWNED' }] })
    let at = String(r.updatedAt)
    await m.startReview(S, { rfqId: String(r.id), expectedUpdatedAt: at })
    at = String(((await (await payload()).findByID({ collection: 'crm-rfqs', id: String(r.id), ...sys })) as unknown as Doc).updatedAt)
    await m.linkAccount(S, { rfqId: String(r.id), accountId: acc, expectedUpdatedAt: at })
    at = String(((await (await payload()).findByID({ collection: 'crm-rfqs', id: String(r.id), ...sys })) as unknown as Doc).updatedAt)
    expect(await m.qualifyRfq(S, { rfqId: String(r.id), motion: 'REPAIR', expectedUpdatedAt: at })).toMatchObject({ ok: true })
    const after = (await (await payload()).findByID({ collection: 'crm-rfqs', id: String(r.id), ...sys })) as unknown as Doc
    expect(after).toMatchObject({ inquiry_type: 'REPAIR_SERVICE', inquiry_type_source: 'STAFF_MOTION', country_code: 'JP' })
    await rest.patch(`crm-rfqs/${String(r.id)}`, admin.token, { country_code: 'US', inquiry_type: 'NEW_TOWER' })
    const again = (await (await payload()).findByID({ collection: 'crm-rfqs', id: String(r.id), ...sys })) as unknown as Doc
    expect(again).toMatchObject({ country_code: 'JP', inquiry_type: 'REPAIR_SERVICE' })
    vi.restoreAllMocks()
  })

  it('filters by several countries (incl. Unknown), by type and several motions; sorts by country; exports both columns', async () => {
    await deliver({ email: 'f-th@example.test', interest: 'Cooling Tower Parts', destination: 'Thailand' })
    await deliver({ email: 'f-jp@example.test', interest: 'Repair service', destination: 'Japan' })
    await deliver({ email: 'f-unk@example.test', interest: 'Cooling Tower Parts', phone: null })
    const { loadInbox, parseInboxParams } = await import('../workspace/queries')
    const ids = async (sp: Record<string, string | string[]>) => (await loadInbox(S, parseInboxParams(sp))).rows.map((x) => x.countryCode ?? 'UNKNOWN').sort()
    expect(await ids({ country: ['TH', 'UNKNOWN'] })).toEqual(['TH', 'UNKNOWN'])
    expect(await ids({ type: 'PARTS' })).toEqual(['TH', 'UNKNOWN'])
    expect(await ids({ type: 'REPAIR_SERVICE', country: 'JP' })).toEqual(['JP'])
    const sorted = (await loadInbox(S, parseInboxParams({ sort: 'country' }))).rows.map((x) => x.countryCode)
    expect(sorted.slice(0, 2)).toEqual(['JP', 'TH'])
    const res = await exportGET(new Request('http://127.0.0.1:3200/crm/export/?list=inbox&cols=type,country,country_source&type=PARTS', { headers: { authorization: `JWT ${admin.token}` } }))
    const lines = (await res.text()).replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Type,Country,Country source,Do not contact')
    expect(lines.slice(1).sort()).toEqual(['Parts,Thailand,destination answer,', 'Parts,Unknown,unknown,'])
    vi.restoreAllMocks()
  })
})

describe('ERS readiness (CT 2026-10-05)', () => {
  it('import stores an inferred country with its source and never a verified jurisdiction', async () => {
    // (The email-ccTLD path is covered by the unit test: fixtures may not use non-reserved domains such as *.co.th.)
    await applyOk(csv('A,B,a.synthetic.probe@gmail.com,no,+66 81 234 5678,no', 'E,F,e@example.test,no,no,no'))
    const by = async (email: string) => (await find('crm-contacts', { email_match_key: { equals: email } }))[0]!
    expect(await by('a.synthetic.probe@gmail.com')).toMatchObject({ country_code: 'TH', country_source: 'PHONE_INFERRED', jurisdiction: 'COUNTRY_UNKNOWN', marketing_eligibility: 'UNKNOWN' })
    const e = await by('e@example.test')
    expect(e.country_code ?? null).toBeNull()
  })

  it('a saved view is a segment the server evaluates to the same records as the list', async () => {
    await m.createContact(S, { email: 'seg1@example.test', firstName: 'Seg' })
    const acc = await account('Segment Co')
    await m.createContact(S, { email: 'seg2@example.test', firstName: 'Linked', accountId: acc, confidence: 'HIGH_CONFIDENCE' })
    const v = await saveView(A, { list: 'contacts', name: 'No account', query: 'linked=no', shared: 'on' })
    const { segmentWhere } = await import('../workspace/views')
    const view = ((await (await payload()).findByID({ collection: 'crm-saved-views', id: String((v as { id?: string }).id), ...sys })) as unknown as Doc)!
    const seg = await segmentWhere(A, 'contacts', String(view.query))
    expect(seg.collection).toBe('crm-contacts')
    const res = await (await payload()).find({ collection: seg.collection, where: seg.where, overrideAccess: false, user: admin.user, depth: 0 })
    expect(res.docs.map((d) => (d as unknown as Doc).email_match_key)).toEqual(['seg1@example.test'])
  })
})

// Keep the types honest: a Summary is all numbers.
export type _Summary = Summary
