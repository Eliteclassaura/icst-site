import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LEGACY_OPTIONS, OperatorError, apply, dryRun, legacyMapping, sha256Hex, undo } from '../import/operator'
import { invalidateErsSettings } from '../ers/settings'
import { payload, resetCrm, user, userEmail } from './harness'

/**
 * IMPORT-CLI-1: the operator import (no browser) for the legacy load, proven with a SYNTHETIC file shaped like the
 * email-IQ export (same column names; example.test addresses, fictional people). The real file is never read here.
 */
type Doc = Record<string, unknown>
const HEADER = 'email,first_name,last_name,primary_phone,mobile_phone,company_name,unused_column'
const ROWS = [
  'avery.quinn@northwind-thermal.example.test,Avery,Quinn,+1 303 555 0100,,Northwind Thermal (synthetic),x',
  'blake.ortiz@northwind-thermal.example.test,Blake Ortiz,,,,Northwind Thermal (synthetic),x',
  'casey.lim.synthetic@gmail.com,Casey,Lim,3035550101,,,x',
  'sales@delta-cooling.example.test,no,no,no,no,Delta Cooling (synthetic),x',
]
const file = (rows = ROWS) => Buffer.from(`${HEADER}\n${rows.join('\n')}\n`)
const VALUES = ['avery.quinn', 'Quinn', 'Blake', 'Ortiz', 'casey.lim', 'Casey', 'Lim', '555 0100', '5550101', 'Northwind', 'Delta']
const count = async (collection: string, where: Doc = {}) => (await (await payload()).count({ collection: collection as never, where: where as never, overrideAccess: true })).totalDocs
const off = { H2O_EMAIL_MODE: 'off', H2O_EMAIL_INBOUND: 'off' } as unknown as NodeJS.ProcessEnv
const refused = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof OperatorError ? e.code : `UNEXPECTED_${String((e as Error).name)}`
  }
  return 'NOT_REFUSED'
}

let adminEmail = ''
let salesEmail = ''
beforeAll(async () => {
  // the run needs ICS's own domains set (the engine refuses to create accounts otherwise); synthetic here
  process.env.H2O_OWN_EMAIL_DOMAINS = 'ics-synthetic.example.test'
  process.env.H2O_IMPORT_PAUSE_MS = '0'
  process.env.H2O_IMPORT_MIN_FREE_MB = '0'
  await Promise.all([user('platform-admin'), user('sales')])
  adminEmail = userEmail('platform-admin')
  salesEmail = userEmail('sales')
})
beforeEach(async () => {
  await resetCrm()
  // the Revenue Engine switch is a global that other suites turn on; an apply needs it off (resetCrm keeps globals)
  await (await payload()).updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, overrideAccess: true })
  invalidateErsSettings()
})
afterEach(() => {
  delete process.env.H2O_EMAIL_MODE
})

describe('refusals (codes only)', () => {
  it('a file that is not the one named, a missing column, a non-admin, or sending not off', async () => {
    const f = file()
    const sha = sha256Hex(f)
    const p = await payload()
    expect(await refused(dryRun(p, f, '0'.repeat(64), adminEmail))).toBe('SHA_MISMATCH')
    expect(await refused(dryRun(p, f, 'not-a-hash', adminEmail))).toBe('SHA_ARGUMENT_INVALID')
    expect(await refused(dryRun(p, f, sha, salesEmail))).toBe('NOT_AN_ADMIN')
    const noPhone = Buffer.from('email,first_name,last_name,mobile_phone,company_name\na@example.test,A,B,,C\n')
    expect(await refused(dryRun(p, noPhone, sha256Hex(noPhone), adminEmail))).toBe('COLUMN_MISSING_PRIMARY_PHONE')
    const dry = await dryRun(p, f, sha, adminEmail)
    expect(await refused(apply(p, f, sha, adminEmail, dry.approval!, { H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: 'x@example.test', H2O_EMAIL_FROM: 'x@example.test' } as unknown as NodeJS.ProcessEnv))).toMatch(/^SENDING_NOT_OFF/)
    expect(await refused(apply(p, f, sha, adminEmail, 'f'.repeat(64), off))).toBe('STALE_DRY_RUN')
    expect(await count('crm-contacts')).toBe(0)
  })
})

describe('dry → apply → rerun → undo', () => {
  it('applies exactly the reviewed plan; nothing is queued or enrolled; audited; a rerun changes nothing; undo archives', async () => {
    const f = file()
    const sha = sha256Hex(f)
    const p = await payload()
    expect(legacyMapping(f.toString('utf8'))).toEqual({ email: 0, first_name: 1, last_name: 2, phone: 3, mobile_phone: 4, company: 5 })
    const dry = await dryRun(p, f, sha, adminEmail)
    expect(dry).toMatchObject({ sha256: sha, rows: 4, blocked: false, cutByField: {} })
    expect(dry.summary).toMatchObject({ rows: 4, create: 4, reject: 0, unlinkedFreeMail: 1, genericInboxReviews: 1 })
    expect(await count('crm-contacts')).toBe(0) // a dry run writes nothing
    const r = await apply(p, f, sha, adminEmail, dry.approval!, off, 'Phase P rehearsal (synthetic)')
    expect(r.batchIds.length).toBeGreaterThanOrEqual(1)
    // PROD-IMPORT-1 N1: the batch says how it ran, with the operator's note
    const batch = (await p.findByID({ collection: 'crm-import-batches', id: r.batchIds[0]!, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    expect(batch.options).toMatchObject({ via: 'operator-cli', operatorNote: 'Phase P rehearsal (synthetic)' })
    expect(r.before).toEqual(r.after) // not one enrollment, not one outgoing email
    expect(r.after).toEqual({ enrollments: 0, outbox: 0 })
    expect(await count('crm-contacts')).toBe(4)
    expect(await count('crm-email-outbox')).toBe(0) // 0 alerts, 0 T1
    expect(await count('audit-log', { collection: { equals: 'crm-import-batches' } })).toBeGreaterThanOrEqual(1) // the batch is audited, recorded as the named admin
    // the output carries counts, ids, the hash and codes only — no value from the file
    const printed = JSON.stringify({ dry, r })
    for (const v of VALUES) expect(printed, v).not.toContain(v)
    // rerun: the same file again creates nothing
    const again = await dryRun(p, f, sha, adminEmail)
    expect(again.summary.create).toBe(0)
    // undo (archive-only) by the file hash
    const u = await undo(p, sha, adminEmail, 'synthetic rehearsal')
    expect(u.ok).toBe(true)
    expect(await count('crm-import-batches', { status: { equals: 'APPLIED' } })).toBe(0)
  })
})

describe('reach counts are the real ones', () => {
  it('existing outbox rows are counted before and after, and the import adds none', async () => {
    const p = await payload()
    await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'reach:prior', kind: 'RFQ_SALES_ALERT', status: 'SENT', recipient_ref: 'x' } as never, overrideAccess: true, context: { crmServer: {} } })
    const f = file()
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    const r = await apply(p, f, sha, adminEmail, dry.approval!, off)
    expect(r.before).toEqual({ enrollments: 0, outbox: 1 })
    expect(r.after).toEqual(r.before)
  })
})

describe('the legacy rules (owner ruling 2026-10-08)', () => {
  it('over-long cells are cut by explicit option, bound into the approval, counted by field; link-names follow the rule', async () => {
    expect(LEGACY_OPTIONS).toMatchObject({ createAccounts: true, attested: true, truncateOversize: true })
    const rows = [
      `dana.ruiz@delta-cooling.example.test,Dana,Ruiz,,,${'Delta Cooling (synthetic) '.repeat(10)},x`,
      'promo.synthetic@gmail.com,Great offer https://spam.example.test/x,,,,,x',
      'eli.park@delta-cooling.example.test,see www.spam.example.test,,,,Delta Cooling (synthetic),x',
    ]
    const f = file(rows)
    const sha = sha256Hex(f)
    const p = await payload()
    const dry = await dryRun(p, f, sha, adminEmail)
    expect(dry).toMatchObject({ blocked: false, cutByField: { company: 1 } })
    expect(dry.summary).toMatchObject({ rows: 3, create: 2, skip: 1, spamNameSkipped: 1, spamNameCleared: 1, oversizeCut: 1 })
    const r = await apply(p, f, sha, adminEmail, dry.approval!, off)
    expect(r.after).toEqual({ enrollments: 0, outbox: 0 })
    expect(await count('crm-contacts')).toBe(2)
    const printed = JSON.stringify({ dry, r })
    for (const v of ['dana.ruiz', 'Ruiz', 'promo.synthetic', 'spam.example', 'eli.park']) expect(printed, v).not.toContain(v)
  })
})

it('the import path never queues an RFQ alert or acknowledgement (no notify import in the import code)', () => {
  for (const f of ['engine.ts', 'csv.ts', 'operator.ts', 'cli.ts']) {
    const src = readFileSync(path.join(process.cwd(), 'src/crm/import', f), 'utf8')
    expect(src, f).not.toMatch(/enqueueRfqNotifications|from '\.\.\/notify'|crm-email-outbox'\s*,\s*data/)
  }
})

it('the CLI awaits its work (`payload run` exits once the module has loaded: an un-awaited main() prints nothing and exits 0)', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/crm/import/cli.ts'), 'utf8')
  expect(src).toMatch(/^await main\(\)/m)
})

it('the CLI apply and undo take the operator note from --note, which is required (PROD-IMPORT-1 N1)', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/crm/import/cli.ts'), 'utf8')
  expect(src).toMatch(/await apply\(payload, [^\n]*, process\.env, arg\(args, 'note'\)\)/)
  expect(src).toMatch(/await undo\(payload, [^\n]*, arg\(args, 'note'\)\)/)
  expect(src).toMatch(/if \(!v\) throw new OperatorError\(`ARGUMENT_MISSING_/) // arg() refuses a missing value
})
