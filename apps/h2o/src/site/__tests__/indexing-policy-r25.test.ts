/**
 * R2.5 (Control Tower 2026-10-05, launch indexing contract): in payload runtime the X-Robots-Tag decision is made by the proxy
 * at runtime from H2O_INDEXING_POLICY, so one image can be promoted from staging (private) to production. Fail closed: any
 * value other than "production" (unset included) puts `noindex, nofollow` on every response. In production the page's own
 * decision applies; /admin, /api and /crm stay noindex in every policy. next.config compiles no robots header for payload builds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const O = 'https://h2ocooling.com'
const row = (p: string, extra: Record<string, unknown> = {}) => ({ path: p, routeId: `T-${p}`, state: 'PUBLIC', export: true, indexable: true, sitemap: true, canonical: O + p, routeClass: 'pages', ...extra })
const env = { ...process.env }

describe('X-Robots-Tag policy matrix (payload runtime)', () => {
  beforeEach(() => {
    vi.resetModules()
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-robots-'))
    mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
    const routes = [row('/'), row('/a/'), row('/search/'), row('/thank-you/', { indexable: false, sitemap: false }),
      // R2.5a: archive taxonomy roots that are not indexable, and one that is
      row('/category/blog/', { indexable: false, sitemap: false, routeClass: 'categories' }), row('/product-tag/fill/', { indexable: false, sitemap: false }), row('/product-category/fans/', { routeClass: 'product_cat' })]
    writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes, redirects: [{ source: '/old/', destination: '/a/', status: 301 }] }))
    mkdirSync(path.join(root, 'releases'), { recursive: true })
    writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
    symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
    renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
    Object.assign(process.env, { H2O_CONTENT_SOURCE: 'payload', CONTENT_SNAPSHOT_DIR: root })
    delete process.env.H2O_INDEXING_POLICY
  })
  afterEach(() => { process.env = { ...env } })
  const tags = async (policy: string | undefined) => {
    if (policy === undefined) delete process.env.H2O_INDEXING_POLICY
    else process.env.H2O_INDEXING_POLICY = policy
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    const out: Record<string, string | null> = {}
    for (const p of ['/', '/a/', '/search/', '/thank-you/', '/old/', '/robots.txt', '/page-sitemap.xml', '/admin/', '/api/ready/', '/crm/', '/_next/static/x.js', '/category/blog/', '/product-tag/fill/', '/product-category/fans/'])
      out[p] = proxy(new NextRequest(`${O}${p}`)).headers.get('x-robots-tag')
    return out
  }
  it('fails closed: unset, empty, a typo or "staging" put noindex, nofollow on every response', async () => {
    for (const policy of [undefined, '', 'Production', 'staging', 'private']) {
      const t = await tags(policy)
      for (const [p, v] of Object.entries(t)) expect(v, `${String(policy)} ${p}`).toBe('noindex, nofollow')
    }
  })
  it('production: indexable pages carry no robots header; per-route noindex stays; admin, API and CRM stay noindex', async () => {
    const t = await tags('production')
    expect(t['/']).toBeNull()
    expect(t['/a/']).toBeNull()
    expect(t['/old/']).toBeNull() // a 301 carries no noindex of its own
    expect(t['/robots.txt']).toBeNull()
    expect(t['/_next/static/x.js']).toBeNull()
    expect(t['/search/']).toBe('noindex, follow')
    // R2.5a: a noindex archive root keeps its links followed; an indexable archive carries no header
    expect(t['/category/blog/']).toBe('noindex, follow')
    expect(t['/product-tag/fill/']).toBe('noindex, follow')
    expect(t['/product-category/fans/']).toBeNull()
    expect(t['/thank-you/']).toBe('noindex, nofollow')
    for (const p of ['/admin/', '/api/ready/', '/crm/']) expect(t[p], p).toBe('noindex, nofollow')
  })
  it('robots.txt is decided at runtime too', async () => {
    const { robotsResponse } = await import('../../proxy')
    expect(await robotsResponse().text()).toBe('User-agent: *\nDisallow: /\n')
    process.env.H2O_INDEXING_POLICY = 'production'
    expect(await robotsResponse().text()).toMatch(/^User-agent: \*\nAllow: \/\n/)
  })
})

describe('a pending two-factor session on a protected surface (R2.5a)', () => {
  afterEach(() => { process.env = { ...env } })
  // A session token with a valid session id and no two-factor cookie: the proxy sends it to /crm/mfa/ (303).
  const token = `x.${Buffer.from(JSON.stringify({ sid: 'abcdef12-3456-7890' })).toString('base64url')}.y`
  it('the 303 to /crm/mfa/ is noindex, nofollow with the security headers, in every policy (12 cases)', async () => {
    let cases = 0
    for (const policy of [undefined, '', 'Production', 'staging', 'private', 'production']) {
      vi.resetModules()
      process.env.H2O_CONTENT_SOURCE = 'payload'
      if (policy === undefined) delete process.env.H2O_INDEXING_POLICY
      else process.env.H2O_INDEXING_POLICY = policy
      const { proxy } = await import('../../proxy')
      const { NextRequest } = await import('next/server')
      for (const p of ['/admin/', '/crm/']) {
        const res = proxy(new NextRequest(`${O}${p}`, { headers: { cookie: `payload-token=${token}` } }))
        expect(res.status, `${String(policy)} ${p}`).toBe(303)
        expect(res.headers.get('location'), p).toMatch(/\/crm\/mfa\//)
        expect(res.headers.get('x-robots-tag'), `${String(policy)} ${p}`).toBe('noindex, nofollow')
        for (const h of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy']) expect(res.headers.get(h), `${p} ${h}`).toBeTruthy()
        cases++
      }
    }
    expect(cases).toBe(12)
  })
})

describe('archive follow policy (R2.5a): publicRobots and the 21 roots the checker named', () => {
  it('a noindex archive taxonomy route is noindex,follow; utility pages stay noindex,nofollow; private policy is noindex,nofollow', async () => {
    const { publicRobots, isNoindexFollow } = await import('../../content/config')
    const prod = { ...process.env, H2O_INDEXING_POLICY: 'production' } as NodeJS.ProcessEnv
    const rec = (p: string, indexable: boolean) => ({ path: p, disposition: { state: 'PUBLIC', indexable } })
    expect(publicRobots(rec('/category/blog/', false), false, prod)).toEqual({ index: false, follow: true })
    expect(publicRobots(rec('/product-tag/fill/', false), false, prod)).toEqual({ index: false, follow: true })
    expect(publicRobots(rec('/product-category/fans/', true), false, prod)).toEqual({ index: true, follow: true })
    expect(publicRobots(rec('/thank-you/', false), false, prod)).toEqual({ index: false, follow: false })
    expect(publicRobots(rec('/category/blog/', false), false, { ...process.env, H2O_INDEXING_POLICY: 'private' } as NodeJS.ProcessEnv)).toEqual({ index: false, follow: false })
    const ledger = JSON.parse(readFileSync(path.join(process.cwd(), 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; state: string; indexable?: boolean }> }
    const named = ['/category/blog/', '/category/cooling-tower-fans/', '/category/cooling-tower-parts/', '/category/cooling-tower-services/', '/category/cooling-tower-servicesindustrial-cooling-tower/', '/category/industrial-cooling-tower/', '/category/uncategorized/', '/product-category/fans/', '/product-category/fill-media/', '/product-category/frp-members/', '/product-category/gearboxes/double-reduction/', '/product-category/gearboxes/right-angle-gearboxes/', '/product-tag/amarillo/', '/product-tag/cooling-tower-fans/', '/product-tag/cooling-tower-gearboxes/', '/product-tag/double-reduction/', '/product-tag/drive-shafts/', '/product-tag/driveshaft/', '/product-tag/fill/', '/product-tag/right-angle-fan-drives/', '/product-tag/splash-fill/']
    for (const p of named) {
      const r = ledger.routes.find((x) => x.path === p)!
      expect(r, p).toBeTruthy()
      expect(r.indexable, p).toBe(false)
      expect(isNoindexFollow(r.path, r.indexable), p).toBe(true)
      expect(publicRobots({ path: r.path, disposition: { state: r.state, indexable: r.indexable } }, false, prod), p).toEqual({ index: false, follow: true })
    }
    // every noindex PUBLIC archive taxonomy route in the ledger follows; no non-archive utility page does unless listed
    for (const r of ledger.routes.filter((x) => x.state === 'PUBLIC' && !x.indexable && /^\/(?:category|product-category|product-tag|tag)\//.test(x.path))) expect(isNoindexFollow(r.path, r.indexable), r.path).toBe(true)
    expect(isNoindexFollow('/thank-you/', false)).toBe(false)
  })
})

describe('next.config compiles no robots header for a payload build', () => {
  afterEach(() => { process.env = { ...env }; vi.resetModules() })
  it('payload runtime: no X-Robots-Tag rule whatever the build-time policy (admin framing kept); repository mode unchanged', async () => {
    for (const policy of [undefined, 'production']) {
      vi.resetModules()
      process.env.H2O_CONTENT_SOURCE = 'payload'
      if (policy) process.env.H2O_INDEXING_POLICY = policy
      else delete process.env.H2O_INDEXING_POLICY
      const config = (await import('../../../next.config')).default as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string }> }>> }
      const rules = await config.headers()
      expect(rules.flatMap((r) => r.headers.map((h) => h.key)), String(policy)).not.toContain('X-Robots-Tag')
      expect(rules.find((r) => r.source === '/admin/:path*')?.headers.map((h) => h.key)).toEqual(['X-Frame-Options', 'Content-Security-Policy'])
    }
    vi.resetModules()
    delete process.env.H2O_CONTENT_SOURCE
    const config = (await import('../../../next.config')).default as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> }
    expect((await config.headers()).find((r) => r.source === '/:path*' && r.headers.some((h) => h.key === 'X-Robots-Tag'))?.headers.find((h) => h.key === 'X-Robots-Tag')?.value).toBe('noindex, nofollow')
  })
})
