import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildClient, client, DEFAULT_CLIENT, H2O_MANIFEST } from '../../client'
import { validateManifest } from '../../client/manifest'
import { holidaysFor, HOLIDAY_SEED } from '../data/holidays'
import { buildOfficeModel, DEFAULT_TH_COUNTRIES, officeCalendar, officeForCountry, OFFICE_LABEL, OFFICE_TIME_ZONE, OFFICES, USER_TIME_ZONES, type Office } from '../offices'

/**
 * KIT-0 H3 (offices, slot-only): the office code now reads its labels, zones and country rule from the client manifest. For the default client
 * the result must be exactly what was hard-coded before (the M12 regression gate in miniature), the stored slot ids must not
 * change (no migration), and a client with one office (slot TH) must work without the other slot.
 */
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const CLIENTS = path.join(process.cwd(), '../../clients')
/** The client's manifest as the build tooling would hand it to the app (the app module itself reads no files): the file's text, validated. */
function manifestOf(slug: string) {
  const v = validateManifest(JSON.parse(read(path.join(path.relative(process.cwd(), CLIENTS), slug, 'manifest.json'))))
  if (!v.ok) throw new Error(`clients/${slug}/manifest.json is invalid: ${JSON.stringify(v.issues)}`)
  return v.manifest
}

// the values and the rule as they were hard-coded in crm/offices.ts at the 1.3a head (copied here verbatim, on purpose)
const TODAY_ZONE = { US: 'America/Denver', TH: 'Asia/Bangkok' }
const TODAY_LABEL = { US: 'US (Denver)', TH: 'Thailand (Bangkok)' }
const TODAY_TH = new Set([
  'TH', 'BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TL', 'VN',
  'JP',
  'CN', 'HK', 'MO', 'TW', 'KR', 'KP', 'MN',
  'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
  'AU', 'NZ', 'PG', 'FJ', 'SB', 'VU', 'NC', 'PF', 'WS', 'TO', 'KI', 'FM', 'MH', 'PW', 'NR', 'TV', 'CK', 'NU', 'GU', 'MP', 'AS',
])
const TODAY_USER_ZONES = ['America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Singapore', 'UTC']
function todayOfficeForCountry(country: string | null | undefined, overrides: ReadonlyMap<string, Office> = new Map()) {
  const code = typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null
  if (!code) return { office: 'US' as Office, source: 'DEFAULT' }
  const o = overrides.get(code)
  if (o) return { office: o, source: 'OWNER_OVERRIDE' }
  return { office: (TODAY_TH.has(code) ? 'TH' : 'US') as Office, source: 'COUNTRY_RULE' }
}

describe('the default client: the manifest reproduces what was hard-coded', () => {
  it('the process client is the default one and the stored slots are unchanged', () => {
    expect(client().slug).toBe(DEFAULT_CLIENT)
    expect([...OFFICES]).toEqual(['US', 'TH'])
  })
  it('zones, labels, the TH country list and the user time zones are exactly today\'s', () => {
    expect(OFFICE_TIME_ZONE).toEqual(TODAY_ZONE)
    expect(OFFICE_LABEL).toEqual(TODAY_LABEL)
    expect([...DEFAULT_TH_COUNTRIES].sort()).toEqual([...TODAY_TH].sort())
    expect([...USER_TIME_ZONES]).toEqual(TODAY_USER_ZONES)
  })
  it('routes every two-letter code, in any case, and every missing or malformed value, exactly as before, with and without owner overrides', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const codes: Array<string | null | undefined> = [null, undefined, '', ' ', 'T', 'THA', 'T1', '1T', 'th ', 'ท', 'ÄÖ']
    for (const a of letters) for (const b of letters) codes.push(a + b, (a + b).toLowerCase())
    const overrides = new Map<string, Office>([['TH', 'US'], ['DE', 'TH'], ['JP', 'US'], ['ZZ', 'TH']])
    for (const c of codes) {
      expect(officeForCountry(c), String(c)).toEqual(todayOfficeForCountry(c))
      expect(officeForCountry(c, overrides), `${String(c)} with overrides`).toEqual(todayOfficeForCountry(c, overrides))
    }
  })
  it('the business calendars still use the same zones; an unknown office still gets the default calendar', () => {
    expect(officeCalendar('US').zone).toBe('America/Denver')
    expect(officeCalendar('TH').zone).toBe('Asia/Bangkok')
    expect(officeCalendar('JP')).toEqual(officeCalendar(undefined))
  })
  it('the model built from the default client\'s manifest file equals the one built from the in-code defaults', () => {
    const fromFile = buildOfficeModel(buildClient(manifestOf(DEFAULT_CLIENT)))
    const fromCode = buildOfficeModel(buildClient(H2O_MANIFEST))
    expect(fromFile.zone).toEqual(fromCode.zone)
    expect(fromFile.label).toEqual(fromCode.label)
    expect([...fromFile.thCountries].sort()).toEqual([...fromCode.thCountries].sort())
    expect(fromFile.unknownSlot).toBe(fromCode.unknownSlot)
    expect(fromFile.zone).toEqual(TODAY_ZONE)
  })
  it('the holiday seed keeps both tables for the default client (counts as in Patch L)', () => {
    for (const office of ['US', 'TH'] as const) for (const y of ['2026', '2027']) expect(HOLIDAY_SEED.filter((h) => h.office === office && h.date.startsWith(y)).length, `${office} ${y}`).toBeGreaterThan(8)
    expect(new Set(HOLIDAY_SEED.map((h) => h.office))).toEqual(new Set(['US', 'TH']))
  })
})

describe('a client with one office (ICST: slot TH only)', () => {
  const icst = buildClient(manifestOf('icst'))
  const m = buildOfficeModel(icst)
  it('uses its own office for zone and label, and routes every country, and a missing one, to TH', () => {
    expect(m.zone.TH).toBe('Asia/Bangkok')
    expect(m.label.TH).toBe('Thailand (Bangkok)')
    expect(m.unknownSlot).toBe('TH')
    for (const c of ['TH', 'US', 'DE', 'JP', 'BR']) expect(m.slotForCountry(c), c).toBe('TH')
  })
  it('the slot it does not use takes the client\'s own zone and its id as a label (never another company\'s name)', () => {
    expect(m.zone.US).toBe('Asia/Bangkok')
    expect(m.label.US).toBe('US')
  })
  it('seeds the Thailand holidays only', () => {
    const seed = holidaysFor(icst)
    expect(seed.length).toBeGreaterThan(16)
    expect(new Set(seed.map((h) => h.office))).toEqual(new Set(['TH']))
    expect(seed.filter((h) => h.office === 'TH').length).toBe(HOLIDAY_SEED.filter((h) => h.office === 'TH').length)
  })
})

describe('fail closed', () => {
  it('an office key that is not a stored slot stops the build instead of writing a value the database cannot hold', () => {
    const bad = { ...H2O_MANIFEST, offices: H2O_MANIFEST.offices.map((o, i) => (i === 0 ? { ...o, key: 'HQ' } : o)), routing: { ...H2O_MANIFEST.routing, rules: [], unknownCountry: 'TH' } }
    expect(() => buildOfficeModel(buildClient(bad))).toThrow(/"HQ" is not a stored office slot/)
  })
  it('a routing target that is not a stored slot stops the build', () => {
    const bad = { ...H2O_MANIFEST, routing: { ...H2O_MANIFEST.routing, unknownCountry: 'XX' } }
    expect(() => buildOfficeModel(buildClient(bad))).toThrow(/"XX" is not a stored office slot/)
  })
})

describe('the office code no longer hard-codes a client', () => {
  const src = read('src/crm/offices.ts')
  it('has no office label, no country list and no zone other than the generic user-selectable list', () => {
    expect(src).not.toMatch(/US \(Denver\)|Thailand \(Bangkok\)/)
    expect(src).not.toMatch(/'BN', 'KH'/)
    expect((src.match(/America\/Denver/g) ?? []).length).toBe(1) // only in the user-selectable zone list
    expect((src.match(/Asia\/Bangkok/g) ?? []).length).toBe(1)
  })
  it('the stored slot ids and the migration history are untouched', () => {
    expect(src).toContain("export const OFFICES = ['US', 'TH'] as const")
  })
})
