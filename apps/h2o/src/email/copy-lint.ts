import LINTER from './data/ICS_COPY_RISK_LINTER_V2.json'

/**
 * Revenue Engine slice 1: the frozen E1.1 R2 copy-risk linter (`ICS_COPY_RISK_LINTER_V2`, 313 rules), loaded as data,
 * byte-identical to the accepted package (SHA-256 pinned below; a test recomputes it).
 *
 * Matching contract (from the rule set itself):
 *   - PHRASE / LITERAL: case-insensitive on normalised text (trimmed, internal whitespace collapsed, lower-cased).
 *     Matched on word boundaries, so "bid" does not hit "rebid" (CT-accepted brief §G.5).
 *   - EXECUTABLE_REGEX: JavaScript RegExp with the rule's flags. `^re\s*:` / `^fwd?\s*:` apply to the subject only.
 *   - STRUCTURAL (62 rules, all WARN/REVIEW): named concepts not implemented in slice 1 — reported as not evaluated,
 *     never silently passed (`structural_rule_policy`).
 *   - Placeholder rules (0187–0189, 0191) are allowed at the TEMPLATE stage and hold at the FINAL (rendered) stage.
 *
 * Decision (CT ruling 6, owner AUTO override): any BLOCK or REVIEW hit → HOLD (no send, a review task); WARN and INFO
 * are recorded only.
 */
export const LINTER_ID = 'ICS_COPY_RISK_LINTER_V2'
export const LINTER_SHA256 = '3ada7e7941e3a7d2b873afc68c91f2a76fec63e6dbbce163b65f4d869a3cddc1'

type RawRule = {
  rule_id: string
  phrase_regex_or_concept: string
  match_type: string
  category: string
  severity: 'INFO' | 'WARN' | 'REVIEW' | 'BLOCK'
  execution_mode: 'NORMALIZED_TEXT' | 'EXECUTABLE_REGEX' | 'STRUCTURAL'
  regex_flags?: string
}
export type LintStage = 'TEMPLATE' | 'FINAL'
export type LintHit = { rule_id: string; severity: RawRule['severity']; category: string; field: 'subject' | 'body' }
export type LintResult = {
  rule_set: typeof LINTER_ID
  version: string
  sha256: string
  stage: LintStage
  decision: 'PASS' | 'HOLD'
  hits: LintHit[]
  not_evaluated: number
}

const PLACEHOLDER_RULES = new Set(['ICS_V2_0187', 'ICS_V2_0188', 'ICS_V2_0189', 'ICS_V2_0191'])
const SUBJECT_ONLY = new Set(['ICS_V2_0001', 'ICS_V2_0002'])
export const normalise = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Compiled = { rule: RawRule; test: (text: string) => boolean }
let compiled: { list: Compiled[]; structural: number } | null = null
function rules(): { list: Compiled[]; structural: number } {
  if (compiled) return compiled
  const list: Compiled[] = []
  let structural = 0
  for (const r of (LINTER as unknown as { rules: RawRule[] }).rules) {
    if (r.execution_mode === 'STRUCTURAL') {
      structural++
      continue
    }
    if (r.execution_mode === 'EXECUTABLE_REGEX') {
      const re = new RegExp(r.phrase_regex_or_concept, r.regex_flags ?? '')
      list.push({ rule: r, test: (t) => re.test(t) })
    } else {
      // Word-boundary phrase match on normalised text (letters/digits on either side mean "inside another word").
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(normalise(r.phrase_regex_or_concept))}(?![\\p{L}\\p{N}_])`, 'u')
      list.push({ rule: r, test: (t) => re.test(normalise(t)) })
    }
  }
  compiled = { list, structural }
  return compiled
}

export function lintCopy(subject: string, body: string, stage: LintStage): LintResult {
  const { list, structural } = rules()
  const hits: LintHit[] = []
  for (const c of list) {
    if (stage === 'TEMPLATE' && PLACEHOLDER_RULES.has(c.rule.rule_id)) continue
    const fields: Array<['subject' | 'body', string]> = SUBJECT_ONLY.has(c.rule.rule_id) ? [['subject', subject]] : [['subject', subject], ['body', body]]
    for (const [field, text] of fields) {
      if (!c.test(text)) continue
      // At the final render an unresolved placeholder is a hard stop, whatever its listed severity.
      const severity = stage === 'FINAL' && PLACEHOLDER_RULES.has(c.rule.rule_id) ? 'BLOCK' : c.rule.severity
      hits.push({ rule_id: c.rule.rule_id, severity, category: c.rule.category, field })
    }
  }
  const hold = hits.some((h) => h.severity === 'BLOCK' || h.severity === 'REVIEW')
  return { rule_set: LINTER_ID, version: String((LINTER as { version: string }).version), sha256: LINTER_SHA256, stage, decision: hold ? 'HOLD' : 'PASS', hits, not_evaluated: structural }
}

export const ruleCount = () => (LINTER as unknown as { rules: unknown[] }).rules.length
