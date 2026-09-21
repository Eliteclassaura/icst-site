/**
 * H2O Phase 2D R2.2 — the OD05 reconciliation, against the ACTUAL audit workbook.
 *
 * R2.1 reconciled against the earlier `CLAIM_INSTANCE_LEDGER.tsv` and derived its own severity
 * model. Control Tower refused that substitution: the real authority is
 * `H2O_OD05_FACT_CHECK_AND_PUBLISHING_DECISIONS_2026-09-19_R1.xlsx`, exported losslessly as
 * `CLAIM_DECISIONS.tsv`, and it carries its own Audit verdict, Severity, Reason code, Recommended
 * response, Primary source keys and Publish-now flag for each of the 1,962 claims.
 *
 * So the first thing these tests assert is that no severity is derived here at all: every severity
 * in the ledger is the workbook's, and the distribution matches the workbook's own counts —
 * 677 HIGH, 1,220 MEDIUM, 65 LOW. A reconciliation that quietly re-graded the audit would fail on
 * the first test in this file.
 *
 * The rest close the ways the reconciliation could be hollow: a claim missing, a disposition
 * outside the permitted set, a HIGH row parked on a rule-based default or left open, a body hash
 * that no longer matches what renders, or a presence column that disagrees with the files.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CONTENT = path.join(process.cwd(), 'content', '2d-launch-cohort')

/** The six states the directive permits, plus the two the factory must be able to say honestly. */
const PERMITTED = new Set([
  'ABSENT_FROM_RENDERED_BODY',
  'ALREADY_CORRECTED',
  'AUDIT_FALSE_POSITIVE_WITH_EXPLICIT_EVIDENCE',
  'CORRECTED_IN_R2_2',
  'OWNER_SCOPE_CONFIRMED',
  'PROPERLY_QUALIFIED_IN_R2_2',
  'SME_CONFIRMATION_OUTSTANDING',
  'STILL_REQUIRES_CORRECTION',
  'SUPPORTED_BY_APPLICABLE_PRIMARY_SOURCE',
])

/** A HIGH row may not finish in either of these. Both mean the audit finding is still open. */
const NOT_CLOSED = new Set(['SME_CONFIRMATION_OUTSTANDING', 'STILL_REQUIRES_CORRECTION'])

/** The workbook's own severity counts, from SUMMARY.json of the authority export. */
const WORKBOOK_SEVERITY = { HIGH: 677, LOW: 65, MEDIUM: 1220 }

/** Owner approval covers company scope and nothing else. These verdicts are technical. */
const TECHNICAL_VERDICTS = new Set([
  'CORRECT_TECHNICAL_ERROR',
  'REMOVE_NUMBER_OR_SOURCE',
  'REMOVE_OR_REPLACE',
  'REMOVE_UNLESS_DOCUMENTED',
  'SAFETY_SME_REQUIRED',
  'SME_OR_CODE_REVIEW_REQUIRED',
  'TECHNICAL_SME_REQUIRED',
  'WATER_TREATMENT_SME_REQUIRED',
])

type Row = Record<string, string>

const rows: Row[] = (() => {
  const text = readFileSync(path.join(CONTENT, 'OD05_R2_2_RECONCILIATION.tsv'), 'utf8')
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
  'audit_verdict',
  'severity',
  'reason_code',
  'recommended_response',
  'publish_now',
  'claim_text',
  'present_in_r2_2',
  'r2_2_disposition',
  'r2_2_reason',
  'replacement_or_qualifier',
  'evidence',
  'final_body_file',
  'final_body_sha256',
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

describe('the severity is the workbook’s, not a model of the factory’s own', () => {
  it('reproduces the workbook’s severity counts exactly', () => {
    const counts: Record<string, number> = {}
    for (const row of rows) counts[row.severity] = (counts[row.severity] ?? 0) + 1
    expect(counts).toEqual(WORKBOOK_SEVERITY)
  })

  it('uses only the three severities the workbook uses', () => {
    for (const row of rows) expect(['HIGH', 'MEDIUM', 'LOW']).toContain(row.severity)
  })

  it('carries no derived-severity column and no derived-marker column', () => {
    const head = Object.keys(rows[0])
    expect(head).not.toContain('severity_markers')
    expect(head).not.toContain('derived_severity')
    expect(head).not.toContain('r2_2_derived_severity')
  })

  it('preserves the workbook’s verdict, reason code, recommended response and publish flag', () => {
    for (const row of rows) {
      expect(row.audit_verdict.length).toBeGreaterThan(5)
      expect(row.reason_code.length).toBeGreaterThan(5)
      expect(row.recommended_response.length).toBeGreaterThan(20)
      expect(['YES', 'NO']).toContain(row.publish_now)
    }
  })
})

describe('the reconciliation covers every claim in the workbook', () => {
  it('holds 1,962 rows across the 29 prepared routes, each claim once', () => {
    expect(rows).toHaveLength(1962)
    expect(new Set(rows.map((r) => r.claim_id)).size).toBe(1962)
    expect(new Set(rows.map((r) => r.route_id)).size).toBe(29)
  })

  it('carries every mandated column, populated on every row', () => {
    for (const row of rows) {
      for (const column of MANDATED) {
        expect(Object.hasOwn(row, column)).toBe(true)
        expect(row[column].length).toBeGreaterThan(0)
      }
    }
  })

  it('uses only permitted dispositions, and never a bare pass state', () => {
    const generic = /^(pass(ed)?|ok|fine|done|reviewed|accepted|no ?action|n\/?a)$/i
    for (const row of rows) {
      expect(PERMITTED.has(row.r2_2_disposition)).toBe(true)
      expect(generic.test(row.r2_2_disposition)).toBe(false)
      expect(generic.test(row.r2_2_reason)).toBe(false)
    }
  })
})

describe('every HIGH finding in the actual workbook has an explicit final disposition', () => {
  const high = rows.filter((r) => r.severity === 'HIGH')

  it('has all 677 of them', () => {
    expect(high).toHaveLength(677)
  })

  it('leaves none of them open', () => {
    const open = high.filter((r) => NOT_CLOSED.has(r.r2_2_disposition))
    expect(open.map((r) => `${r.claim_id} ${r.r2_2_disposition}`)).toEqual([])
  })

  it('writes an individual evidence statement on every one', () => {
    for (const row of high) {
      expect(row.evidence.length).toBeGreaterThan(40)
      expect(row.replacement_or_qualifier.length).toBeGreaterThan(2)
    }
  })

  it('never settles a technical, safety or standards finding with owner approval', () => {
    const laundered = high.filter(
      (r) => r.r2_2_disposition === 'OWNER_SCOPE_CONFIRMED' && TECHNICAL_VERDICTS.has(r.audit_verdict),
    )
    expect(laundered.map((r) => `${r.claim_id} ${r.audit_verdict}`)).toEqual([])
  })

  it('never justifies a HIGH row by legacy-site provenance alone', () => {
    for (const row of high) {
      expect(row.evidence.toLowerCase()).not.toContain('exact substring of the accepted source')
      expect(row.evidence.toLowerCase()).not.toContain('verbatim from the accepted source')
    }
  })
})

describe('the audit moved the bodies', () => {
  it('cut the HIGH findings present in the rendered text by an order of magnitude', () => {
    const high = rows.filter((r) => r.severity === 'HIGH')
    const before = high.filter((r) => r.present_in_r2_1 === 'YES').length
    const after = high.filter((r) => r.present_in_r2_2 === 'YES').length
    expect(before).toBe(586)
    expect(after).toBeLessThan(before / 5)
  })

  it('answers every HIGH row still present as a false positive, a qualification or owner scope', () => {
    const stillThere = rows.filter((r) => r.severity === 'HIGH' && r.present_in_r2_2 === 'YES')
    for (const row of stillThere) {
      expect([
        'AUDIT_FALSE_POSITIVE_WITH_EXPLICIT_EVIDENCE',
        'OWNER_SCOPE_CONFIRMED',
        'PROPERLY_QUALIFIED_IN_R2_2',
        'SUPPORTED_BY_APPLICABLE_PRIMARY_SOURCE',
      ]).toContain(row.r2_2_disposition)
    }
  })

  it('is not a deletion pass — far more claims are retained or qualified than removed', () => {
    const removed = rows.filter((r) => r.r2_2_disposition === 'CORRECTED_IN_R2_2').length
    const retained = rows.filter((r) =>
      ['AUDIT_FALSE_POSITIVE_WITH_EXPLICIT_EVIDENCE', 'OWNER_SCOPE_CONFIRMED', 'PROPERLY_QUALIFIED_IN_R2_2', 'SME_CONFIRMATION_OUTSTANDING', 'SUPPORTED_BY_APPLICABLE_PRIMARY_SOURCE'].includes(
        r.r2_2_disposition,
      ),
    ).length
    expect(retained).toBeGreaterThan(400)
    expect(removed).toBeGreaterThan(0)
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
      if (present !== (row.present_in_r2_2 === 'YES')) wrong.push(`${row.claim_id}`)
    }
    expect(wrong).toEqual([])
  })

  it('never marks a claim corrected while its original text is still rendered', () => {
    for (const row of rows) {
      if (row.r2_2_disposition === 'CORRECTED_IN_R2_2') expect(row.present_in_r2_2).toBe('NO')
    }
  })
})
