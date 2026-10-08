import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { countCsvRecords, EXPORT_CAP } from '../../app/(crm)/crm/_components/ExportDialog'
import { csvLine, exportCap, MAX_EXPORT_ROWS, overCapMessage } from '../export/csv-export'
import { MAX_CELL, normalizePhone, parseCsv, type Mapping } from '../import/csv'
import { cpLength, cpSlice, line } from '../workspace/validate'
import { approvalToken, DEFAULT_OPTIONS, findOversize, nameHasLink, nameLinkSkips, type PlannedRow } from '../import/engine'

/**
 * CSV-FIX-1 — external review items R2-07/08/09, pure logic (no database). DB behaviour is in
 * `__dbtests__/csv-fix-1.dbtest.ts`. Synthetic values only.
 */
const SRC = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8')

describe('R2-08 oversize cells: never sliced silently', () => {
  it('parseCsv keeps a long cell whole and lists it by row and column', () => {
    const long = 'x'.repeat(MAX_CELL + 5)
    const r = parseCsv(`email,notes\na@example.test,${long}\nb@example.test,short\n`)
    if (!r.ok) throw new Error(r.code)
    expect(r.rows[0]![1]).toHaveLength(MAX_CELL + 5)
    expect(r.longCells).toEqual([{ row: 1, column: 1, length: MAX_CELL + 5 }])
  })

  it('reports mapped cells over their field limit (CUT) and long unmapped cells (NOT_IMPORTED), by column name', () => {
    const header = ['email', 'title', 'unused', 'full name']
    const rows = [
      ['a@example.test', 't'.repeat(121), 'u'.repeat(MAX_CELL + 1), 'Avery Quinn'],
      ['b@example.test', 'Engineer', '', `${'A'.repeat(81)} Quinn`],
      ['c@example.test', 't'.repeat(120), '', 'Jo Ray'],
    ]
    const out = findOversize(header, rows, [{ row: 1, column: 2, length: MAX_CELL + 1 }], { email: 0, title: 1, full_name: 3 })
    expect(out).toEqual([
      { row: 1, column: 'title', field: 'title', length: 121, limit: 120, treatment: 'CUT' },
      { row: 1, column: 'unused', field: null, length: MAX_CELL + 1, limit: MAX_CELL, treatment: 'NOT_IMPORTED' },
      { row: 2, column: 'full name', field: 'full_name', length: 81, limit: 80, treatment: 'CUT' },
    ])
  })

  it('measures a name after the split the plan uses (a long first-name cell that splits fine is not oversize)', () => {
    const name = `${'A'.repeat(60)} ${'B'.repeat(60)}`
    expect(findOversize(['email', 'first'], [['a@example.test', name]], [], { email: 0, first_name: 1 })).toEqual([])
    expect(findOversize(['email', 'first', 'last'], [['a@example.test', 'Avery', 'Q'.repeat(81)]], [], { email: 0, first_name: 1, last_name: 2 })).toMatchObject([
      { row: 1, column: 'last', field: 'last_name', limit: 80 },
    ])
  })
})

describe('R2-07 approval bound to the reviewed plan', () => {
  const row = (over: Partial<PlannedRow> = {}): PlannedRow => ({
    row: 1,
    outcome: 'CREATE',
    reasons: [],
    email: 'a@example.test',
    contactId: null,
    fill: ['first_name'],
    account: 'NONE',
    accountId: null,
    domain: null,
    suppress: 'NONE',
    note: false,
    genericInbox: false,
    addressQuality: null,
    nameLinkCleared: false,
    values: { first_name: 'Avery' },
    ...over,
  })
  const base = { sha256: 'a'.repeat(64), mapping: { email: 0, first_name: 1 } as Mapping, options: DEFAULT_OPTIONS, rows: [row()], newAccounts: new Map<string, string>(), oversize: [] }
  const token = (over: Partial<typeof base> = {}, user = 'user-1') => approvalToken({ userId: user }, { ...base, ...over })

  it('is stable for the same plan, and differs when anything reviewed differs (counts alone are not enough)', () => {
    expect(token()).toBe(token())
    expect(token()).toMatch(/^[0-9a-f]{64}$/)
    const variants = [
      token({ sha256: 'b'.repeat(64) }),
      token({ mapping: { email: 0, last_name: 1 } }),
      token({ mapping: { email: 1, first_name: 0 } }),
      token({ options: { ...DEFAULT_OPTIONS, truncateOversize: true } }),
      token({ options: { ...DEFAULT_OPTIONS, createAccounts: true } }),
      token({ rows: [row({ email: 'b@example.test', values: { first_name: 'Jo' } })] }), // same counts, other person
      token({ rows: [row({ outcome: 'FILL', contactId: 'c-1' })] }),
      token({ rows: [row({ account: 'LINK_VERIFIED', accountId: 'acc-1' })] }),
      token({ rows: [row({ nameLinkCleared: true })] }), // a name cleared for a link is part of the reviewed plan
      token({ newAccounts: new Map([['acme.example.com', 'Acme']]) }),
      token({}, 'user-2'),
    ]
    for (const v of variants) expect(v).not.toBe(token())
    expect(new Set(variants).size).toBe(variants.length)
  })

  it('the mapping is normalised (key order does not matter)', () => {
    expect(token({ mapping: { first_name: 1, email: 0 } })).toBe(token())
  })
})

describe('R2-08 formula-protected phone round trip', () => {
  it('accepts one leading apostrophe before a phone, as the export writes it, and nothing more', () => {
    expect(normalizePhone("'+13035550142")).toEqual({ kind: 'E164', value: '+13035550142' })
    expect(normalizePhone("'(303) 555-0142")).toEqual({ kind: 'E164', value: '+13035550142' })
    expect(normalizePhone("'3035550142")).toEqual({ kind: 'E164', value: '+13035550142' })
    expect(normalizePhone("''+13035550142")).toMatchObject({ kind: 'DROPPED' })
    expect(normalizePhone("'call me")).toMatchObject({ kind: 'DROPPED' })
  })

  it('export cell → CSV parse → phone normaliser returns the stored E.164 value', () => {
    for (const stored of ['+13035550142', '+442079460958', '+13035550142 ext 12']) {
      const text = `phone\r\n${csvLine([stored])}`
      expect(text).toContain(`'${stored}`)
      const parsed = parseCsv(text)
      if (!parsed.ok) throw new Error(parsed.code)
      expect(normalizePhone(parsed.rows[0]![0]!)).toEqual({ kind: 'E164', value: stored })
    }
  })
})

describe('R2-08 attestation wording says what the engine does', () => {
  it('the option promises a candidate, never a verified past customer', () => {
    const wizard = read('app/(crm)/crm/_components/ImportWizard.tsx')
    expect(wizard).not.toMatch(/verified past customer/i)
    expect(wizard).toContain('Mark as candidate past customers (an admin confirms each one later).')
  })
})

describe('R2-09 export totals', () => {
  it('the dialog cap mirrors the server cap; the env knob can only lower it', () => {
    expect(EXPORT_CAP).toBe(MAX_EXPORT_ROWS)
    const prev = process.env.H2O_EXPORT_MAX_ROWS
    try {
      process.env.H2O_EXPORT_MAX_ROWS = '10'
      expect(exportCap()).toBe(10)
      process.env.H2O_EXPORT_MAX_ROWS = String(MAX_EXPORT_ROWS * 2)
      expect(exportCap()).toBe(MAX_EXPORT_ROWS)
      process.env.H2O_EXPORT_MAX_ROWS = 'nonsense'
      expect(exportCap()).toBe(MAX_EXPORT_ROWS)
    } finally {
      if (prev === undefined) delete process.env.H2O_EXPORT_MAX_ROWS
      else process.env.H2O_EXPORT_MAX_ROWS = prev
    }
  })

  it('the over-cap message names requested and allowed totals and how to narrow', () => {
    expect(overCapMessage(63210, 50000)).toBe('This list has 63,210 rows. An export can hold at most 50,000. Narrow the filters or search, then export in parts.')
  })

  it('the dialog counts data rows, not line breaks inside quoted cells, across chunks', () => {
    const csv = `\uFEFFName,Notes\r\n${csvLine(['Avery', 'line one\nline two'])}${csvLine(['Jo', 'plain'])}`
    const state = { inQuotes: false, lines: 0 }
    for (let i = 0; i < csv.length; i += 7) countCsvRecords(csv.slice(i, i + 7), state)
    expect(state.lines - 1).toBe(2)
  })

  it('no export copy calls an ordinary export a backup; the do-not-contact promise is only made for contacts and inquiries', () => {
    const dialog = read('app/(crm)/crm/_components/ExportDialog.tsx')
    expect(dialog).toContain('This is a list export, not a backup of the CRM.')
    expect(dialog).toMatch(/const dnc = alwaysDnc && list !== 'accounts'/)
    expect(dialog).not.toMatch(/full (CRM )?backup/i)
  })
})

describe('form spam in the name field (legacy load, owner ruling 2026-10-08)', () => {
  const m: Mapping = { email: 0, first_name: 1, last_name: 2 }
  it('a name with a web link is spam; ordinary names (dots, initials, non-Latin) are not', () => {
    expect(nameHasLink(['a@example.test', 'Win now https://spam.example.test/x', ''], m)).toBe(true)
    expect(nameHasLink(['a@example.test', 'Visit www.spam.example.test', ''], m)).toBe(true)
    expect(nameHasLink(['a@example.test', 'Avery', 'see HTTP://x.example.test'], m)).toBe(true)
    for (const n of ['J. R. Quinn', 'Dr. Avery Quinn Jr.', 'Ngọc Lan', '王 伟', 'O\'Brien-Smith', 'Mr.www'])
      expect(nameHasLink(['a@example.test', n, 'Synthetic'], m), n).toBe(false)
    expect(nameHasLink(['a@example.test', 'Visit www.spam.example.test', ''], { email: 0 })).toBe(false) // name not mapped
  })
  it('on free mail (or with no valid address) the row is skipped; on a corporate domain it loads without a name', () => {
    expect(nameLinkSkips(['casey.lim.synthetic@gmail.com', 'x https://spam.example.test', ''], m)).toBe(true)
    expect(nameLinkSkips(['not-an-address', 'x https://spam.example.test', ''], m)).toBe(true)
    expect(nameLinkSkips(['buyer@northwind.example.test', 'x https://spam.example.test', ''], m)).toBe(false)
  })
  it('a link-bearing name is never measured for length (skipped or cleared), but the rest of a cleared row still is', () => {
    const long = `Big offer https://spam.example.test/${'x'.repeat(200)}`
    const H = ['email', 'first_name', 'last_name', 'company']
    const mc: Mapping = { ...m, company: 3 }
    expect(findOversize(H, [['casey.lim.synthetic@gmail.com', long, '', 'c'.repeat(200)]], [], mc)).toEqual([])
    expect(findOversize(H, [['buyer@northwind.example.test', long, '', 'c'.repeat(200)]], [], mc).map((o) => o.field)).toEqual(['company'])
    expect(findOversize(H, [['buyer@northwind.example.test', 'y'.repeat(120), '', '']], [], mc)).toHaveLength(1)
  })
})

describe('PROD-IMPORT-1 N3: lengths and cuts count code points', () => {
  it('a cut never splits a character; a name of 80 emoji is 80 characters, not 160', () => {
    const emoji = '\u{1F600}'
    expect(cpLength(emoji.repeat(80))).toBe(80)
    expect(line(emoji.repeat(80), 80)).toBe(emoji.repeat(80)) // not over the limit
    const cut = line(`${emoji.repeat(79)}ab`, 80)!
    expect(cut).toBe(`${emoji.repeat(79)}a`)
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cpSlice(emoji.repeat(3), 2))).toBe(false) // no lone surrogate
    // the parser lists a cell by its code points: 1,100 emoji (2,200 UTF-16 units) is not over 2,000
    const csv = parseCsv(`email,notes\na@example.test,${emoji.repeat(1100)}\n`)
    expect(csv.ok && csv.longCells).toEqual([])
    const long = parseCsv(`email,notes\na@example.test,${emoji.repeat(MAX_CELL + 1)}\n`)
    expect(long.ok && long.longCells).toEqual([{ row: 1, column: 1, length: MAX_CELL + 1 }])
  })
  it('the over-long check measures code points: 160 emoji fit a 160-character company, 80 fit an 80-character name', () => {
    const emoji = '\u{1F600}'
    const H = ['email', 'first_name', 'company']
    const mc: Mapping = { email: 0, first_name: 1, company: 2 }
    expect(findOversize(H, [['buyer@northwind.example.test', emoji.repeat(80), emoji.repeat(160)]], [], mc)).toEqual([])
    expect(findOversize(H, [['buyer@northwind.example.test', 'Jo', emoji.repeat(161)]], [], mc).map((o) => [o.field, o.length])).toEqual([['company', 161]])
  })
})
