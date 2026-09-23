/**
 * H2O Phase 2C-min — safe-context field contract.
 *
 * The adapter forwards a small, fixed set of non-sensitive fields so a quote request arrives with
 * the product and page it came from. The contract is an allowlist, not a denylist: a key that is
 * not named here does not travel, whatever it is called and whoever supplied it.
 *
 * Every rejection is recorded with a reason. Nothing is dropped silently — a reviewer reading the
 * ledger can see exactly what was refused and why, which is the same discipline the 2B relationship
 * pass uses for an unresolved edge.
 *
 * The sensitive-value and control-character screens live in `sensitive.ts` and are shared verbatim
 * with the event contract, so what may not reach a URL and what may not reach analytics can never
 * diverge.
 */
import { containsSensitiveValue, hasControlCharacter } from './sensitive'

/** The only keys that may ever reach Typeform. Order is the order they are serialised in. */
export const SAFE_CONTEXT_KEYS = [
  'product_id',
  'product_slug',
  'product_path',
  'product_title',
  'page_path',
  'cta_placement',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const

export type SafeContextKey = (typeof SAFE_CONTEXT_KEYS)[number]

export type DropReason =
  | 'EMPTY'
  | 'KEY_NOT_ALLOWLISTED'
  | 'NOT_A_STRING'
  | 'PATH_NOT_SITE_RELATIVE'
  | 'SENSITIVE_VALUE'
  | 'TOO_LONG'
  | 'UNSAFE_CHARACTERS'

export type DroppedField = { key: string; reason: DropReason }

export type SafeContext = {
  /** Accepted fields, allowlist order, every value already sanitised. */
  fields: Array<[SafeContextKey, string]>
  /** Everything refused, with the reason. Never empty for a refused input. */
  dropped: DroppedField[]
}

/** Per-field length caps. Short by design: these are identifiers and paths, not prose. */
const MAX_LENGTH: Record<SafeContextKey, number> = {
  cta_placement: 64,
  page_path: 512,
  product_id: 64,
  product_path: 512,
  product_slug: 128,
  product_title: 160,
  utm_campaign: 128,
  utm_content: 128,
  utm_medium: 64,
  utm_source: 64,
  utm_term: 128,
}

/** Total serialised budget across all fields, so many short values cannot add up to a long URL. */
export const MAX_TOTAL_CONTEXT_BYTES = 1024

const PATH_KEYS = new Set<SafeContextKey>(['page_path', 'product_path'])
const IDENTIFIER_KEYS = new Set<SafeContextKey>([
  'cta_placement',
  'product_id',
  'product_slug',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
])

/**
 * A site-relative path: one leading slash, allowed characters only, and no traversal segment.
 *
 * The character class alone is not enough, and two cases proved it during R1 development:
 *
 *   - `//evil.example/x` is a **protocol-relative URL**. Every character in it is allowed and it
 *     starts with a slash, so a naive `^/[A-Za-z0-9\-._~/]*$` accepts it — and a browser handed
 *     that value navigates off-site. The second character must therefore not be a slash.
 *   - `/a/../../etc/passwd` is traversal made only of allowed characters. A `..` segment is refused
 *     outright rather than normalised, because normalising would forward a path nobody wrote.
 */
const SITE_PATH_CHARACTERS = /^\/(?:[A-Za-z0-9\-._~/]|%[0-9A-Fa-f]{2})*$/

const isSiteRelativePath = (value: string): boolean => {
  if (!SITE_PATH_CHARACTERS.test(value)) return false
  if (value.startsWith('//')) return false
  try{
    const decoded=decodeURIComponent(value)
    return !decoded.startsWith('//')&&!decoded.includes('\\')&&!decoded.split('/').includes('..')&&!hasControlCharacter(decoded)
  }catch{return false}
}
/** Identifiers and attribution tokens: letters, digits and a few separators. Nothing else. */
const IDENTIFIER = /^[A-Za-z0-9._~-]+$/
const ENCODED_PRODUCT_SLUG = /^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/
/** A human-readable title: printable, single-line, no angle brackets, no URL scheme. */
const TITLE_FORBIDDEN = /[<>]|:\/\//

const isSafeKey = (key: string): key is SafeContextKey =>
  (SAFE_CONTEXT_KEYS as readonly string[]).includes(key)

/**
 * Build the safe context from arbitrary input. `input` is untrusted: it may come from a product
 * record, a page, or a query string, and this function is the only thing standing between it and a
 * URL that leaves the origin.
 */
export const buildSafeContext = (input: Readonly<Record<string, unknown>>): SafeContext => {
  const fields: Array<[SafeContextKey, string]> = []
  const dropped: DroppedField[] = []
  let budget = 0

  for (const key of Object.keys(input)) {
    if (!isSafeKey(key)) dropped.push({ key, reason: 'KEY_NOT_ALLOWLISTED' })
  }

  for (const key of SAFE_CONTEXT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    const raw = input[key]
    if (raw === null || raw === undefined) continue
    if (typeof raw !== 'string') {
      dropped.push({ key, reason: 'NOT_A_STRING' })
      continue
    }
    const value = raw.trim()
    if (value === '') {
      dropped.push({ key, reason: 'EMPTY' })
      continue
    }
    if (hasControlCharacter(value)) {
      dropped.push({ key, reason: 'UNSAFE_CHARACTERS' })
      continue
    }
    if (value.length > MAX_LENGTH[key]) {
      // Truncation would forward a corrupted identifier that still looks valid. Refusing is honest.
      dropped.push({ key, reason: 'TOO_LONG' })
      continue
    }
    // Shape before content: a path that is not a site-relative path is refused as one, so the
    // reason a reviewer reads is the reason it was actually refused. `/a/../../etc/passwd` happens
    // to contain "passwd" and would otherwise be reported as a sensitive value, which is true but
    // misleading — it is a traversal attempt.
    if (PATH_KEYS.has(key) && !isSiteRelativePath(value)) {
      dropped.push({ key, reason: 'PATH_NOT_SITE_RELATIVE' })
      continue
    }
    if (containsSensitiveValue(value)) {
      dropped.push({ key, reason: 'SENSITIVE_VALUE' })
      continue
    }
    if (IDENTIFIER_KEYS.has(key) && !(key==='product_slug'?ENCODED_PRODUCT_SLUG:IDENTIFIER).test(value)) {
      dropped.push({ key, reason: 'UNSAFE_CHARACTERS' })
      continue
    }
    if (key === 'product_title' && TITLE_FORBIDDEN.test(value)) {
      dropped.push({ key, reason: 'UNSAFE_CHARACTERS' })
      continue
    }

    const cost = key.length + 1 + encodeURIComponent(value).length + 1
    if (budget + cost > MAX_TOTAL_CONTEXT_BYTES) {
      dropped.push({ key, reason: 'TOO_LONG' })
      continue
    }
    budget += cost
    fields.push([key, value])
  }

  return { dropped, fields }
}
