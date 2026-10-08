import { createVerify } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TAB, readSheetsConfig } from '../config'
import { accessToken, ALLOWED_HOSTS, appendRow, assertAllowed, resetTokenCache, SheetsError, signJwt, tokenPresent } from '../google'
import { buildRow, COLUMNS, HEADERS, neutralise } from '../row'
import { backoffMs } from '../sync'
import { ACCESS_TOKEN, fakeGoogle, PUBLIC_PEM, SA, SA_B64, SHEET_ID } from './fake-google'

const ENV = { H2O_SHEETS_SA_KEY_B64: SA_B64, H2O_SHEETS_SPREADSHEET_ID: SHEET_ID } as unknown as NodeJS.ProcessEnv
const cfg = () => readSheetsConfig(ENV)
beforeEach(() => resetTokenCache())

describe('config', () => {
  it('is off unless the key and the sheet id are both set', () => {
    expect(readSheetsConfig({} as unknown as NodeJS.ProcessEnv)).toMatchObject({ enabled: false, errors: [] })
    expect(readSheetsConfig({ H2O_SHEETS_SA_KEY_B64: SA_B64 } as unknown as NodeJS.ProcessEnv).enabled).toBe(false)
    expect(readSheetsConfig({ H2O_SHEETS_SPREADSHEET_ID: SHEET_ID } as unknown as NodeJS.ProcessEnv).enabled).toBe(false)
  })
  it('on with both; the tab defaults to "Website RFQs" and can be set', () => {
    expect(cfg()).toMatchObject({ enabled: true, tab: DEFAULT_TAB, spreadsheetId: SHEET_ID })
    expect(readSheetsConfig({ ...ENV, H2O_SHEETS_TAB: 'Leads' } as unknown as NodeJS.ProcessEnv).tab).toBe('Leads')
  })
  it('an unusable key or id is off, with a code and never the value', () => {
    const bad = readSheetsConfig({ H2O_SHEETS_SA_KEY_B64: 'not-base64-json', H2O_SHEETS_SPREADSHEET_ID: 'x' } as unknown as NodeJS.ProcessEnv)
    expect(bad.enabled).toBe(false)
    expect(bad.errors).toEqual(['SHEETS_KEY_INVALID', 'SHEETS_SPREADSHEET_ID_INVALID'])
    expect(JSON.stringify(bad)).not.toContain('not-base64-json')
  })
})

describe('Google client', () => {
  it('signs an RS256 service-account JWT that verifies with the public key (scope, audience, 1 h)', () => {
    const jwt = signJwt(SA, new Date('2026-10-09T10:00:00Z'))
    const [h, c, s] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims).toMatchObject({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token' })
    expect(claims.exp - claims.iat).toBe(3600)
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(PUBLIC_PEM, Buffer.from(s, 'base64url'))).toBe(true)
  })
  it('exchanges the JWT for a token once and caches it', async () => {
    const g = fakeGoogle()
    const now = new Date('2026-10-09T10:00:00Z')
    expect(await accessToken(cfg(), g.fetch, now)).toBe(ACCESS_TOKEN)
    expect(await accessToken(cfg(), g.fetch, new Date(now.getTime() + 60_000))).toBe(ACCESS_TOKEN)
    expect(g.calls).toHaveLength(1)
    expect(g.calls[0]!.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer')
    expect(g.calls[0]!.body).toContain('assertion=')
  })
  it('appends one row with RAW input to the configured tab (quoted), with the bearer token', async () => {
    const g = fakeGoogle()
    await appendRow(readSheetsConfig({ ...ENV, H2O_SHEETS_TAB: "Joe's RFQs" } as unknown as NodeJS.ProcessEnv), g.fetch, new Date(), ['a', 'b'])
    const call = g.appends()[0]!
    expect(call.url.startsWith(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/`)).toBe(true)
    expect(decodeURIComponent(call.url)).toContain("'Joe''s RFQs'!A:O:append")
    expect(call.url).toContain('valueInputOption=RAW')
    expect(call.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(JSON.parse(call.body)).toEqual({ values: [['a', 'b']] })
  })
  it('looks for a token (the RFQ number) in column N', async () => {
    const g = fakeGoogle()
    g.sheet.push(Array.from({ length: COLUMNS }, (_, i) => (i === 13 ? 'RFQ-1' : '')))
    expect(await tokenPresent(cfg(), g.fetch, new Date(), 'RFQ-1')).toBe(true)
    expect(await tokenPresent(cfg(), g.fetch, new Date(), 'RFQ-2')).toBe(false)
    expect(decodeURIComponent(g.calls.at(-1)!.url)).toContain('!N:N')
  })
  it('only the two Google hosts, https only; redirects refused; nothing else is ever requested', async () => {
    expect([...ALLOWED_HOSTS]).toEqual(['oauth2.googleapis.com', 'sheets.googleapis.com'])
    for (const bad of ['https://evil.example/token', 'http://sheets.googleapis.com/v4/x', 'https://sheets.googleapis.com.evil.example/', 'https://oauth2.googleapis.com@evil.example/', 'ftp://sheets.googleapis.com/', 'not a url'])
      expect(() => assertAllowed(bad), bad).toThrow(SheetsError)
    assertAllowed('https://sheets.googleapis.com/v4/spreadsheets/x')
    const g = fakeGoogle()
    const seen: RequestInit[] = []
    await appendRow(cfg(), async (u, i) => { seen.push(i); return g.fetch(u, i) }, new Date(), ['x'])
    expect(seen.every((i) => i.redirect === 'error')).toBe(true)
  })
  it('failures are short codes: no response body, no key, no token in the message', async () => {
    const g = fakeGoogle()
    g.mode = 'down'
    const err = await appendRow(cfg(), g.fetch, new Date(), ['x']).catch((e: unknown) => e as SheetsError) as SheetsError
    expect(err).toBeInstanceOf(SheetsError)
    expect(err.code).toBe('GOOGLE_SHEETS_503')
    expect(`${err.message}${err.stack ?? ''}`).not.toMatch(/customer@example|BEGIN PRIVATE|ya29|gserviceaccount/)
    resetTokenCache()
    g.mode = 'net'
    expect((await appendRow(cfg(), g.fetch, new Date(), ['x']).catch((e: unknown) => e as SheetsError) as SheetsError).code).toBe('GOOGLE_NETWORK')
    resetTokenCache()
    g.mode = 'auth'
    expect((await appendRow(cfg(), g.fetch, new Date(), ['x']).catch((e: unknown) => e as SheetsError) as SheetsError).code).toBe('GOOGLE_TOKEN_400')
  })
})

describe('row', () => {
  const rfq = {
    id: 'rid-1',
    rfq_number: 'RFQ-20261009-ABCD1234',
    received_at: '2026-10-09T18:03:11.000Z',
    submitted: { email: 'ana@example.test', first_name: 'Ana', last_name: 'Ruiz', company: 'Northwind', phone: '+1 555 0100', country_code: 'TH', message: 'Need fan blades', other_answers: { interest: 'Parts', parts_part: 'Fan blades', parts_model: 'M-2', notes: 'Call after 3' } },
  }
  it('has the 15 columns (a phone starting with + gets the formula apostrophe, as specified) in the Typeform order plus the CRM link; time in America/Denver; token = RFQ number', () => {
    expect([...HEADERS]).toEqual(['email', 'first_name', 'last_name', 'company', 'interest', 'part', 'details', 'urgent', 'upload', 'phone', 'country', 'notes', 'Submitted At (America/Denver)', 'token', 'CRM link'])
    const r = buildRow(rfq, 'https://crm.example.test/')
    expect(r).toHaveLength(15)
    expect(r).toEqual(['ana@example.test', 'Ana', 'Ruiz', 'Northwind', 'Parts', 'Fan blades / M-2', 'Need fan blades', '', '', "'+1 555 0100", 'TH', 'Call after 3', '2026-10-09 12:03:11', 'RFQ-20261009-ABCD1234', 'https://crm.example.test/crm/rfqs/rid-1/'])
  })
  it('neutralises anything a spreadsheet would read as a formula', () => {
    for (const v of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\t=x', '\r=x']) expect(neutralise(v), JSON.stringify(v)).toBe(`'${v}`)
    for (const v of ['plain', 'a=b', '', 'x@y', '1+1']) expect(neutralise(v)).toBe(v)
    const r = buildRow({ ...rfq, submitted: { ...rfq.submitted, company: '=HYPERLINK("http://x","y")', first_name: '+1', message: '@SUM(1)', last_name: '-1' } }, '')
    expect([r[3], r[1], r[6], r[2]]).toEqual(['\'=HYPERLINK("http://x","y")', "'+1", "'@SUM(1)", "'-1"])
  })
  it('backs off 2^attempts minutes, at most an hour', () => {
    expect([1, 2, 3, 6, 7, 20].map((n) => backoffMs(n) / 60_000)).toEqual([2, 4, 8, 60, 60, 60])
  })
})

describe('boundary: Google is reached from one file, to two hosts', () => {
  const dir = path.resolve(__dirname, '..')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(path.join(dir, f), 'utf8')] as const)
  it('every URL literal in src/sheets is one of the two hosts, and only google.ts calls fetch with a URL', () => {
    for (const [f, src] of files) {
      for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) expect((ALLOWED_HOSTS as readonly string[]).includes(m[1]!) || m[1] === 'www.googleapis.com', `${f}: ${m[0]}`).toBe(true)
      if (f !== 'google.ts') expect(src, f).not.toMatch(/node:(http|https|net|tls|dgram)|\baxios\b|googleapis['"]/)
    }
  })
  it('no secret-bearing value is logged or thrown (no console, no key in any message)', () => {
    for (const [f, src] of files) expect(src, f).not.toMatch(/console\./)
  })
})
