import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as exportGET } from '../../app/(crm)/crm/export/route'
import { POST as importPOST } from '../../app/(crm)/crm/import/run/route'
import { exportRows, pickColumns, prepareExport } from '../export/csv-export'
import { applyImport, planImport, planView } from '../import/engine'
import * as m from '../workspace/mutations'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * CSV-FIX-1 against the isolated synthetic database: external review items R2-07 (approval bound to the reviewed
 * plan), R2-08 (oversize cells, phone round trip) and R2-09 (export totals). Synthetic data only (example.test).
 */

let admin: TestUser, sales: TestUser
let A: CrmSession, S: CrmSession
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const session = async (u: TestUser) => crmSessionFor(await payload(), u.user)!
const MAP = { first_name: 0, last_name: 1, email: 2, title: 3 }
const csv = (...rows: string[]) => ['first_name,last_name,email,title', ...rows].join('\n') + '\n'
const count = async (collection: 'crm-contacts' | 'crm-import-batches') => (await (await payload()).count({ collection, overrideAccess: true })).totalDocs
async function plan(text: string, map: Doc = MAP, options: Doc = {}) {
  const r = await planImport(A, text, map, options)
  if ('error' in r) throw new Error(r.error.code)
  return r.plan
}
const exportAudits = async () =>
  ((await (await payload()).find({ collection: 'audit-log', where: { action: { equals: 'export' } }, sort: '-createdAt', overrideAccess: true })).docs as unknown as Doc[]).map((d) => d.detail as Doc)

beforeAll(async () => {
  process.env.H2O_IMPORT_PAUSE_MS = '0'
  process.env.H2O_IMPORT_MIN_FREE_MB = '0'
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  A = await session(admin)
  S = await session(sales)
})
beforeEach(async () => {
  await resetCrm()
  delete process.env.H2O_EXPORT_MAX_ROWS
})

describe('R2-07 apply is bound to the reviewed plan, not to counts', () => {
  it('refuses a different file with equal summary counts', async () => {
    const reviewed = await plan(csv('Avery,Quinn,avery@example.test,Engineer'))
    const other = csv('Jo,Ray,jo@example.test,Buyer')
    expect((await plan(other)).summary).toEqual(reviewed.summary)
    expect(await applyImport(A, other, MAP, {}, reviewed.approval)).toMatchObject({
      ok: false,
      code: 'STALE_DRY_RUN',
      message: 'The file, mapping or the records changed since your preview — preview again.',
    })
    expect(await count('crm-import-batches')).toBe(0)
    expect(await count('crm-contacts')).toBe(0)
  })

  it('refuses a different mapping, or different options, with equal summary counts', async () => {
    const text = csv('Avery,Quinn,avery@example.test,Engineer')
    const reviewed = await plan(text)
    const swapped = { first_name: 1, last_name: 0, email: 2, title: 3 }
    expect((await plan(text, swapped)).summary).toEqual(reviewed.summary)
    expect(await applyImport(A, text, swapped, {}, reviewed.approval)).toMatchObject({ ok: false, code: 'STALE_DRY_RUN' })
    const attested = { attested: true, source: 'synthetic export', basis: 'synthetic basis' }
    const p1 = await plan(text, MAP, attested)
    expect(await applyImport(A, text, MAP, { ...attested, source: 'another synthetic export' }, p1.approval)).toMatchObject({ ok: false, code: 'STALE_DRY_RUN' })
    expect(await count('crm-import-batches')).toBe(0)
  })

  it('refuses when a record changed the row plan since the preview; an unrelated change does not block', async () => {
    const text = csv('Avery,Quinn,avery@example.test,Engineer')
    const p = await plan(text)
    await m.createContact(S, { email: 'someone.else@example.test', firstName: 'Unrelated' })
    const ok = await applyImport(A, text, MAP, {}, p.approval)
    expect(ok).toMatchObject({ ok: true })

    await resetCrm()
    const p2 = await plan(text)
    await m.createContact(S, { email: 'avery@example.test', firstName: 'Avery' })
    // Counts may still look alike (one row, one action) but the row now targets an existing contact.
    expect(await applyImport(A, text, MAP, {}, p2.approval)).toMatchObject({ ok: false, code: 'STALE_DRY_RUN' })
    expect(await count('crm-import-batches')).toBe(0)
  })

  it('the token is issued per admin and the route takes it from the preview', async () => {
    const text = csv('Avery,Quinn,route.token@example.test,Engineer')
    const req = (body: unknown) =>
      importPOST(new Request('http://127.0.0.1:3200/crm/import/run/', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `JWT ${admin.token}` }, body: JSON.stringify(body) }))
    const dry = (await (await req({ mode: 'dry', csv: text, mapping: MAP, options: {} })).json()) as { plan: { approval: string; summary: Doc } }
    expect(dry.plan.approval).toMatch(/^[0-9a-f]{64}$/)
    // The old client contract (counts as `expected`) no longer applies anything.
    const stale = (await (await req({ mode: 'apply', csv: text, mapping: MAP, options: {}, expected: dry.plan.summary })).text()).trim().split('\n').map((l) => JSON.parse(l) as Doc)
    expect(stale.at(-1)).toMatchObject({ type: 'result', ok: false, code: 'STALE_DRY_RUN' })
    const lines = (await (await req({ mode: 'apply', csv: text, mapping: MAP, options: {}, approval: dry.plan.approval })).text()).trim().split('\n').map((l) => JSON.parse(l) as Doc)
    expect(lines.at(-1)).toMatchObject({ type: 'result', ok: true, failed: [] })
  })
})

describe('R2-08 oversize cells', () => {
  const longTitle = 'T'.repeat(150)

  it('the preview lists each over-long cell (row, column, treatment); apply refuses and writes nothing', async () => {
    const text = csv('Avery,Quinn,avery@example.test,Engineer', `Jo,Ray,jo@example.test,${longTitle}`)
    const p = await plan(text)
    expect(p.blocked).toBe(true)
    expect(p.approval).toBeNull()
    expect(p.summary).toMatchObject({ oversizeCells: 1, oversizeCut: 0 })
    expect(planView(p).oversize).toEqual([{ row: 2, column: 'title', field: 'title', length: 150, limit: 120, treatment: 'CUT' }])
    expect(JSON.stringify(planView(p).oversize)).not.toContain('TTTT')
    for (const approval of [null, 'f'.repeat(64)])
      expect(await applyImport(A, text, MAP, {}, approval)).toMatchObject({ ok: false, code: 'OVERSIZE_CELLS', message: expect.stringContaining('1 cell is longer than allowed') })
    expect(await count('crm-contacts')).toBe(0)
  })

  it('a name with a web link (owner ruling): free mail is skipped (SKIP_NAME_URL); a corporate domain loads with no name and a review', async () => {
    const spam = `Big offer https://spam.example.test/${'x'.repeat(200)}`
    const text = csv('Avery,Quinn,avery@example.test,Engineer', `${spam},,casey.lim.synthetic@gmail.com,`, `see www.spam.example.test,,buyer@northwind.example.test,Buyer`)
    const p = await plan(text)
    expect(p.blocked).toBe(false)
    expect(p.oversize).toEqual([])
    expect(p.summary).toMatchObject({ rows: 3, create: 2, skip: 1, spamNameSkipped: 1, spamNameCleared: 1, spamNameOver80: 1, spamNameWithin80: 1 })
    expect(p.rows[1]).toMatchObject({ outcome: 'SKIP', reasons: [expect.stringMatching(/^SKIP_NAME_URL:/)] })
    expect(p.rows[2]).toMatchObject({ outcome: 'CREATE', nameLinkCleared: true, values: { first_name: null, last_name: null } })
    const before = { enr: await (await payload()).count({ collection: 'crm-enrollments' as never, overrideAccess: true }), out: await (await payload()).count({ collection: 'crm-email-outbox', overrideAccess: true }) }
    expect(await applyImport(A, text, MAP, {}, p.approval)).toMatchObject({ ok: true, summary: { spamNameCleared: 1 } })
    const pl = await payload()
    expect(await count('crm-contacts')).toBe(2)
    expect((await pl.find({ collection: 'crm-contacts', where: { email: { equals: 'casey.lim.synthetic@gmail.com' } }, ...sys })).docs).toHaveLength(0)
    const [buyer] = (await pl.find({ collection: 'crm-contacts', where: { email: { equals: 'buyer@northwind.example.test' } }, ...sys })).docs as unknown as Doc[]
    expect(buyer).toMatchObject({ first_name: null, last_name: null })
    const reviews = (await pl.find({ collection: 'crm-identity-reviews' as never, where: { reason: { equals: 'NAME_CONTAINED_LINK' } }, ...sys })).docs as unknown as Doc[]
    expect(reviews).toHaveLength(1)
    // eligibility untouched; nothing enrolled or queued
    expect(buyer!.marketing_eligibility ?? 'UNKNOWN').toBe('UNKNOWN')
    expect((await pl.count({ collection: 'crm-enrollments' as never, overrideAccess: true })).totalDocs).toBe(before.enr.totalDocs)
    expect((await pl.count({ collection: 'crm-email-outbox', overrideAccess: true })).totalDocs).toBe(before.out.totalDocs)
  })

  it('a long cell in an unmapped column is reported as not imported and blocks nothing', async () => {
    const text = ['email,first_name,ignored', `pat@example.test,Pat,${'z'.repeat(2500)}`].join('\n')
    const p = await plan(text, { email: 0, first_name: 1 })
    expect(p.blocked).toBe(false)
    expect(p.oversize).toEqual([{ row: 1, column: 'ignored', field: null, length: 2500, limit: 2000, treatment: 'NOT_IMPORTED' }])
    expect(await applyImport(A, text, { email: 0, first_name: 1 }, {}, p.approval)).toMatchObject({ ok: true })
  })

  it('with the explicit cut choice the cells are cut to their limit, bound into the approval, and recorded', async () => {
    const text = ['email,first_name,title,notes', `jo@example.test,Jo,${longTitle},${'n'.repeat(2500)}`].join('\n')
    const map = { email: 0, first_name: 1, title: 2, notes: 3 }
    const blocked = await plan(text, map)
    expect(blocked.oversize.map((o) => [o.column, o.limit])).toEqual([
      ['notes', 2000],
      ['title', 120],
    ])
    const cut = await plan(text, map, { truncateOversize: true })
    expect(cut).toMatchObject({ blocked: false, summary: { oversizeCells: 2, oversizeCut: 2 } })
    // The approval for "cut" does not apply without the choice (and the reverse), so the choice is bound.
    expect(await applyImport(A, text, map, {}, cut.approval)).toMatchObject({ ok: false, code: 'OVERSIZE_CELLS' })
    const out = await applyImport(A, text, map, { truncateOversize: true }, cut.approval)
    if (!out.ok) throw new Error(out.code)
    const c = (await (await payload()).find({ collection: 'crm-contacts', ...sys })).docs[0] as unknown as Doc
    expect(String(c.title)).toHaveLength(120)
    const note = (await (await payload()).find({ collection: 'crm-notes', ...sys })).docs[0] as unknown as Doc
    expect(String(note.body)).toHaveLength(2000)
    const batch = (await (await payload()).findByID({ collection: 'crm-import-batches', id: out.batchIds[0]!, ...sys })) as unknown as Doc
    expect(batch.options).toMatchObject({ truncateOversize: true, oversizeCut: 2, oversizeCutByField: { notes: 1, title: 1 }, via: 'import-page', operatorNote: null })
    const audit = ((await (await payload()).find({ collection: 'audit-log', where: { collection: { equals: 'crm-import-batches' } }, overrideAccess: true })).docs as unknown as Doc[]).map((d) => d.detail as Doc)
    expect(audit.find((d) => d.event === 'IMPORT_APPLIED')).toMatchObject({ truncateOversize: true, oversizeCut: 2, oversizeCutByField: { notes: 1, title: 1 }, via: 'import-page' })
    expect(JSON.stringify(audit)).not.toMatch(/jo@example|TTTT|nnnn/)
  })

  it('the cut counts code points: an emoji note over the limit keeps 2,000 whole characters (PROD-IMPORT-1 N3)', async () => {
    const emoji = '\u{1F600}'
    const text = ['email,notes', `em@example.test,${emoji.repeat(2100)}`].join('\n')
    const map = { email: 0, notes: 1 }
    expect((await plan(text, map)).oversize.map((o) => [o.column, o.length])).toEqual([['notes', 2100]])
    const cut = await plan(text, map, { truncateOversize: true })
    const out = await applyImport(A, text, map, { truncateOversize: true }, cut.approval)
    if (!out.ok) throw new Error(out.code)
    const notes = (await (await payload()).find({ collection: 'crm-notes', ...sys, limit: 50 })).docs as unknown as Doc[]
    const body = notes.map((n) => String(n.body)).find((b) => b.startsWith(emoji))!
    expect([...body]).toHaveLength(2000)
    expect(body).toBe(emoji.repeat(2000))
  })
})

describe('R2-08 phone round trip: export → import', () => {
  it('a formula-protected exported phone (and the do-not-contact mark) import back unchanged', async () => {
    const seed = ['email,first_name,phone', 'round.trip@example.test,Rory,+1 303 555 0142'].join('\n')
    const seeded = await plan(seed, { email: 0, first_name: 1, phone: 2 })
    expect((await applyImport(A, seed, { email: 0, first_name: 1, phone: 2 }, {}, seeded.approval)).ok).toBe(true)
    const contact = (await (await payload()).find({ collection: 'crm-contacts', ...sys })).docs[0] as unknown as Doc
    await m.applyDoNotContact(S, { contactId: String(contact.id), note: 'synthetic' })

    const res = await exportGET(new Request('http://127.0.0.1:3200/crm/export/?list=contacts&cols=email,first_name,phone', { headers: { authorization: `JWT ${admin.token}` } }))
    const exported = await res.text()
    expect(exported).toContain("'+13035550142")

    await resetCrm()
    // Columns come out in allowlist order: First name, Email, Phone, Do not contact.
    expect(exported.replace(/^\uFEFF/, '').split('\r\n')[0]).toBe('First name,Email,Phone,Do not contact')
    const map = { first_name: 0, email: 1, phone: 2, do_not_contact: 3 }
    const p = await plan(exported, map)
    expect(p.summary).toMatchObject({ rows: 1, create: 1, phonesNormalised: 1, phonesDropped: 0, suppressAdd: 1 })
    expect((await applyImport(A, exported, map, {}, p.approval)).ok).toBe(true)
    const back = (await (await payload()).find({ collection: 'crm-contacts', ...sys })).docs[0] as unknown as Doc
    expect((back.phones as Doc[]).map((x) => x.number_raw)).toEqual(['+13035550142'])
  })
})

describe('R2-09 export totals', () => {
  const get = (qs: string) => exportGET(new Request(`http://127.0.0.1:3200/crm/export/?${qs}`, { headers: { authorization: `JWT ${admin.token}` } }))
  const contacts = async (n: number) => {
    for (let i = 0; i < n; i++) await m.createContact(S, { email: `export.total.${i}@example.test`, firstName: `Probe ${i}` })
  }

  it('over the cap: refused before download with requested and allowed totals, audited as REFUSED', async () => {
    process.env.H2O_EXPORT_MAX_ROWS = '2'
    await contacts(3)
    const res = await get('list=contacts&cols=email')
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({
      ok: false,
      code: 'TOO_MANY_ROWS',
      requested: 3,
      allowed: 2,
      message: 'This list has 3 rows. An export can hold at most 2. Narrow the filters or search, then export in parts.',
    })
    expect((await exportAudits())[0]).toMatchObject({ status: 'REFUSED', requested: 3, rowCount: 0, allowed: 2, complete: false })
  })

  it('at or under the cap: every match is exported; the response and the audit carry requested and exported', async () => {
    process.env.H2O_EXPORT_MAX_ROWS = '2'
    await contacts(2)
    const res = await get('list=contacts&cols=email')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-export-requested')).toBe('2')
    expect((await res.text()).trim().split('\r\n')).toHaveLength(3)
    expect((await exportAudits())[0]).toMatchObject({ status: 'COMPLETE', requested: 2, rowCount: 2, complete: true })
  })

  it('a run that stops at the cap with rows left is PARTIAL, never complete', async () => {
    process.env.H2O_EXPORT_MAX_ROWS = '2'
    await contacts(2)
    const prep = await prepareExport(A, 'contacts', {}, null)
    expect(prep).toMatchObject({ requested: 2, allowed: 2 })
    await contacts(3) // the list grows between the count and the download
    let text = ''
    for await (const chunk of exportRows(A, 'contacts', {}, null, pickColumns('contacts', 'email'), prep)) text += chunk
    expect(text.trim().split('\r\n')).toHaveLength(3)
    expect((await exportAudits())[0]).toMatchObject({ status: 'PARTIAL', requested: 2, rowCount: 2, complete: false })
  })

  it('accounts exports carry no do-not-contact column; contacts always do', async () => {
    expect(pickColumns('accounts', 'name').map((c) => c.key)).toEqual(['name'])
    expect(pickColumns('contacts', 'email').map((c) => c.key)).toEqual(['email', 'do_not_contact'])
    expect(pickColumns('inbox', 'email').map((c) => c.key)).toEqual(['email', 'do_not_contact'])
  })
})
