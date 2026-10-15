import { describe, expect, it } from 'vitest'
import { BAKED_MANIFEST } from '../baked'
import type { ListedPage } from '../site/content'
import { breadcrumbOf, indexablePages, indexingOn, llmsTxt, robotsMeta, robotsTxt, schemaGraph, sitemapChildren, sitemapIndexXml, sitemapXml } from '../site/seo'

const page = (path: string, title: string, extra: Partial<ListedPage['page']> = {}): ListedPage => ({ name: path.replace(/\//g, '') || 'home', path, page: { title, description: `${title} description`, layout: [], ...extra } })
const pages = [page('/', 'Home'), page('/parts/', 'Parts'), page('/parts/fans/', 'Fans', { lastmod: '2026-10-01' }), page('/legal/', 'Legal', { noindex: true })]
const origin = BAKED_MANIFEST.domains.canonical

describe('indexing switch', () => {
  it('is off unless the production policy is set', () => {
    expect(indexingOn({} as NodeJS.ProcessEnv)).toBe(false)
    expect(indexingOn({ H2O_INDEXING_POLICY: 'private' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(indexingOn({ H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })
  it('private: robots disallows everything, no sitemap children, pages are noindex', () => {
    expect(robotsTxt(origin, false)).toBe('User-agent: *\nDisallow: /\n')
    expect(sitemapChildren(pages, false)).toEqual([])
    expect(sitemapXml(origin, pages, 'pages-1.xml', false)).toBeNull()
    expect(robotsMeta(false, {})).toEqual({ index: false, follow: false })
  })
  it('production: robots allows, keeps platform paths out and names the sitemap index; a noindex page stays out', () => {
    const r = robotsTxt(origin, true)
    expect(r).toContain('Allow: /')
    for (const p of ['/admin/', '/crm/', '/api/']) expect(r).toContain(`Disallow: ${p}`)
    expect(r).toContain(`Sitemap: ${origin}/sitemap_index.xml`)
    expect(robotsMeta(true, {})).toEqual({ index: true, follow: true })
    expect(robotsMeta(true, { noindex: true })).toEqual({ index: false, follow: false })
  })
})

describe('sitemaps', () => {
  it('the index lists child files; a child lists indexable pages as canonical URLs with lastmod; noindex pages never appear', () => {
    expect(sitemapChildren(pages, true)).toEqual(['pages-1.xml'])
    expect(sitemapIndexXml(origin, ['pages-1.xml'])).toContain(`<loc>${origin}/sitemaps/pages-1.xml</loc>`)
    const x = sitemapXml(origin, pages, 'pages-1.xml', true)!
    expect(x).toContain(`<loc>${origin}/</loc>`)
    expect(x).toContain(`<loc>${origin}/parts/fans/</loc><lastmod>2026-10-01</lastmod>`)
    expect(x).not.toContain('/legal/')
    expect(indexablePages(pages).map((p) => p.path)).toEqual(['/', '/parts/', '/parts/fans/'])
  })
  it('unknown child names and out-of-range chunks are not found; special characters are escaped', () => {
    expect(sitemapXml(origin, pages, 'pages-2.xml', true)).toBeNull()
    expect(sitemapXml(origin, pages, '../x.xml', true)).toBeNull()
    expect(sitemapXml(origin, [page('/a&b/', 'T')], 'pages-1.xml', true)).toContain('/a&amp;b/')
  })
  it('chunks at 1,000 pages', () => {
    const many = Array.from({ length: 2500 }, (_, i) => page(`/p${i}/`, `P${i}`))
    expect(sitemapChildren(many, true)).toEqual(['pages-1.xml', 'pages-2.xml', 'pages-3.xml'])
    expect(sitemapXml(origin, many, 'pages-3.xml', true)!.match(/<url>/g)).toHaveLength(500)
  })
})

describe('llms.txt', () => {
  it('names the site and home description; lists indexable pages only in production', () => {
    const on = llmsTxt(BAKED_MANIFEST, pages, true)
    expect(on).toContain(`# ${BAKED_MANIFEST.brand.names.site}`)
    expect(on).toContain('> Home description')
    expect(on).toContain(`[Fans](${origin}/parts/fans/): Fans description`)
    expect(on).not.toContain('Legal')
    expect(llmsTxt(BAKED_MANIFEST, pages, false)).not.toContain('## Pages')
  })
})

describe('schema graph', () => {
  it('Organization and WebSite come from the manifest; inner pages add a BreadcrumbList; no Person or author claim', () => {
    const g = schemaGraph(BAKED_MANIFEST, pages[2], pages) as { '@graph': Array<Record<string, unknown>> }
    const types = g['@graph'].map((n) => n['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'BreadcrumbList'])
    const org = g['@graph'][0] as Record<string, unknown>
    expect(org.legalName).toBe(BAKED_MANIFEST.client.legalName)
    expect(JSON.stringify(g)).not.toMatch(/"Person"|"author"|aggregateRating/)
    const crumbs = (g['@graph'][2].itemListElement as Array<{ position: number; name: string; item: string }>)
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Parts', 'Fans'])
    expect(crumbs[2].item).toBe(`${origin}/parts/fans/`)
    expect((schemaGraph(BAKED_MANIFEST, pages[0], pages) as { '@graph': unknown[] })['@graph']).toHaveLength(2)
  })
  it('breadcrumbs: a page may state its own trail; otherwise it derives from the path', () => {
    expect(breadcrumbOf(page('/x/', 'X', { breadcrumb: [{ name: 'Custom', path: '/c/' }] }), pages)).toEqual([{ name: 'Custom', path: '/c/' }])
    expect(breadcrumbOf(page('/parts/fans/', 'Fans'), pages).map((b) => b.name)).toEqual(['Parts', 'Fans'])
  })
})
