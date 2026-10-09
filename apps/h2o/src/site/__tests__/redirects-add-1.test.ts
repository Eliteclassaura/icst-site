/**
 * REDIRECTS-ADD-1 (CT 2026-10-09, QA R18): (a) five live catch-all addresses that the old site sent to the home page now go to their best real
 * page in one hop; (b) /<section>/page/<n>/ on a section that has no real pagination answers 301 to the section page (the live site serves
 * page 1 there). Locale roots (/th/, /ja/, /es/) are NOT touched here (locale preservation rule).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'

const APP = process.cwd()
const env = { ...process.env }
const ORIGIN = 'https://h2ocooling.com'
type Row = { path: string; state: string }
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<Row & { routeId: string }>; redirects: Array<{ source: string; destination: string; status: number; targetState: string }> }
const ROWS: Array<[string, string]> = [
  ['/about/', '/about-ics-industrial-cooling-solutions/'],
  ['/services/', '/cooling-tower-maintenance-repair-upgrade/'],
  ['/cooling-towers/', '/cooling-tower/'],
  ['/fan-stacks/', '/cooling-tower-fan-stacks/'],
  ['/index.php', '/'],
]
const snapshot = (routes: Row[], redirects: unknown[] = []) => {
  const root = mkdtempSync(path.join(tmpdir(), 'h2o-ra1-'))
  mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
  writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes, redirects }))
  mkdirSync(path.join(root, 'releases'), { recursive: true })
  writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
  symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
  renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
  process.env.H2O_CONTENT_SOURCE = 'payload'
  process.env.CONTENT_SNAPSHOT_DIR = root
  process.env.H2O_INDEXING_POLICY = 'production'
}
const hop = async (p: string) => {
  const { proxy } = await import('../../proxy')
  const res = proxy(new NextRequest(`${ORIGIN}${p}`, { nextConfig: { trailingSlash: true } }))
  return { status: res.status, location: res.headers.get('location') }
}
beforeEach(() => vi.resetModules())
afterEach(() => { process.env = { ...env } })

describe('REDIRECTS-ADD-1: the catch-all addresses', () => {
  it('the ledger has the five one-hop 301s to public pages and no locale-root redirect was added', () => {
    for (const [source, destination] of ROWS) {
      const r = ledger.redirects.find((x) => x.source === source)
      expect(r, source).toEqual({ source, destination, status: 301, targetState: 'PUBLIC' })
      expect(ledger.routes.some((x) => x.path === source), `${source} must not also be a route`).toBe(false)
      expect(ledger.redirects.some((x) => x.source === destination), `${source}: no chain`).toBe(false)
    }
    for (const root of ['/th/', '/ja/', '/es/']) expect(ledger.redirects.some((x) => x.source === root), root).toBe(false)
  })
  for (const [source, destination] of ROWS)
    it(`${source} answers 301 to ${destination}`, async () => {
      snapshot(ledger.routes.map((r) => ({ path: r.path, state: r.state })).slice(0, 5), ledger.redirects.filter((r) => ROWS.some(([s]) => s === r.source)))
      const res = await hop(source)
      expect(res.status).toBe(301)
      expect(res.location).toBe(`${ORIGIN}${destination}`)
    })
})

describe('REDIRECTS-ADD-1: /<section>/page/<n>/ without real pagination', () => {
  const routes: Row[] = [
    { path: '/tech-articles/', state: 'PUBLIC' },
    { path: '/cooling-tower-parts-online/', state: 'PUBLIC' },
    { path: '/category/blog/', state: 'PUBLIC' },
    { path: '/category/blog/page/2/', state: 'PUBLIC' },
    { path: '/draft-section/', state: 'REVIEW_HOLD' },
  ]
  it('redirects /tech-articles/page/2/ and /cooling-tower-parts-online/page/2/ (and later pages) to the section', async () => {
    snapshot(routes)
    for (const [from, to] of [['/tech-articles/page/2/', '/tech-articles/'], ['/cooling-tower-parts-online/page/2/', '/cooling-tower-parts-online/'], ['/tech-articles/page/17/', '/tech-articles/']]) {
      const res = await hop(from)
      expect([res.status, res.location], from).toEqual([301, `${ORIGIN}${to}`])
    }
  })
  it('leaves real paginated archive pages, unknown sections and non-public sections alone', async () => {
    snapshot(routes)
    for (const p of ['/category/blog/page/2/', '/nothing-here/page/2/', '/draft-section/page/2/', '/tech-articles/pages/2/']) {
      const res = await hop(p)
      expect(res.status, p).not.toBe(301)
    }
  })
})
