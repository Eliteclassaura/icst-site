/**
 * H2O Phase 2C-min — server-side resolution.
 *
 * One function turns environment configuration plus a page's raw context into everything the client
 * component needs: a URL, or a reason there is none. Configuration never crosses to the browser —
 * the client receives a finished URL and the approved origin, not the form id and not the
 * environment.
 */
import { typeformConfigFromEnv, type ConfigUnavailableReason } from './config'
import { buildSafeContext, type DroppedField } from './context'
import { resolveFormUrl } from './url'

export type QuoteCtaResolution =
  | { available: false; reason: ConfigUnavailableReason }
  | {
      available: true
      /** Fields refused by the safe-context contract. Reported, never hidden. */
      dropped: DroppedField[]
      /** False when the context had to be left off to stay inside the URL ceiling. */
      contextIncluded: boolean
      formUrl: string
      /** The origin the embed is allowed to speak from, for the message check in the browser. */
      origin: string
    }

/**
 * Resolve a CTA. `context` is untrusted input — a product record, a page path, a query string — and
 * is passed through the allowlist before any of it reaches a URL.
 */
export const resolveQuoteCta = (
  context: Readonly<Record<string, unknown>>,
  env: NodeJS.ProcessEnv = process.env,
): QuoteCtaResolution => {
  const config = typeformConfigFromEnv(env)
  if (!config.ok) return { available: false, reason: config.reason }

  const safe = buildSafeContext(context)
  const { contextIncluded, url } = resolveFormUrl(config.value, safe)
  return {
    available: true,
    contextIncluded,
    dropped: safe.dropped,
    formUrl: url,
    origin: config.value.origin,
  }
}
