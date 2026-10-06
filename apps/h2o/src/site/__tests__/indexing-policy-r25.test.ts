/**
 * R2.5 (Control Tower 2026-10-05, launch indexing contract): in payload runtime the X-Robots-Tag decision is made by the proxy
 * at runtime from H2O_INDEXING_POLICY, so one image can be promoted from staging (private) to production. Fail closed: any
 * value other than "production" (unset included) puts `noindex, nofollow` on every response. In production the page's own
 * decision applies; /admin, /api and /crm stay noindex in every policy. next.config compiles no robots header for payload builds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
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
    const routes = [row('/'), row('/a/'), row('/search/'), row('/thank-you/', { indexable: false, sitemap: false })]
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
    for (const p of ['/', '/a/', '/search/', '/thank-you/', '/old/', '/robots.txt', '/page-sitemap.xml', '/admin/', '/api/ready/', '/crm/', '/_next/static/x.js'])
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
