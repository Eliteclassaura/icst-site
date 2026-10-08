/**
 * Production sitemap (CT brief H2O_SITEMAP_PRODUCTION_BRIEF_R1, 2026-10-05): inclusion rules, index/child shape,
 * lastmod sourcing, escaping and encoding, hreflang reciprocity, the private policy, preview access, and mutation
 * discrimination on the inclusion filter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as sitemap from '../../content/sitemap'
import { GONE_PATHS, NOINDEX_FOLLOW_PATHS, productTagNoindex } from '../../content/config'

const { childFor, exclusionReason, sitemapChildren, sitemapChildXml, sitemapEntries, sitemapIndexXml, SITEMAP_FILE } = sitemap
type Row = sitemap.SitemapLedgerRow
const O = 'https://h2ocooling.com'
const APP = process.cwd()
const locale = JSON.parse(readFileSync(path.join(APP, 'content/locale/sitemap-locale.json'), 'utf8')) as sitemap.LocaleData
const pub = (p: string, extra: Partial<Row> = {}): Row => ({ path: p, state: 'PUBLIC', sitemap: true, canonical: O + p, routeClass: 'pages', ...extra })

/** One fixture per exclusion rule, plus the rows that must stay in. */
const FIXTURES: Array<{ row: Row; reason: string | null }> = [
  { row: pub('/listed/'), reason: null },
  { row: pub('/no-canonical-field/', { canonical: null }), reason: null },
  { row: pub('/held/', { state: 'REVIEW_HOLD', sitemap: false }), reason: 'state REVIEW_HOLD' },
  // R2.5: a row marked noindex is excluded even when its sitemap flag is still true (SEO pre-flight D11)
  { row: pub('/noindex-flagged/', { indexable: false }), reason: 'noindex' },
  { row: pub('/held-flag/', { state: 'REVIEW_HOLD' }), reason: 'state REVIEW_HOLD' },
  { row: pub('/moved/', { state: 'REDIRECT' }), reason: 'state REDIRECT' },
  { row: pub('/crm/inbox/'), reason: 'private surface' },
  { row: pub('/admin/'), reason: 'private surface' },
  { row: pub('/canvas/list/'), reason: '410 gone' },
  { row: pub('/redirected/'), reason: '301 redirect' },
  { row: pub('/withdrawn/'), reason: 'revoked (withdrawn since the release)' },
  { row: pub('/author/timbozic/'), reason: 'noindex,follow' },
  // SEO-FIX-1: product-tag archives (except the ones with Google clicks) are noindex,follow by rule
  { row: pub('/product-tag/blade-de/'), reason: 'noindex,follow (rule)' },
  { row: pub('/product-tag/paramax-sfc/'), reason: null },
  { row: pub('/not-approved/', { sitemap: false }), reason: 'not sitemap-approved' },
  { row: pub('/duplicate/', { canonical: `${O}/winner/` }), reason: 'canonical points elsewhere' },
  { row: pub('/category/blog/page/2/', { routeClass: 'link-discovered' }), reason: 'paginated archive page' },
  { row: pub('/file.pdf', { canonical: null }), reason: 'not a trailing-slash page path' },
]
const input = (rows: Row[], extra: Partial<sitemap.SitemapInput> = {}): sitemap.SitemapInput => ({
  rows, origin: O, redirected: new Set(['/redirected/']), gone: GONE_PATHS, revoked: new Set(['/withdrawn/']), noindexFollow: NOINDEX_FOLLOW_PATHS, noindexFollowPath: productTagNoindex, ...extra,
})

describe('who gets in', () => {
  it('lists only published PUBLIC, sitemap-approved, self-canonical page paths; every excluded class has its own reason', () => {
    for (const f of FIXTURES) expect(exclusionReason(f.row, input([f.row])), f.row.path).toBe(f.reason)
    expect(sitemapEntries(input(FIXTURES.map((f) => f.row))).map((e) => e.loc)).toEqual([`${O}/listed/`, `${O}/no-canonical-field/`, `${O}/product-tag/paramax-sfc/`])
  })
  it('a decoded and an encoded spelling of the same path are one URL (no duplicates; revocation by either spelling)', () => {
    const rows = [pub('/caf%c3%a9/'), pub('/café/')]
    expect(sitemapEntries(input(rows))).toHaveLength(1)
    expect(sitemapEntries(input(rows, { revoked: new Set(['/café/']) }))).toHaveLength(0)
  })
})

describe('mutation discrimination on the inclusion filter', () => {
  // Each guard of exclusionReason is disabled in turn; the fixture table must notice every mutant.
  const source = readFileSync(path.join(APP, 'src/content/sitemap.ts'), 'utf8')
  const body = source.slice(source.indexOf('export function exclusionReason'), source.indexOf('/** Every listed URL'))
  const guards = body.split('\n').filter((l) => /^ {2}if \(/.test(l))
  const dir = path.join(APP, 'node_modules/.cache/sitemap-mutants')
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  it('has a guard per rule and every mutant changes at least one fixture outcome', async () => {
    expect(guards).toHaveLength(12) // R2.5: + the noindex guard; SEO-FIX-1: + the product-tag guard
    mkdirSync(dir, { recursive: true })
    for (const [i, guard] of guards.entries()) {
      const mutated = source.replace(guard, guard.replace(/^ {2}if \(.*\) return /, '  if (false) return '))
      expect(mutated, guard).not.toBe(source)
      const file = path.join(dir, `m${i}-${Date.now()}.ts`)
      writeFileSync(file, mutated)
      const m = (await import(/* @vite-ignore */ file)) as typeof sitemap
      const killed = FIXTURES.some((f) => m.exclusionReason(f.row, input([f.row])) !== f.reason)
      expect(killed, `mutant survives: ${guard.trim()}`).toBe(true)
    }
  }, 60000)
})

describe('index and children', () => {
  const rows = [pub('/'), pub('/about/'), pub('/a-post/', { routeClass: 'posts' }), pub('/product/x/', { routeClass: 'product' }), pub('/product-category/fans/', { routeClass: 'product_cat' }), pub('/category/blog/', { routeClass: 'link-discovered' }), pub('/rt-portfolios/kbr/')]
  it('keeps the Yoast child names, omits empty children, and puts locale pages in their language child', () => {
    const children = sitemapChildren(sitemapEntries(input(rows)))
    expect([...children.keys()]).toEqual(['page-sitemap.xml', 'post-sitemap.xml', 'product-sitemap.xml', 'product_cat-sitemap.xml', 'category-sitemap.xml', 'rt-portfolios-sitemap.xml'])
    expect(childFor(pub('/ja/何か/'), locale)).toBe('sitemap-ja.xml')
    expect(childFor(pub('/th/x/'))).toBe('sitemap-th.xml')
    // Part A decides the language of a preserved page whatever its prefix.
    const bare = Object.entries(locale.languages).find(([p]) => !/^\/(ja|th|id|vi)\//.test(p))!
    expect(childFor(pub(bare[0]), locale)).toBe(`sitemap-${bare[1]}.xml`)
    for (const name of ['sitemap_index.xml', 'sitemap.xml', 'page-sitemap.xml', 'product_cat-sitemap.xml', 'rt-portfolios-sitemap.xml', 'page-sitemap2.xml', 'sitemap-ja.xml', 'sitemap-vi2.xml']) expect(SITEMAP_FILE.test(`/${name}`), name).toBe(true)
    for (const name of ['sitemap-fr.xml', 'page-sitemap.xml.gz', 'x/page-sitemap.xml', '../sitemap.xml', 'Page-sitemap.xml']) expect(SITEMAP_FILE.test(`/${name}`), name).toBe(false)
  })
  it('index shape: one <sitemap> per non-empty child, with the latest lastmod of its URLs', () => {
    const lastmod = new Map([['/about/', '2026-10-05T09:20:11.123Z'], ['/', '2026-10-01T00:00:00Z']])
    const xml = sitemapIndexXml(sitemapChildren(sitemapEntries(input(rows, { lastmod }))), O)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')).toBe(true)
    expect(xml).toContain(`<sitemap><loc>${O}/page-sitemap.xml</loc><lastmod>2026-10-05T09:20:11Z</lastmod></sitemap>`)
    expect(xml).toContain(`<sitemap><loc>${O}/post-sitemap.xml</loc></sitemap>`)
    expect(xml.match(/<sitemap>/g)).toHaveLength(6)
  })
  it('splits a child at the URL limit with the Yoast numbering', () => {
    const many = Array.from({ length: 5 }, (_, i) => pub(`/p${i}/`))
    expect([...sitemapChildren(sitemapEntries(input(many)), 2)].map(([n, l]) => [n, l.length])).toEqual([['page-sitemap.xml', 2], ['page-sitemap2.xml', 2], ['page-sitemap3.xml', 1]])
  })
})

describe('lastmod', () => {
  it('comes from the document updatedAt (second precision, UTC); unknown or invalid is omitted, never the build time', () => {
    const lastmod = new Map([['/a/', '2026-09-30T23:59:59.999+02:00'], ['/b/', 'not a date']])
    const [a, b, c] = sitemapEntries(input([pub('/a/'), pub('/b/'), pub('/c/')], { lastmod }))
    expect(a!.lastmod).toBe('2026-09-30T21:59:59Z')
    expect(b!.lastmod).toBeUndefined()
    expect(c!.lastmod).toBeUndefined()
    const xml = sitemapChildXml([a!, c!])
    expect(xml).toContain(`<url><loc>${O}/a/</loc><lastmod>2026-09-30T21:59:59Z</lastmod></url>`)
    expect(xml).toContain(`<url><loc>${O}/c/</loc></url>`)
    expect(xml).not.toMatch(/changefreq|priority/)
  })
})

describe('escaping and encoding', () => {
  it('escapes XML and percent-encodes non-ASCII slugs, keeping the canonical spelling of existing escapes', () => {
    const rows = [pub('/r&d/', { canonical: null }), pub('/th/ทดสอบ/', { canonical: null }), pub('/product/dyna-fab-18%e2%80%b2-height/')]
    const xml = sitemapChildXml(sitemapEntries(input(rows)))
    expect(xml).toContain(`<loc>${O}/r&amp;d/</loc>`)
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
    expect(xml).toContain(`<loc>${O}/th/${encodeURIComponent('ทดสอบ')}/</loc>`)
    expect(xml).toContain(`<loc>${O}/product/dyna-fab-18%e2%80%b2-height/</loc>`)
    expect(/^[ -~\n]*$/.test(xml)).toBe(true)
  })
})

describe('hreflang (OGCS Part A clusters)', () => {
  const full = locale.clusters.find((c) => c.length === 6 && c.some((m) => m.url.endsWith('/understanding-cooling-tower-parts/')))!
  const rowsFor = (members: sitemap.HreflangMember[]) => [...new Set(members.map((m) => new URL(m.url).pathname))].map((p) => pub(p, { canonical: null }))
  it('every member of a served cluster emits the full set, self included (reciprocity), on both locale and English pages', () => {
    const entries = sitemapEntries(input(rowsFor(full), { locale }))
    expect(entries).toHaveLength(5)
    const sets = entries.map((e) => JSON.stringify(e.alternates))
    expect(new Set(sets).size).toBe(1)
    expect(entries[0]!.alternates!.map((a) => a.hreflang).sort()).toEqual(['en', 'id', 'ja', 'th', 'vi', 'x-default'])
    for (const e of entries) expect(e.alternates!.some((a) => a.url === e.loc)).toBe(true)
    const xml = sitemapChildXml(entries)
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml).toMatch(/<xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/h2ocooling\.com\/understanding-cooling-tower-parts\/"\/>/)
  })
  it('a member that is not served drops out of every page (the publish-at-cutover rule): no en and no x-default without the English page', () => {
    const entries = sitemapEntries(input(rowsFor(full).filter((r) => r.path !== '/understanding-cooling-tower-parts/'), { locale }))
    expect(new Set(entries.map((e) => JSON.stringify(e.alternates))).size).toBe(1)
    expect(entries[0]!.alternates!.map((a) => a.hreflang).sort()).toEqual(['id', 'ja', 'th', 'vi'])
  })
  it('emits nothing until at least two languages of a cluster are served (today: the locale pages are not yet published)', () => {
    const english = rowsFor(full).filter((r) => !/^\/(ja|th|id|vi)\//.test(sitemap.pathKey(r.path)))
    expect(sitemapEntries(input(english, { locale }))[0]!.alternates).toBeUndefined()
  })
  it('the cluster data is well formed: one cluster per page, no repeated hreflang, Part A OMIT pages absent', () => {
    const seen = new Set<string>()
    for (const c of locale.clusters) {
      expect(new Set(c.map((m) => m.hreflang)).size).toBe(c.length)
      for (const m of c.filter((x) => x.hreflang !== 'x-default')) {
        expect(seen.has(m.url), m.url).toBe(false)
        seen.add(m.url)
      }
    }
    expect(locale.clusters).toHaveLength(42) // SEO-CONTENT-2.1: the cluster of the four held HVAC locale twins is gone
    expect(Object.keys(locale.languages)).toHaveLength(164)
    expect(seen.has(`${O}/th/工業プロセスにおける冷却塔の用途を理解する/`)).toBe(false)
    expect(seen.has(`${O}/ja/工業プロセスにおける冷却塔の用途を理解する/`)).toBe(false)
  })
})

describe('served responses: the private policy stays closed; the preview shares the production code path', () => {
  const env = { ...process.env }
  let root: string
  beforeEach(() => {
    vi.resetModules()
    root = mkdtempSync(path.join(tmpdir(), 'h2o-sitemap-'))
    mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
    writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes: [pub('/a/'), pub('/b-post/', { routeClass: 'posts' }), pub('/h/', { state: 'REVIEW_HOLD' })], redirects: [{ source: '/old/', destination: '/a/', status: 301 }] }))
    mkdirSync(path.join(root, 'releases'), { recursive: true })
    writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
    symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
    renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
    Object.assign(process.env, { H2O_CONTENT_SOURCE: 'payload', CONTENT_SNAPSHOT_DIR: root })
    delete process.env.H2O_INDEXING_POLICY
  })
  afterEach(() => {
    process.env = { ...env }
    vi.doUnmock('payload')
    vi.doUnmock('next/headers')
    vi.doUnmock('@payload-config')
    vi.doUnmock('../../content/revocation')
  })
  it('private policy: the index is empty, every child is 404, robots disallows all and names no sitemap', async () => {
    const { sitemapResponse } = await import('../../content/sitemap-response')
    const { robotsResponse } = await import('../../proxy')
    const index = await sitemapResponse('sitemap.xml')
    expect(index.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(await index.text()).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</sitemapindex>\n')
    expect((await sitemapResponse('page-sitemap.xml')).status).toBe(404)
    expect(await robotsResponse().text()).toBe('User-agent: *\nDisallow: /\n')
  })
  it('production policy: both index addresses list the children; robots points at sitemap_index.xml', async () => {
    process.env.H2O_INDEXING_POLICY = 'production'
    const { sitemapResponse } = await import('../../content/sitemap-response')
    const { robotsResponse } = await import('../../proxy')
    for (const name of ['sitemap_index.xml', 'sitemap.xml']) {
      const xml = await (await sitemapResponse(name)).text()
      expect(xml).toContain(`<loc>${O}/page-sitemap.xml</loc>`)
      expect(xml).toContain(`<loc>${O}/post-sitemap.xml</loc>`)
    }
    expect(await (await sitemapResponse('page-sitemap.xml')).text()).toContain(`<loc>${O}/a/</loc>`)
    expect((await sitemapResponse('product-sitemap.xml')).status).toBe(404)
    expect(await robotsResponse().text()).toMatch(/\nSitemap: https:\/\/h2ocooling\.com\/sitemap_index\.xml\n$/)
  })
  it('the proxy rewrites every sitemap file name (index aliases and children) to the sitemap handler', async () => {
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    for (const name of ['sitemap_index.xml', 'sitemap.xml', 'page-sitemap.xml', 'sitemap-ja.xml']) {
      const res = proxy(new NextRequest(`${O}/${name}`))
      expect(res.headers.get('x-middleware-rewrite'), name).toBe(`${O}/api/public-sitemap/?file=${name}`)
    }
  })
  async function preview(user: unknown, file?: string) {
    vi.doMock('@payload-config', () => ({ default: {} }))
    vi.doMock('next/headers', () => ({ headers: async () => new Headers() }))
    vi.doMock('../../content/revocation', () => ({ computeRevocations: async () => ({ paths: new Set<string>() }) }))
    vi.doMock('payload', () => ({
      getPayload: async () => ({
        auth: async () => ({ user }),
        find: async () => ({ docs: [{ path: '/a/', updatedAt: '2026-10-05T01:02:03.000Z' }] }),
      }),
    }))
    const { GET } = await import('../../app/(site)/api/sitemap-preview/route')
    return GET(new Request(`${O}/api/sitemap-preview/${file ? `?file=${file}` : ''}`))
  }
  it('preview: a content admin gets what production would publish (private policy notwithstanding), noindex and no-store', async () => {
    const index = await preview({ roles: ['platform-admin'] })
    expect(index.status).toBe(200)
    expect(index.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(index.headers.get('cache-control')).toBe('private, no-store')
    expect(await index.text()).toContain(`<sitemap><loc>${O}/page-sitemap.xml</loc><lastmod>2026-10-05T01:02:03Z</lastmod></sitemap>`)
    const child = await preview({ roles: ['platform-admin'] }, 'page-sitemap.xml')
    expect(await child.text()).toContain(`<url><loc>${O}/a/</loc><lastmod>2026-10-05T01:02:03Z</lastmod></url>`)
  })
  it('preview: anonymous, an editor without admin rights, and a sales user all get 404', async () => {
    for (const user of [null, { roles: ['editor'] }, { roles: ['sales'] }]) {
      vi.resetModules()
      const res = await preview(user)
      expect(res.status, JSON.stringify(user)).toBe(404)
      expect(await res.text()).not.toMatch(/sitemap/i)
    }
  })
  it('both handlers use the same response builder (no forked logic)', () => {
    for (const route of ['public-sitemap', 'sitemap-preview']) expect(readFileSync(path.join(APP, `src/app/(site)/api/${route}/route.ts`), 'utf8')).toMatch(/return sitemapResponse\(name, \{ revoked, lastmod/)
  })
})
