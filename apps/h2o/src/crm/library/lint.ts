import { lintCopy as contractLint, LINTER_ID } from '../../email/copy-lint'
import { scopeHits } from '../../email/scope-guard'
import { t } from './ui-strings'
import { client } from '../../client'

/**
 * EMAIL-LIB-1: the copy check for one Library variant. Pure; no database; it JUDGES and never rewrites.
 *
 * It does not carry its own rules. It runs, unchanged:
 *   - the frozen owner contract ICS_COPY_RISK_LINTER_V2 (`email/copy-lint.ts`, SHA-pinned, TEMPLATE stage: library copy
 *     keeps its {{merge fields}}; the engine runs the FINAL stage on the rendered message);
 *   - the industrial-only scope guard (`email/scope-guard.ts`: HVAC, small tower, residential …) as REVIEW findings;
 * and adds two owner rules the contract does not carry:
 *   - no phone number or postal address in the body (owner rule 2026-10-06) → BLOCK;
 *   - the client's persona sign-off, when the manifest has one → an INFO note only, never a warning.
 * Structural contract rules are reported as not evaluated (never counted as a pass).
 */
export type Severity = 'INFO' | 'WARN' | 'REVIEW' | 'BLOCK'
export type Badge = 'PASS' | 'NOTES' | 'REVIEW' | 'BLOCKED'
export type LibFinding = {
  rule_id: string
  category: string
  severity: Severity
  where: 'subject' | 'body'
  matched?: string
  note?: string
}
export type LibLint = {
  rule_set: string
  findings: LibFinding[]
  not_evaluated: number
  badge: Badge
  counts: Record<Severity, number>
}

const PHONE = /(?:\+\d[\d\s().-]{7,}\d|\(\d{3}\)\s?\d{3}[-.\s]\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/
const ADDRESS =
  /\b\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Suite|Ste)\b/
/** The client's own persona sign-off (`email.persona`), or none: a client without a persona never matches. */
const persona = client().manifest.email.persona
const SIGNOFF = persona ? new RegExp(`(?:^|[\\s—–-])${persona.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) : /(?!)/
export const SIGNOFF_NOTE = t('ers.persona.note')

export function lintVariant(subject: string, body: string): LibLint {
  const c = contractLint(subject, body, 'TEMPLATE')
  const findings: LibFinding[] = c.hits.map((h) => ({
    rule_id: h.rule_id,
    category: h.category,
    severity: h.severity,
    where: h.field,
  }))
  for (const s of scopeHits(subject, body))
    findings.push({
      rule_id: s.rule_id,
      category: 'SCOPE_INDUSTRIAL_ONLY',
      severity: 'REVIEW',
      where: 'body',
      matched: s.term,
      note: `Out of scope wording: ${s.term}`,
    })
  const contact = PHONE.exec(body) ?? ADDRESS.exec(body)
  if (contact)
    findings.push({
      rule_id: 'ICS_OWNER_NOPHONE_001',
      category: 'NO_PHONE_OR_ADDRESS',
      severity: 'BLOCK',
      where: 'body',
      matched: contact[0].slice(0, 60),
      note: 'No phone number or postal address in emails',
    })
  if (SIGNOFF.test(body))
    findings.push({
      rule_id: 'ICS_OWNER_SIGNOFF_001',
      category: 'SENDER_IDENTITY',
      severity: 'INFO',
      where: 'body',
      note: SIGNOFF_NOTE,
    })
  const order: Severity[] = ['INFO', 'WARN', 'REVIEW', 'BLOCK']
  findings.sort(
    (a, b) => order.indexOf(b.severity) - order.indexOf(a.severity) || a.rule_id.localeCompare(b.rule_id),
  )
  const counts = { INFO: 0, WARN: 0, REVIEW: 0, BLOCK: 0 } as Record<Severity, number>
  for (const f of findings) counts[f.severity]++
  // The sign-off note alone is information about the persona, not a copy-check note: a variant with only it is a Pass.
  const onlyPersona = findings.every((f) => f.rule_id === 'ICS_OWNER_SIGNOFF_001')
  const badge: Badge = counts.BLOCK
    ? 'BLOCKED'
    : counts.REVIEW
      ? 'REVIEW'
      : (counts.INFO || counts.WARN) && !onlyPersona
        ? 'NOTES'
        : 'PASS'
  return { rule_set: LINTER_ID, findings, not_evaluated: c.not_evaluated, badge, counts }
}

const RANK: Badge[] = ['PASS', 'NOTES', 'REVIEW', 'BLOCKED']
/** A step is only as clean as its worst variant. */
export const worstBadge = (results: Array<Pick<LibLint, 'badge'>>): Badge =>
  results.reduce<Badge>((w, r) => (RANK.indexOf(r.badge) > RANK.indexOf(w) ? r.badge : w), 'PASS')
