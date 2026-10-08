import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { registryReply, submitReply } from '../intake/native/handlers'
import { fixtureRegistry } from '../../rfq-native/registry'
import { issueFormToken } from '../intake/native/token'
import { readSheetsConfig } from '../../sheets/config'
import { resetTokenCache } from '../../sheets/google'
import { backoffMs, listSheetRows, MAX_ATTEMPTS, retryFailed, sheetStats, syncSheets } from '../../sheets/sync'
import { fakeGoogle, PRIVATE_PEM, SA, SA_B64, SHEET_ID } from '../../sheets/__tests__/fake-google'
import { payload, resetCrm } from './harness'

/**
 * SHEET-SYNC-1 against the isolated synthetic database, with a recording stand-in for Google (no network). The RFQ is
 * made through the real native submit path; the sheet job runs separately, after the RFQ is committed.
 */
type Doc = Record<string, unknown>
const T0 = new Date('2026-10-07T03:00:00Z')
let p: Payload
let seq = 0
const uuid = () => `0194${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`
const ENV = ['H2O_SHEETS_SA_KEY_B64', 'H2O_SHEETS_SPREADSHEET_ID', 'H2O_SHEETS_TAB', 'H2O_NATIVE_INTAKE', 'TRUSTED_PROXY'] as const
let saved: Record<string, string | undefined> = {}
const sheetsOn = () => {
  process.env.H2O_SHEETS_SA_KEY_B64 = SA_B64
  process.env.H2O_SHEETS_SPREADSHEET_ID = SHEET_ID
  delete process.env.H2O_SHEETS_TAB
}
const exec = async (q: unknown) => (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(q)
const rows = async () => (await exec(sql`SELECT inquiry_id, state, attempts, last_error_code, appended_at, next_attempt_at FROM crm_sheet_appends ORDER BY created_at`)).rows
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function request(ip: string, over: Record<string, string> = {}) {
  const reg = fixtureRegistry()
  return new Request('http://localhost:3210/api/rfq/submit/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': ip },
    body: JSON.stringify({ submissionId: uuid(), source: 'NATIVE_FORM', registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'parts', parts_part: 'Fan blades', parts_qty: '4', notes: 'Call after 3', name: 'Ana Ruiz', company: 'Northwind Thermal (synthetic)', email: `ana.${Date.now()}.${seq}@example.test`, country: 'TH', ...over }, context: { page_path: '/contact-us/', cta_placement: 'form', context_type: 'page' }, attribution: {}, antiAbuse: { formToken: issueFormToken(new Date(T0.getTime() - 20_000)).formToken, hp: '' } }),
  })
}
let ipSeq = 10
const submit = async (over: Record<string, string> = {}) => {
  const r = await submitReply(p, request(`192.0.2.${++ipSeq}`, over), T0)
  expect(r.status).toBe(200)
  return String((r.body as Doc).rfqNumber)
}
const rfqByNumber = async (n: string) => (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: n } }, limit: 1, overrideAccess: true, depth: 0 })).docs[0] as unknown as Doc

beforeAll(async () => {
  p = await payload()
  void registryReply
})
beforeEach(async () => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
  process.env.H2O_NATIVE_INTAKE = 'on'
  process.env.TRUSTED_PROXY = 'cloudflare'
  await resetCrm()
  await exec(sql`DELETE FROM crm_sheet_appends`)
  await exec(sql`DELETE FROM crm_sheet_state`)
  resetTokenCache()
})
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]
  else process.env[k] = saved[k]
  vi.restoreAllMocks()
})

describe('SHEET-SYNC-1: off unless configured', () => {
  it('with the settings unset nothing is queued and Google is never touched', async () => {
    for (const k of ENV) if (k.startsWith('H2O_SHEETS')) delete process.env[k]
    await submit()
    const g = fakeGoogle()
    expect(await syncSheets(p, { fetch: g.fetch })).toMatchObject({ enabled: false, queued: 0, appended: 0 })
    expect(g.calls).toHaveLength(0)
    expect(await rows()).toHaveLength(0)
    expect(readSheetsConfig().enabled).toBe(false)
  })
})

describe('SHEET-SYNC-1: happy path and idempotency', () => {
  it('a new website RFQ becomes exactly one sheet row (15 columns, token = RFQ number), and a second tick adds nothing', async () => {
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() }) // switches the feature on (the cursor)
    await sleep(15)
    const number = await submit({ company: 'Northwind Thermal (synthetic)' })
    const rfq = await rfqByNumber(number)
    const t = new Date(Date.now() + 1000)
    expect(await syncSheets(p, { fetch: g.fetch, now: t })).toMatchObject({ enabled: true, queued: 1, appended: 1, failed: 0 })
    expect(g.sheet).toHaveLength(1)
    const row = g.sheet[0]!
    expect(row).toHaveLength(15)
    expect(row[13]).toBe(number)
    expect(row[3]).toBe('Northwind Thermal (synthetic)')
    expect(row[5]).toBe('Fan blades')
    expect(row[10]).toBe('TH')
    expect(row[11]).toBe('Call after 3')
    expect(row[12]).toMatch(/^2026-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(row[14]).toContain(`/crm/rfqs/${String(rfq.id)}/`)
    expect((await rows())[0]).toMatchObject({ inquiry_id: String(rfq.id), state: 'SENT', attempts: 1 })
    expect(await syncSheets(p, { fetch: g.fetch, now: new Date(t.getTime() + 120_000) })).toMatchObject({ queued: 0, appended: 0 })
    expect(g.sheet).toHaveLength(1)
    expect((await rows()).length).toBe(1)
  })
  it('RFQs from before the feature was switched on are not back-filled', async () => {
    const before = await submit() // sheets still off
    await sleep(15)
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    expect(g.sheet).toHaveLength(0)
    await sleep(15)
    const after = await submit()
    await syncSheets(p, { fetch: g.fetch, now: new Date(Date.now() + 1000) })
    expect(g.sheet.map((r) => r[13])).toEqual([after])
    expect(g.sheet.map((r) => r[13])).not.toContain(before)
  })
  it('two ticks at once (two workers) append each RFQ exactly once', async () => {
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    await sleep(15)
    const numbers = [await submit(), await submit(), await submit()]
    const t = new Date(Date.now() + 1000)
    await Promise.all([syncSheets(p, { fetch: g.fetch, now: t }), syncSheets(p, { fetch: g.fetch, now: t })])
    expect(g.sheet.map((r) => r[13]).sort()).toEqual([...numbers].sort())
  })
  it('a worker that died after writing the row: the retry finds the token and does not write it again', async () => {
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    await sleep(15)
    const number = await submit()
    const t = new Date(Date.now() + 1000)
    await syncSheets(p, { fetch: g.fetch, now: t })
    expect(g.sheet).toHaveLength(1)
    // simulate the crash: the row is in the sheet but the queue still says SENDING with an expired lease
    await exec(sql`UPDATE crm_sheet_appends SET state = 'SENDING', lease_until = ${new Date(t.getTime() - 1000).toISOString()}::timestamptz, appended_at = NULL`)
    expect(await syncSheets(p, { fetch: g.fetch, now: new Date(t.getTime() + 60_000) })).toMatchObject({ appended: 0, alreadyThere: 1 })
    expect(g.sheet).toHaveLength(1)
    expect(g.sheet[0]![13]).toBe(number)
    expect((await rows())[0]).toMatchObject({ state: 'SENT', attempts: 2 })
  })
})

describe('SHEET-SYNC-1: Google down never touches the RFQ; retries; admin list', () => {
  it('the RFQ is accepted and kept while Google is unreachable; the row retries with backoff, then needs attention, then "Try again" delivers it', async () => {
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    await sleep(15)
    g.mode = 'net'
    const number = await submit() // 200 with the network down
    expect(await rfqByNumber(number)).toBeTruthy()
    let t = new Date(Date.now() + 1000)
    expect(await syncSheets(p, { fetch: g.fetch, now: t })).toMatchObject({ queued: 1, retrying: 1 })
    expect((await rows())[0]).toMatchObject({ state: 'PENDING', attempts: 1, last_error_code: 'GOOGLE_NETWORK' })
    // not due again before the backoff
    expect(await syncSheets(p, { fetch: g.fetch, now: new Date(t.getTime() + 60_000) })).toMatchObject({ retrying: 0, appended: 0 })
    for (let n = 2; n <= MAX_ATTEMPTS; n++) {
      t = new Date(t.getTime() + backoffMs(n - 1) + 1000)
      await syncSheets(p, { fetch: g.fetch, now: t })
    }
    expect((await rows())[0]).toMatchObject({ state: 'FAILED', attempts: MAX_ATTEMPTS, last_error_code: 'GOOGLE_NETWORK' })
    expect(await sheetStats(p)).toEqual({ failed: 1, pending: 0 })
    expect(await listSheetRows(p)).toEqual([expect.objectContaining({ state: 'FAILED', attempts: MAX_ATTEMPTS, code: 'GOOGLE_NETWORK' })])
    // the request itself was never affected
    const rfq = await rfqByNumber(number)
    expect(rfq).toBeTruthy()
    // Google comes back; an admin presses "Try again"
    g.mode = 'ok'
    expect(await retryFailed(p, t)).toBe(1)
    expect(await syncSheets(p, { fetch: g.fetch, now: new Date(t.getTime() + 1000) })).toMatchObject({ appended: 1 })
    expect(g.sheet.map((r) => r[13])).toEqual([number])
    expect(await sheetStats(p)).toEqual({ failed: 0, pending: 0 })
  })
  it('a 503 and a bad key are retried like any failure, with their codes', async () => {
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    await sleep(15)
    await submit()
    g.mode = 'down'
    await syncSheets(p, { fetch: g.fetch, now: new Date(Date.now() + 1000) })
    expect((await rows())[0]).toMatchObject({ state: 'PENDING', last_error_code: 'GOOGLE_SHEETS_503' })
    resetTokenCache()
    g.mode = 'auth'
    await syncSheets(p, { fetch: g.fetch, now: new Date(Date.now() + 3 * 3600_000) })
    expect((await rows())[0]).toMatchObject({ last_error_code: 'GOOGLE_TOKEN_400' })
  })
  it('the real submit path never calls Google (a failing global fetch cannot matter to an RFQ)', async () => {
    sheetsOn()
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('NETWORK_FORBIDDEN') })
    await submit()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('SHEET-SYNC-1: cell safety and logs', () => {
  it('formula-looking input is written with the apostrophe prefix', async () => {
    sheetsOn()
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    await sleep(15)
    await submit({ company: '=HYPERLINK("http://x.test","y")', notes: '@SUM(1)', parts_part: '-2+3' })
    await syncSheets(p, { fetch: g.fetch, now: new Date(Date.now() + 1000) })
    const row = g.sheet[0]!
    expect(row[3]).toBe('\'=HYPERLINK("http://x.test","y")')
    expect(row[11]).toBe("'@SUM(1)")
    expect(row[5]).toBe("'-2+3")
  })
  it('nothing secret or personal is logged: no key, no service account, no token, no customer address or name', async () => {
    sheetsOn()
    const lines: string[] = []
    const rec = (...a: unknown[]) => void lines.push(JSON.stringify(a))
    for (const m of ['info', 'warn', 'error', 'debug'] as const) vi.spyOn(p.logger, m).mockImplementation(rec as never)
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(((c: unknown) => (lines.push(String(c)), true)) as never)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(((c: unknown) => (lines.push(String(c)), true)) as never)
    const g = fakeGoogle()
    await syncSheets(p, { fetch: g.fetch, now: new Date() })
    await sleep(15)
    g.mode = 'down'
    await submit({ name: 'Zebulon Quux', company: 'Quasar Synthetic Works' })
    await syncSheets(p, { fetch: g.fetch, now: new Date(Date.now() + 1000) })
    g.mode = 'net'
    resetTokenCache()
    await syncSheets(p, { fetch: g.fetch, now: new Date(Date.now() + 3 * 3600_000) })
    out.mockRestore()
    err.mockRestore()
    const all = lines.join('\n')
    expect(all).toContain('SHEETS_APPEND_FAILED')
    for (const secret of [SA_B64, SA.private_key, PRIVATE_PEM.split('\n')[1]!, SA.client_email, 'ya29.', SHEET_ID, 'Zebulon', 'Quasar', '@example.test']) expect(all, secret.slice(0, 12)).not.toContain(secret)
    // the queue holds no customer data either
    expect(JSON.stringify(await rows())).not.toMatch(/Zebulon|Quasar|@example/)
  })
})
