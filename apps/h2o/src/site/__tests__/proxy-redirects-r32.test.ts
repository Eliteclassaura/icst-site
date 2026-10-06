/**
 * R3.2 (Control Tower 2026-10-05; Commander Round 1 rehearsal, rehearsal-causal-diagnosis.json): every ledger redirect's
 * Location is the approved target byte-exact, so no redirect costs an extra hop. The rehearsal saw 23 file-extension sources
 * (/content/uploads/*.jpg) lose the target's trailing slash (301 → 308 → 200) because NextURL.clone() re-formats the path
 * with the request's trailing-slash state. Requests here carry the app's real `trailingSlash: true`, as the server's do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'

type Redirect = { source: string; destination: string; status: number }
const APP = process.cwd()
const env = { ...process.env }
const ORIGIN = 'https://h2ocooling.com'
const snapshot = (redirects: Redirect[]) => {
  const root = mkdtempSync(path.join(tmpdir(), 'h2o-r32-'))
  mkdirSync(path.join(root, 'generations', 'g'), { recursive: true })
  writeFileSync(path.join(root, 'generations', 'g', 'ledger.json'), JSON.stringify({ routes: [], redirects }))
  mkdirSync(path.join(root, 'releases'), { recursive: true })
  writeFileSync(path.join(root, 'releases', 'r-g.json'), JSON.stringify({ format: 1, id: 'r-g', content: 'g', search: 's-g' }))
  symlinkSync('releases/r-g.json', path.join(root, 'release.tmp'))
  renameSync(path.join(root, 'release.tmp'), path.join(root, 'release'))
  process.env.H2O_CONTENT_SOURCE = 'payload'
  process.env.CONTENT_SNAPSHOT_DIR = root
  process.env.H2O_INDEXING_POLICY = 'production'
}
/** A request as the Next server builds it for this app (next.config.ts: trailingSlash: true). */
const request = (p: string) => new NextRequest(`${ORIGIN}${p}`, { nextConfig: { trailingSlash: true } })
const hop = async (p: string) => {
  const { proxy } = await import('../../proxy')
  const res = proxy(request(p))
  return { status: res.status, location: res.headers.get('location') }
}
beforeEach(() => vi.resetModules())
afterEach(() => { process.env = { ...env } })

describe('R3.2: ledger redirects emit the approved target byte-exact', () => {
  const CASES: Array<[name: string, row: Redirect, request: string, location: string]> = [
    ['file-extension source → trailing-slash page', { source: '/content/uploads/frpfantypes.jpg', destination: '/frp-fan-blades-guide/', status: 301 }, '/content/uploads/frpfantypes.jpg', '/frp-fan-blades-guide/'],
    ['sized-image source → nested project page', { source: '/content/uploads/ICS_CoolingTowerProject_KBR_stair1.jpg', destination: '/all-projects/kbr/', status: 301 }, '/content/uploads/ICS_CoolingTowerProject_KBR_stair1.jpg', '/all-projects/kbr/'],
    ['percent-encoded PDF source (%20) → mixed-case file target', { source: '/content/uploads/AccuPac%20Film%20Fills%20Brochure.pdf', destination: '/wp-content/uploads/2021/12/AccuPac-Film-Fills-Brochure.pdf', status: 301 }, '/content/uploads/AccuPac%20Film%20Fills%20Brochure.pdf', '/wp-content/uploads/2021/12/AccuPac-Film-Fills-Brochure.pdf'],
    ['file → file with %20 kept in the target', { source: '/content/uploads/Brentwood%20D15.pdf', destination: '/wp-content/uploads/2021/12/Brentwood%20D15.pdf', status: 301 }, '/content/uploads/Brentwood%20D15.pdf', '/wp-content/uploads/2021/12/Brentwood%20D15.pdf'],
    ['trailing-slash page → page', { source: '/cooling-tower-vs-chiller/', destination: '/chiller-and-cooling-tower/', status: 301 }, '/cooling-tower-vs-chiller/', '/chiller-and-cooling-tower/'],
    ['target with a query', { source: '/content/uploads/catalog.pdf', destination: '/resources/?type=brochure', status: 301 }, '/content/uploads/catalog.pdf?utm_source=x', '/resources/?type=brochure'],
    ['request query carried when the target has none', { source: '/content/uploads/frpfantypes.jpg', destination: '/frp-fan-blades-guide/', status: 301 }, '/content/uploads/frpfantypes.jpg?utm_source=x', '/frp-fan-blades-guide/?utm_source=x'],
    ['lower-case escapes in the target kept as written', { source: '/product/dyna-fab-18-height-fan-stack/', destination: '/product/dyna-fab-18%e2%80%b2-height-fan-stack/', status: 301 }, '/product/dyna-fab-18-height-fan-stack/', '/product/dyna-fab-18%e2%80%b2-height-fan-stack/'],
    ['Thai source → Thai target (percent-encoded)', { source: '/th/blog/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD/', destination: '/th/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD/', status: 301 }, '/th/blog/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD/', '/th/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD/'],
    ['Japanese target stored decoded → its percent-encoded form', { source: '/ja/old/', destination: '/ja/冷却塔とは何ですか/', status: 301 }, '/ja/old/', `/ja/${encodeURIComponent('冷却塔とは何ですか')}/`],
    ['Thai file-extension source → Thai page', { source: '/content/uploads/%E0%B8%84%E0%B8%B9.jpg', destination: '/th/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD/', status: 308 }, '/content/uploads/%E0%B8%84%E0%B8%B9.jpg', '/th/%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD/'],
  ]
  for (const [name, row, req, location] of CASES)
    it(name, async () => {
      snapshot([row])
      const res = await hop(req)
      expect(res.status).toBe(301) // R2.4 (item k): every published redirect is a 301, whatever the stored status
      expect(res.location).toBe(`${ORIGIN}${location}`)
    })

  it('the cause: NextURL.clone() drops the target slash for a file-extension source; the fix does not', async () => {
    const req = request('/content/uploads/frpfantypes.jpg')
    const cloned = req.nextUrl.clone()
    cloned.pathname = '/frp-fan-blades-guide/'
    expect(cloned.href).toBe(`${ORIGIN}/frp-fan-blades-guide`)
    const { redirectLocation } = await import('../../redirect-location')
    expect(redirectLocation('/frp-fan-blades-guide/', req)).toBe(`${ORIGIN}/frp-fan-blades-guide/`)
  })

  it('the legacy search redirect keeps /search/ with the query', async () => {
    snapshot([])
    const res = await hop('/?s=fill%20media')
    expect(res.status).toBe(307)
    expect(res.location).toBe(`${ORIGIN}/search/?q=fill+media`)
  })
})

describe('R3.2 checker: every redirect the ledger and the R3 batch carry reaches its target in one hop', () => {
  const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; state: string }>; redirects: Redirect[] }
  const batch = readFileSync(path.join(APP, 'ops/seo-pass/data/redirects.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')).map(([source, destination, status]) => ({ source: source!, destination: destination!, status: Number(status) }))
  const all = [...new Map([...ledger.redirects, ...batch].map((r) => [r.source, r])).values()]
  it('Location is the target exactly, and the target is not itself a redirect source (zero extra hops)', async () => {
    snapshot(all)
    const key = (p: string) => { try { return decodeURIComponent(p) } catch { return p } }
    const sources = new Set(all.map((r) => key(r.source)))
    const problems: string[] = []
    for (const r of all) {
      const res = await hop(r.source)
      if (res.location !== new URL(r.destination, ORIGIN).href) problems.push(`${r.source}: Location ${res.location} ≠ ${r.destination}`)
      if (sources.has(key(r.destination))) problems.push(`${r.source}: target ${r.destination} redirects again`)
      if (!/\.[a-z0-9]{2,5}$/i.test(key(r.destination)) && !r.destination.split('?')[0]!.endsWith('/')) problems.push(`${r.source}: page target without its trailing slash`)
    }
    expect(all.length).toBeGreaterThan(400)
    expect(all.filter((r) => /\.[a-z0-9]{2,5}$/i.test(key(r.source))).length).toBeGreaterThanOrEqual(23)
    expect(problems).toEqual([])
  }, 120000)
})
