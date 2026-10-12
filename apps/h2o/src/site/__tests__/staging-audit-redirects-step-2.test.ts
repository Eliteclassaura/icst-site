/** STAGING-AUDIT-REDIRECTS-1: the targeted production step, against an in-memory REST fake (the engine is cf3-prod-step-1's). */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { extractSlots } from '../../content/content-slots'
import { storedDocument } from '../../../ops/seo-pass/scan-slots'
import { applyStep, planStep } from '../../../ops/prod-step/cf3-prod-step-1.mjs'
import { DATA2 } from '../../../ops/prod-step/staging-audit-redirects-step-2.mjs'

const APP = process.cwd()
type Rec = Record<string, ReturnType<typeof JSON.parse>>
const SG = '/cooling-tower-singapore/'
const BR = '/product/brentwood-cf150max-cellular-drift-eliminator/'
const ledger0 = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; routeId: string; state: string; export: boolean }> }
const productIds = new Map(ledger0.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
const realSlots = (p: string) => extractSlots(storedDocument(ledger0.routes.find((r) => r.path === p) as never), { productIds }) as Rec[]
const slotFixes = JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), 'utf8')) as Record<string, { slots: Array<{ key: string; after: unknown; afterCanon: string }> }>
type MetaRow = { path: string; field: 'title' | 'description'; expectedOld: string | null; new: string }
const fake = (opts: { redirects?: Rec[]; draft?: boolean; withdrawn?: boolean; editedTitle?: string; editedH1?: boolean } = {}) => {
  const route: Rec = { id: 'id:sg', pathKey: SG, _status: opts.withdrawn ? 'draft' : 'published', updatedAt: 't1', seo: {}, slots: [], disposition: { state: opts.withdrawn ? 'REDIRECT' : 'PUBLIC', export: !opts.withdrawn, indexable: true, sitemap: true, searchable: true, redirect: null } }
  const routes = new Map<string, Rec>([[SG, route]])
  for (const w of DATA2.withdraw as Array<{ path: string }>) if (w.path !== SG) routes.set(w.path, { id: `id:${w.path}`, pathKey: w.path, _status: 'published', updatedAt: 't1', seo: {}, slots: [], disposition: { state: 'PUBLIC', export: true, indexable: true, sitemap: true, searchable: true, redirect: null } })
  for (const p of new Set((DATA2.meta as MetaRow[]).map((m) => m.path))) {
    const seo: Rec = { canonical: 'https://h2ocooling.com/x/' }
    for (const m of (DATA2.meta as MetaRow[]).filter((x) => x.path === p)) if (m.expectedOld !== null) seo[m.field] = m.expectedOld
    if (opts.editedTitle === p) seo.title = 'Edited by staff'
    routes.set(p, { id: `id:${p}`, pathKey: p, _status: 'published', updatedAt: 't1', seo, slots: [], disposition: {} })
  }
  // every page element the step edits: the imported value, or (FBG rows composed onto the SEO batch) the batch result the step's `before` names
  for (const page of DATA2.slotEdits as Array<{ path: string; fixes: Array<{ key: string; field: string; before: string }> }>) {
    const slots = realSlots(page.path)
    for (const f of page.fixes) {
      const batch = slotFixes[page.path]?.slots.find((x) => x.key === f.key && x.afterCanon === f.before)
      const slot = slots.find((x) => x.key === f.key)
      if (batch && slot) slot[f.field] = batch.after
    }
    routes.set(page.path, { id: `id:${page.path}`, pathKey: page.path, _status: 'published', updatedAt: 't1', seo: routes.get(page.path)?.seo ?? {}, slots, disposition: {} })
  }
  const br = routes.get(BR)!
  if (opts.editedH1) { const h = br.slots.find((x: Rec) => x.key === 'body.1.1.1.1.1'); if (h) h.heading = 'Brentwood by staff' }
  const redirects: Rec[] = [{ id: 'old-hybrid', source: '/hybrid-cooling-tower/', destination: '/hybrid-cooling-tower-repair/', active: true }, ...(opts.redirects ?? [])] // the review/prod database holds the old redirect record (authority import)
  const api = async (p: string, init: { method?: string; body?: string } = {}) => {
    const m = /^public-routes\?where\[pathKey\]\[equals\]=([^&]*)&/.exec(p)
    if (m) { const r = routes.get(decodeURIComponent(m[1]!)); return { status: 200, body: { docs: r ? [p.includes('draft=true') && opts.draft && decodeURIComponent(m[1]!) === SG ? { ...r, _status: 'draft', updatedAt: 't2' } : { ...r }] : [] } } }
    if (p.startsWith('public-routes/') && init.method === 'PATCH') { const r = [...routes.values()].find((x) => `public-routes/${x.id}?depth=0` === p)!; Object.assign(r, JSON.parse(init.body!)); return { status: 200, body: {} } }
    if (p.startsWith('public-redirects/') && init.method === 'PATCH') { const r = redirects.find((x) => `public-redirects/${x.id}?depth=0` === p); if (!r) return { status: 404, body: null }; Object.assign(r, JSON.parse(init.body!)); return { status: 200, body: {} } }
    if (p.startsWith('public-redirects?') && !init.method) return { status: 200, body: { docs: redirects, hasNextPage: false } }
    if (p.startsWith('public-redirects?') && init.method === 'POST') { redirects.push({ id: `d${redirects.length}`, ...JSON.parse(init.body!) }); return { status: 201, body: {} } }
    return { status: 404, body: null }
  }
  return { api, route, redirects, routes }
}

describe('STAGING-AUDIT-REDIRECTS-1 prod step', () => {
  it('the data is exactly the release data: 25 redirects, 18 SEO fields and one page element (batch rows), seven withdrawals and one retired redirect (disposition)', () => {
    const tsv = (f: string) => readFileSync(path.join(APP, 'ops/seo-pass/data', f), 'utf8').split('\n').map((l) => l.split('\t'))
    expect(DATA2.redirects).toHaveLength(25)
    for (const r of DATA2.redirects as Array<{ source: string; destination: string }>) expect(tsv('redirects.tsv').find((c) => c[0] === r.source)?.slice(1, 4), r.source).toEqual([r.destination, '301', 'CREATE'])
    expect(DATA2.withdraw).toHaveLength(7)
    expect(DATA2.retireRedirects).toEqual([{ source: '/hybrid-cooling-tower/', destination: '/hybrid-cooling-tower-repair/' }])
    expect((DATA2.withdraw as Array<{ path: string }>)[0]).toEqual({ path: SG, redirect: '/cooling-tower-construction-repair-in-singapore/' })
    for (const w of DATA2.withdraw as Array<{ path: string; redirect: string }>) expect(tsv('route-dispositions.tsv').find((c) => c[0] === w.path)?.slice(2, 4), w.path).toEqual(['WITHDRAW_TO_REDIRECT', w.redirect])
    const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; state: string; redirect?: string | null }>; redirects: Array<{ source: string; destination: string }> }
    for (const r of DATA2.redirects as Array<{ source: string; destination: string }>) {
      // the withdrawn page is a REDIRECT route row (like /thailand-cooling-tower/); the others are ledger redirects
      const viaRoute = ledger.routes.find((x) => x.path === r.source)
      expect(viaRoute ? viaRoute.redirect : ledger.redirects.find((x) => x.source === r.source)?.destination, `ledger ${r.source}`).toBe(r.destination)
      expect(ledger.routes.find((x) => x.path === r.destination)?.state, `destination ${r.destination}`).toBe('PUBLIC') // never a redirect, never home
      expect(r.destination).not.toBe('/')
    }
  })
  it('dry run writes nothing (78 changes: 19 SEO fields + 26 page elements (FBG-CONTENT-1) + 25 redirects + 7 withdrawals + 1 retired redirect); apply writes once; the rerun is 78 x UNCHANGED', async () => {
    const f = fake()
    const plan = await planStep(f.api, DATA2)
    expect(plan.counts).toMatchObject({ meta: 19, slotEdits: 26, redirects: 25, retire: 1, withdraw: 7, unchanged: 0, refused: 0 })
    expect(f.redirects).toHaveLength(1) // only the old record
    const res = await applyStep(f.api, plan, DATA2)
    expect(res.problems).toEqual([])
    expect(f.redirects).toHaveLength(26) // the old record + 25 created
    expect(f.redirects.find((r) => r.id === 'old-hybrid')).toMatchObject({ active: false }) // retired, not deleted
    expect(f.redirects.filter((r) => r.id !== 'old-hybrid').every((r) => r.status === '301' && r.active === true && /STAGING-AUDIT-REDIRECTS-1/.test(r.authority))).toBe(true)
    expect(f.route.disposition).toMatchObject({ state: 'REDIRECT', export: false, indexable: false, sitemap: false, redirect: '/cooling-tower-construction-repair-in-singapore/' })
    const again = await planStep(f.api, DATA2)
    expect(again.counts).toMatchObject({ meta: 0, slotEdits: 0, redirects: 0, retire: 0, withdraw: 0, unchanged: 78, refused: 0 })
    // what was written: each title/description is exactly the new text, the Brentwood H1 is CF150MAX, other SEO fields are untouched
    for (const m of DATA2.meta as MetaRow[]) expect((f.routes.get(m.path)!.seo as Rec)[m.field], `${m.path} ${m.field}`).toBe(m.new)
    expect(f.routes.get(BR)!.slots.find((x: Rec) => x.key === 'body.1.1.1.1.1')!.heading).toBe('Brentwood CF150MAX Cellular Drift Eliminator')
    expect((f.routes.get(BR)!.seo as Rec).canonical).toBe('https://h2ocooling.com/x/')
  })
  it('refuses: a redirect record with another destination, an inactive one, and a pending editor draft on the Singapore page', async () => {
    const other = await planStep(fake({ redirects: [{ id: 'x', source: '/blog/', destination: '/home-ish/' }] }).api, DATA2)
    expect(other.counts.refused).toBe(1)
    const inactive = await planStep(fake({ redirects: [{ id: 'y', source: '/tools/', destination: '/resources/tools/', active: false }] }).api, DATA2)
    expect(inactive.counts.refused).toBe(1)
    const draft = await planStep(fake({ draft: true }).api, DATA2)
    expect(draft.withdraw[0]).toMatchObject({ action: 'REFUSE', reason: 'unpublished editor draft pending' })
  })
  it('refuses an edited title and an edited Brentwood H1 (not overwritten), and applies nothing', async () => {
    const t = await planStep(fake({ editedTitle: '/product/tuf-lite-ii-5000h-series-hub-fan-assemblies/' }).api, DATA2)
    expect(t.counts.refused).toBe(1)
    expect(t.meta.find((m: { action: string }) => m.action === 'REFUSE')).toMatchObject({ path: '/product/tuf-lite-ii-5000h-series-hub-fan-assemblies/', field: 'title' })
    const h = await planStep(fake({ editedH1: true }).api, DATA2)
    expect(h.counts.refused).toBe(1)
    expect(h.slotEdits[0]).toMatchObject({ action: 'REFUSE' })
  })
  it('the SEO rows match the release data (seo-fields.tsv) and the OGCS text: no commercial / OEM / worldwide wording, the TUF-LITE II/III titles keep "Cooling Tower Fans"', () => {
    const tsv = readFileSync(path.join(APP, 'ops/seo-pass/data/seo-fields.tsv'), 'utf8').split('\n').map((l) => l.split('\t'))
    for (const m of DATA2.meta as MetaRow[]) expect(tsv.find((c) => c[0] === m.path)![m.field === 'title' ? 3 : 4], `${m.path} ${m.field}`).toBe(m.new)
    const titles = (DATA2.meta as MetaRow[]).filter((m) => m.field === 'title')
    expect(titles.filter((m) => /tuf-lite/.test(m.path)).every((m) => / \| Cooling Tower Fans$/.test(m.new))).toBe(true)
    expect(titles.filter((m) => /tuf-lite/.test(m.path))).toHaveLength(11)
    for (const m of (DATA2.meta as MetaRow[]).filter((x) => x.field === 'description')) expect(m.new, m.path).not.toMatch(/commercial|OEM|worldwide|warranty/i)
  })
  it('the old /hybrid-cooling-tower/ redirect record is retired (inactive, not deleted); another destination or no record is not ours: refused / unchanged', async () => {
    const f = fake()
    const plan = await planStep(f.api, DATA2)
    const retire = (plan.redirects as Array<{ source: string; action: string }>).find((r) => r.source === '/hybrid-cooling-tower/')
    expect(retire?.action).toBe('RETIRE')
    const other = fake(); other.redirects[0]!.destination = '/somewhere-else/'
    expect(((await planStep(other.api, DATA2)).redirects as Array<{ source: string; action: string }>).find((r) => r.source === '/hybrid-cooling-tower/')?.action).toBe('REFUSE')
    const none = fake(); none.redirects.length = 0
    expect(((await planStep(none.api, DATA2)).redirects as Array<{ source: string; action: string }>).find((r) => r.source === '/hybrid-cooling-tower/')?.action).toBe('UNCHANGED')
  })
  it('an already-existing identical record and an already-withdrawn page are UNCHANGED', async () => {
    const plan = await planStep(fake({ withdrawn: true, redirects: [{ id: 'z', source: '/blog/', destination: '/tech-articles/', active: true }] }).api, DATA2)
    expect((plan.redirects as Array<{ source: string; action: string }>).find((r) => r.source === '/blog/')?.action).toBe('UNCHANGED')
    expect(plan.withdraw[0]?.action).toBe('UNCHANGED')
  })
})
