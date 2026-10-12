/**
 * CF3-PROD-STEP-1 R2: the targeted production step. Exercised against an in-memory REST fake (the real calls are the same
 * public-routes / public-redirects endpoints apply-seo-pass uses); the Howden page elements are the REAL imported ones, so the
 * recorded "before" values are checked against the import.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { extractSlots } from '../../content/content-slots'
import { storedDocument } from '../../../ops/seo-pass/scan-slots'
import { applyStep, DATA, planStep } from '../../../ops/prod-step/cf3-prod-step-1.mjs'

const APP = process.cwd()
type Rec = Record<string, ReturnType<typeof JSON.parse>>
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; routeId: string; state: string; export: boolean; indexable: boolean; sourceFile?: string }> }
const productIds = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
const realSlots = (p: string) => extractSlots(storedDocument(ledger.routes.find((r) => r.path === p) as never), { productIds }) as Rec[]

const fake = (opts: { description?: string; draft?: boolean; redirects?: Rec[]; editedKey?: string } = {}) => {
  const routes = new Map<string, Rec>()
  const add = (p: string, extra: Rec) => routes.set(p, { id: `id:${p}`, pathKey: p, _status: 'published', updatedAt: 't1', seo: {}, disposition: {}, slots: [], ...extra })
  add(DATA.meta[0].path, { seo: { title: 'Cooling Tower Services|Industrial Cooling Tower - ICS', description: opts.description ?? DATA.meta[0].expectedOld, canonical: 'https://h2ocooling.com/x/' } })
  const seoOf = (p: string) => { const o: Rec = { canonical: 'https://h2ocooling.com/y/' }; for (const m of (DATA.meta as Array<{ path: string; field: string; expectedOld: string | null }>).filter((x) => x.path === p)) if (m.expectedOld !== null) o[m.field] = m.expectedOld; return o }
  for (const p of [...new Set((DATA.meta as Array<{ path: string }>).map((m) => m.path))].slice(1)) add(p, { seo: seoOf(p) })
  for (const page of DATA.slotEdits as Array<{ path: string }>) {
    const slots = realSlots(page.path)
    if (opts.editedKey) { const s = slots.find((x) => x.key === opts.editedKey); if (s) s.text = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Edited by staff', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }], format: '', indent: 0, version: 1, direction: 'ltr' }], format: '', indent: 0, version: 1, direction: 'ltr' } } }
    add(page.path, { slots })
  }
  for (const w of DATA.withdraw as Array<{ path: string; redirect: string }>) add(w.path, { disposition: { state: 'PUBLIC', export: true, indexable: true, sitemap: true, searchable: true, redirect: null, matchedArticle: false, releaseOverride: null } })
  const redirects: Rec[] = [...(opts.redirects ?? [])]
  const calls: string[] = []
  const api = async (p: string, init: { method?: string; body?: string } = {}) => {
    calls.push(`${init.method ?? 'GET'} ${p.split('?')[0]}`)
    const m = /^public-routes\?where\[pathKey\]\[equals\]=([^&]*)&/.exec(p)
    if (m) { const r = routes.get(decodeURIComponent(m[1]!)); if (!r) return { status: 200, body: { docs: [] } }; return { status: 200, body: { docs: [p.includes('draft=true') && opts.draft ? { ...r, _status: 'draft', updatedAt: 't2' } : r] } } }
    if (p.startsWith('public-routes/') && init.method === 'PATCH') { const r = [...routes.values()].find((x) => `public-routes/${x.id}?depth=0` === p)!; Object.assign(r, JSON.parse(init.body!)); return { status: 200, body: r } }
    if (p.startsWith('public-redirects?') && !init.method) return { status: 200, body: { docs: redirects, hasNextPage: false } }
    if (p.startsWith('public-redirects?') && init.method === 'POST') { redirects.push({ id: `d${redirects.length}`, ...JSON.parse(init.body!) }); return { status: 201, body: {} } }
    return { status: 404, body: null }
  }
  return { api, routes, redirects, calls }
}

describe('CF3-PROD-STEP-1 R2', () => {
  it('the data matches the repository: meta rows, eight redirects (batch rows), three withdrawals (dispositions), six page-element edits (slot fixes)', () => {
    const tsv = (f: string) => readFileSync(path.join(APP, 'ops/seo-pass/data', f), 'utf8').split('\n').map((l) => l.split('\t'))
    for (const m of DATA.meta as Array<{ path: string; field: string; new: string }>) expect(tsv('seo-fields.tsv').find((c) => c[0] === m.path)![m.field === 'title' ? 3 : 4], `${m.path} ${m.field}`).toBe(m.new)
    expect(DATA.meta).toHaveLength(5)
    expect(DATA.redirects).toHaveLength(8)
    for (const r of DATA.redirects as Array<{ source: string; destination: string }>) expect(tsv('redirects.tsv').find((c) => c[0] === r.source)?.[1], r.source).toBe(r.destination)
    for (const w of DATA.withdraw as Array<{ path: string; redirect: string }>) expect(tsv('route-dispositions.tsv').find((c) => c[0] === w.path)?.slice(2, 4), w.path).toEqual(['WITHDRAW_TO_REDIRECT', w.redirect])
    const fixes = JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), 'utf8')) as Record<string, { slots: Array<{ key: string; before: string; afterCanon: string }> }>
    const rows = (DATA.slotEdits as Array<{ path: string; fixes: Array<{ key: string; before: string; afterCanon: string; row: string }> }>).flatMap((p) => p.fixes.map((f) => ({ ...f, path: p.path })))
    expect(rows.map((r) => r.row.split(' ')[0]).sort()).toEqual(['COUNTRY-LINK', 'HWD-01', 'HWD-02', 'HWD-03', 'HWS-01', 'HWS-02'])
    for (const r of rows) expect(fixes[r.path]!.slots.find((s) => s.key === r.key), `${r.row}`).toMatchObject({ before: r.before, afterCanon: r.afterCanon })
  })
  it('dry run lists every item and writes nothing; expected counts 5 meta, 6 text edits (5 Howden + 1 link repoint), 8 redirects, 3 route withdrawals', async () => {
    const f = fake()
    const plan = await planStep(f.api)
    expect(plan.counts).toEqual({ meta: 5, slotEdits: 6, redirects: 8, retire: 0, withdraw: 3, unchanged: 0, refused: 0 })
    const text = plan.lines.join('\n')
    expect(text).toContain(`old: ${DATA.meta[0].expectedOld}`)
    expect(text).toContain('TEXT HWD-01')
    expect(text).toContain('TEXT HWS-02')
    expect(text).toContain('ROUTE /rt-portfolios/ptt-gsp3-fan-upgrade/ -> REDIRECT /all-projects/ptt-csp3/')
    expect(f.calls.some((c) => c.startsWith('PATCH') || c.startsWith('POST'))).toBe(false)
  })
  it('apply writes once (redirects, page-element edits, meta, withdrawals) and the rerun is 0 changes', async () => {
    const f = fake()
    const res = await applyStep(f.api, await planStep(f.api))
    expect(res.problems).toEqual([])
    expect(f.redirects).toHaveLength(8)
    expect(f.routes.get(DATA.meta[0].path)!.seo.description).toBe(DATA.meta[0].new)
    expect(f.routes.get(DATA.meta[0].path)!.seo.canonical).toBe('https://h2ocooling.com/x/')
    for (const m of DATA.meta as Array<{ path: string; field: string; new: string }>) expect(f.routes.get(m.path)!.seo[m.field], `${m.path} ${m.field}`).toBe(m.new) // two fields of one route arrive together
    for (const w of DATA.withdraw as Array<{ path: string; redirect: string }>) {
      const r = f.routes.get(w.path)!
      expect(r._status).toBe('draft')
      expect(r.disposition).toMatchObject({ state: 'REDIRECT', export: false, indexable: false, sitemap: false, searchable: false, redirect: w.redirect })
    }
    for (const page of DATA.slotEdits as Array<{ path: string; fixes: Array<{ key: string }> }>) {
      const r = f.routes.get(page.path)!
      expect(r._status).toBe('published')
      expect(r.slots.length).toBe(realSlots(page.path).length) // the element list keeps its size and order
      const changed = r.slots.filter((s: Rec, i: number) => JSON.stringify(s) !== JSON.stringify(realSlots(page.path)[i]))
      expect(changed.map((s: Rec) => s.key).sort()).toEqual(page.fixes.map((x) => x.key).sort())
    }
    const again = await planStep(f.api)
    expect(again.counts).toEqual({ meta: 0, slotEdits: 0, redirects: 0, retire: 0, withdraw: 0, unchanged: 22, refused: 0 })
  })
  it('refuses an edited meta, an edited Howden element, a pending editor draft and a redirect with another destination', async () => {
    expect((await planStep(fake({ description: 'Edited by staff.' }).api)).meta[0].action).toBe('REFUSE')
    const key = (DATA.slotEdits as Array<{ fixes: Array<{ key: string }> }>)[0]!.fixes[0]!.key
    const edited = await planStep(fake({ editedKey: key }).api)
    expect(edited.slotEdits.find((s: Rec) => s.key === key && s.action === 'REFUSE')?.reason).toMatch(/edited since/)
    expect(edited.counts.refused).toBe(1)
    const draft = await planStep(fake({ draft: true }).api)
    expect(draft.meta[0]).toMatchObject({ action: 'REFUSE', reason: 'unpublished editor draft pending' })
    expect(draft.counts.refused).toBeGreaterThanOrEqual(5 + 5)
    const other = await planStep(fake({ redirects: [{ id: 'x', source: '/about/', destination: '/somewhere-else/', active: true }] }).api)
    expect(other.redirects.find((r: Rec) => r.source === '/about/')).toMatchObject({ action: 'REFUSE' })
  })
  it('a record with the same destination is unchanged (not duplicated)', async () => {
    const f = fake({ redirects: [{ id: 'x', source: '/about/', destination: '/about-ics-industrial-cooling-solutions/', active: true }] })
    const plan = await planStep(f.api)
    expect(plan.redirects.find((r: Rec) => r.source === '/about/')).toMatchObject({ action: 'UNCHANGED' })
    expect(plan.counts.redirects).toBe(7)
  })
})
