import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { LayoutBlockData } from '@factory/agency-core/blocks'
import type { FooterProps } from '@factory/agency-core/blocks'
import type { HeaderProps } from '@factory/agency-core/blocks'

/**
 * KIT-0 H6: server-only readers for a non-H2O client's site content. Everything a client's pages say lives in
 * `clients/<slug>/content/` (never in code): `chrome.json` (header and footer props) and `pages/<name>.json` (a page: title,
 * description, and `layout`, the same block rows a Payload page returns). `CLIENTS_DIR` overrides the search for `clients/`.
 */
export type ClientPageData = {
  title: string
  description?: string
  layout: LayoutBlockData[]
  /** Public path when it is not `/<name>/` (nested pages), always with leading and trailing slash. */
  path?: string
  /** Canonical path when this page repeats another page's content (it stays 200 but is not listed); defaults to its own path. */
  canonical?: string
  /** Kept out of the index, the sitemaps and llms.txt, whatever the indexing policy. */
  noindex?: boolean
  /** ISO date, for the sitemap. */
  lastmod?: string
  /** Breadcrumb trail after Home: names and paths. Derived from the path when absent. */
  breadcrumb?: Array<{ name: string; path: string }>
}
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

const PATH_OK = /^\/(?:[a-z0-9][a-z0-9-]*\/)*$/

function readPage(file: string): ClientPageData {
  const d = readJson(file) as Partial<ClientPageData>
  if (typeof d.title !== 'string' || !Array.isArray(d.layout)) throw new Error(`${file}: a page needs a title and a layout list`)
  if (d.path !== undefined && !PATH_OK.test(d.path)) throw new Error(`${file}: path must look like /a/b/ (lower-case segments, leading and trailing slash)`)
  if (d.canonical !== undefined && !/^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/.test(d.canonical)) throw new Error(`${file}: canonical must be a same-site path ending in /`)
  return d as ClientPageData
}

export type ListedPage = { name: string; path: string; page: ClientPageData }

// M15 (port of the availability finding in the port matrix): every public page view called listPages twice, which parsed all page
// files each time. The parsed index is kept per process (the content folder is part of the image and does not change while it runs).
const pageIndex = new Map<string, ListedPage[]>()

/** Every page of the client with its public path (`home` is `/`, others `/<name>/` unless the page sets `path`). Sorted by path. Cached per process. */
export function listPages(slug: string, root: string = clientsRoot()): ListedPage[] {
  const key = `${root}\0${slug}`
  const hit = pageIndex.get(key)
  if (hit) return hit
  const index = readPageIndex(slug, root)
  pageIndex.set(key, index)
  return index
}

function readPageIndex(slug: string, root: string): ListedPage[] {
  const dir = path.join(root, slug, 'content', 'pages')
  if (!existsSync(dir)) return []
  const out: ListedPage[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const name = f.slice(0, -5)
    if (!SAFE.test(name)) continue
    const page = readPage(path.join(dir, f))
    out.push({ name, path: page.path ?? (name === 'home' ? '/' : `/${name}/`), page })
  }
  const seen = new Set<string>()
  for (const p of out) {
    if (seen.has(p.path)) throw new Error(`two pages claim the path ${p.path}`)
    seen.add(p.path)
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

export const requestPath = (segments: readonly string[]): string => (segments.length === 0 ? '/' : `/${segments.join('/')}/`)

export function loadPage(slug: string, segments: readonly string[], root: string = clientsRoot()): ClientPageData | null {
  if (segments.length > 0 && !segments.every((x) => SAFE.test(x))) return null
  return listPages(slug, root).find((p) => p.path === requestPath(segments))?.page ?? null
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
