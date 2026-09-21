/**
 * Payload security defaults shared by every client app (R25–R27).
 * The app spreads these into buildConfig and supplies its origins.
 */
export function securityDefaults(opts: { serverURL: string; extraOrigins?: string[] }) {
  const origins = [opts.serverURL, ...(opts.extraOrigins ?? [])].filter(Boolean)
  return {
    cors: origins,
    csrf: origins,
    graphQL: {
      // GraphQL is not used by the public site or admin; keep it off unless a client needs it.
      disable: process.env.PAYLOAD_GRAPHQL === '1' ? false : true,
      disablePlaygroundInProduction: true,
      disableIntrospectionInProduction: true,
    },
    // Rate-limit key for form/auth endpoints, applied by the app's proxy (Cloudflare adds the edge layer).
    rateLimit: { window: 60_000, max: 300, trustProxy: true },
    telemetry: false,
  }
}

/**
 * Turnstile is enabled at launch (owner decision 2026-09-04, R38; ADR-023). The public site key lives in
 * the `integrations` global, the secret only in the environment. A half-configured pair is a launch-gate
 * failure in production: the form route must answer 503 (not silently skip verification), and the
 * quality-gates launch mode must block. Outside production a missing pair means "Turnstile off" (local dev).
 */
export type TurnstileReadiness =
  | { ok: true; enabled: boolean }
  | {
      ok: false
      enabled: false
      reason: 'site-key-without-secret' | 'secret-without-site-key' | 'required-in-production'
    }

export function turnstileReadiness(opts: {
  siteKey?: string | null
  secret?: string | null
  nodeEnv?: string
  requiredInProduction?: boolean
}): TurnstileReadiness {
  const siteKey = (opts.siteKey ?? '').trim()
  const secret = (opts.secret ?? '').trim()
  const prod = (opts.nodeEnv ?? process.env.NODE_ENV) === 'production'
  const required = opts.requiredInProduction ?? true
  if (siteKey && !secret) return { ok: false, enabled: false, reason: 'site-key-without-secret' }
  if (!siteKey && secret) return { ok: false, enabled: false, reason: 'secret-without-site-key' }
  if (!siteKey && !secret) {
    if (prod && required) return { ok: false, enabled: false, reason: 'required-in-production' }
    return { ok: true, enabled: false }
  }
  return { ok: true, enabled: true }
}
