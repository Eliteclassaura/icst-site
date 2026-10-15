/**
 * T-R1 (owner condition, 2026-10-06): every email template stays **industrial cooling**. the company sells industrial cooling
 * tower parts, maintenance and repairs, dry soda blasting and new towers; no HVAC wording and no targeting of small
 * towers. These REVIEW-level rules run when a template is approved (every kind: transactional and sequence); a hit
 * refuses the approval with a message naming the term.
 *
 * Kept apart from the frozen copy-risk linter (`ICS_COPY_RISK_LINTER_V2`, byte-identical and SHA-pinned), which is
 * not edited. Word boundaries, case-insensitive; hyphen, space or nothing between the words of a phrase.
 */
export type ScopeHit = { rule_id: string; severity: 'REVIEW'; term: string }

const RULES: ReadonlyArray<{ rule_id: string; label: string; re: RegExp }> = [
  { rule_id: 'SCOPE_HVAC', label: 'HVAC', re: /\bhvac\b/i },
  { rule_id: 'SCOPE_ROOFTOP_UNIT', label: 'rooftop unit', re: /\broof[\s-]?top[\s-]+units?\b|\brtus?\b/i },
  { rule_id: 'SCOPE_RESIDENTIAL', label: 'residential / home', re: /\bresidential\b|\bhomes?\b|\bhomeowners?\b/i },
  { rule_id: 'SCOPE_SMALL_TOWER', label: 'small cooling tower', re: /\bsmall(?:er)?[\s-]+(?:cooling[\s-]+)?towers?\b/i },
  { rule_id: 'SCOPE_PACKAGED_TOWER', label: 'packaged tower', re: /\bpackaged[\s-]+(?:cooling[\s-]+)?towers?\b/i },
  { rule_id: 'SCOPE_AIR_CONDITIONING', label: 'air conditioning', re: /\bair[\s-]?condition(?:ing|ers?|ed)?\b|\ba\/c\b/i },
]

/** Hits in the subject and body (the template text as written, merge fields included). */
export function scopeHits(subject: string, body: string): ScopeHit[] {
  const text = `${subject}\n${body}`
  return RULES.filter((r) => r.re.test(text)).map((r) => ({ rule_id: r.rule_id, severity: 'REVIEW' as const, term: r.label }))
}

/** The approval refusal message, or null when the text is in scope. */
export function scopeRefusal(subject: string, body: string): string | null {
  const hits = scopeHits(subject, body)
  if (!hits.length) return null
  return `This template mentions ${hits.map((h) => `“${h.term}”`).join(', ')}. Emails stay industrial cooling (industrial cooling tower parts, maintenance and repairs, dry soda blasting, new towers): rewrite it before approving.`
}
