import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { LayoutBlockData } from '@factory/agency-core/blocks'
import type { FooterProps } from '@factory/agency-core/blocks'
import type { HeaderProps } from '@factory/agency-core/blocks'

/**
 * KIT-0 H6: server-only readers for a non-H2O client's site content. Everything a client's pages say lives in
 * `clients/<slug>/content/` (never in code): `chrome.json` (header and footer props) and `pages/<name>.json` (a page: title,
 * description, and `layout`, the same block rows a Payload page returns). `CLIENTS_DIR` overrides the search for `clients/`.
 */
export type ClientPageData = { title: string; description?: string; layout: LayoutBlockData[] }
export type ClientChrome = { header: HeaderProps; footer: FooterProps; fonts?: string[] }

export function clientsRoot(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  if (env.CLIENTS_DIR) return path.resolve(env.CLIENTS_DIR)
  let dir = cwd
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'clients', '_template'))) return path.join(dir, 'clients')
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new Error('no clients/ folder found above the working directory; set CLIENTS_DIR')
}

const SAFE = /^[a-z0-9][a-z0-9-]{0,80}$/
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

/** `/` is `home`; `/about/` is `about`; `/a/b/` is `a-b`. Anything that is not a plain slug is not a page. */
export function pageName(segments: readonly string[]): string | null {
  const name = segments.length === 0 ? 'home' : segments.join('-')
  return SAFE.test(name) ? name : null
}

export function loadPage(slug: string, segments: readonly string[], root: string = clientsRoot()): ClientPageData | null {
  const name = pageName(segments)
  if (!name) return null
  const file = path.join(root, slug, 'content', 'pages', `${name}.json`)
  if (!existsSync(file)) return null
  const d = readJson(file) as Partial<ClientPageData>
  if (typeof d.title !== 'string' || !Array.isArray(d.layout)) throw new Error(`${file}: a page needs a title and a layout list`)
  return d as ClientPageData
}

export function loadChrome(slug: string, root: string = clientsRoot()): ClientChrome {
  const file = path.join(root, slug, 'content', 'chrome.json')
  if (!existsSync(file)) throw new Error(`${file} is missing (header and footer props)`)
  const d = readJson(file) as Partial<ClientChrome>
  if (!d.header || !d.footer) throw new Error(`${file}: needs header and footer`)
  return d as ClientChrome
}

export function loadThemeCss(slug: string, root: string = clientsRoot()): string {
  const read = (n: string) => (existsSync(path.join(root, slug, 'theme', n)) ? readFileSync(path.join(root, slug, 'theme', n), 'utf8') : '')
  return `${read('tokens.css')}\n${read('overrides.css')}`
}
