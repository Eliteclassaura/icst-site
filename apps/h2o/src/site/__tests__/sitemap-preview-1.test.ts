/**
 * SITEMAP-PREVIEW-1 (owner, 2026-10-09): on the private review host the sitemap endpoints return the REAL index and children (the URL set
 * production would publish) with URLs on the host that serves them. Fails closed (empty index) for any other or empty host and under the
 * production policy, which stays exactly the production output (canonical origin, never the staging host). Kill switch H2O_SITEMAP_PREVIEW=off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const O = 'https://h2ocooling.com'
const STAGING = 'https://staging.h2ocooling.org'
const APP = process.cwd()
const env0 = { ...process.env }
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: unknown[]; redirects: unknown[] }
let root: string
beforeEach(() => {
  vi.resetModules()
  root = mkdtempSync(path.join(tmpdir(), 'h2o-sitemap-preview-'))
  mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
  writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify(ledger))
  mkdirSync(path.join(root, 'releases'), { recursive: true })
  writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
  symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
  renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
  Object.assign(process.env, { H2O_CONTENT_SOURCE: 'payload', CONTENT_SNAPSHOT_DIR: root })
  delete process.env.H2O_INDEXING_POLICY
  delete process.env.H2O_SITEMAP_PREVIEW
})
afterEach(() => { process.env = { ...env0 }; vi.resetModules() })
void copyFileSync

const load = async () => await import('../../content/sitemap-response')
const xml = async (r: Response) => await r.text()
const locs = (s: string) => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)
const CHILD_NAME = /^(?:[a-z_-]+-sitemap[0-9]*|sitemap-(?:ja|th|id|vi)[0-9]*)\.xml$/

describe('SITEMAP-PREVIEW-1: the private review host', () => {
  it('the allowlist is exactly the staging host; kill switch and production policy turn it off', async () => {
    const { SITEMAP_PREVIEW_ORIGINS, sitemapPreviewOrigin } = await load()
    expect([...SITEMAP_PREVIEW_ORIGINS]).toEqual([STAGING])
    expect(sitemapPreviewOrigin(STAGING, {} as never)).toBe(STAGING)
    expect(sitemapPreviewOrigin(STAGING, { H2O_INDEXING_POLICY: 'private' } as never)).toBe(STAGING)
    for (const bad of [O, 'https://www.h2ocooling.com', 'https://evil.example', 'http://staging.h2ocooling.org', 'https://staging.h2ocooling.org:8443', 'https://STAGING.h2ocooling.org', '', null, undefined])
      expect(sitemapPreviewOrigin(bad as string | null, {} as never), String(bad)).toBeUndefined()
    expect(sitemapPreviewOrigin(STAGING, { H2O_SITEMAP_PREVIEW: 'off' } as never)).toBeUndefined()
    expect(sitemapPreviewOrigin(STAGING, { H2O_INDEXING_POLICY: 'production' } as never)).toBeUndefined()
  })

  it('on the staging host the index lists the production child set with children on the staging host, and every child lists its URLs there', async () => {
    const { sitemapResponse } = await load()
    const prod = await sitemapResponse('sitemap_index.xml', { production: true })
    const prodChildren = locs(await xml(prod)).map((u) => u.replace(O + '/', ''))
    expect(prodChildren.length).toBeGreaterThan(4)
    const index = await sitemapResponse('sitemap_index.xml', { previewOrigin: STAGING })
    const idx = await xml(index)
    expect(index.status).toBe(200)
    expect(locs(idx).map((u) => u.replace(STAGING + '/', ''))).toEqual(prodChildren)
    expect(idx).not.toContain('h2ocooling.com')
    expect(index.headers.get('cache-control')).toBe('no-cache')
    expect(index.headers.get('x-robots-tag')).toBe('noindex')
    for (const child of prodChildren) {
      expect(child).toMatch(CHILD_NAME)
      const p = await xml(await sitemapResponse(child, { production: true }))
      const s = await xml(await sitemapResponse(child, { previewOrigin: STAGING }))
      const prodLocs = locs(p), previewLocs = locs(s)
      expect(previewLocs.length, child).toBe(prodLocs.length)
      expect(previewLocs, child).toEqual(prodLocs.map((u) => STAGING + u.slice(O.length)))
      expect(s, child).not.toContain('h2ocooling.com') // loc, lastmod-free text and hreflang alternates all on the staging host
      for (const u of previewLocs) expect(u.startsWith(STAGING + '/'), u).toBe(true)
    }
  }, 120000)

  it('the same URL set as production: withdrawn (revoked), gone, redirected and noindex routes stay out exactly as in production, lastmod carried', async () => {
    const { sitemapResponse } = await load()
    const first = locs(await xml(await sitemapResponse('page-sitemap.xml', { production: true })))
    expect(first).toContain(`${O}/cooling-tower-malaysia/`)
    const lastmod = new Map(first.map((u) => [new URL(u).pathname, '2026-10-01T10:00:00.000Z'] as const))
    const withdrawn = '/cooling-tower-malaysia/'
    const a = await xml(await sitemapResponse('page-sitemap.xml', { production: true, revoked: new Set([withdrawn]), lastmod }))
    const b = await xml(await sitemapResponse('page-sitemap.xml', { previewOrigin: STAGING, revoked: new Set([withdrawn]), lastmod }))
    expect(a).not.toContain(`${O}${withdrawn}`)
    expect(b).not.toContain(withdrawn)
    expect(b).toMatch(/<lastmod>2026-10-01T10:00:00/)
    expect(b.replaceAll(STAGING, O)).toBe(a) // byte-identical apart from the host
  })

  it('an unknown, empty or production-listed host falls back to the private empty index (fail closed); an unknown child is a 404', async () => {
    const { sitemapResponse, sitemapPreviewOrigin } = await load()
    for (const host of ['https://evil.example', '', O, undefined]) {
      const res = await sitemapResponse('sitemap_index.xml', { previewOrigin: sitemapPreviewOrigin(host) })
      const body = await xml(res)
      expect(locs(body), String(host)).toEqual([])
      expect(body).toContain('<sitemapindex')
    }
    expect((await sitemapResponse('page-sitemap.xml', { previewOrigin: undefined })).status).toBe(404)
  })

  it('the production policy is unchanged: canonical origin, no host rewriting, and never the staging host, even if a staging origin is passed', async () => {
    process.env.H2O_INDEXING_POLICY = 'production'
    const { sitemapResponse, sitemapPreviewOrigin } = await load()
    const lastmod = new Map<string, string>()
    const plain = await xml(await sitemapResponse('sitemap_index.xml', { lastmod }))
    const withStaging = await xml(await sitemapResponse('sitemap_index.xml', { lastmod, previewOrigin: STAGING }))
    expect(withStaging).toBe(plain)
    expect(plain).toContain(`<loc>${O}/`)
    expect(plain).not.toContain('staging.h2ocooling.org')
    for (const child of locs(plain).map((u) => u.replace(O + '/', ''))) {
      const c = await xml(await sitemapResponse(child, { lastmod, previewOrigin: STAGING }))
      expect(c, child).not.toContain('staging.h2ocooling.org')
      expect(c, child).toContain(O)
    }
    expect(sitemapPreviewOrigin(STAGING)).toBeUndefined()
  }, 120000)

  it('kill switch: H2O_SITEMAP_PREVIEW=off returns the empty index again (read per request)', async () => {
    process.env.H2O_SITEMAP_PREVIEW = 'off'
    const { sitemapPreviewOrigin, sitemapResponse } = await load()
    expect(locs(await xml(await sitemapResponse('sitemap_index.xml', { previewOrigin: sitemapPreviewOrigin(STAGING) })))).toEqual([])
    delete process.env.H2O_SITEMAP_PREVIEW
    expect(locs(await xml(await sitemapResponse('sitemap_index.xml', { previewOrigin: sitemapPreviewOrigin(STAGING) }))).length).toBeGreaterThan(4)
  })
})

describe('SITEMAP-PREVIEW-1: the proxy names the request origin itself', () => {
  beforeEach(() => { process.env.H2O_CONTENT_SOURCE = 'payload' })
  it('sets x-h2o-sitemap-origin on sitemap addresses (overwriting a client value) and removes it from every other request; robots.txt stays closed with no Sitemap line', async () => {
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    const { SITEMAP_ORIGIN_HEADER } = await import('../../content/sitemap-request')
    const key = `x-middleware-request-${SITEMAP_ORIGIN_HEADER}`
    const spoof = { headers: { [SITEMAP_ORIGIN_HEADER]: 'https://staging.h2ocooling.org' } }
    for (const name of ['sitemap_index.xml', 'sitemap.xml', 'page-sitemap.xml']) {
      expect(proxy(new NextRequest(`${STAGING}/${name}`)).headers.get(key), name).toBe(STAGING)
      expect(proxy(new NextRequest(`${O}/${name}`, spoof)).headers.get(key), `${name} on the production host`).toBe(O) // the proxy's own value, never the client's
      expect(proxy(new NextRequest(`${STAGING}/${name}`)).headers.get('x-robots-tag'), name).toBe('noindex, nofollow')
    }
    for (const p of ['/cooling-tower/', '/api/public-sitemap/', '/crm/inbox/']) expect(proxy(new NextRequest(`${STAGING}${p}`, spoof)).headers.get(key), p).toBeNull()
    const robots = proxy(new NextRequest(`${STAGING}/robots.txt`))
    const body = await robots.text()
    expect(body).toContain('Disallow: /')
    expect(body).not.toMatch(/^Sitemap:/im)
    expect(robots.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
