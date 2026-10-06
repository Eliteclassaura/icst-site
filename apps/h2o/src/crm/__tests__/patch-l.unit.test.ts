import { describe, expect, it } from 'vitest'
import { HOLIDAY_SEED } from '../data/holidays'
import { DEFAULT_TH_COUNTRIES, officeCalendar, officeForCountry, OFFICE_TIME_ZONE } from '../offices'
import { settingsFromDoc } from '../officeSettings'
import { validateAttribution } from '../intake/attribution'
import { ACTIVITY_TYPE } from '../vocabulary'
import { ACTIVITY_LABEL } from '../workspace/labels'
import {
  absoluteTime,
  activityTime,
  businessDate,
  endOfLocalDate,
  firstResponseDueAt,
  isBusinessDay,
  quickDueDates,
  type BusinessCalendar,
} from '../workspace/time'

/** CRM Patch L1 — pure logic: routing, office calendars, holidays, zone-aware display. DB behaviour: patch-l.dbtest.ts. */
const TH: BusinessCalendar = { zone: 'Asia/Bangkok', holidays: new Set(['2027-04-13', '2027-04-14', '2027-04-15']) }
const US: BusinessCalendar = { zone: 'America/Denver', holidays: new Set(['2026-11-26']) }

describe('L1 routing rule', () => {
  it('Thailand, Southeast Asia, Japan and the rest of APAC → TH; everything else → US; unknown → US (DEFAULT)', () => {
    for (const c of ['TH', 'VN', 'SG', 'ID', 'JP', 'CN', 'KR', 'IN', 'AU', 'NZ']) expect(officeForCountry(c), c).toEqual({ office: 'TH', source: 'COUNTRY_RULE' })
    for (const c of ['US', 'MX', 'DE', 'SA', 'ZA', 'BR', 'GB']) expect(officeForCountry(c), c).toEqual({ office: 'US', source: 'COUNTRY_RULE' })
    expect(officeForCountry(null)).toEqual({ office: 'US', source: 'DEFAULT' })
    expect(officeForCountry('xx1')).toEqual({ office: 'US', source: 'DEFAULT' })
    expect(officeForCountry('jp')).toEqual({ office: 'TH', source: 'COUNTRY_RULE' })
  })
  it('an owner override wins, case-insensitively, and is parsed from the settings record defensively', () => {
    const s = settingsFromDoc({ routing_overrides: [{ country_code: 'jp', office: 'US' }, { country_code: 'bad!', office: 'TH' }, { country_code: 'DE', office: 'XX' }], holidays: [{ office: 'TH', date: '2027-04-13' }, { office: 'TH', date: 'soon' }] })
    expect([...s.overrides]).toEqual([['JP', 'US']])
    expect(officeForCountry('JP', s.overrides)).toEqual({ office: 'US', source: 'OWNER_OVERRIDE' })
    expect([...s.holidays.TH]).toEqual(['2027-04-13'])
    expect(officeCalendar('TH', s)).toEqual({ zone: 'Asia/Bangkok', holidays: s.holidays.TH })
    expect(officeCalendar('nope', s).zone).toBe('America/Denver')
  })
  it('the office zones are Denver and Bangkok; the default TH list has no US-queue country', () => {
    expect(OFFICE_TIME_ZONE).toEqual({ US: 'America/Denver', TH: 'Asia/Bangkok' })
    for (const c of ['US', 'CA', 'MX', 'GB', 'DE', 'SA', 'AE']) expect(DEFAULT_TH_COUNTRIES.has(c), c).toBe(false)
  })
})

describe('L1 office calendars', () => {
  it('business days skip weekends and the office holidays, in the office zone', () => {
    expect(isBusinessDay(new Date('2027-04-13T05:00:00Z'), TH)).toBe(false) // Songkran, Bangkok
    expect(isBusinessDay(new Date('2027-04-16T05:00:00Z'), TH)).toBe(true)
    // 2026-11-26 18:00 Bangkok is still the 26th in Bangkok but the 26th 04:00 in Denver: the US holiday applies in Denver.
    expect(isBusinessDay(new Date('2026-11-26T11:00:00Z'), US)).toBe(false)
  })
  it('first response: Bangkok Friday daytime → end of Monday, Bangkok; holidays push it further', () => {
    expect(firstResponseDueAt(new Date('2026-10-09T03:00:00Z'), { zone: 'Asia/Bangkok', holidays: new Set() }).toISOString()).toBe(new Date('2026-10-12T23:59:59.999+07:00').toISOString())
    expect(firstResponseDueAt(new Date('2027-04-12T03:00:00Z'), TH).toISOString()).toBe(new Date('2027-04-16T23:59:59.999+07:00').toISOString())
    expect(firstResponseDueAt(new Date('2026-11-25T17:00:00Z'), US).toISOString()).toBe(new Date('2026-11-27T23:59:59.999-07:00').toISOString())
    // An arrival ON a holiday counts from the next business day.
    expect(firstResponseDueAt(new Date('2027-04-14T03:00:00Z'), TH).toISOString()).toBe(new Date('2027-04-19T23:59:59.999+07:00').toISOString())
  })
  it('a picked date ends at local midnight in the user zone (no 18:00Z noon trick); invalid dates are refused', () => {
    expect(endOfLocalDate('2026-10-07', 'Asia/Bangkok')?.toISOString()).toBe(new Date('2026-10-07T23:59:59.999+07:00').toISOString())
    expect(endOfLocalDate('2026-10-07', 'America/Denver')?.toISOString()).toBe(new Date('2026-10-07T23:59:59.999-06:00').toISOString())
    expect(endOfLocalDate('2026-02-30', 'Asia/Bangkok')).toBeNull()
    expect(endOfLocalDate('7 Oct', 'Asia/Bangkok')).toBeNull()
  })
  it('quick dates use the viewer calendar: "tomorrow" skips a holiday; "today" is the viewer’s date', () => {
    const q = quickDueDates(new Date('2027-04-12T03:00:00Z'), TH)
    expect(q).toEqual({ today: '2027-04-12', tomorrow: '2027-04-16', next_week: '2027-04-19' })
    // 23:30 Monday in Denver is already Tuesday in Bangkok.
    expect(businessDate(new Date('2026-10-06T05:30:00Z'), 'America/Denver')).toBe('2026-10-05')
    expect(businessDate(new Date('2026-10-06T05:30:00Z'), 'Asia/Bangkok')).toBe('2026-10-06')
  })
  it('display follows the viewer zone and names it', () => {
    const d = new Date('2026-10-06T03:00:00Z')
    expect(absoluteTime(d, 'Asia/Bangkok')).toMatch(/10:00 AM ICT$/)
    expect(absoluteTime(d)).toMatch(/9:00 PM MT$/)
    expect(activityTime(d, new Date('2026-10-06T04:00:00Z'), 'Asia/Bangkok')).toBe('Today 10:00')
  })
})

describe('L1 holiday seed (owner-approved standard lists)', () => {
  it('covers both offices for 2026 and 2027, every date real, unique, and never on a weekend', () => {
    for (const office of ['US', 'TH'] as const)
      for (const y of ['2026', '2027']) expect(HOLIDAY_SEED.filter((h) => h.office === office && h.date.startsWith(y)).length, `${office} ${y}`).toBeGreaterThanOrEqual(10)
    const keys = HOLIDAY_SEED.map((h) => `${h.office}:${h.date}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const h of HOLIDAY_SEED) {
      const d = new Date(`${h.date}T12:00:00Z`)
      expect(d.toISOString().slice(0, 10), h.date).toBe(h.date)
      expect([0, 6], `${h.office} ${h.date} ${h.name}`).not.toContain(d.getUTCDay())
    }
  })
})

describe('L4 attribution (native intake, contract §4)', () => {
  it('keeps valid first-touch values, capped and shaped', () => {
    const { attribution, rejected } = validateAttribution({
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'cooling towers 2026', utm_term: 'fan blade', utm_content: 'ad:a/b+1',
      gclid: 'Cj0KCQjw-abc_123', gbraid: '0AAAAA-xyz', wbraid: 'Ck_1-a', ga_client_id: '1234567890.1700000000',
      landing_page: '/cooling-tower-parts/', referrer: 'https://www.google.com/search',
    })
    expect(rejected).toEqual([])
    expect(attribution).toMatchObject({ utm_campaign: 'cooling towers 2026', gclid: 'Cj0KCQjw-abc_123', ga_client_id: '1234567890.1700000000', landing_page: '/cooling-tower-parts/', referrer: 'https://www.google.com/search' })
  })
  it('drops anything unsafe or unknown, by key only — never echoing a value', () => {
    const { attribution, rejected } = validateAttribution({
      utm_source: 'x'.repeat(65), utm_medium: 'pat@example.test', utm_term: 'a\u0007b', gclid: 'bad id!', ga_client_id: 'GA1.1.123.456',
      landing_page: 'https://evil.example/x', referrer: 'https://user:pw@example.com/p?q=secret#f', email: 'pat@example.test',
    })
    expect(attribution).toEqual({})
    expect(rejected.sort()).toEqual(['email:NOT_ALLOWLISTED', 'ga_client_id:INVALID', 'gclid:INVALID', 'landing_page:INVALID', 'referrer:INVALID', 'utm_medium:INVALID', 'utm_source:INVALID', 'utm_term:INVALID'])
    expect(JSON.stringify(rejected)).not.toContain('example')
  })
  it('a referrer keeps origin and path only; a landing page must be a site path without traversal', () => {
    expect(validateAttribution({ referrer: 'https://www.bing.com/search?q=cooling+tower#x' }).attribution).toEqual({ referrer: 'https://www.bing.com/search' })
    expect(validateAttribution({ landing_page: '/a/../admin/' }).rejected).toEqual(['landing_page:INVALID'])
    expect(validateAttribution({ landing_page: '//evil.example/' }).rejected).toEqual(['landing_page:INVALID'])
    expect(validateAttribution(null)).toEqual({ attribution: {}, rejected: [] })
  })
})

describe('labels (found in Patch L QA)', () => {
  it('every activity type has a human label (email notifications rendered as "Unknown")', () => {
    for (const t of ACTIVITY_TYPE) expect(ACTIVITY_LABEL[t as keyof typeof ACTIVITY_LABEL], t).toBeTruthy()
  })
})

