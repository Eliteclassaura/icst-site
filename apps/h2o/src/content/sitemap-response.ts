import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'
import { PUBLISHED_PUBLIC } from './access'
import { GONE_PATHS, NOINDEX_FOLLOW_PATHS, PUBLIC_ORIGIN } from './config'
import { snapshotJson } from './runtime-read'
import { isIndexName, pathKey, sitemapChildren, sitemapChildXml, sitemapEntries, sitemapIndexXml, type LocaleData, type SitemapEntry, type SitemapLedgerRow } from './sitemap'

/**
 * The sitemap responses (public /sitemap_index.xml, /sitemap.xml and the children; the editorial preview). One
 * code path: the preview passes `production: true` and gets exactly what the production policy publishes.
 * The private indexing policy (staging, previews) publishes an empty index and no children.
 */
type Ledger = { routes: SitemapLedgerRow[]; redirects: Array<{ source: string }> }
export type SitemapOptions = { revoked?: ReadonlySet<string>; lastmod?: ReadonlyMap<string, string>; production?: boolean }

/** OGCS Part A hreflang clusters and locale languages (content/locale/sitemap-locale.json, built by ops/sitemap). */
let locale: LocaleData | undefined
const localeData = (): LocaleData => (locale ??= JSON.parse(readFileSync(path.join(process.cwd(), 'content/locale/sitemap-locale.json'), 'utf8')) as LocaleData)

function publishedLedger(): Ledger | null {
  try {
    return snapshotJson<Ledger>('ledger.json')
  } catch {
    return null
  }
}

/** Every URL the policy lists now (null: no published ledger). */
export function sitemapEntriesFor(opts: SitemapOptions = {}): SitemapEntry[] | null {
  const ledger = publishedLedger()
  if (!ledger) return null
  const production = opts.production ?? process.env.H2O_INDEXING_POLICY === 'production'
  if (!production) return []
  return sitemapEntries({
    rows: ledger.routes,
    origin: PUBLIC_ORIGIN,
    revoked: opts.revoked,
    redirected: new Set(ledger.redirects.map((r) => pathKey(r.source))),
    gone: GONE_PATHS,
    noindexFollow: NOINDEX_FOLLOW_PATHS,
    lastmod: opts.lastmod,
    locale: localeData(),
  })
}

const XML = { 'Content-Type': 'application/xml; charset=utf-8' }
/** `name` is a sitemap file name (`sitemap_index.xml`, `page-sitemap.xml`, …). */
export function sitemapResponse(name: string, opts: SitemapOptions = {}, headers: Record<string, string> = { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }): NextResponse {
  const entries = sitemapEntriesFor(opts)
  if (!entries) return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const children = sitemapChildren(entries)
  if (isIndexName(name)) return new NextResponse(sitemapIndexXml(children, PUBLIC_ORIGIN), { headers: { ...XML, ...headers } })
  const list = children.get(name)
  if (!list) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache' } })
  return new NextResponse(sitemapChildXml(list), { headers: { ...XML, ...headers } })
}

/** `updatedAt` of every published PUBLIC document, by decoded path (the sitemap's `lastmod`). */
export async function publishedUpdatedAt(payload: Payload): Promise<Map<string, string>> {
  const res = await payload.find({
    collection: 'public-routes' as never,
    where: PUBLISHED_PUBLIC as never,
    select: { path: true, updatedAt: true } as never,
    depth: 0,
    pagination: false,
    overrideAccess: false,
  })
  const out = new Map<string, string>()
  for (const d of res.docs as unknown as Array<{ path?: string; updatedAt?: string }>) if (d.path && d.updatedAt) out.set(pathKey(d.path), d.updatedAt)
  return out
}
