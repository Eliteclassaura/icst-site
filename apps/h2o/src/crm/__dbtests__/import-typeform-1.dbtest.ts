import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { safeUploadUrl, TYPEFORM_UPLOAD_HOSTS } from '../collections/historical-inquiries'
import { invalidateErsSettings } from '../ers/settings'
import { OperatorError, sha256Hex } from '../import/operator'
import { applyTypeform, planTypeform, submittedAtUtc, typeformDryOutput, undoTypeform } from '../import/typeform'
import { payload, resetCrm, user, userEmail } from './harness'

/**
 * IMPORT-TYPEFORM-1 with a SYNTHETIC file shaped like the Typeform leads sheet (the same 14 headers, example.test
 * addresses, fictional people). The real file is never read here. The Security Auditor's criteria:
 *   (1) no RFQ hook: nothing is written to crm-rfqs, no task, no alert, no T1 (and statically: no notify import)
 *   (2) UNIQUE token: a re-run adds 0; a token back with different content is reported, never overwritten
 *   (3) the upload link is https on the Typeform host, text only, and never in the output
 *   (4) caps; text is stored as given (escaped when shown)
 *   (5) the same identity rules: dedupe by email key, fill-empty, no enrolment, eligibility untouched
 */
type Doc = Record<string, unknown>
const H = [
  'What is your email address?',
  'Can I get your first name?',
  'And your last name?',
  'Great {{field:abc}}. What company are you with?',
  'Awesome, {{field:abc}}. What are you interested in:',
  'What Part are you interested in? ',
  'Please provide any information you have on {{field:def}} (model, size, etc.)',
  'Is this Urgent Part Quote Request?',
  'Upload any relevant files, PDFs only (If needed)',
  'Please let us know your phone number',
  'Can you please let us know the Country of Destination?',
  "Anything else you'd like us to know?",
  'Submitted At',
  'Token',
]
const q = (v: string) => `"${v.replace(/"/g, '""')}"`
const UPLOAD = 'https://api.typeform.com/responses/files/synthetic-file/drawing.pdf'
const ROWS = [
  ['avery.quinn@northwind-thermal.example.test', 'Avery', 'Quinn', 'Northwind Thermal (synthetic)', 'Parts', 'Fan blades', 'Model 3000, 12 ft', 'Yes', UPLOAD, '+1 303 555 0100', 'United States', 'Please call first', '3/14/2025 9:05:00', 'tokA1b2c3d4e5f6'],
  // the same person again, later: one contact, two past requests
  ['avery.quinn@northwind-thermal.example.test', 'Avery', 'Quinn', 'Northwind Thermal (synthetic)', 'Service', '', 'Basin repair', 'No', '', '+1 303 555 0100', 'United States', '', '11/2/2025 14:30:00', 'tokB1b2c3d4e5f6'],
  ['casey.lim.synthetic@gmail.com', 'Casey', 'Lim', 'Lim Cooling (synthetic)', 'Parts', 'Drift eliminators', 'x'.repeat(5000), '', 'http://evil.example/steal', '3035550101', 'Canada', '', '7/4/2025 23:59:59', 'tokC1b2c3d4e5f6'],
]
const file = (rows: string[][] = ROWS) => Buffer.from(`${H.map(q).join(',')}\n${rows.map((r) => r.map(q).join(',')).join('\n')}\n`)
const VALUES = ['avery.quinn', 'Quinn', 'casey.lim', 'Lim', 'Northwind', 'Fan blades', 'Model 3000', 'api.typeform.com', 'drawing.pdf', 'evil.example', '555 0100', 'Please call first']
const off = { H2O_EMAIL_MODE: 'off', H2O_EMAIL_INBOUND: 'off' } as unknown as NodeJS.ProcessEnv
const count = async (collection: string, where: Doc = {}) => (await (await payload()).count({ collection: collection as never, where: where as never, overrideAccess: true })).totalDocs
const inquiries = async () => (await (await payload()).find({ collection: 'crm-historical-inquiries' as never, sort: 'submitted_at', limit: 50, depth: 0, overrideAccess: true })).docs as unknown as Doc[]

let adminEmail = ''
beforeAll(async () => {
  process.env.H2O_OWN_EMAIL_DOMAINS = 'ics-synthetic.example.test'
  process.env.H2O_IMPORT_PAUSE_MS = '0'
  process.env.H2O_IMPORT_MIN_FREE_MB = '0'
  await user('platform-admin')
  adminEmail = userEmail('platform-admin')
})
beforeEach(async () => {
  await resetCrm()
  const p = await payload()
  await p.delete({ collection: 'crm-historical-inquiries' as never, where: { id: { exists: true } } as never, overrideAccess: true, context: { crmServer: {} } }).catch(() => undefined)
  await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, overrideAccess: true })
  invalidateErsSettings()
})
afterEach(() => {
  delete process.env.H2O_EMAIL_MODE
})

describe('the sheet', () => {
  it('Submitted At is the sheet zone (America/Denver), across DST', () => {
    expect(submittedAtUtc('3/14/2025 9:05:00')).toBe('2025-03-14T15:05:00.000Z') // MDT (UTC−6)
    expect(submittedAtUtc('11/2/2025 14:30:00')).toBe('2025-11-02T21:30:00.000Z') // MST (UTC−7), after fall-back
    expect(submittedAtUtc('2/30/2025 1:00:00')).toBeNull()
    expect(submittedAtUtc('2025-03-14 09:05')).toBeNull()
  })
  it('only https links on the Typeform host are kept', () => {
    expect(safeUploadUrl(UPLOAD)).toBe(UPLOAD)
    for (const bad of ['http://api.typeform.com/x', 'https://evil.example/x', `https://user:pw@${TYPEFORM_UPLOAD_HOSTS[0]}/x`, 'javascript:alert(1)', 'https://api.typeform.com.evil.example/x'])
      expect(safeUploadUrl(bad), bad).toBeNull()
  })
})

describe('dry → apply → rerun → undo', () => {
  it('one contact per address, one past request per response; nothing queued, enrolled or written to crm-rfqs', async () => {
    const f = file()
    const sha = sha256Hex(f)
    const p = await payload()
    const plan = await planTypeform(p, f, sha, adminEmail)
    const dry = typeformDryOutput(plan)
    expect(dry).toMatchObject({ rows: 3, blocked: false })
    expect(dry.contacts).toMatchObject({ rows: 2, create: 2 })
    expect(dry.inquiries).toMatchObject({ inquiriesNew: 3, uploadLinks: 1, uploadLinkRefused: 1, cut_details: 1, uniqueAddresses: 2 })
    expect(await count('crm-contacts')).toBe(0)
    const r = await applyTypeform(p, f, sha, adminEmail, plan.approval!, off, 'Typeform rehearsal (synthetic)')
    expect(r.inquiries).toMatchObject({ created: 3, conflicts: 0 })
    // PROD-IMPORT-1 N1 parity: the contact batch says it came from the operator CLI, with the operator's note
    const batches = (await p.find({ collection: 'crm-import-batches', depth: 0, overrideAccess: true })).docs as unknown as Doc[]
    expect(batches.length).toBeGreaterThan(0)
    for (const bt of batches) expect(bt.options).toMatchObject({ via: 'operator-cli', operatorNote: 'Typeform rehearsal (synthetic)' })
    expect(r.after).toEqual({ enrollments: 0, outbox: 0 })
    expect(await count('crm-contacts')).toBe(2)
    expect(await count('crm-rfqs')).toBe(0) // (1) never an RFQ
    expect(await count('crm-tasks')).toBe(0) // no first-response task
    expect(await count('crm-email-outbox')).toBe(0) // no alert, no T1
    const rows = await inquiries()
    expect(rows.map((x) => [x.typeform_token, x.state, x.source, x.submitted_zone])).toEqual([
      ['tokA1b2c3d4e5f6', 'HISTORICAL_CLOSED_UNKNOWN', 'TYPEFORM_LEGACY', 'America/Denver'],
      ['tokC1b2c3d4e5f6', 'HISTORICAL_CLOSED_UNKNOWN', 'TYPEFORM_LEGACY', 'America/Denver'],
      ['tokB1b2c3d4e5f6', 'HISTORICAL_CLOSED_UNKNOWN', 'TYPEFORM_LEGACY', 'America/Denver'],
    ])
    expect(rows[0]).toMatchObject({ upload_url: UPLOAD, urgent: 'YES', submitted_at: '2025-03-14T15:05:00.000Z' })
    expect(rows[1]).toMatchObject({ upload_url: null, urgent: 'UNKNOWN', cut_fields: ['details'] })
    expect(String(rows[1]!.details)).toHaveLength(4000)
    expect(rows[0]!.contact).toBe(rows[2]!.contact) // the same person: one contact
    // (5) eligibility untouched
    const contacts = (await p.find({ collection: 'crm-contacts', depth: 0, overrideAccess: true })).docs as unknown as Doc[]
    for (const c of contacts) expect(c.marketing_eligibility ?? 'UNKNOWN').toBe('UNKNOWN')
    // (3) output carries no value from the file, and no link
    const printed = JSON.stringify({ dry, r })
    for (const v of VALUES) expect(printed, v).not.toContain(v)
    // (2) a re-run adds 0
    const again = await planTypeform(p, f, sha, adminEmail)
    expect(again.counts).toMatchObject({ inquiriesUnchanged: 3 })
    expect(again.counts.inquiriesNew ?? 0).toBe(0)
    const r2 = await applyTypeform(p, f, sha, adminEmail, again.approval!, off, 'Typeform rehearsal (synthetic)')
    expect(r2.inquiries).toMatchObject({ created: 0, unchanged: 3 })
    expect(await count('crm-historical-inquiries')).toBe(3)
    // undo archives (archive-only)
    expect(await undoTypeform(p, f, sha, adminEmail, 'synthetic rehearsal')).toMatchObject({ ok: true, inquiriesArchived: 3 })
    expect(await count('crm-historical-inquiries', { record_state: { equals: 'ARCHIVED' } })).toBe(3)
  })
  it('(4) caps count code points: an emoji answer over its cap keeps whole characters and is stored', async () => {
    const e = '\u{1F600}'
    const f = file([['emoji.case@northwind-thermal.example.test', 'Emi', 'Case', 'Northwind Thermal (synthetic)', e.repeat(600), e.repeat(200), 'ok', '', '', '', 'Japan', '', '5/6/2025 10:00:00', 'tokE1b2c3d4e5f6']])
    const sha = sha256Hex(f)
    const p = await payload()
    const plan = await planTypeform(p, f, sha, adminEmail)
    expect(typeformDryOutput(plan).inquiries).toMatchObject({ inquiriesNew: 1, cut_interest: 1 })
    expect(typeformDryOutput(plan).inquiries.cut_part ?? 0).toBe(0) // 200 emoji = 200 characters, at the cap
    expect((await applyTypeform(p, f, sha, adminEmail, plan.approval!, off)).inquiries).toMatchObject({ created: 1 })
    const [row] = await inquiries()
    expect(row).toMatchObject({ interest: e.repeat(500), part: e.repeat(200), cut_fields: ['interest'] })
  })
  it('(2) a token back with different content is a CONFLICT: reported and left as it is', async () => {
    const p = await payload()
    const f1 = file()
    const plan1 = await planTypeform(p, f1, sha256Hex(f1), adminEmail)
    await applyTypeform(p, f1, sha256Hex(f1), adminEmail, plan1.approval!, off)
    const changed = ROWS.map((r) => [...r])
    changed[0]![6] = 'Model 4000 (edited later)'
    const f2 = file(changed)
    const plan2 = await planTypeform(p, f2, sha256Hex(f2), adminEmail)
    expect(plan2.counts).toMatchObject({ inquiriesConflict: 1, TF_TOKEN_CONTENT_DIFFERS: 1, inquiriesUnchanged: 2 })
    const r = await applyTypeform(p, f2, sha256Hex(f2), adminEmail, plan2.approval!, off)
    expect(r.inquiries).toMatchObject({ created: 0, conflicts: 1 })
    expect((await inquiries())[0]!.details).toBe('Model 3000, 12 ft')
  })
  it('row rules: bad or repeated tokens, bad addresses and spam-rule contacts are skipped; the contact is the latest response', async () => {
    const row = (email: string, first: string, company: string, at: string, token: string) => [email, first, 'Synthetic', company, 'Parts', '', 'x', '', '', '', 'Canada', '', at, token]
    const rows = [
      row('drew.park@northwind-thermal.example.test', 'Drew', 'Newer Co (synthetic)', '6/1/2025 9:00:00', 'tokN1b2c3d4e5f6'), // newer first in the file
      row('drew.park@northwind-thermal.example.test', 'Drew', 'Older Co (synthetic)', '1/1/2025 9:00:00', 'tokO1b2c3d4e5f6'),
      row('sam.ito@northwind-thermal.example.test', 'Sam', 'Ito Co (synthetic)', '2/1/2025 9:00:00', 'short'), // invalid token
      row('kim.ash@northwind-thermal.example.test', 'Kim', 'Ash Co (synthetic)', '2/2/2025 9:00:00', 'tokN1b2c3d4e5f6'), // token repeated in the file
      row('not-an-address', 'Lee', 'Lee Co (synthetic)', '2/3/2025 9:00:00', 'tokL1b2c3d4e5f6'), // invalid address
      row('casey.lim.synthetic@gmail.com', 'Visit https://spam.example.test', '', '2/4/2025 9:00:00', 'tokS1b2c3d4e5f6'), // free mail + link name: contact skipped
      row('web.buyer@northwind-thermal.example.test', 'Web', 'Web Co (synthetic)', '2/5/2025 9:00:00', 'RFQ-20261008-ABCDEFGH'), // a website RFQ the CRM appended (SHEET-SYNC-1)
      row('web.two@northwind-thermal.example.test', 'Web', 'Web Two (synthetic)', '2/6/2025 9:00:00', 'web-0194a1b2-0000-4000-8000-0123456789ab'), // the same, SHEET-SYNC-1.1 token
    ]
    const f = file(rows)
    const p = await payload()
    const plan = await planTypeform(p, f, sha256Hex(f), adminEmail)
    expect(plan.counts).toMatchObject({ inquiriesNew: 2, TF_TOKEN_INVALID: 1, TF_TOKEN_REPEATED_IN_FILE: 1, TF_EMAIL_INVALID: 1, TF_CONTACT_SKIPPED: 1, TF_WEBSITE_ROW: 2 })
    expect((await applyTypeform(p, f, sha256Hex(f), adminEmail, plan.approval!, off)).inquiries).toMatchObject({ created: 2 })
    expect((await inquiries()).map((x) => x.typeform_token)).toEqual(['tokO1b2c3d4e5f6', 'tokN1b2c3d4e5f6'])
    const contacts = (await p.find({ collection: 'crm-contacts', depth: 0, overrideAccess: true })).docs as unknown as Doc[]
    expect(contacts).toHaveLength(1)
    expect(contacts[0]!.company_name_original).toBe('Newer Co (synthetic)') // from the most recent response
  })
  it('the post-DNS delta: a newer download creates only the new responses', async () => {
    const p = await payload()
    const f1 = file(ROWS.slice(0, 2))
    const plan1 = await planTypeform(p, f1, sha256Hex(f1), adminEmail)
    await applyTypeform(p, f1, sha256Hex(f1), adminEmail, plan1.approval!, off)
    const f2 = file()
    const plan2 = await planTypeform(p, f2, sha256Hex(f2), adminEmail)
    expect(plan2.counts).toMatchObject({ inquiriesNew: 1, inquiriesUnchanged: 2 })
    expect((await applyTypeform(p, f2, sha256Hex(f2), adminEmail, plan2.approval!, off)).inquiries).toMatchObject({ created: 1 })
    expect(await count('crm-historical-inquiries')).toBe(3)
  })
  it('refusals: sending not off, a stale approval, a wrong hash, a missing column', async () => {
    const p = await payload()
    const f = file()
    const sha = sha256Hex(f)
    const plan = await planTypeform(p, f, sha, adminEmail)
    const code = async (x: Promise<unknown>) => x.then(() => 'NOT_REFUSED', (e) => (e instanceof OperatorError ? e.code : 'UNEXPECTED'))
    expect(await code(applyTypeform(p, f, sha, adminEmail, plan.approval!, { H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: 'x@example.test', H2O_EMAIL_FROM: 'x@example.test' } as unknown as NodeJS.ProcessEnv))).toMatch(/^SENDING_NOT_OFF/)
    expect(await code(applyTypeform(p, f, sha, adminEmail, 'f'.repeat(64), off))).toBe('STALE_DRY_RUN')
    expect(await code(planTypeform(p, f, '0'.repeat(64), adminEmail))).toBe('SHA_MISMATCH')
    const noToken = Buffer.from(`${H.slice(0, 13).map(q).join(',')}\n`)
    expect(await code(planTypeform(p, noToken, sha256Hex(noToken), adminEmail))).toBe('TF_COLUMN_MISSING_TOKEN')
    const twoTokens = Buffer.from(`${[...H, 'Token'].map(q).join(',')}\n`)
    expect(await code(planTypeform(p, twoTokens, sha256Hex(twoTokens), adminEmail))).toBe('TF_COLUMN_AMBIGUOUS_TOKEN')
    expect(await count('crm-historical-inquiries')).toBe(0)
  })
})

it('the CLI tf-apply takes the operator note from --note, which is required (PROD-IMPORT-1 N1 parity)', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/crm/import/cli.ts'), 'utf8')
  expect(src).toMatch(/await applyTypeform\(payload, [^\n]*, process\.env, arg\(args, 'note'\)\)/)
})
it('(1) statically: the Typeform import never touches notify, crm-rfqs or the RFQ creation path', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/crm/import/typeform.ts'), 'utf8')
  expect(src).not.toMatch(/enqueueRfqNotifications|['"]\.\.\/notify['"]|'crm-rfqs'|collections\/rfqs/) // any import of notify, bare or named
  const col = readFileSync(path.join(process.cwd(), 'src/crm/collections/historical-inquiries.ts'), 'utf8')
  expect(col).not.toMatch(/notify|afterChange|ensureSystemTask|crm-tasks/)
})
