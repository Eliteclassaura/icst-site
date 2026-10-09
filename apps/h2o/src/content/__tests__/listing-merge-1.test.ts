/**
 * LISTING-MERGE-1.1: the base-aware production step that applies catalog-listing changes to held listing records without overwriting edited page
 * elements, and without refusing a record just because its stored structure differs from the current authority in other, legitimate ways
 * (a later bundle, a newer projection of the same source). Pure planning (no database): stored record in, merge plan out.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { extractSlots, type ContentSlot } from '../content-slots'
import { importedDocument, mergeListings, planListingMerge, type StoredListing } from '../import/listing-merge'
import { storedDocument } from '../../../ops/seo-pass/scan-slots'

type Doc = Record<string, unknown>
const APP = process.cwd()
const el = (tag: string, children: unknown[], attrs: Record<string, string> = {}) => ({ tag, attrs, children })
const card = (n: number) => el('li', [el('a', [el('h2', [`Product ${n}`])], { href: `https://example.test/product/p${n}/` })], { class: `product post-${n}`, 'data-id': `e${n}` })
const doc = (cards: number[], counts: string, extra: Record<string, unknown> = {}, closing = 'Closing words about fans.'): Doc => ({
  routeId: 'SALMON-test', title: 'Fans', type: 'pages', targetPath: '/test/', sourceUrl: 'https://example.test/test/', seo: { title: 'T', h1: ['Fans'], meta: [], schema: [] },
  children: [el('main', [el('h1', ['Fans']), el('p', [counts]), el('ul', ['\n', ...cards.flatMap((c) => [card(c), '\n'])], { class: 'products' }), el('p', [closing])])],
  images: cards.map((c) => ({ order: c, src: `/media/p${c}.jpg` })), links: cards.map((c) => ({ order: c, href: `https://example.test/product/p${c}/` })), ...extra,
})
const products = new Map<string, string>()
const stored = (document: Doc, slots: ContentSlot[], sha = 'old'): StoredListing => ({ id: 1, routeId: 'SALMON-test', path: '/test/', document, slots, source: { sourceSha256: sha }, disposition: { state: 'PUBLIC' } })
const edit = (slots: ContentSlot[], pick: (s: ContentSlot) => boolean, change: (s: ContentSlot) => void) => { const c = structuredClone(slots); change(c.find(pick)!); return c }
const slotsOf = (d: Doc) => extractSlots(d, { productIds: products })
const countSlot = (s: ContentSlot) => /Showing/.test(JSON.stringify(s.text ?? ''))

describe('LISTING-MERGE-1.1: planListingMerge (three-way per element)', () => {
  const oldDoc = doc([1, 2], 'Showing all 2 results'), newDoc = doc([1, 2, 3], 'Showing all 3 results')
  const fresh = slotsOf(oldDoc)
  it('adds the card, takes the unedited count, keeps an edited element, and reports each part', () => {
    const edited = edit(fresh, (s) => s.tag === 'h1', (s) => { s.heading = 'Fans (staff)' })
    const plan = planListingMerge(stored(oldDoc, edited), newDoc, 'new', products)
    expect(plan.report.action).toBe('MERGE')
    expect(plan.report.refusedElements).toEqual([])
    expect(plan.report.newElements.length).toBeGreaterThan(0)
    expect(plan.report.newElements.some((n) => n.title.includes('Product 3'))).toBe(true)
    expect(plan.report.takenElements).toHaveLength(1)
    expect(plan.report.countChanges).toEqual([{ before: 'Showing all 2 results', after: 'Showing all 3 results' }])
    expect(plan.document).toBe(newDoc)
    expect(plan.slots!.map((s) => s.key)).toEqual(slotsOf(newDoc).map((s) => s.key))
    expect(plan.slots!.find((s) => s.tag === 'h1')!.heading).toBe('Fans (staff)')
    expect(plan.report.keptEditedElements).toBe(1)
  })
  it('refuses ONLY an element whose source changed and that was edited (the count line); everything else still merges', () => {
    const edited = edit(fresh, countSlot, (s) => { s.text = JSON.parse(JSON.stringify(s.text).replace('Showing all 2 results', 'Showing everything')) })
    const plan = planListingMerge(stored(oldDoc, edited), newDoc, 'new', products)
    expect(plan.report.action).toBe('MERGE_PARTIAL')
    expect(plan.report.refusedElements).toHaveLength(1)
    expect(plan.report.refusedElements[0]!.reason).toMatch(/source changed AND it was edited/)
    expect(JSON.stringify(plan.slots!.find(countSlot)!.text)).toContain('Showing everything') // the stored value is kept
    expect(plan.report.newElements.length).toBeGreaterThan(0) // the added card still arrives
    expect(plan.document).toBe(newDoc)
  })
  it('does not refuse other, legitimate source differences: other document fields, image/link records, a reworded paragraph (taken), a removed unedited element (dropped)', () => {
    const base = doc([1, 2], 'Showing all 2 results', { seo: { title: 'Old title', h1: ['Fans'], meta: [], schema: [] }, chrome: { a: 1 }, downloads: [] }, 'Closing words about fans, old wording.')
    const theirs = doc([1, 2, 3], 'Showing all 3 results', { seo: { title: 'New title', h1: ['Fans'], meta: [], schema: [] }, chrome: { a: 2 }, downloads: [{ href: '/x.pdf' }], links: [{ order: 9, href: 'https://example.test/other/' }] })
    const plan = planListingMerge(stored(base, slotsOf(base)), theirs, 'new', products)
    expect(plan.report.action).toBe('MERGE')
    expect(plan.report.refusals).toEqual([])
    expect(plan.report.documentFieldsChanged).toEqual(expect.arrayContaining(['seo', 'chrome', 'downloads', 'links']))
    expect(plan.report.takenElements.some((n) => n.title.includes('Closing words'))).toBe(true)
    const withExtra = doc([1, 2], 'Showing all 2 results'); (withExtra.children as Array<{ children: unknown[] }>)[0]!.children.push(el('p', ['A line the new source no longer has.']))
    const dropped = planListingMerge(stored(withExtra, slotsOf(withExtra)), newDoc, 'new', products)
    expect(dropped.report.action).toBe('MERGE')
    expect(dropped.report.droppedElements.map((d) => d.title).join(' ')).toContain('A line the new source no longer has.')
  })
  it('a source-changed element that staff also edited is refused alone; a removed element that staff edited refuses the route (the edit would be lost)', () => {
    const base = doc([1, 2], 'Showing all 2 results', {}, 'Closing words, old.')
    const theirs = doc([1, 2], 'Showing all 2 results', {}, 'Closing words, new.')
    const baseSlots = slotsOf(base)
    const edited = edit(baseSlots, (s) => /Closing/.test(JSON.stringify(s.text ?? '')), (s) => { s.text = JSON.parse(JSON.stringify(s.text).replace('old', 'staff')) })
    const partial = planListingMerge(stored(base, edited), theirs, 'new', products)
    expect(partial.report.action).toBe('MERGE_PARTIAL')
    expect(partial.report.refusedElements).toHaveLength(1)
    const withExtra = doc([1, 2], 'Showing all 2 results'); (withExtra.children as Array<{ children: unknown[] }>)[0]!.children.push(el('p', ['Only in the old structure.']))
    const editedExtra = edit(slotsOf(withExtra), (s) => /Only in the old/.test(JSON.stringify(s.text ?? '')), (s) => { s.text = JSON.parse(JSON.stringify(s.text).replace('Only in the old structure.', 'Staff rewrote it.')) })
    const refused = planListingMerge(stored(withExtra, editedExtra), doc([1, 2], 'Showing all 2 results'), 'new', products)
    expect(refused.report.action).toBe('REFUSE')
    expect(refused.slots).toBeUndefined()
  })
  it('a card inserted BEFORE an existing, edited card shifts the element keys: the edit follows its element to the new key', () => {
    const o = doc([1, 2], 'Showing all 2 results'), n = doc([1, 3, 2], 'Showing all 3 results')
    const card2 = (s: ContentSlot) => s.label === 'Product 2' || s.label === 'Product Two (staff)'
    const edited = edit(slotsOf(o), card2, (s) => { s.label = 'Product Two (staff)' })
    const plan = planListingMerge(stored(o, edited), n, 'new', products)
    expect(plan.report.refusedElements).toEqual([])
    const kept = plan.slots!.find((s) => s.label === 'Product Two (staff)')!
    expect(kept.key).toBe(slotsOf(n).find(card2)!.key)
    expect(kept.key).not.toBe(edited.find(card2)!.key)
    expect(plan.slots!.map((s) => s.key)).toEqual(slotsOf(n).map((s) => s.key))
  })
  it('is idempotent: the same source hash is UNCHANGED, and a merged record merges to UNCHANGED', () => {
    expect(planListingMerge(stored(oldDoc, fresh, 'same'), newDoc, 'same', products).report.action).toBe('UNCHANGED')
    const plan = planListingMerge(stored(oldDoc, fresh), newDoc, 'new', products)
    expect(planListingMerge(stored(plan.document!, plan.slots!, plan.sourceSha256), newDoc, 'new', products).report.action).toBe('UNCHANGED')
  })
})

describe('LISTING-MERGE-1.1: the four real held listing records, stored by an older import than the authority', () => {
  const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; routeId: string; state: string; export: boolean; indexable: boolean; sourceFile?: string; sourceSha256?: string; matchedArticle?: boolean }> }
  const config = JSON.parse(readFileSync(path.join(APP, 'content/release/listing-merge.json'), 'utf8')) as { routes: string[] }
  const productIds = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
  const ADDED = /\bpost-49\d\d\b/
  const PATHS = ['/fans/', '/product-category/fans/', '/product-category/fans/page/2/', '/product-tag/hudson/']
  /** The record as an older import stored it: the added cards removed, the counts back, and the differences Commander saw on the review database (other document fields, an image/link record, a reworded node). */
  /** modes: 'all' = stored before CATALOG-FANS-1, authority current; 'fans2' = stored with FANS-1 merged, authority current (+10); 'fans1' = stored before FANS-1, authority = FANS-1 only (+1). */
  type Mode = 'all' | 'fans2' | 'fans1'
  const REMOVE: Record<Mode, { stored: RegExp; theirs: RegExp | null }> = { all: { stored: ADDED, theirs: null }, fans2: { stored: /\bpost-49(?:0[1-9]|10)\b/, theirs: null }, fans1: { stored: ADDED, theirs: /\bpost-49(?:0[1-9]|10)\b/ } }
  const reshape = (d: Doc & { children: unknown[]; images?: unknown[]; links?: unknown[] }, re: RegExp, shift: number) => {
    let removed = 0
    const strip = (n: unknown): unknown => {
      if (!n || typeof n !== 'object') return n
      const e = n as { children?: unknown[] }
      if (e.children) e.children = e.children.filter((c) => { if (c && typeof c === 'object' && re.test((c as { attrs?: { class?: string } }).attrs?.class ?? '')) { removed++; return false } return true }).map(strip)
      return e
    }
    const fix = (n: unknown): unknown => {
      if (typeof n === 'string') return n.replace(/Showing all (\d+) results/, (_m, t) => `Showing all ${Number(t) - shift} results`).replace(/Showing (\d+)–(\d+) of (\d+) results/, (_m, a, b, t) => `Showing ${a}–${Math.min(Number(b), Number(t) - shift)} of ${Number(t) - shift} results`)
      if (n && typeof n === 'object') { const e = n as { children?: unknown[] }; if (e.children) e.children = e.children.map(fix) }
      return n
    }
    d.children = d.children.map(strip).map(fix)
    return removed
  }
  const olderStored = (p: string, shift: number, perturb = true, mode: Mode = 'all') => {
    const row = ledger.routes.find((r) => r.path === p)!
    const current = importedDocument(APP, row, productIds) as Doc & { children: unknown[]; images?: unknown[]; links?: unknown[] }
    const { stored: reStored, theirs: reTheirs } = REMOVE[mode]
    const newDoc = structuredClone(current)
    const theirsRemoved = reTheirs ? reshape(newDoc, reTheirs, 10) : 0
    const old = structuredClone(current)
    const removed = reshape(old, reStored, shift) - theirsRemoved
    const gone = (x: unknown) => reStored.test(JSON.stringify(x)) || /tuf-lite-iv/.test(JSON.stringify(x))
    old.images = (old.images ?? []).filter((i) => !gone(i))
    old.links = (old.links ?? []).filter((l) => !gone(l))
    if (perturb) {
      old.seo = { ...(old.seo as Record<string, unknown>), title: 'An older stored title' }
      old.chrome = { older: true }
      old.downloads = [{ href: '/older.pdf' }]
      if (old.links!.length) old.links![0] = { ...(old.links![0] as Record<string, unknown>), href: 'https://older.example/' }
    }
    const slots = slotsOf2(old, productIds)
    return { row, newDoc, old, slots, removed }
  }
  const slotsOf2 = (d: Doc, ids: Map<string, string>) => extractSlots(d, { productIds: ids })
  const rec = (p: string, o: { row: { routeId: string }; old: Doc; slots: ContentSlot[] }): StoredListing => ({ id: p, routeId: o.row.routeId, path: p, document: o.old, slots: o.slots, source: { sourceSha256: 'imported-old' }, disposition: {} })

  it('names exactly the four routes of the catalog-fans additions', () => {
    expect(config.routes).toEqual(PATHS)
  })
  it('the step builds the same stored document the SEO scan and the import build', () => {
    for (const p of config.routes) {
      const row = ledger.routes.find((r) => r.path === p)!
      expect(importedDocument(APP, row, productIds), p).toEqual(storedDocument(row as never))
    }
  })
  for (const p of PATHS) {
    it(`${p}: with the other differences present (as on the review database) it merges with ZERO element refusals, keeps a staff edit, and reruns as UNCHANGED`, () => {
      const shift = olderStored('/product-category/fans/page/2/', 0, false).removed
      const o = olderStored(p, shift)
      const edited = structuredClone(o.slots)
      const target = edited.find((s) => s.label)
      if (target) target.label = `${target.label} (edited)`
      const plan = planListingMerge(rec(p, { ...o, slots: edited }), o.newDoc as Doc, o.row.sourceSha256!, productIds)
      expect(plan.report.refusals, p).toEqual([])
      expect(plan.report.refusedElements, p).toEqual([])
      expect(plan.report.action).toBe('MERGE')
      expect(plan.report.documentFieldsChanged).toEqual(expect.arrayContaining(['seo', 'chrome', 'downloads']))
      if (o.removed) expect(plan.report.newElements.length).toBeGreaterThanOrEqual(o.removed)
      else expect(plan.report.countChanges.length).toBeGreaterThan(0) // /product-category/fans/: counts only
      if (p === '/product-category/fans/page/2/') expect(plan.report.countChanges.map((c) => c.after)).toEqual([expect.stringMatching(/^Showing 17–\d+ of \d+ results$/)])
      if (target) expect(plan.slots!.find((s) => s.label === `${target.label}`)).toBeDefined()
      const again = planListingMerge({ ...rec(p, { ...o, slots: edited }), document: plan.document!, slots: plan.slots!, source: { sourceSha256: plan.sourceSha256 } }, o.newDoc as Doc, o.row.sourceSha256!, productIds)
      expect(again.report.action).toBe('UNCHANGED')
    }, 120000)
  }
  for (const [mode, label] of [['fans2', 'CATALOG-FANS-2 run (+10)'], ['fans1', 'UPDATE-1.1c run (+1: CATALOG-FANS-1 only)']] as const)
    it(`${label}: every route merges with zero element refusals; the card counts are 10 / 1 as expected`, () => {
      const want = mode === 'fans2' ? 10 : 1
      const shift = mode === 'fans2' ? 10 : 1
      for (const p of PATHS) {
        const o = olderStored(p, shift, true, mode)
        const plan = planListingMerge(rec(p, o), o.newDoc as Doc, o.row.sourceSha256 ?? 'new', productIds)
        expect(plan.report.refusals, `${p} ${mode}`).toEqual([])
        expect(plan.report.refusedElements, `${p} ${mode}`).toEqual([])
        expect(plan.report.action, `${p} ${mode}`).toBe('MERGE')
        if (p === '/product-category/fans/') expect(o.removed).toBe(0)
        else expect(o.removed, `${p} ${mode}`).toBe(want)
        expect(plan.report.countChanges.map((c) => c.after), p).toEqual(p === '/fans/' ? [] : [expect.stringMatching(new RegExp(mode === 'fans2' ? (p === '/product-tag/hudson/' ? 'all 27 results' : '33 results') : (p === '/product-tag/hudson/' ? 'all 17 results' : '23 results')))])
      }
    }, 240000)
  it('a staff edit on an element whose source changed is refused for that element only (the route still merges)', () => {
    const p = '/product-category/fans/page/2/'
    const shift = olderStored(p, 0, false).removed
    const o = olderStored(p, shift)
    const edited = structuredClone(o.slots)
    const c = edited.find((s) => /Showing/.test(JSON.stringify(s.text ?? '')))!
    c.text = JSON.parse(JSON.stringify(c.text).replace('Showing', 'Displaying'))
    const plan = planListingMerge(rec(p, { ...o, slots: edited }), o.newDoc as Doc, o.row.sourceSha256!, productIds)
    expect(plan.report.action).toBe('MERGE_PARTIAL')
    expect(plan.report.refusedElements).toHaveLength(1)
    expect(plan.report.newElements.length).toBeGreaterThanOrEqual(shift)
  }, 120000)
  it('LISTING-MERGE-1.2: a results-count paragraph (count text before and after, differing in dash/space form) resolves to the source; free text still refuses. Count text (stored and old source) differing only in dash/space form is resolved to the source, the route is MERGE with 0 refused; free text still refuses', () => {
    const p = '/product-category/fans/page/2/'
    const shift = olderStored(p, 0, false).removed
    const o = olderStored(p, shift)
    for (const variant of [(t: string) => t.replace('–', '-'), (t: string) => t.replace('Showing ', 'Showing\u00a0'), (t: string) => t.replace(' of ', '  of ')]) {
      const edited = structuredClone(o.slots)
      const c = edited.find((s) => /Showing/.test(JSON.stringify(s.text ?? '')))!
      c.text = JSON.parse(variant(JSON.stringify(c.text)))
      const plan = planListingMerge(rec(p, { ...o, slots: edited }), o.newDoc as Doc, o.row.sourceSha256!, productIds)
      expect(plan.report.action).toBe('MERGE')
      expect(plan.report.refusedElements).toEqual([])
      expect(plan.report.resolvedElements).toHaveLength(1)
      expect(plan.report.resolvedElements[0]!.reason).toBe('resolved: count paragraph -> source')
      expect(JSON.stringify(plan.slots!.find((s) => /Showing/.test(JSON.stringify(s.text ?? '')))!.text)).toContain('of 33 results')
    }
    // free text in the count paragraph is not count data: refused for that element only
    const free = structuredClone(o.slots)
    const f = free.find((s) => /Showing/.test(JSON.stringify(s.text ?? '')))!
    f.text = JSON.parse(JSON.stringify(f.text).replace(/Showing[^"]*results/, 'Our complete range of fans'))
    const refused = planListingMerge(rec(p, { ...o, slots: free }), o.newDoc as Doc, o.row.sourceSha256!, productIds)
    expect(refused.report.action).toBe('MERGE_PARTIAL')
    expect(refused.report.refusedElements).toHaveLength(1)
    expect(refused.report.resolvedElements).toEqual([])
  }, 120000)
})

describe('LISTING-MERGE-1.1: mergeListings against an in-memory Payload (find/update wiring)', () => {
  const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; routeId: string; state: string; export: boolean; indexable: boolean; sourceFile?: string; sourceSha256?: string }> }
  const productIds = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
  const PATHS = ['/fans/', '/product-category/fans/', '/product-category/fans/page/2/', '/product-tag/hudson/']
  const oldRecord = (p: string) => {
    const row = ledger.routes.find((r) => r.path === p)!
    const newDoc = importedDocument(APP, row, productIds) as { children: unknown[] }
    const strip = (n: unknown): unknown => {
      if (!n || typeof n !== 'object') return n
      const e = n as { children?: unknown[] }
      if (e.children) e.children = e.children.filter((c) => !(c && typeof c === 'object' && /\bpost-49\d\d\b/.test((c as { attrs?: { class?: string } }).attrs?.class ?? ''))).map(strip)
      return e
    }
    const doc = structuredClone(newDoc) as Doc & { children: unknown[] }
    const fixCounts = (n: unknown): unknown => {
      if (typeof n === 'string') return n.replace(/Showing all (\d+) results/, (_m, t) => `Showing all ${Number(t) - 1} results`).replace(/Showing (\d+)–(\d+) of (\d+) results/, (_m, a, b, t) => `Showing ${a}–${Math.min(Number(b), Number(t) - 1)} of ${Number(t) - 1} results`)
      if (n && typeof n === 'object') { const e = n as { children?: unknown[] }; if (e.children) e.children = e.children.map(fixCounts) }
      return n
    }
    doc.children = doc.children.map(strip).map(fixCounts)
    doc.seo = { ...(doc.seo as Record<string, unknown>), title: 'An older stored title' }
    const slots = extractSlots(doc, { productIds })
    const label = slots.find((s) => s.label)
    if (label) label.label = `${label.label} (staff)`
    return { id: p, routeId: row.routeId, path: p, document: doc, slots, source: { sourceSha256: 'imported-old', sourceFile: 'x' }, disposition: { state: row.state, export: row.export, indexable: row.indexable }, editedLabel: label?.label }
  }
  const fake = (records: ReturnType<typeof oldRecord>[]) => {
    const updates: Array<{ id: unknown; data: Record<string, unknown>; context: unknown }> = []
    const payload = {
      find: async (a: { where: { routeId: { equals: string } } }) => ({ docs: records.filter((r) => r.routeId === a.where.routeId.equals) }),
      update: async (a: { id: unknown; data: Record<string, unknown>; context: unknown }) => { updates.push(a); Object.assign(records.find((x) => x.id === a.id)!, a.data); return {} },
    }
    return { payload: payload as never, updates }
  }
  it('dry run writes nothing; apply writes the four records once through the import context; the rerun changes nothing', async () => {
    const records = PATHS.map(oldRecord)
    const { payload, updates } = fake(records)
    const dry = await mergeListings(payload, APP, { apply: false })
    expect(updates).toHaveLength(0)
    expect(dry.map((r) => [r.path, r.action, r.refusals.join(' | '), r.refusedElements.length])).toEqual(PATHS.map((p) => [p, 'MERGE', '', 0]))
    const applied = await mergeListings(payload, APP, { apply: true })
    expect(applied.map((r) => r.action)).toEqual(['MERGE', 'MERGE', 'MERGE', 'MERGE'])
    expect(updates).toHaveLength(4)
    for (const u of updates) { expect(Object.keys(u.data).sort()).toEqual(['document', 'slots', 'source']); expect(JSON.stringify(u.context)).toContain('true') }
    for (const r of records) {
      if (r.editedLabel) expect((r.slots as ContentSlot[]).some((s) => s.label === r.editedLabel), `${r.path}: the staff edit survives`).toBe(true)
      expect((r.source as { sourceSha256: string }).sourceSha256).toBe(ledger.routes.find((x) => x.path === r.path)!.sourceSha256)
    }
    const rerun = await mergeListings(payload, APP, { apply: true })
    expect(rerun.map((r) => r.action)).toEqual(['UNCHANGED', 'UNCHANGED', 'UNCHANGED', 'UNCHANGED'])
    expect(updates).toHaveLength(4)
  }, 180000)
  it('LISTING-MERGE-1.2: a stored count paragraph that differs in form (batch-touched) is resolved to the source on all four routes: 4 x MERGE, 0 refused, the rerun is 4 x UNCHANGED', async () => {
    const records = PATHS.map(oldRecord)
    for (const r of records) {
      const c = (r.slots as ContentSlot[]).find((s) => /Showing/.test(JSON.stringify(s.text ?? '')))
      if (c) c.text = JSON.parse(JSON.stringify(c.text).replace('Showing ', 'Showing\u00a0').replace('–', '-'))
    }
    const { payload } = fake(records)
    const dry = await mergeListings(payload, APP, { apply: false })
    expect(dry.map((r) => r.action)).toEqual(['MERGE', 'MERGE', 'MERGE', 'MERGE'])
    expect(dry.map((r) => r.refusedElements.length)).toEqual([0, 0, 0, 0])
    expect(dry.filter((r) => r.resolvedElements.length === 1).length).toBeGreaterThanOrEqual(1)
    await mergeListings(payload, APP, { apply: true })
    const rerun = await mergeListings(payload, APP, { apply: true })
    expect(rerun.map((r) => r.action)).toEqual(['UNCHANGED', 'UNCHANGED', 'UNCHANGED', 'UNCHANGED'])
  }, 180000)
  it('an element-level conflict is applied for the rest of the route and reported (MERGE_PARTIAL, the edited element keeps its stored value)', async () => {
    const records = PATHS.map(oldRecord)
    const hud = records.find((r) => r.path === '/product-tag/hudson/')!
    const slots = hud.slots as ContentSlot[]
    const c = slots.find((s) => /Showing all/.test(JSON.stringify(s.text ?? '')))
    if (!c) return
    c.text = JSON.parse(JSON.stringify(c.text).replace('Showing all', 'All'))
    const { payload, updates } = fake(records)
    const out = await mergeListings(payload, APP, { apply: true })
    const h = out.find((r) => r.path === '/product-tag/hudson/')!
    expect(h.action).toBe('MERGE_PARTIAL')
    expect(h.refusedElements).toHaveLength(1)
    expect(updates).toHaveLength(4)
    expect(JSON.stringify((hud.slots as ContentSlot[]).find((s) => /All \d+ results|All 1\d results/.test(JSON.stringify(s.text ?? '')))?.text ?? '')).toContain('All')
  }, 180000)
})
