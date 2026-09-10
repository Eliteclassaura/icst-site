/**
 * Redaction (master prompt §Security: "Do not send contact data, private email bodies, unpublished
 * content, credentials, or customer PII to an AI provider unless the client has opted in and the exact
 * feature requires it. Redact unnecessary data.").
 *
 * The rule here is allow-list, not deny-list: a prompt declares the fields it may receive, and anything
 * else is dropped before the adapter exists. On top of that, a scan refuses the call outright if a value
 * still looks like an email address, a phone number, an IP, a key or a hashed identifier — a prompt that
 * *needs* one of those is a policy change, not a redaction bug.
 */
export const PII_PATTERNS: Array<[string, RegExp]> = [
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['phone', /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,4}[\s-]?\d{3,4}(?![\d-])/],
  ['ipv4', /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  ['sha-like', /\b[0-9a-f]{32,}\b/],
  ['bearer-or-key', /\b(?:sk-|pk_|AKIA|ghp_|xox[baprs]-|Bearer\s+)[A-Za-z0-9_-]{8,}/],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

export type RedactionResult =
  | { ok: true; input: Record<string, unknown>; dropped: string[] }
  | { ok: false; refusedFor: string; path: string }

const MAX_STRING = 4000

function scan(value: unknown, path: string): { refusedFor: string; path: string } | null {
  if (typeof value === 'string') {
    for (const [name, re] of PII_PATTERNS) if (re.test(value)) return { refusedFor: name, path }
    return null
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = scan(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const hit = scan(v, `${path}.${k}`)
      if (hit) return hit
    }
  }
  return null
}

function truncate(value: unknown): unknown {
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value
  if (Array.isArray(value)) return value.slice(0, 50).map(truncate)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, truncate(v)]),
    )
  return value
}

/**
 * Projects `source` down to `allow` (dot paths), truncates long values, then scans what is left.
 * A surviving PII match refuses the call rather than silently masking it.
 */
export function redact(source: Record<string, unknown>, allow: string[]): RedactionResult {
  const input: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const key of Object.keys(source))
    if (!allow.some((a) => a === key || a.startsWith(key + '.'))) dropped.push(key)
  for (const path of allow) {
    const parts = path.split('.')
    let cur: unknown = source
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>))
        cur = (cur as Record<string, unknown>)[p]
      else {
        cur = undefined
        break
      }
    }
    if (cur === undefined || cur === null) continue
    // Flatten to the leaf name so prompts see a stable, shallow shape.
    input[parts[parts.length - 1]!] = truncate(cur)
  }
  const hit = scan(input, '$')
  if (hit) return { ok: false, refusedFor: hit.refusedFor, path: hit.path }
  return { ok: true, input, dropped }
}
