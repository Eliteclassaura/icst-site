/**
 * R3.6 (Control Tower 2026-10-06, owner decision): H2O_ROBOTS_ALLOW_AGENTS lets named audit crawlers (Semrush Site Audit) crawl
 * a private deployment through robots.txt. Empty: today's robots byte-for-byte. Production ignores it. Indexing stays closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseRobotsAllowAgents, privateRobotsBody } from '../../content/robots-allow'

const O = 'https://h2ocooling.com'
const env = { ...process.env }
const TODAY_PRIVATE = 'User-agent: *\nDisallow: /\n'
const TODAY_PRODUCTION = 'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /crm/\nDisallow: /private/\nSitemap: https://h2ocooling.com/sitemap_index.xml\n'
const group = (token: string) => `User-agent: ${token}\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /crm/\n\n`

describe('H2O_ROBOTS_ALLOW_AGENTS parsing', () => {
  it('keeps valid tokens in order without duplicates; invalid tokens are dropped and logged without their values', () => {
    const warnings: string[] = []
    const tokens = parseRobotsAllowAgents(' SiteAuditBot , SemrushBot-SA,bad token-secret,,x/../secret,SiteAuditBot,' + 'a'.repeat(41), (m) => warnings.push(m))
    expect(tokens).toEqual(['SiteAuditBot', 'SemrushBot-SA'])
    expect(warnings).toHaveLength(4)
    for (const w of warnings) {
      expect(w).not.toMatch(/secret|aaaa/)
      expect(w).toMatch(/^\[h2o\] H2O_ROBOTS_ALLOW_AGENTS token \d+ ignored: /)
    }
    expect(parseRobotsAllowAgents(undefined)).toEqual([])
    expect(parseRobotsAllowAgents('  ')).toEqual([])
  })
  it('private body: empty is today byte-for-byte; two tokens give two groups, then the * disallow last', () => {
    expect(privateRobotsBody({})).toBe(TODAY_PRIVATE)
    expect(privateRobotsBody({ H2O_ROBOTS_ALLOW_AGENTS: '' })).toBe(TODAY_PRIVATE)
    expect(privateRobotsBody({ H2O_ROBOTS_ALLOW_AGENTS: 'SiteAuditBot,SemrushBot-SA' })).toBe(group('SiteAuditBot') + group('SemrushBot-SA') + TODAY_PRIVATE)
    expect(privateRobotsBody({ H2O_ROBOTS_ALLOW_AGENTS: 'bad token,SiteAuditBot' })).toBe(group('SiteAuditBot') + TODAY_PRIVATE)
    expect(privateRobotsBody({ H2O_ROBOTS_ALLOW_AGENTS: 'only bad!' })).toBe(TODAY_PRIVATE)
  })
})

describe('robots.txt from the proxy (payload runtime)', () => {
  beforeEach(() => {
    vi.resetModules()
    const root = mkdtempSync(path.join(tmpdir(), 'h2o-robots-allow-'))
    mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
    const routes = [{ path: '/', routeId: 'T-home', state: 'PUBLIC', export: true, indexable: true, sitemap: true, canonical: `${O}/`, routeClass: 'pages' }]
    writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes, redirects: [] }))
    mkdirSync(path.join(root, 'releases'), { recursive: true })
    writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
    symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
    renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
    Object.assign(process.env, { H2O_CONTENT_SOURCE: 'payload', CONTENT_SNAPSHOT_DIR: root })
    delete process.env.H2O_INDEXING_POLICY
    delete process.env.H2O_ROBOTS_ALLOW_AGENTS
  })
  afterEach(() => { process.env = { ...env } })
  const robots = async () => {
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    return proxy(new NextRequest(`${O}/robots.txt`)).text()
  }
  it('private, unset: today byte-for-byte', async () => {
    expect(await robots()).toBe(TODAY_PRIVATE)
  })
  it('private with the staging value: the two Semrush groups, then everyone disallowed; read at request time; pages stay noindex', async () => {
    process.env.H2O_ROBOTS_ALLOW_AGENTS = 'SiteAuditBot,SemrushBot-SA'
    const body = await robots()
    expect(body).toBe(group('SiteAuditBot') + group('SemrushBot-SA') + TODAY_PRIVATE)
    expect(body.endsWith('User-agent: *\nDisallow: /\n')).toBe(true)
    const { proxy } = await import('../../proxy')
    const { NextRequest } = await import('next/server')
    expect(proxy(new NextRequest(`${O}/`)).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    // a changed value takes effect without a rebuild or restart of the module
    process.env.H2O_ROBOTS_ALLOW_AGENTS = ''
    expect(await robots()).toBe(TODAY_PRIVATE)
  })
  it('production ignores the variable: the accepted production robots, unchanged', async () => {
    process.env.H2O_INDEXING_POLICY = 'production'
    process.env.H2O_ROBOTS_ALLOW_AGENTS = 'SiteAuditBot,SemrushBot-SA'
    expect(await robots()).toBe(TODAY_PRODUCTION)
  })
})
