/**
 * H2O Phase 2C-min — Typeform V1 conversion adapter: configuration contract.
 *
 * Every value the adapter needs comes from validated configuration and nowhere else. There is no
 * default form id, no default origin and no fallback that guesses: a missing or malformed value
 * resolves to `unavailable` with a reason code, and the caller renders nothing interactive. That is
 * what "fail closed" means here — the conversion path is absent rather than pointed somewhere
 * unverified.
 *
 * Nothing in this module reads query input. A form id or origin arriving from a URL is not
 * configuration, and there is deliberately no code path that would accept one.
 */

/** Hosts H2O is permitted to embed or link to. Exact hosts, never patterns, never wildcards. */
export const APPROVED_TYPEFORM_HOSTS = ['form.typeform.com'] as const

/**
 * Typeform form ids are short alphanumeric tokens. The bound is deliberately tight: anything
 * carrying a slash, dot, space, or protocol is not an id, it is an attempt to redirect us.
 */
export const FORM_ID_PATTERN = /^[A-Za-z0-9]{6,32}$/

export type TypeformConfig = {
  /** The validated form id, e.g. `aB3xY9Qz`. */
  formId: string
  /** Scheme + host only, no trailing slash, e.g. `https://form.typeform.com`. */
  origin: string
}

export type ConfigUnavailableReason =
  | 'FORM_ID_MALFORMED'
  | 'FORM_ID_MISSING'
  | 'ORIGIN_MALFORMED'
  | 'ORIGIN_MISSING'
  | 'ORIGIN_NOT_APPROVED'
  | 'ORIGIN_NOT_HTTPS'

export type ConfigResolution =
  | { ok: false; reason: ConfigUnavailableReason }
  | { ok: true; value: TypeformConfig }

export type ConfigSource = {
  H2O_TYPEFORM_FORM_ID?: string | undefined
  H2O_TYPEFORM_ORIGIN?: string | undefined
}

const trimmed = (value: string | undefined): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Resolve the adapter's configuration. Total: it never throws and never returns a partially valid
 * configuration, because a half-configured conversion path is worse than none.
 */
export const resolveTypeformConfig = (source: ConfigSource): ConfigResolution => {
  const rawId = trimmed(source.H2O_TYPEFORM_FORM_ID)
  if (rawId === '') return { ok: false, reason: 'FORM_ID_MISSING' }
  if (!FORM_ID_PATTERN.test(rawId)) return { ok: false, reason: 'FORM_ID_MALFORMED' }

  const rawOrigin = trimmed(source.H2O_TYPEFORM_ORIGIN)
  if (rawOrigin === '') return { ok: false, reason: 'ORIGIN_MISSING' }

  let parsed: URL
  try {
    parsed = new URL(rawOrigin)
  } catch {
    return { ok: false, reason: 'ORIGIN_MALFORMED' }
  }
  // An origin is scheme + host (+ port). Credentials, a path, a query or a fragment mean the value
  // is not an origin, and accepting it would let configuration smuggle in a redirect target.
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'ORIGIN_MALFORMED' }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '')
    return { ok: false, reason: 'ORIGIN_MALFORMED' }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'ORIGIN_NOT_HTTPS' }
  if (!(APPROVED_TYPEFORM_HOSTS as readonly string[]).includes(parsed.host))
    return { ok: false, reason: 'ORIGIN_NOT_APPROVED' }

  return { ok: true, value: { formId: rawId, origin: `${parsed.protocol}//${parsed.host}` } }
}

/**
 * Server-side entry point. Reads only the two documented variables; anything else in the
 * environment is ignored, so an unrelated variable can never become a form id.
 */
export const typeformConfigFromEnv = (env: NodeJS.ProcessEnv = process.env): ConfigResolution =>
  resolveTypeformConfig({
    H2O_TYPEFORM_FORM_ID: env.H2O_TYPEFORM_FORM_ID,
    H2O_TYPEFORM_ORIGIN: env.H2O_TYPEFORM_ORIGIN,
  })
