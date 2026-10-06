/**
 * R3.3 (Control Tower hotfix 2026-10-05; Commander Round 2 hold): the standalone runtime does not pass a proxy rewrite's
 * query to the route handler, so every sitemap child answered the index. The proxy now names the file in a request header it
 * sets itself (`x-h2o-sitemap-file`; a client-supplied value is overwritten on sitemap addresses and removed from every other
 * payload-mode request); the handler reads header ?? `?file=` ??
 * the index, and keeps the allowlist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SITEMAP_FILE_HEADER, requestedSitemapFile } from '../../content/sitemap-request'

const O = 'https://h2ocooling.com'
const CHILDREN = ['page-sitemap.xml', 'post-sitemap.xml', 'product-sitemap.xml', 'product_cat-sitemap.xml', 'rt-portfolios-sitemap.xml']
const pub = (p: string, routeClass = 'pages') => ({ path: p, state: 'PUBLIC', sitemap: true, canonical: O + p, routeClass })

describe('requestedSitemapFile: header, then ?file=, then the index; allowlisted', () => {
  const req = (url: string, header?: string) => new Request(url, header ? { headers: { [SITEMAP_FILE_HEADER]: header } } : undefined)
  it('the header wins over the query (the standalone runtime drops the query)', () => {
    expect(requestedSitemapFile(req(`${O}/api/public-sitemap/`, 'page-sitemap.xml'))).toBe('page-sitemap.xml')
    expect(requestedSitemapFile(req(`${O}/api/public-sitemap/?file=post-sitemap.xml`, 'page-sitemap.xml'))).toBe('page-sitemap.xml')
    expect(requestedSitemapFile(req(`${O}/api/public-sitemap/?file=post-sitemap.xml`))).toBe('post-sitemap.xml')
    expect(requestedSitemapFile(req(`${O}/api/public-sitemap/`))).toBe('sitemap_index.xml')
  })
  it('anything that is not a sitemap name is refused (null → 404)', () => {
    for (const bad of ['../ledger.json', 'page-sitemap.xml/../x', 'robots.txt', 'Page-Sitemap.xml', '/page-sitemap.xml', 'sitemap_index.xml?x=1'])
      expect(requestedSitemapFile(req(`${O}/api/public-sitemap/`, bad)), bad).toBeNull()
  })
})

describe('the proxy sets the header itself and never forwards a client-supplied one', () => {
  const env = { ...process.env }
  beforeEach(() => { vi.resetModules(); process.env.H2O_CONTENT_SOURCE = 'payload' })
  afterEach(() => { process.env = { ...env } })
  it('every sitemap address is rewritten to the handler with the header and the query', async () => {
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    for (const name of ['sitemap_index.xml', 'sitemap.xml', ...CHILDREN, 'sitemap-ja.xml']) {
      const res = proxy(new NextRequest(`${O}/${name}`))
      expect(res.headers.get('x-middleware-rewrite'), name).toBe(`${O}/api/public-sitemap/?file=${name}`)
      expect(res.headers.get(`x-middleware-request-${SITEMAP_FILE_HEADER}`), name).toBe(name)
    }
  })
  it('a client-supplied header is overwritten on a sitemap address and removed everywhere else', async () => {
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    const spoof = { headers: { [SITEMAP_FILE_HEADER]: 'post-sitemap.xml' } }
    expect(proxy(new NextRequest(`${O}/page-sitemap.xml`, spoof)).headers.get(`x-middleware-request-${SITEMAP_FILE_HEADER}`)).toBe('page-sitemap.xml')
    for (const p of ['/api/public-sitemap/', '/api/sitemap-preview/', '/cooling-tower/', '/crm/inbox/']) {
      const res = proxy(new NextRequest(`${O}${p}`, spoof))
      const overridden = (res.headers.get('x-middleware-override-headers') ?? '').split(',')
      expect(overridden, p).not.toContain(SITEMAP_FILE_HEADER)
      expect(res.headers.get(`x-middleware-request-${SITEMAP_FILE_HEADER}`), p).toBeNull()
      expect(res.headers.get('x-middleware-override-headers'), `${p} forwards a sanitized header set`).not.toBeNull()
    }
  })
})

describe('the handler answers the named child (production and private policy)', () => {
  const env = { ...process.env }
  beforeEach(() => {
    vi.resetModules()
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-r33-'))
    mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
    writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes: [pub('/a/'), pub('/b-post/', 'posts')], redirects: [] }))
    mkdirSync(path.join(root, 'releases'), { recursive: true })
    writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
    symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
    renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
    Object.assign(process.env, { H2O_CONTENT_SOURCE: 'payload', CONTENT_SNAPSHOT_DIR: root })
    delete process.env.H2O_INDEXING_POLICY
    vi.doMock('@payload-config', () => ({ default: {} }))
    vi.doMock('../../content/revocation', () => ({ computeRevocations: async () => ({ paths: new Set<string>() }) }))
    vi.doMock('payload', () => ({ getPayload: async () => ({ find: async () => ({ docs: [{ path: '/a/', updatedAt: '2026-10-05T01:02:03.000Z' }] }) }) }))
  })
  afterEach(() => { process.env = { ...env }; vi.doUnmock('payload'); vi.doUnmock('@payload-config'); vi.doUnmock('../../content/revocation') })
  const get = async (header?: string, query = '') => {
    const { GET } = await import('../../app/(site)/api/public-sitemap/route')
    return GET(new Request(`${O}/api/public-sitemap/${query}`, header ? { headers: { [SITEMAP_FILE_HEADER]: header } } : undefined))
  }
  it('production: the header alone selects the child (no query), the index aliases list the children, unknown names 404', async () => {
    process.env.H2O_INDEXING_POLICY = 'production'
    const page = await (await get('page-sitemap.xml')).text()
    expect(page).toContain('<urlset')
    expect(page).toContain(`<loc>${O}/a/</loc>`)
    expect(await (await get('post-sitemap.xml', '?file=page-sitemap.xml')).text()).toContain(`<loc>${O}/b-post/</loc>`)
    for (const name of ['sitemap_index.xml', 'sitemap.xml']) expect(await (await get(name)).text(), name).toContain('<sitemapindex')
    expect((await get('unknown-sitemap.xml')).status).toBe(404)
    expect((await get('../ledger.json')).status).toBe(404)
  })
  it('private policy unchanged: the index is empty and every child 404s', async () => {
    expect(await (await get('sitemap_index.xml')).text()).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</sitemapindex>\n')
    expect((await get('page-sitemap.xml')).status).toBe(404)
  })
})
