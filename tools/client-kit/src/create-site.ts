import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadManifest } from './load.ts'

export type NewSite = { slug: string; name: string; legal: string; short: string; domain: string; tenant: string }

const TOKENS = (s: NewSite): Array<[string, string]> => [
  ['__SLUG__', s.slug],
  ['__LEGAL__', s.legal],
  ['__NAME__', s.name],
  ['__SHORT__', s.short],
  ['__DOMAIN__', s.domain],
  ['__TENANT__', s.tenant],
]

/** JSON-safe replacement: the value is escaped as it would be inside a JSON string. */
const jsonSafe = (v: string) => JSON.stringify(v).slice(1, -1)

function walk(dir: string, fn: (file: string) => void) {
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e)
    if (statSync(f).isDirectory()) walk(f, fn)
    else fn(f)
  }
}

/**
 * KIT-0 M11: scaffold `clients/<slug>/` from `clients/_template/`. Refuses to overwrite, validates the result, and removes
 * the copy if it does not validate. It writes no wizard output and touches nothing outside the new folder.
 */
export function createSite(clientsRoot: string, site: NewSite): string {
  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(site.slug)) throw new Error(`slug "${site.slug}" must be 3 to 40 lower-case letters, digits or dashes`)
  if (site.slug.startsWith('_')) throw new Error('slug must not start with _')
  const dest = path.join(clientsRoot, site.slug)
  if (existsSync(dest)) throw new Error(`clients/${site.slug} already exists`)
  cpSync(path.join(clientsRoot, '_template'), dest, { recursive: true })
  try {
    walk(dest, (f) => {
      if (!/\.(json|css|md|txt)$/.test(f)) return
      let s = readFileSync(f, 'utf8')
      for (const [t, v] of TOKENS(site)) s = s.split(t).join(f.endsWith('.json') ? jsonSafe(v) : v)
      writeFileSync(f, s)
    })
    loadManifest(dest)
    // A starting blocklist: what we know belongs to this client. The client's owner adds persona, phones, addresses, buckets.
    const all = ['source', 'output', 'seed', 'render']
    const entries = [
      { value: site.name, kind: 'text', scopes: all, group: `${site.slug}-name` },
      ...(site.legal !== site.name ? [{ value: site.legal, kind: 'text', scopes: all, group: `${site.slug}-name` }] : []),
      { value: site.domain, kind: 'domain', scopes: all, group: `${site.slug}-domain` },
    ]
    writeFileSync(path.join(dest, 'blocklist.json'), `${JSON.stringify({ schemaVersion: 1, client: site.slug, entries }, null, 2)}\n`)
  } catch (e) {
    rmSync(dest, { recursive: true, force: true })
    throw e
  }
  return dest
}
