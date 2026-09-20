/**
 * H2O Phase 2C-min — the single sensitive-value primitive.
 *
 * R1 carried two copies of this screen: one in `context.ts` guarding what enters a URL, and a
 * shorter one in `events.ts` guarding what enters analytics. Two copies of a security control drift,
 * and they already had — the event copy was missing the JWT and provider-token patterns and did not
 * check control characters at all, so a value the context contract refused could still be emitted.
 *
 * There is now one implementation and both callers import it. A test asserts the two call the same
 * function, so the drift cannot come back by editing one side.
 */

/**
 * Patterns for values that must never leave the site, whatever key they arrive under. A match is
 * refused outright rather than masked: a masked value is still a value somebody chose to send.
 */
const SENSITIVE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['EMAIL', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['PHONE', /(?:\+\d[\d\s().-]{7,}\d)|(?:\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/],
  ['PAYMENT_CARD', /\b(?:\d[ -]*?){13,19}\b/],
  ['CREDENTIAL_KEYWORD', /\b(?:bearer|token|secret|api[_-]?key|password|passwd|authorization|credential)\b/i],
  ['JWT', /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.?[A-Za-z0-9_-]*/],
  ['PROVIDER_TOKEN', /\b(?:sk|pk|rk|ghp|ghs|gho|glpat|xox[baprs])[_-][A-Za-z0-9]{8,}/],
  ['PRIVATE_KEY', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

/** The categories this primitive screens for. Exported so tests and docs cannot drift from it. */
export const SENSITIVE_CATEGORIES = SENSITIVE_PATTERNS.map(([name]) => name)

/**
 * Which category a value matched, or null. Returning the category rather than a boolean lets a
 * caller report *why* without ever putting the offending value in the report.
 */
export const sensitiveCategory = (value: string): string | null => {
  for (const [name, pattern] of SENSITIVE_PATTERNS) if (pattern.test(value)) return name
  return null
}

/** True when the value matches any sensitive pattern. */
export const containsSensitiveValue = (value: string): boolean => sensitiveCategory(value) !== null

/**
 * Control characters, including the ones that would split a URL, a header or a log line. Built from
 * character codes rather than written as literals so the source file itself stays plain text.
 */
export const hasControlCharacter = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * The one question both callers ask: may this string leave the site at all?
 *
 * `false` for anything sensitive and for anything carrying a control character. Callers add their
 * own shape and length rules on top; none of them may weaken this one.
 */
export const isEmittableValue = (value: string): boolean =>
  !hasControlCharacter(value) && !containsSensitiveValue(value)
