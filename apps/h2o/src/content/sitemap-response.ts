import { readFileSync } from 'node:fs'
import { withLegalRows } from '../site/legal-routes'
import path from 'node:path'
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'
import { PUBLISHED_PUBLIC } from './access'
import { GONE_PATHS, NOINDEX_FOLLOW_PATHS, PUBLIC_ORIGIN, productTagNoindex } from './config'
import { snapshotJson } from './runtime-read'
import { isIndexName, pathKey, sitemapChildren, sitemapChildXml, sitemapEntries, sitemapIndexXml, type LocaleData, type SitemapEntry, type SitemapLedgerRow } from './sitemap'

/**
 * The sitemap responses (public /sitemap_index.xml, /sitemap.xml and the children; the editorial preview). One
 * code path: the preview passes `production: true` and gets exactly what the production policy publishes.
 * The private indexing policy (staging, previews) publishes an empty index and no children.
 */
type Ledger = { routes: SitemapLedgerRow[]; redirects: Array<{ source: string }> }
export type SitemapOptions = { revoked?: ReadonlySet<string>; lastmod?: ReadonlyMap<string, string>; production?: boolean; previewOrigin?: string }

/**
 * SITEMAP-PREVIEW-1: the retired preview host has no allowlisted origin. Private sitemap requests
 * therefore keep the empty index; production remains on the canonical public origin. The preview
 * mechanism stays fail-closed if a future review host is explicitly approved.
 */
export const SITEMAP_PREVIEW_ORIGINS: ReadonlySet<string> = new Set()
export const sitemapPreviewOrigin = (candidate: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined =>
  env.H2O_INDEXING_POLICY !== 'production' && env.H2O_SITEMAP_PREVIEW !== 'off' && candidate && SITEMAP_PREVIEW_ORIGINS.has(candidate) ? candidate : undefined
const onOrigin = (url: string, origin: string): string => (url.startsWith(PUBLIC_ORIGIN) ? origin + url.slice(PUBLIC_ORIGIN.length) : url)

/** OGCS Part A hreflang clusters and locale languages (content/locale/sitemap-locale.json, built by ops/sitemap). */
let locale: LocaleData | undefined
/**
 * SEO-FIX-1 (OGCS SEO DEEP R1 section 6, CT 2026-10-07; supersedes OGCS Part A's mapping for this cluster): LOCALE_ONLY
 * clusters list their locale members only. The "parts and functions" translations have no English equivalent (the English
 * article 404s and the parts hub is not a translation of it), so `en` and `x-default` are dropped. Any cluster that holds
 * one of these URLs is LOCALE_ONLY. No locale page or redirect changes.
 */
export const LOCALE_ONLY_MEMBERS: ReadonlySet<string> = new Set(['https://h2ocooling.com/id/komponen-dan-fungsi-menara-pendingin/'])
export const localeOnly = (data: LocaleData): LocaleData => ({
  ...data,
  clusters: data.clusters.map((c) => (c.some((m) => LOCALE_ONLY_MEMBERS.has(m.url)) ? c.filter((m) => m.hreflang !== 'en' && m.hreflang !== 'x-default') : c)),
})
const localeData = (): LocaleData => (locale ??= localeOnly(JSON.parse(readFileSync(path.join(process.cwd(), 'content/locale/sitemap-locale.json'), 'utf8')) as LocaleData))

function publishedLedger(): Ledger | null {
  try {
    return withLegalRows(snapshotJson<Ledger>('ledger.json'))
  } catch {
    return null
  }
}

/** Every URL the policy lists now (null: no published ledger). */
export function sitemapEntriesFor(opts: SitemapOptions = {}): SitemapEntry[] | null {
  const ledger = publishedLedger()
  if (!ledger) return null
  const production = opts.production ?? process.env.H2O_INDEXING_POLICY === 'production'
  // the private policy lists nothing, except for a private review host (SITEMAP-PREVIEW-1), and never when the production policy is active
  const previewOrigin = !production ? opts.previewOrigin : undefined
  if (!production && !previewOrigin) return []
  const entries = sitemapEntries({
    rows: ledger.routes,
    origin: PUBLIC_ORIGIN,
    revoked: opts.revoked,
    redirected: new Set(ledger.redirects.map((r) => pathKey(r.source))),
    gone: GONE_PATHS,
    noindexFollow: NOINDEX_FOLLOW_PATHS,
    noindexFollowPath: productTagNoindex,
    lastmod: opts.lastmod,
    locale: localeData(),
  })
  if (!previewOrigin) return entries
  return entries.map((e) => ({ ...e, loc: onOrigin(e.loc, previewOrigin), alternates: e.alternates?.map((a) => ({ ...a, url: onOrigin(a.url, previewOrigin) })) }))
}

const XML = { 'Content-Type': 'application/xml; charset=utf-8' }
/** `name` is a sitemap file name (`sitemap_index.xml`, `page-sitemap.xml`, …). */
export function sitemapResponse(name: string, opts: SitemapOptions = {}, headers: Record<string, string> = { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }): NextResponse {
  const entries = sitemapEntriesFor(opts)
  if (!entries) return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const children = sitemapChildren(entries)
  if (isIndexName(name)) return new NextResponse(sitemapIndexXml(children, !(opts.production ?? process.env.H2O_INDEXING_POLICY === 'production') && opts.previewOrigin ? opts.previewOrigin : PUBLIC_ORIGIN), { headers: { ...XML, ...headers } })
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

/**
 * hreflang alternates for a page's <head> (Locale Part B): the same set the production sitemap lists for it, built from
 * the OGCS Part A clusters restricted to members that are themselves listed, so every member names the identical set
 * (reciprocity) and a page outside a served cluster names none. Cached briefly per process.
 */
let alternatesCache: { at: number; byKey: Map<string, Record<string, string>> } | null = null
const ALTERNATES_TTL_MS = 30_000
export function hreflangAlternatesFor(pathname: string, now = Date.now()): Record<string, string> | undefined {
  if (!alternatesCache || now - alternatesCache.at > ALTERNATES_TTL_MS) {
    const byKey = new Map<string, Record<string, string>>()
    for (const e of sitemapEntriesFor({ production: true }) ?? []) if (e.alternates) byKey.set(e.key, Object.fromEntries(e.alternates.map((a) => [a.hreflang, a.url])))
    alternatesCache = { at: now, byKey }
  }
  return alternatesCache.byKey.get(pathKey(pathname))
}
/**
 * LANG-1: the same hreflang alternates, computed from the repository's release ledger (content/release/route-ledger.json) with the
 * identical sitemap policy and redirect guard, for renders that have no published Payload snapshot (static export, tests, plain
 * dev). Live Payload renders use hreflangAlternatesFor.
 */
let repoAlternates: Map<string, Record<string, string>> | null = null
export function repositoryAlternatesFor(pathname: string): Record<string, string> | undefined {
  if (!repoAlternates) {
    const ledger = JSON.parse(readFileSync(path.join(process.cwd(), 'content/release/route-ledger.json'), 'utf8')) as Ledger
    const entries = sitemapEntries({
      rows: ledger.routes,
      origin: PUBLIC_ORIGIN,
      redirected: new Set(ledger.redirects.map((r) => pathKey(r.source))),
      gone: GONE_PATHS,
      noindexFollow: NOINDEX_FOLLOW_PATHS,
      noindexFollowPath: productTagNoindex,
      locale: localeData(),
    })
    repoAlternates = new Map(entries.filter((e) => e.alternates).map((e) => [e.key, Object.fromEntries(e.alternates!.map((a) => [a.hreflang, a.url]))]))
  }
  return repoAlternates.get(pathKey(pathname))
}

export const resetAlternatesCache = (): void => {
  alternatesCache = null
}
