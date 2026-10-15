import { existsSync } from 'node:fs'
import path from 'node:path'
import { H2O_MANIFEST } from './h2o-defaults'
import { loadManifest, ManifestError, type Manifest, type Office, type Sender } from './manifest'

export { H2O_MANIFEST, ManifestError }
export type { Manifest, Office, Sender }

/**
 * KIT-0 H0: the app-side client accessor. SERVER ONLY (it may read `clients/<slug>/manifest.json`).
 *
 *   client()            the resolved client for this process (cached)
 *   client().manifest   the validated manifest
 *   client().<helpers>  the small typed accessors H1-H5 need
 *
 * Resolution: `CLIENT` env (default `h2o`). `h2o` returns `H2O_MANIFEST`, today's constants, with no file read. Any other slug
 * loads `<clients dir>/<slug>/manifest.json` and fails CLOSED: a missing folder, an invalid manifest or a slug mismatch throws
 * `ManifestError`; nothing falls back to H2O values. The clients dir is `CLIENTS_DIR` or the nearest `clients/` above `process.cwd()`.
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

function clientsDir(env: NodeJS.ProcessEnv, cwd: string): string {
  if (env.CLIENTS_DIR) return path.resolve(env.CLIENTS_DIR)
  let dir = cwd
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'clients')
    if (existsSync(path.join(candidate, '_template'))) return candidate
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new ManifestError('clients/', [{ path: '$', message: 'no clients/ folder found above the working directory; set CLIENTS_DIR' }])
}

/** Resolve a client from an environment. Pure apart from reading the manifest file; use `client()` in app code. */
export function resolveClient(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): ClientConfig {
  const slug = (env.CLIENT ?? '').trim() || DEFAULT_CLIENT
  if (!SLUG.test(slug)) throw new ManifestError('CLIENT', [{ path: '$', message: `"${slug}" is not a valid client slug` }])
  if (slug === DEFAULT_CLIENT) return buildClient(H2O_MANIFEST)
  const manifest = loadManifest(path.join(clientsDir(env, cwd), slug))
  if (manifest.client.slug !== slug) throw new ManifestError(slug, [{ path: '$.client.slug', message: `is "${manifest.client.slug}" but CLIENT is "${slug}"` }])
  return buildClient(manifest)
}

let cached: ClientConfig | null = null
/** The client for this process. Cached after the first call; throws (fail closed) if it cannot be resolved. */
export function client(): ClientConfig {
  cached ??= resolveClient()
  return cached
}
/** Tests only. */
export function resetClientCache(): void {
  cached = null
}
