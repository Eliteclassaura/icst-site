/**
 * H2O Phase 2C-min — form URL construction.
 *
 * The URL is built from validated configuration plus an already-sanitised safe context. It takes no
 * form id, origin or redirect target from the caller's free text, so there is no path by which
 * query input becomes a destination.
 *
 * Context travels in the **fragment**, not the query string. A fragment is not sent to the server
 * in the request line and does not appear in access logs or the `Referer` header, so the product
 * and page context stays between the visitor's browser and Typeform's own client. Typeform reads
 * hidden fields from either, so this costs nothing and leaks less.
 */
import type { TypeformConfig } from './config'
import type { SafeContext } from './context'

/** Hard ceiling on the built URL. Well under every browser and proxy limit, with room to spare. */
export const MAX_FORM_URL_LENGTH = 2000

export type FormUrlResult =
  | { ok: false; reason: 'CONTEXT_TOO_LONG' }
  | { ok: true; url: string }

/** The bare form URL, with no context at all. Always safe, always available. */
export const baseFormUrl = (config: TypeformConfig): string =>
  `${config.origin}/to/${encodeURIComponent(config.formId)}`

/**
 * Serialise the safe context as a fragment. Keys are already allowlisted and values already
 * sanitised; both are percent-encoded anyway, because encoding twice is cheap and forgetting once
 * is a defect.
 */
export const serialiseContext = (context: SafeContext): string =>
  context.fields
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')

/**
 * Build the full form URL. Returns a reason rather than a truncated URL if the result would exceed
 * the ceiling — a truncated URL would silently deliver a corrupted product id.
 */
export const buildFormUrl = (config: TypeformConfig, context: SafeContext): FormUrlResult => {
  const base = baseFormUrl(config)
  const fragment = serialiseContext(context)
  const url = fragment === '' ? base : `${base}#${fragment}`
  if (url.length > MAX_FORM_URL_LENGTH) return { ok: false, reason: 'CONTEXT_TOO_LONG' }
  return { ok: true, url }
}

/**
 * The URL actually used by the UI. If the context pushes the URL past the ceiling the adapter falls
 * back to the bare form rather than failing the visitor: they can still request a quote, the
 * context is simply absent, and the caller is told so it can be reported rather than hidden.
 */
export const resolveFormUrl = (
  config: TypeformConfig,
  context: SafeContext,
): { contextIncluded: boolean; url: string } => {
  const built = buildFormUrl(config, context)
  if (built.ok) return { contextIncluded: context.fields.length > 0, url: built.url }
  return { contextIncluded: false, url: baseFormUrl(config) }
}
