/** STAGING-AUDIT-REDIRECTS-1: the targeted production step, against an in-memory REST fake (the engine is cf3-prod-step-1's). */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { applyStep, planStep } from '../../../ops/prod-step/cf3-prod-step-1.mjs'
import { DATA2 } from '../../../ops/prod-step/staging-audit-redirects-step-2.mjs'

const APP = process.cwd()
type Rec = Record<string, ReturnType<typeof JSON.parse>>
const SG = '/cooling-tower-singapore/'
const fake = (opts: { redirects?: Rec[]; draft?: boolean; withdrawn?: boolean } = {}) => {
  const route: Rec = { id: 'id:sg', pathKey: SG, _status: opts.withdrawn ? 'draft' : 'published', updatedAt: 't1', seo: {}, slots: [], disposition: { state: opts.withdrawn ? 'REDIRECT' : 'PUBLIC', export: !opts.withdrawn, indexable: true, sitemap: true, searchable: true, redirect: null } }
  const redirects: Rec[] = [...(opts.redirects ?? [])]
  const api = async (p: string, init: { method?: string; body?: string } = {}) => {
    const m = /^public-routes\?where\[pathKey\]\[equals\]=([^&]*)&/.exec(p)
    if (m) return { status: 200, body: { docs: decodeURIComponent(m[1]!) === SG ? [p.includes('draft=true') && opts.draft ? { ...route, _status: 'draft', updatedAt: 't2' } : { ...route }] : [] } }
    if (p.startsWith('public-routes/') && init.method === 'PATCH') { Object.assign(route, JSON.parse(init.body!)); return { status: 200, body: {} } }
    if (p.startsWith('public-redirects?') && !init.method) return { status: 200, body: { docs: redirects, hasNextPage: false } }
    if (p.startsWith('public-redirects?') && init.method === 'POST') { redirects.push({ id: `d${redirects.length}`, ...JSON.parse(init.body!) }); return { status: 201, body: {} } }
    return { status: 404, body: null }
  }
  return { api, route, redirects }
}

describe('STAGING-AUDIT-REDIRECTS-1 prod step', () => {
  it('the data is exactly the release data: fifteen redirects (batch rows) and one withdrawal (disposition)', () => {
    const tsv = (f: string) => readFileSync(path.join(APP, 'ops/seo-pass/data', f), 'utf8').split('\n').map((l) => l.split('\t'))
    expect(DATA2.redirects).toHaveLength(15)
    for (const r of DATA2.redirects as Array<{ source: string; destination: string }>) expect(tsv('redirects.tsv').find((c) => c[0] === r.source)?.slice(1, 4), r.source).toEqual([r.destination, '301', 'CREATE'])
    expect(DATA2.withdraw).toEqual([{ path: SG, redirect: '/cooling-tower-construction-repair-in-singapore/' }])
    expect(tsv('route-dispositions.tsv').find((c) => c[0] === SG)?.slice(2, 4)).toEqual(['WITHDRAW_TO_REDIRECT', '/cooling-tower-construction-repair-in-singapore/'])
    const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; state: string; redirect?: string | null }>; redirects: Array<{ source: string; destination: string }> }
    for (const r of DATA2.redirects as Array<{ source: string; destination: string }>) {
      // the withdrawn page is a REDIRECT route row (like /thailand-cooling-tower/); the others are ledger redirects
      const viaRoute = ledger.routes.find((x) => x.path === r.source)
      expect(viaRoute ? viaRoute.redirect : ledger.redirects.find((x) => x.source === r.source)?.destination, `ledger ${r.source}`).toBe(r.destination)
      expect(ledger.routes.find((x) => x.path === r.destination)?.state, `destination ${r.destination}`).toBe('PUBLIC') // never a redirect, never home
      expect(r.destination).not.toBe('/')
    }
  })
  it('dry run writes nothing (16 changes: 15 redirects + 1 withdrawal); apply writes once; the rerun is 16 x UNCHANGED', async () => {
    const f = fake()
    const plan = await planStep(f.api, DATA2)
    expect(plan.counts).toMatchObject({ redirects: 15, withdraw: 1, unchanged: 0, refused: 0 })
    expect(f.redirects).toHaveLength(0)
    const res = await applyStep(f.api, plan, DATA2)
    expect(res.problems).toEqual([])
    expect(f.redirects).toHaveLength(15)
    expect(f.redirects.every((r) => r.status === '301' && r.active === true && /STAGING-AUDIT-REDIRECTS-1/.test(r.authority))).toBe(true)
    expect(f.route.disposition).toMatchObject({ state: 'REDIRECT', export: false, indexable: false, sitemap: false, redirect: '/cooling-tower-construction-repair-in-singapore/' })
    const again = await planStep(f.api, DATA2)
    expect(again.counts).toMatchObject({ redirects: 0, withdraw: 0, unchanged: 16, refused: 0 })
  })
  it('refuses: a redirect record with another destination, an inactive one, and a pending editor draft on the Singapore page', async () => {
    const other = await planStep(fake({ redirects: [{ id: 'x', source: '/blog/', destination: '/home-ish/' }] }).api, DATA2)
    expect(other.counts.refused).toBe(1)
    const inactive = await planStep(fake({ redirects: [{ id: 'y', source: '/tools/', destination: '/resources/tools/', active: false }] }).api, DATA2)
    expect(inactive.counts.refused).toBe(1)
    const draft = await planStep(fake({ draft: true }).api, DATA2)
    expect(draft.withdraw[0]).toMatchObject({ action: 'REFUSE', reason: 'unpublished editor draft pending' })
  })
  it('an already-existing identical record and an already-withdrawn page are UNCHANGED', async () => {
    const plan = await planStep(fake({ withdrawn: true, redirects: [{ id: 'z', source: '/blog/', destination: '/tech-articles/', active: true }] }).api, DATA2)
    expect((plan.redirects as Array<{ source: string; action: string }>).find((r) => r.source === '/blog/')?.action).toBe('UNCHANGED')
    expect(plan.withdraw[0]?.action).toBe('UNCHANGED')
  })
})
