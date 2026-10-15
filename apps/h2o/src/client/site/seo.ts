import type { Manifest } from '../manifest'
import type { ListedPage } from './content'

/**
 * Client-site search-engine files, generated from the manifest and the page files (nothing typed per client in code).
 * Indexing is OFF unless the production policy is set (`H2O_INDEXING_POLICY=production`, the existing switch): a private deploy serves
 * `Disallow: /`, `noindex` on every page and an empty index, whatever the pages say. A page with `noindex: true` is never listed.
 */
export const indexingOn = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_INDEXING_POLICY === 'production'

export const SITEMAP_CHUNK = 1000
export const canonicalUrl = (origin: string, pagePath: string): string => `${origin}${pagePath}`
const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string)

export const indexablePages = (pages: readonly ListedPage[]): ListedPage[] => pages.filter((p) => !p.page.noindex && (!p.page.canonical || p.page.canonical === p.path))

export function robotsTxt(origin: string, on: boolean): string {
  if (!on) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /crm/\nDisallow: /api/\n\nSitemap: ${origin}/sitemap_index.xml\n`
}

/** Child sitemap file names for these pages: `pages-1.xml`, `pages-2.xml`... served under `/sitemaps/`. */
export function sitemapChildren(pages: readonly ListedPage[], on: boolean): string[] {
  if (!on) return []
  const n = Math.max(1, Math.ceil(indexablePages(pages).length / SITEMAP_CHUNK))
  return Array.from({ length: n }, (_, i) => `pages-${i + 1}.xml`)
}

export function sitemapIndexXml(origin: string, children: readonly string[]): string {
  const rows = children.map((c) => `<sitemap><loc>${xml(`${origin}/sitemaps/${c}`)}</loc></sitemap>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</sitemapindex>\n`
}

export function sitemapXml(origin: string, pages: readonly ListedPage[], file: string, on: boolean): string | null {
  const m = /^pages-(\d+)\.xml$/.exec(file)
  if (!on || !m) return null
  const chunk = indexablePages(pages).slice((Number(m[1]) - 1) * SITEMAP_CHUNK, Number(m[1]) * SITEMAP_CHUNK)
  if (chunk.length === 0 && Number(m[1]) > 1) return null
  const rows = chunk.map((p) => `<url><loc>${xml(canonicalUrl(origin, p.path))}</loc>${p.page.lastmod ? `<lastmod>${xml(p.page.lastmod)}</lastmod>` : ''}</url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>\n`
}

/** llms.txt: the site's name, a one-line summary (the home page's own description), and the indexable pages with their titles and descriptions. */
export function llmsTxt(manifest: Manifest, pages: readonly ListedPage[], on: boolean): string {
  const origin = manifest.domains.canonical
  const home = pages.find((p) => p.path === '/')
  const lines = [`# ${manifest.brand.names.site}`, '']
  if (home?.page.description) lines.push(`> ${home.page.description.replace(/\s+/g, ' ').trim()}`, '')
  lines.push(`Website: ${origin}/`, '')
  if (!on) return `${lines.join('\n')}\n`
  const list = indexablePages(pages).filter((p) => p.path !== '/')
  if (list.length) {
    lines.push('## Pages', '')
    for (const p of list) lines.push(`- [${p.page.title}](${canonicalUrl(origin, p.path)})${p.page.description ? `: ${p.page.description.replace(/\s+/g, ' ').trim()}` : ''}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Breadcrumb trail after Home: the page's own, else the parents of its path (names from the pages that exist, else the segment). */
export function breadcrumbOf(page: ListedPage, pages: readonly ListedPage[]): Array<{ name: string; path: string }> {
  if (page.path === '/') return []
  if (page.page.breadcrumb) return page.page.breadcrumb
  const segs = page.path.split('/').filter(Boolean)
  return segs.map((seg, i) => {
    const p = `/${segs.slice(0, i + 1).join('/')}/`
    const found = pages.find((x) => x.path === p)
    return { name: found?.page.title ?? seg.replace(/-/g, ' '), path: p }
  })
}

/**
 * JSON-LD graph: Organization (from the manifest: legal name, public offices, phones, profiles), WebSite, and a BreadcrumbList for inner
 * pages. No Person or author claims, no ratings, no products: only what the manifest states.
 */
export function schemaGraph(manifest: Manifest, page: ListedPage, pages: readonly ListedPage[]): Record<string, unknown> {
  const origin = manifest.domains.canonical
  const offices = manifest.offices.filter((o) => o.publicOnSite)
  const org: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: manifest.brand.names.site,
    legalName: manifest.client.legalName,
    url: `${origin}/`,
    ...(manifest.site.sameAs.length ? { sameAs: manifest.site.sameAs } : {}),
    ...(offices[0]
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: offices[0].address.lines.join(', '),
            addressLocality: offices[0].address.city,
            addressRegion: offices[0].address.region,
            postalCode: offices[0].address.postalCode,
            addressCountry: offices[0].country,
          },
        }
      : {}),
    ...(offices.some((o) => o.phones.length)
      ? { contactPoint: offices.flatMap((o) => o.phones.map((p) => ({ '@type': 'ContactPoint', contactType: 'sales', telephone: p.tel.replace('tel:', ''), areaServed: o.country }))) }
      : {}),
  }
  const site = { '@type': 'WebSite', '@id': `${origin}/#website`, name: manifest.brand.names.site, url: `${origin}/`, publisher: { '@id': `${origin}/#organization` }, inLanguage: manifest.locales.default }
  const graph: unknown[] = [org, site]
  const trail = breadcrumbOf(page, pages)
  if (trail.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [{ name: 'Home', path: '/' }, ...trail].map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: canonicalUrl(origin, t.path) })),
    })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}

export const robotsMeta = (on: boolean, page: { noindex?: boolean }): { index: boolean; follow: boolean } => ({ index: on && !page.noindex, follow: on && !page.noindex })
