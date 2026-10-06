/**
 * Production sitemap (Control Tower brief H2O_SITEMAP_PRODUCTION_BRIEF_R1, 2026-10-05). Pure: no I/O.
 *
 * A sitemap index (served at both /sitemap_index.xml and /sitemap.xml, so the Yoast index already submitted in
 * Search Console stays valid at cutover) and its children, which keep the Yoast names where the type exists:
 * page-sitemap.xml, post-sitemap.xml, product-sitemap.xml, product_cat-sitemap.xml, category-sitemap.xml,
 * rt-portfolios-sitemap.xml, and one child per preserved locale (sitemap-ja.xml, -th, -id, -vi).
 *
 * Membership is decided per request from the published ledger minus the revocation overlay, as before:
 * only routes that are published PUBLIC, sitemap-approved and self-canonical. Redirects, GONE (410),
 * noindex,follow, revoked routes, paginated archive pages (/page/N/) and private surfaces never appear. `lastmod` is the Payload document's
 * `updatedAt` (omitted when unknown, never the build time). An empty child is omitted from the index and
 * answers 404. hreflang alternates come from the OGCS Part A clusters, restricted to the members that are
 * themselves emitted, so every member of a cluster emits the same set (reciprocity) and a cluster fills in on
 * its own as Locale Part B publishes the locale pages.
 */
export type SitemapLedgerRow = { path: string; state: string; sitemap?: boolean; indexable?: boolean; canonical?: string | null; routeClass?: string }
export type HreflangMember = { hreflang: string; url: string }
export type LocaleData = { clusters: HreflangMember[][]; languages: Record<string, string> }
export type SitemapEntry = { child: string; loc: string; key: string; lastmod?: string; alternates?: HreflangMember[] }
export type SitemapInput = {
  rows: readonly SitemapLedgerRow[]
  origin: string
  revoked?: ReadonlySet<string>
  /** Paths answered with a redirect or 410 by the proxy: never listed, whatever their row says. */
  redirected?: ReadonlySet<string>
  gone?: ReadonlySet<string>
  noindexFollow?: ReadonlySet<string>
  /** Decoded path → ISO `updatedAt` of the published document. */
  lastmod?: ReadonlyMap<string, string>
  locale?: LocaleData
}

export const LOCALES = ['ja', 'th', 'id', 'vi'] as const
export const MAX_URLS_PER_CHILD = 50000
const PRIVATE = /^\/(?:api|admin|crm|private|_next|preview)(?:\/|$)/

export const pathKey = (p: string): string => {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}
const urlKey = (u: string): string => {
  try {
    const url = new URL(u)
    return url.origin + pathKey(url.pathname)
  } catch {
    return u
  }
}
/** Percent-encode non-ASCII characters only: existing escapes (the canonical's own spelling) are kept as they are. */
export const asciiUrl = (u: string): string => u.replace(/[\u{80}-\u{10FFFF}]+/gu, (run) => encodeURIComponent(run))
export const xmlEscape = (v: string): string => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
/** W3C datetime, second precision, UTC. Unknown or invalid input gives undefined. */
export const isoLastmod = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !v) return undefined
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** The Yoast-named child for a route. */
export function childFor(row: SitemapLedgerRow, locale?: LocaleData): string {
  const key = pathKey(row.path)
  const lang = locale?.languages[key] ?? LOCALES.find((l) => key.startsWith(`/${l}/`))
  if (lang) return `sitemap-${lang}.xml`
  if (row.routeClass === 'product') return 'product-sitemap.xml'
  if (row.routeClass === 'product_cat' || key.startsWith('/product-category/')) return 'product_cat-sitemap.xml'
  if (key.startsWith('/category/')) return 'category-sitemap.xml'
  if (key.startsWith('/tag/')) return 'post_tag-sitemap.xml'
  if (key.startsWith('/rt-portfolios/')) return 'rt-portfolios-sitemap.xml'
  if (row.routeClass === 'posts') return 'post-sitemap.xml'
  return 'page-sitemap.xml'
}

/** Why a ledger row is not listed (null: it is listed). One reason per row, checked in this order. */
export function exclusionReason(row: SitemapLedgerRow, input: SitemapInput): string | null {
  const key = pathKey(row.path)
  if (row.state !== 'PUBLIC') return `state ${row.state}`
  if (PRIVATE.test(key)) return 'private surface'
  if (input.gone?.has(key)) return '410 gone'
  if (input.redirected?.has(key)) return '301 redirect'
  if (input.revoked?.has(row.path) || input.revoked?.has(key)) return 'revoked (withdrawn since the release)'
  if (input.noindexFollow?.has(row.path) || input.noindexFollow?.has(key)) return 'noindex,follow'
  // R2.5 (CT 2026-10-05, SEO pre-flight): a noindex row is never listed, whatever its sitemap flag says
  if (row.indexable === false) return 'noindex'
  if (!row.sitemap) return 'not sitemap-approved'
  // CT 2026-10-05: paginated archive pages keep serving (index,follow, self-canonical) but are not landing pages.
  if (/\/page\/[0-9]+\/$/.test(key)) return 'paginated archive page'
  const self = input.origin + row.path
  if (row.canonical && urlKey(row.canonical) !== urlKey(self)) return 'canonical points elsewhere'
  if (!row.path.startsWith('/') || !row.path.endsWith('/')) return 'not a trailing-slash page path'
  return null
}

/** Every listed URL, with its child, lastmod and hreflang alternates. */
export function sitemapEntries(input: SitemapInput): SitemapEntry[] {
  const out: SitemapEntry[] = []
  const seen = new Set<string>()
  for (const row of input.rows) {
    if (exclusionReason(row, input)) continue
    const key = pathKey(row.path)
    if (seen.has(key)) continue
    seen.add(key)
    const loc = asciiUrl(row.canonical || input.origin + row.path)
    out.push({ child: childFor(row, input.locale), loc, key, lastmod: isoLastmod(input.lastmod?.get(key)) })
  }
  if (input.locale) {
    const byUrl = new Map(out.map((e) => [input.origin + e.key, e]))
    for (const cluster of input.locale.clusters) {
      const live = cluster.map((m) => ({ m, e: byUrl.get(urlKey(m.url)) })).filter((x) => x.e)
      if (new Set(live.filter((x) => x.m.hreflang !== 'x-default').map((x) => x.m.hreflang)).size < 2) continue
      const alternates = live.map((x) => ({ hreflang: x.m.hreflang, url: x.e!.loc }))
      for (const x of live) x.e!.alternates = alternates
    }
  }
  return out
}

/** Child file names in index order, split at the 50,000-URL limit (`page-sitemap.xml`, `page-sitemap2.xml`, …). */
export function sitemapChildren(entries: readonly SitemapEntry[], max = MAX_URLS_PER_CHILD): Map<string, SitemapEntry[]> {
  const grouped = new Map<string, SitemapEntry[]>()
  for (const e of entries) grouped.set(e.child, [...(grouped.get(e.child) ?? []), e])
  const out = new Map<string, SitemapEntry[]>()
  for (const [name, list] of grouped)
    for (let i = 0; i < list.length; i += max) out.set(i === 0 ? name : name.replace(/\.xml$/, `${i / max + 1}.xml`), list.slice(i, i + max))
  return out
}

const latest = (list: readonly SitemapEntry[]) => list.reduce<string | undefined>((a, e) => (e.lastmod && (!a || e.lastmod > a) ? e.lastmod : a), undefined)

export function sitemapIndexXml(children: ReadonlyMap<string, readonly SitemapEntry[]>, origin: string): string {
  const items = [...children].map(([name, list]) => {
    const lm = latest(list)
    return `  <sitemap><loc>${xmlEscape(`${origin}/${name}`)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</sitemap>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.map((i) => i + '\n').join('')}</sitemapindex>\n`
}

export function sitemapChildXml(list: readonly SitemapEntry[]): string {
  const hreflang = list.some((e) => e.alternates)
  const ns = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hreflang ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}`
  const urls = list.map((e) => {
    const alt = (e.alternates ?? []).map((a) => `<xhtml:link rel="alternate" hreflang="${xmlEscape(a.hreflang)}" href="${xmlEscape(a.url)}"/>`).join('')
    return `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}${alt}</url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${urls.map((u) => u + '\n').join('')}</urlset>\n`
}

/** The public sitemap file names this site answers (index aliases plus any child name). */
export const SITEMAP_FILE = /^\/(sitemap_index\.xml|sitemap\.xml|[a-z_-]+-sitemap[0-9]*\.xml|sitemap-(?:ja|th|id|vi)[0-9]*\.xml)$/
export const isIndexName = (name: string): boolean => name === 'sitemap_index.xml' || name === 'sitemap.xml'
