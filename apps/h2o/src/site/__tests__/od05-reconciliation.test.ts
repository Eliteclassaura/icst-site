/**
 * H2O Phase 2D — the OD05 claim reconciliation, tested as an authority.
 *
 * OD05 holds 1,962 claim instances across the 29 prepared routes whose reviewer_role_required is
 * SUBJECT_MATTER_EXPERT. Owner approval does not resolve them: an owner can confirm what ICS does,
 * not whether a procedure is safe, a standard is current or a number is supported. R2.1 reconciles
 * every one of them, and OD05_R2_RECONCILIATION.tsv is the record.
 *
 * These tests do not judge the engineering. They close the ways the reconciliation could be
 * hollow: a row missing, a disposition outside the permitted set, a HIGH-severity row parked on a
 * generic verdict, a recorded body hash that no longer matches the file that renders, or a claim
 * marked as still present that is not.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CONTENT = path.join(process.cwd(), 'content', '2d-launch-cohort')

const PERMITTED = new Set([
  'ALREADY_CORRECTED',
  'CORRECTED_R2_1',
  'FALSE_POSITIVE_WITH_EXPLICIT_EVIDENCE',
  'NOT_APPLICABLE_TO_RENDERED_BODY',
  'OWNER_SCOPE_CONFIRMED',
  'QUALIFIED_WITH_PRIMARY_SOURCE',
  'REMOVED',
  'SUPPORTED_AS_WRITTEN_BY_PRIMARY_SOURCE',
])

/*
  A rule-based default is a legitimate verdict for a descriptive sentence that carries no
  prescription, number or named authority. It is not a legitimate verdict for a HIGH-severity
  technical, safety, standards or water-treatment row: those are exactly the rows the directive
  says may not finish unexplained, so each one must carry an individual judgement.
*/
const RULE_BASED_DEFAULTS = new Set([
  'COMPOSED_UNDER_AN_ACCEPTED_FACTORY_CONTRACT',
  'DESCRIPTIVE_SEGMENT_NO_PRESCRIPTION_NO_QUANTIFIED_CLAIM_NO_NAMED_AUTHORITY',
  'HEADING_OR_RHETORICAL_QUESTION_ASSERTS_NOTHING',
  'SCOPED_TECHNICAL_STATEMENT_MARKER_WITHOUT_PRESCRIPTION',
])

type Row = Record<string, string>

const rows: Row[] = (() => {
  const text = readFileSync(path.join(CONTENT, 'OD05_R2_RECONCILIATION.tsv'), 'utf8')
  const lines = text.split('\n').filter((l) => l !== '')
  const head = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    expect(cells).toHaveLength(head.length)
    return Object.fromEntries(head.map((h, i) => [h, cells[i]])) as Row
  })
})()

const MANDATED = [
  'claim_id',
  'route_id',
  'canonical_path',
  'claim_class',
  'severity',
  'audit_verdict',
  'reason_code',
  'claim_text',
  'present_in_r2_before',
  'r2_disposition',
  'primary_source_keys',
  'replacement_or_qualifier',
  'final_body_file',
  'final_body_sha256',
  'notes',
]

const norm = (s: string): string =>
  s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

describe('the reconciliation covers every OD05 SME row', () => {
  it('holds 1,962 rows across the 29 prepared routes, each claim once', () => {
    expect(rows).toHaveLength(1962)
    expect(new Set(rows.map((r) => r.claim_id)).size).toBe(1962)
    expect(new Set(rows.map((r) => r.route_id)).size).toBe(29)
    expect(new Set(rows.map((r) => r.canonical_path)).size).toBe(29)
  })

  it('carries every mandated column, populated on every row', () => {
    for (const row of rows) {
      for (const column of MANDATED) {
        expect(Object.hasOwn(row, column)).toBe(true)
        expect(row[column].length).toBeGreaterThan(0)
      }
    }
  })

  it('records the OD05 verdict each row is answering', () => {
    for (const row of rows) {
      expect(row.audit_verdict).toBe('OD05:OWNER_OR_SME_VERIFICATION_REQUIRED_BEFORE_PUBLICATION')
    }
  })
})

describe('every disposition is one of the permitted eight, and none is a generic pass', () => {
  it('uses only the permitted disposition values', () => {
    for (const row of rows) expect(PERMITTED.has(row.r2_disposition)).toBe(true)
  })

  it('never records a bare PASS, OK, DONE or REVIEWED state', () => {
    const generic = /^(pass(ed)?|ok|fine|done|reviewed|accepted|no ?action|n\/?a)$/i
    for (const row of rows) {
      expect(generic.test(row.r2_disposition)).toBe(false)
      expect(generic.test(row.reason_code)).toBe(false)
    }
  })

  it('gives every row a reason code long enough to mean something', () => {
    for (const row of rows) expect(row.reason_code.length).toBeGreaterThan(12)
  })
})

describe('no HIGH-severity finding finishes unexplained', () => {
  const high = rows.filter((r) => r.severity === 'HIGH')

  it('has HIGH-severity rows to answer for', () => {
    expect(high.length).toBeGreaterThan(50)
  })

  it('answers each of them individually rather than by rule', () => {
    const parked = high.filter((r) => RULE_BASED_DEFAULTS.has(r.reason_code))
    expect(parked.map((r) => `${r.claim_id} ${r.reason_code}`)).toEqual([])
  })

  it('names a primary source key and writes a note on each one', () => {
    for (const row of high) {
      expect(row.primary_source_keys.length).toBeGreaterThan(8)
      expect(row.notes.length).toBeGreaterThan(40)
      expect(row.replacement_or_qualifier.length).toBeGreaterThan(8)
    }
  })

  it('records the severity markers that produced the derived severity', () => {
    for (const row of rows) {
      expect(row.severity_markers.length).toBeGreaterThan(0)
      if (row.severity === 'HIGH') expect(row.severity_markers).not.toBe('none')
    }
  })
})

describe('the reconciliation is not a deletion pass', () => {
  it('retains far more claims than it removes', () => {
    const removed = rows.filter((r) => r.r2_disposition === 'REMOVED').length
    const retained = rows.filter(
      (r) =>
        r.r2_disposition === 'SUPPORTED_AS_WRITTEN_BY_PRIMARY_SOURCE' ||
        r.r2_disposition === 'FALSE_POSITIVE_WITH_EXPLICIT_EVIDENCE' ||
        r.r2_disposition === 'QUALIFIED_WITH_PRIMARY_SOURCE',
    ).length
    expect(retained).toBeGreaterThan(removed * 100)
  })

  it('keeps sound engineering content on HIGH rows too', () => {
    const high = rows.filter((r) => r.severity === 'HIGH')
    const kept = high.filter(
      (r) =>
        r.r2_disposition === 'SUPPORTED_AS_WRITTEN_BY_PRIMARY_SOURCE' ||
        r.r2_disposition === 'FALSE_POSITIVE_WITH_EXPLICIT_EVIDENCE',
    )
    expect(kept.length).toBeGreaterThan(0)
  })
})

describe('the ledger points at the bodies that actually render', () => {
  const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
  const cache = new Map<string, string>()
  const body = (file: string): string => {
    let t = cache.get(file)
    if (t === undefined) {
      t = readFileSync(path.join(CONTENT, 'bodies-r2', file), 'utf8')
      cache.set(file, t)
    }
    return t
  }

  it('records a final body hash that still matches the file on disk', () => {
    for (const row of rows) expect(sha(body(row.final_body_file))).toBe(row.final_body_sha256)
  })

  it('tells the truth about whether the claim survived into the rendered body', () => {
    const wrong: string[] = []
    for (const row of rows) {
      const present = norm(body(row.final_body_file)).includes(norm(row.claim_text))
      const claimed = row.present_in_r2_1_after === 'YES'
      if (present !== claimed) wrong.push(`${row.claim_id} says ${row.present_in_r2_1_after}`)
    }
    expect(wrong).toEqual([])
  })

  it('never says a corrected or removed claim is still present', () => {
    for (const row of rows) {
      if (row.r2_disposition === 'REMOVED' || row.r2_disposition === 'CORRECTED_R2_1') {
        expect(row.present_in_r2_1_after).toBe('NO')
      }
    }
  })
})
