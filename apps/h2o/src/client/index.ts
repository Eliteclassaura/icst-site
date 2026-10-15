import { H2O_MANIFEST } from './h2o-defaults'
import { ManifestError, validateManifest, type Manifest, type Office, type Sender } from './manifest'

export { H2O_MANIFEST, ManifestError }
export type { Manifest, Office, Sender }

/**
 * KIT-0 H0: the app-side client accessor. No file system access here, so it is safe in any bundle; it is still SERVER-SIDE
 * ONLY by rule (see below).
 *
 *   client()            the resolved client for this process (cached)
 *   client().manifest   the validated manifest
 *   client().<helpers>  the small typed accessors H1-H5 need
 *
 * Resolution: `CLIENT` env (default `h2o`). `h2o` returns `H2O_MANIFEST`, today's constants. Any other slug needs the manifest as
 * JSON in `CLIENT_MANIFEST_JSON` (set by the build/seed tooling from `clients/<slug>/manifest.json`; see `./load`), validated here, and
 * fails CLOSED: a missing, invalid or mismatched manifest throws `ManifestError`; nothing falls back to H2O values.
 *
 * Never call `client()` in code that runs in the browser: a client bundle has no `CLIENT` and would answer with H2O. It throws there.
 */
export const DEFAULT_CLIENT = 'h2o'
const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/

export type ClientConfig = {
  readonly slug: string
  readonly manifest: Manifest
  /** `https://example.test` (no trailing slash). */
  readonly origin: string
  /** The tenant key written to rows (`ICS` for H2O today). */
  readonly tenantKey: string
  /** Brand name by use: site, admin, emailFrom, chatHeader, crmHeader. */
  brandName(use: keyof Manifest['brand']['names']): string
  /** An office by its stored key (`US`/`TH` for H2O: opaque slot ids). Undefined if the client has no such office. */
  office(key: string): Office | undefined
  readonly offices: readonly Office[]
  /** The office that gets a country's RFQs: first matching routing rule, else `routing.unknownCountry`. */
  officeKeyForCountry(country: string | null | undefined): string
  /** The sender to use when none is configured: `email.senders[0]`. */
  readonly defaultSender: Sender
  readonly rfqPrefix: string
  /** True when the client's own module flag is on (library, sequences, attachments, api, sheets, typeform). */
  moduleOn(name: keyof Manifest['crm']['modules']): boolean
}

export function buildClient(manifest: Manifest): ClientConfig {
  const offices = manifest.offices
  const rules = manifest.routing.rules.map((r) => ({ office: r.office, countries: new Set(r.countries) }))
  return {
    slug: manifest.client.slug,
    manifest,
    origin: manifest.domains.canonical,
    tenantKey: manifest.client.tenantKey,
    brandName: (use) => manifest.brand.names[use],
    office: (key) => offices.find((o) => o.key === key),
    offices,
    officeKeyForCountry(country) {
      const code = typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null
      if (!code) return manifest.routing.unknownCountry
      return rules.find((r) => r.countries.has(code))?.office ?? manifest.routing.unknownCountry
    },
    defaultSender: manifest.email.senders[0],
    rfqPrefix: manifest.crm.rfqPrefix,
    moduleOn: (name) => manifest.crm.modules[name],
  }
}

/** Resolve a client from an environment. Pure; use `client()` in app code. */
export function resolveClient(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const slug = (env.CLIENT ?? '').trim() || DEFAULT_CLIENT
  if (!SLUG.test(slug)) throw new ManifestError('CLIENT', [{ path: '$', message: `"${slug}" is not a valid client slug` }])
  if (slug === DEFAULT_CLIENT) return buildClient(H2O_MANIFEST)
  const json = env.CLIENT_MANIFEST_JSON
  if (!json) throw new ManifestError(slug, [{ path: '$', message: `CLIENT=${slug} needs CLIENT_MANIFEST_JSON (the manifest of clients/${slug}); there is no fallback` }])
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    throw new ManifestError(slug, [{ path: '$', message: `CLIENT_MANIFEST_JSON is not JSON (${(e as Error).message})` }])
  }
  const r = validateManifest(raw)
  if (!r.ok) throw new ManifestError(`CLIENT_MANIFEST_JSON for ${slug}`, r.issues)
  if (r.manifest.client.slug !== slug) throw new ManifestError(slug, [{ path: '$.client.slug', message: `is "${r.manifest.client.slug}" but CLIENT is "${slug}"` }])
  return buildClient(r.manifest)
}

let cached: ClientConfig | null = null
/** The client for this process. Cached after the first call; throws (fail closed) if it cannot be resolved, and in the browser. */
export function client(): ClientConfig {
  if (typeof window !== 'undefined') throw new Error('client() is server-side only: a browser bundle cannot know which client it belongs to')
  cached ??= resolveClient()
  return cached
}
/** Tests only. */
export function resetClientCache(): void {
  cached = null
}
