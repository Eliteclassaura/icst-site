import { describe, expect, it } from 'vitest'
import { csvCell, pickColumns } from '../export/csv-export'
import { CONSUMER_EMAIL_DOMAINS, isConsumerDomain, isProviderDomain, registrableLabel } from '../free-mail'
import { guessMapping, isPlaceholder, MAX_ROWS, normalizePhone, parseCsv, splitName, validateMapping } from '../import/csv'
import { companyHint, displayCompany, nameFromDomain, parseOptions } from '../import/engine'
import { addressQualityOf, providerTypoOf, spamPatternOf } from '../address-quality'
import { parseBulk, BULK_MAX } from '../workspace/bulk'
import { activityTime } from '../workspace/time'
import { normalizeViewQuery, viewHref } from '../workspace/views'

/** CRM Wave 1 Patch B — pure logic (no database). DB behaviour is in `__dbtests__/wave1-patch-b.dbtest.ts`. */
const UUID = '01920000-0000-7000-8000-000000000001'

describe('W1-3 CSV reading', () => {
  it('parses quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM', () => {
    const r = parseCsv('﻿email,name\r\n"a@example.test","Smith, ""Jo"""\r\nb@example.test,"two\nlines"\n')
    expect(r).toEqual({ ok: true, header: ['email', 'name'], rows: [['a@example.test', 'Smith, "Jo"'], ['b@example.test', 'two\nlines']] })
  })
  it('refuses binary, empty, unterminated, headerless and oversized input with a code and no value echoed', () => {
    expect(parseCsv('a\u0000b')).toMatchObject({ ok: false, code: 'NOT_TEXT' })
    expect(parseCsv('')).toMatchObject({ ok: false, code: 'EMPTY' })
    expect(parseCsv('email\n"secret@example.test')).toMatchObject({ ok: false, code: 'UNTERMINATED_QUOTE' })
    expect(parseCsv(',,\nx,y,z')).toMatchObject({ ok: false, code: 'NO_HEADER' })
    const big = `email\n${'a@example.test\n'.repeat(MAX_ROWS + 1)}`
    expect(parseCsv(big)).toMatchObject({ ok: false, code: 'TOO_MANY_ROWS' })
    const r = parseCsv('email\n"secret@example.test')
    expect(JSON.stringify(r)).not.toContain('secret')
  })
  it('guesses a mapping from headers and validates client mappings strictly', () => {
    expect(guessMapping(['first_name', 'last_name', 'email', 'mobile_phone', 'primary_phone', 'company_name'])).toEqual({
      first_name: 0, last_name: 1, email: 2, mobile_phone: 3, phone: 4, company: 5,
    })
    expect(validateMapping({ email: 0 }, 2)).toEqual({ ok: true, mapping: { email: 0 } })
    expect(validateMapping({ first_name: 0 }, 2)).toMatchObject({ ok: false }) // no email
    expect(validateMapping({ email: 0, title: 0 }, 2)).toMatchObject({ ok: false }) // a column twice
    expect(validateMapping({ email: 5 }, 2)).toMatchObject({ ok: false }) // out of range
    expect(validateMapping({ email: 0, password: 1 }, 2)).toMatchObject({ ok: false }) // not an import field
    expect(validateMapping({ email: 0, full_name: 1, last_name: 2 }, 3)).toMatchObject({ ok: false })
  })
})

describe('W1-3 value rules (CT conditions 2026-10-05)', () => {
  it('treats export placeholders ("no", "N/A", "-", …) as empty', () => {
    for (const v of ['no', 'NO', 'n/a', 'NA', 'none', '-', '0', 'unknown']) expect(isPlaceholder(v)).toBe(true)
    for (const v of ['Norm', 'Acme', 'Noah']) expect(isPlaceholder(v)).toBe(false)
  })
  it('splits names: last word = last name, suffix kept, single word kept whole, CJK/Thai never split, "Last, First"', () => {
    expect(splitName('Avery Jo Quinn')).toEqual({ first: 'Avery Jo', last: 'Quinn', how: 'SPLIT' })
    expect(splitName('Avery Quinn Jr')).toEqual({ first: 'Avery', last: 'Quinn Jr', how: 'SPLIT_SUFFIX' })
    expect(splitName('Avery Quinn III')).toEqual({ first: 'Avery', last: 'Quinn III', how: 'SPLIT_SUFFIX' })
    expect(splitName('Avery Quinn PE')).toEqual({ first: 'Avery', last: 'Quinn PE', how: 'SPLIT_SUFFIX' })
    expect(splitName('Avery')).toEqual({ first: 'Avery', last: null, how: 'SINGLE_WORD' })
    expect(splitName('山田 太郎')).toEqual({ first: '山田 太郎', last: null, how: 'SCRIPT_NOT_SPLIT' })
    expect(splitName('สมชาย ใจดี')).toEqual({ first: 'สมชาย ใจดี', last: null, how: 'SCRIPT_NOT_SPLIT' })
    expect(splitName('Quinn, Avery')).toEqual({ first: 'Avery', last: 'Quinn', how: 'COMMA' })
    expect(splitName('  ')).toEqual({ first: null, last: null, how: 'EMPTY' })
  })
  it('stores phones only as E.164: +…, or valid North American 10/11 digits; drops the rest, never reconstructs', () => {
    expect(normalizePhone('+44 20 7946 0958')).toEqual({ kind: 'E164', value: '+442079460958' })
    expect(normalizePhone('(303) 555-0142')).toEqual({ kind: 'E164', value: '+13035550142' })
    expect(normalizePhone('13035550142')).toEqual({ kind: 'E164', value: '+13035550142' })
    expect(normalizePhone('303-555-0142 x12')).toEqual({ kind: 'E164', value: '+13035550142 ext 12' })
    expect(normalizePhone('9.17E+11')).toMatchObject({ kind: 'DROPPED', why: expect.stringContaining('scientific') })
    expect(normalizePhone('1035550142')).toMatchObject({ kind: 'DROPPED' }) // area code cannot start with 0/1
    expect(normalizePhone('3031550142')).toMatchObject({ kind: 'DROPPED' }) // exchange cannot start with 0/1
    expect(normalizePhone('919876543210')).toMatchObject({ kind: 'DROPPED' }) // 12 digits, no "+": country unknown
    expect(normalizePhone('call me')).toMatchObject({ kind: 'DROPPED' })
    expect(normalizePhone('+12')).toMatchObject({ kind: 'DROPPED' })
  })
  it('names an account from its domain as the title-cased registrable label', () => {
    expect(nameFromDomain('acme.com')).toBe('Acme')
    expect(nameFromDomain('duke-energy.com')).toBe('Duke Energy')
    expect(nameFromDomain('plant.acme.co.uk')).toBe('Acme')
  })
  it('compares company hints without legal-form words', () => {
    expect(companyHint('ACME Inc.')).toBe(companyHint('Acme Incorporated'))
    expect(companyHint('Acme LLC')).toBe('acme')
    expect(companyHint('Beta Corp')).not.toBe(companyHint('Acme Corp'))
    // An address, a URL or a pasted paragraph in the company column never names or matches an account.
    expect(companyHint('Contact pat@example.test for orders')).toBeNull()
    expect(companyHint('https://acme.example.com')).toBeNull()
    expect(companyHint('A'.repeat(121))).toBeNull()
    expect(companyHint('Acme Thermal\nPlant 2')).toBeNull()
  })
  it('options: attestation needs explicit flags; text is bounded', () => {
    expect(parseOptions(undefined)).toEqual({ createAccounts: false, attested: false, source: null, basis: null })
    expect(parseOptions({ createAccounts: 'yes', attested: 1 })).toMatchObject({ createAccounts: false, attested: false })
    expect(parseOptions({ attested: true, source: 'x'.repeat(500) }).source).toHaveLength(160)
  })
})

describe('Free mail (CT ruling §8.3): one shared list plus provider labels', () => {
  it('the exact list includes the 2026-10-05 additions', () => {
    for (const d of ['mail.ru', 'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net']) expect(CONSUMER_EMAIL_DOMAINS.has(d)).toBe(true)
  })
  it('provider labels catch regional variants and typos the list cannot enumerate', () => {
    for (const d of ['gmx.de', 'yahoo.fr', 'outlook.com.br', 'hotmail.co.za', 'gmail.comm', 'shaw.ca', 'orange.fr']) {
      expect(isProviderDomain(d)).toBe(true)
      expect(isConsumerDomain(d)).toBe(true)
    }
    for (const d of ['airgas.com', 'dow.com', 'northwind.example.com', 'yahooindustries.com']) expect(isConsumerDomain(d)).toBe(false)
  })
  it('registrable label understands two-part suffixes', () => {
    expect(registrableLabel('mail.acme.co.uk')).toBe('acme')
    expect(registrableLabel('acme.com')).toBe('acme')
    expect(registrableLabel('x.yahoo.com.au')).toBe('yahoo')
  })
})

describe('W1-4 export safety', () => {
  it('neutralises spreadsheet formulas and quotes CSV', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    for (const v of ['+1', '-2', '@SUM(A1)', '\tx', '\rx']) expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true)
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell(null)).toBe('')
    expect(csvCell('Acme')).toBe('Acme')
  })
  it('columns come from the allowlist; contacts and inquiries always carry Do not contact', () => {
    expect(pickColumns('contacts', 'email,password,name').map((c) => c.key)).toEqual(['name', 'email', 'do_not_contact'])
    expect(pickColumns('inbox', null).at(-1)!.key).toBe('do_not_contact')
    expect(pickColumns('accounts', 'name').map((c) => c.key)).toEqual(['name'])
  })
})

describe('W1-5 bulk input', () => {
  it('accepts at most 100 valid, de-duplicated references and keeps each row’s loaded timestamp', () => {
    expect(parseBulk(`${UUID}|2026-10-05T10:00:00.000Z,${UUID}|x`)).toEqual({ ok: true, items: [{ id: UUID, updatedAt: '2026-10-05T10:00:00.000Z' }] })
    expect(parseBulk('')).toMatchObject({ ok: false })
    expect(parseBulk('not-a-uuid')).toMatchObject({ ok: false })
    const many = Array.from({ length: BULK_MAX + 1 }, (_, i) => `01920000-0000-7000-8000-${String(i).padStart(12, '0')}|`).join(',')
    expect(parseBulk(many)).toMatchObject({ ok: false })
  })
})

describe('W1-6 saved views keep filters only', () => {
  it('drops search, paging, unknown keys and malformed values', () => {
    expect(normalizeViewQuery('inbox', '?view=mine&q=jane%40example.test&s=1&page=3&motion=PARTS&evil=1')).toBe('view=mine&motion=PARTS')
    expect(normalizeViewQuery('contacts', 'owner=Jane&linked=no')).toBe('linked=no')
    expect(normalizeViewQuery('accounts', 'naming=domain&relationship=PROSPECT')).toBe('naming=domain&relationship=PROSPECT')
    expect(normalizeViewQuery('followups', 'who=team&when=overdue&x=1')).toBe('who=team&when=overdue')
    expect(normalizeViewQuery('followups', 'who=everyone')).toBe('')
    expect(viewHref('inbox', 'view=mine')).toBe('/crm/rfqs/?view=mine')
  })
})

describe('Directory "Last activity" (CT UX note)', () => {
  it('says Today for today, the weekday this week, the date otherwise', () => {
    const now = new Date('2026-10-05T18:00:00Z')
    expect(activityTime(new Date('2026-10-05T14:44:00Z'), now)).toMatch(/^Today \d{2}:\d{2}$/)
    expect(activityTime(new Date('2026-10-02T14:44:00Z'), now)).toMatch(/^Fri \d{2}:\d{2}$/)
    expect(activityTime(new Date('2026-09-01T14:44:00Z'), now)).toBe('Sep 1')
  })
})

describe('Inbox country and type (owner request 2026-10-05)', () => {
  it('resolves free-text countries by name, alias, ISO code or "City, Country"; never guesses', async () => {
    const { resolveCountryText } = await import('../countries')
    expect(resolveCountryText('Thailand')).toBe('TH')
    expect(resolveCountryText('USA')).toBe('US')
    expect(resolveCountryText('Houston, Texas, USA')).toBe('US')
    expect(resolveCountryText('th')).toBe('TH')
    expect(resolveCountryText('Viet Nam')).toBe('VN')
    expect(resolveCountryText('UAE')).toBe('AE')
    expect(resolveCountryText('Mars')).toBeNull()
    expect(resolveCountryText('')).toBeNull()
  })
  it('infers from the phone only for one-country calling codes, never +1 or +7, never without "+"', async () => {
    const { countryFromPhone } = await import('../countries')
    expect(countryFromPhone('+66 81 234 5678')).toBe('TH')
    expect(countryFromPhone('+44 20 7946 0958')).toBe('GB')
    expect(countryFromPhone('+971 4 123 4567')).toBe('AE')
    expect(countryFromPhone('+1 303 555 0100')).toBeNull()
    expect(countryFromPhone('+7 495 123 4567')).toBeNull()
    expect(countryFromPhone('66 81 234 5678')).toBeNull()
  })
  it('precedence: submitted ISO, then the destination answer, then the phone; otherwise unknown (not US)', async () => {
    const { deriveCountry } = await import('../countries')
    expect(deriveCountry({ submittedCountry: 'jp', destination: 'Thailand', phone: '+44 1' })).toEqual({ code: 'JP', source: 'SUBMITTED' })
    expect(deriveCountry({ destination: 'Thailand', phone: '+44 20 7946 0958' })).toEqual({ code: 'TH', source: 'DESTINATION_ANSWER' })
    expect(deriveCountry({ destination: 'somewhere', phone: '+44 20 7946 0958' })).toEqual({ code: 'GB', source: 'PHONE_INFERRED' })
    expect(deriveCountry({ phone: '+1 303 555 0100' })).toEqual({ code: null, source: 'UNKNOWN' })
    expect(deriveCountry({})).toEqual({ code: null, source: 'UNKNOWN' })
  })
  it('type: staff motion wins; else the customer interest by keyword; repair/service groups four motions', async () => {
    const { deriveType, typeFromInterest } = await import('../inquiry-type')
    expect(typeFromInterest('Cooling Tower Parts')).toBe('PARTS')
    expect(typeFromInterest('New Cooling Tower')).toBe('NEW_TOWER')
    expect(typeFromInterest('Repair / Maintenance service')).toBe('REPAIR_SERVICE')
    expect(typeFromInterest('Something else')).toBe('OTHER')
    expect(typeFromInterest('')).toBe('UNKNOWN')
    expect(deriveType({ motion: 'MAINTENANCE_INSPECTION', interest: 'Cooling Tower Parts' })).toEqual({ type: 'REPAIR_SERVICE', source: 'STAFF_MOTION' })
    expect(deriveType({ interest: 'Cooling Tower Parts' })).toEqual({ type: 'PARTS', source: 'CUSTOMER_INTEREST' })
    for (const mo of ['REPAIR', 'MAINTENANCE_INSPECTION', 'UPGRADE_RETROFIT', 'REBUILD_REPLACEMENT']) expect(deriveType({ motion: mo }).type).toBe('REPAIR_SERVICE')
  })
  it('saved views and links keep country, type and several motions', () => {
    expect(normalizeViewQuery('inbox', 'country=TH&country=UNKNOWN&country=XX&type=PARTS&motion=PARTS&motion=REPAIR&sort=country')).toBe(
      'type=PARTS&sort=country&motion=PARTS&motion=REPAIR&country=TH&country=UNKNOWN',
    )
  })
})

describe('ERS readiness: contact country hints (CT 2026-10-05)', () => {
  it('ccTLD gives a country; generic and vanity TLDs give nothing; .uk is GB', async () => {
    const { countryFromEmailDomain } = await import('../countries')
    expect(countryFromEmailDomain('acme.co.th')).toBe('TH')
    expect(countryFromEmailDomain('acme.co.uk')).toBe('GB')
    expect(countryFromEmailDomain('acme.jp')).toBe('JP')
    for (const d of ['acme.com', 'acme.io', 'acme.co', 'acme.ai', 'acme.tv', 'acme.net']) expect(countryFromEmailDomain(d)).toBeNull()
  })
})

describe('E1.3 AR-007 shared inboxes', () => {
  it('detects role/shared local parts (trailing digits ignored), not named people', async () => {
    const { isGenericInbox } = await import('../import/csv')
    for (const e of ['sales@acme.example.com', 'info2@acme.example.com', 'Purchasing@acme.example.com', 'ap@acme.example.com']) expect(isGenericInbox(e)).toBe(true)
    for (const e of ['salesman.jo@acme.example.com', 'avery@acme.example.com', 'information.desk.jane@acme.example.com']) expect(isGenericInbox(e)).toBe(false)
  })
})

describe('address quality (CT legacy spot-check, 2026-10-05)', () => {
  it('flags typos of the major mailbox providers, never a real mailbox domain or a near-miss company', () => {
    for (const d of ['gmai.com', 'gmsil.com', 'gamil.com', 'gmail.con', 'gmail.co', 'hotmial.com', 'hotmal.com', 'outlok.com', 'yaho.com', 'icluod.com', 'aol.con'])
      expect(providerTypoOf(d), d).not.toBeNull()
    for (const d of ['gmail.com', 'ymail.com', 'email.com', 'cloud.com', 'aon.com', 'bol.com', 'yahoo.co.jp', 'hotmail.co.uk', 'acme.example.com'])
      expect(providerTypoOf(d), d).toBeNull()
  })

  it('own domains come only from config (none when unset); disposable and typo domains are flagged', () => {
    const prev = process.env.H2O_OWN_EMAIL_DOMAINS
    try {
      process.env.H2O_OWN_EMAIL_DOMAINS = ' Ics-Own.example.com , ics-own.example.test'
      expect(addressQualityOf('ics-own.example.com')).toBe('INTERNAL')
      expect(addressQualityOf('ICS-OWN.example.test')).toBe('INTERNAL')
      expect(addressQualityOf('yopmail.com')).toBe('DISPOSABLE')
      expect(addressQualityOf('gmai.com')).toBe('SUSPECT_TYPO')
      expect(addressQualityOf('acme.example.com')).toBeNull()
      delete process.env.H2O_OWN_EMAIL_DOMAINS
      expect(addressQualityOf('ics-own.example.com')).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.H2O_OWN_EMAIL_DOMAINS
      else process.env.H2O_OWN_EMAIL_DOMAINS = prev
    }
  })

  it('spam-signup shapes: unusual TLD, a mail-service-like name, a short subdomain on a generic TLD', () => {
    expect(spamPatternOf('bubuk.site')).toBe('UNUSUAL_TLD')
    expect(spamPatternOf('kirzzioh.ru')).toBe('UNUSUAL_TLD')
    expect(spamPatternOf('sigismail.com')).toBe('MAIL_SERVICE_NAME')
    expect(spamPatternOf('si.llanhai.com')).toBe('SUBDOMAIN_GENERIC_TLD')
    for (const d of ['acme.example.com', 'plant-ops.acme.example.com', 'us.acme.example.com', 'duke-energy.com']) expect(spamPatternOf(d), d).toBeNull()
  })

  it('regional free mail never names an employer', () => {
    for (const d of ['inbox.lv', 'wp.pl', 'seznam.cz', 'ukr.net', 'mozmail.com', 'hvc.rr.com', 'mail.de']) expect(isConsumerDomain(d), d).toBe(true)
    for (const d of ['mozmail.com', 'hvc.rr.com']) expect(providerTypoOf(d), d).toBeNull()
  })

  it('title-cases an all-lowercase company value only', () => {
    expect(displayCompany('energy development corporation')).toBe('Energy Development Corporation')
    expect(displayCompany('indonesia power')).toBe('Indonesia Power')
    expect(displayCompany('ACME Thermal Inc')).toBe('ACME Thermal Inc')
    expect(displayCompany('McKinsey & co')).toBe('McKinsey & co')
  })
})
