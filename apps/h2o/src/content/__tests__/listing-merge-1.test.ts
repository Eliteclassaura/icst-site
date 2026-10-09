/**
 * LISTING-MERGE-1: the production step that applies a catalog-listing delta (added product cards, result counts) to held listing
 * records without overwriting edited page elements. Pure planning (no database): stored record in, merge plan out.
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
const card = (n: number) => el('li', [el('a', [el('h2', [`Product ${n}`])], { href: `https://example.test/product/p${n}/` })], { class: `product post-${n}` })
const doc = (cards: number[], counts: string): Doc => ({
  routeId: 'SALMON-test', title: 'Fans', type: 'pages', targetPath: '/test/', sourceUrl: 'https://example.test/test/', seo: { title: 'T', h1: ['Fans'], meta: [], schema: [] },
  children: [el('main', [el('h1', ['Fans']), el('p', [counts]), el('ul', ['\n', ...cards.flatMap((c) => [card(c), '\n'])], { class: 'products' }), el('p', ['Closing words about fans.'])])],
  images: cards.map((c) => ({ order: c, src: `/media/p${c}.jpg` })), links: cards.map((c) => ({ order: c, href: `https://example.test/product/p${c}/` })),
})
const products = new Map<string, string>()
const stored = (document: Doc, slots: ContentSlot[], sha = 'old'): StoredListing => ({ id: 1, routeId: 'SALMON-test', path: '/test/', document, slots, source: { sourceSha256: sha }, disposition: { state: 'PUBLIC' } })
const edit = (slots: ContentSlot[], pick: (s: ContentSlot) => boolean, change: (s: ContentSlot) => void) => { const c = structuredClone(slots); change(c.find(pick)!); return c }

describe('LISTING-MERGE-1: planListingMerge', () => {
  const oldDoc = doc([1, 2], 'Showing all 2 results'), newDoc = doc([1, 2, 3], 'Showing all 3 results')
  const fresh = extractSlots(oldDoc, { productIds: products })
  it('adds the card and the new count, keeps an edited element, reports what it did', () => {
    const edited = edit(fresh, (s) => s.tag === 'h1', (s) => { s.title = 'H1 · Edited by staff' ; (s as unknown as { alt: string }).alt = 'x' })
    const plan = planListingMerge(stored(oldDoc, edited), newDoc, 'new', products)
    expect(plan.report.action).toBe('MERGE')
    expect(plan.report.cardsAdded).toHaveLength(1)
    expect(plan.report.cardsAdded[0]).toContain('Product 3')
    expect(plan.report.countChanges).toEqual([{ before: 'Showing all 2 results', after: 'Showing all 3 results' }])
    expect(plan.document).toBe(newDoc)
    expect(plan.slots!.length).toBe(extractSlots(newDoc, { productIds: products }).length)
    expect(plan.slots!.find((s) => s.tag === 'h1')).toEqual(edited.find((s) => s.tag === 'h1'))
    expect(plan.report.slotsNew).toBeGreaterThan(0)
    expect(plan.report.slotsSourceChanged).toBe(1)
  })
  it('refuses when the result-count element was itself edited (source changed AND edited)', () => {
    const countSlot = (s: ContentSlot) => JSON.stringify(s.text ?? '').includes('Showing all 2 results')
    const edited = edit(fresh, countSlot, (s) => { s.text = JSON.parse(JSON.stringify(s.text).replace('Showing all 2 results', 'Showing everything')) })
    const plan = planListingMerge(stored(oldDoc, edited), newDoc, 'new', products)
    expect(plan.report.action).toBe('REFUSE')
    expect(plan.report.refusals.join(' ')).toMatch(/source changed AND it was edited/)
    expect(plan.slots).toBeUndefined()
  })
  it('refuses any other structural change (a reworded paragraph, a different SEO field, a removed card)', () => {
    const reworded = doc([1, 2, 3], 'Showing all 3 results') as { children: Array<{ children: Array<{ children: string[] }> }> }
    reworded.children[0]!.children[3]!.children = ['Closing words, rewritten.']
    expect(planListingMerge(stored(oldDoc, fresh), reworded as unknown as Doc, 'new', products).report.action).toBe('REFUSE')
    expect(planListingMerge(stored(oldDoc, fresh), { ...newDoc, seo: { title: 'Other', h1: ['Fans'], meta: [], schema: [] } }, 'new', products).report.action).toBe('REFUSE')
    expect(planListingMerge(stored(doc([1, 2, 3], 'Showing all 3 results'), extractSlots(doc([1, 2, 3], 'Showing all 3 results'), { productIds: products })), oldDoc, 'new', products).report.action).toBe('REFUSE')
  })
  it('a card inserted BEFORE an existing, edited card shifts the element keys: the edit follows its element to the new key', () => {
    const o = doc([1, 2], 'Showing all 2 results')
    const n = doc([1, 3, 2], 'Showing all 3 results') // 3 inserted between 1 and 2
    const fresh0 = extractSlots(o, { productIds: products })
    const card2 = (s: ContentSlot) => s.label === 'Product 2' || s.label === 'Product Two (staff)'
    const edited = edit(fresh0, card2, (s) => { s.label = 'Product Two (staff)' })
    const plan = planListingMerge(stored(o, edited), n, 'new', products)
    expect(plan.report.refusals).toEqual([])
    const kept = plan.slots!.find((s) => s.label === 'Product Two (staff)')!
    const fresh1 = extractSlots(n, { productIds: products })
    expect(kept.key).toBe(fresh1.find(card2)!.key)
    expect(kept.key).not.toBe(edited.find(card2)!.key)
    expect(plan.slots!.map((s) => s.key)).toEqual(fresh1.map((s) => s.key))
  })
  it('is idempotent: the same source hash is UNCHANGED, and a merged record merges to UNCHANGED', () => {
    expect(planListingMerge(stored(oldDoc, fresh, 'same'), newDoc, 'same', products).report.action).toBe('UNCHANGED')
    const plan = planListingMerge(stored(oldDoc, fresh), newDoc, 'new', products)
    const after = stored(plan.document!, plan.slots!, plan.sourceSha256)
    expect(planListingMerge(after, newDoc, 'new', products).report.action).toBe('UNCHANGED')
  })
})

describe('LISTING-MERGE-1: the four real held listing records', () => {
  const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; routeId: string; state: string; export: boolean; sourceFile?: string; sourceSha256?: string; matchedArticle?: boolean }> }
  const config = JSON.parse(readFileSync(path.join(APP, 'content/release/listing-merge.json'), 'utf8')) as { routes: string[] }
  const productIds = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
  const ADDED = /\bpost-49\d\d\b/
  /** The record as the import stored it before the catalog additions: the added cards removed and the counts back. */
  const before = (d: Doc, countShift?: number): { doc: Doc; removed: number } => {
    let removed = 0
    const strip = (n: unknown): unknown => {
      if (typeof n === 'string' || n === null || typeof n !== 'object') return n
      const e = n as { tag?: string; attrs?: Record<string, string>; children?: unknown[] }
      if (e.children) e.children = e.children.filter((c) => { if (c && typeof c === 'object' && ADDED.test((c as { attrs?: { class?: string } }).attrs?.class ?? '')) { removed++; return false } return true }).map(strip)
      return e
    }
    const copy = structuredClone(d) as { children: unknown[] }
    copy.children = copy.children.map(strip)
    const fix = (n: unknown): unknown => {
      if (typeof n === 'string') return n.replace(/Showing all (\d+) results/, (_m, t) => `Showing all ${Number(t) - (countShift ?? removed)} results`).replace(/Showing (\d+)–(\d+) of (\d+) results/, (_m, a, b, t) => `Showing ${a}–${Math.min(Number(b), Number(t) - (countShift ?? removed))} of ${Number(t) - (countShift ?? removed)} results`)
      if (n && typeof n === 'object') { const e = n as { children?: unknown[] }; if (e.children) e.children = e.children.map(fix) }
      return n
    }
    copy.children = copy.children.map(fix)
    return { doc: copy as unknown as Doc, removed }
  }
  it('names exactly the four routes of the catalog-fans additions, all public listing records', () => {
    expect(config.routes).toEqual(['/fans/', '/product-category/fans/', '/product-category/fans/page/2/', '/product-tag/hudson/'])
    for (const p of config.routes) expect(ledger.routes.find((r) => r.path === p)?.state, p).toBe('PUBLIC')
  })
  it('the step builds the same stored document the SEO scan and the import build', () => {
    for (const p of config.routes) {
      const row = ledger.routes.find((r) => r.path === p)!
      expect(importedDocument(APP, row, productIds), p).toEqual(storedDocument(row as never))
    }
  })
  for (const p of ['/fans/', '/product-category/fans/', '/product-category/fans/page/2/', '/product-tag/hudson/']) {
    it(`${p}: merges the added cards/counts, keeps staff edits, refuses an edited count, reruns as UNCHANGED`, () => {
      const row = ledger.routes.find((r) => r.path === p)!
      const newDoc = importedDocument(APP, row, productIds)
      // the catalog additions shift every result count by the number of cards the second category page gained
      const shift = before(importedDocument(APP, ledger.routes.find((r) => r.path === '/product-category/fans/page/2/')!, productIds)).removed
      const { doc: oldDoc, removed } = before(newDoc, shift)
      const oldSlots = extractSlots(oldDoc, { productIds })
      const withEdit = structuredClone(oldSlots)
      const target = withEdit.find((s) => s.label)
      if (target) target.label = `${target.label} (edited)`
      const plan = planListingMerge(stored(oldDoc, withEdit), newDoc, row.sourceSha256!, productIds)
      expect(plan.report.refusals, p).toEqual([])
      expect(plan.report.action).toBe('MERGE')
      expect(plan.report.cardsAdded.length).toBe(removed)
      if (p === '/product-category/fans/') expect(plan.report.countChanges.length).toBeGreaterThan(0) // counts only, no cards
      if (target) expect(plan.slots!.find((s) => s.key === target.key)!.label).toBe(`${target.label}`)
      // only the added cards, the counts and nothing else may be new
      expect(plan.slots!.length).toBeGreaterThanOrEqual(oldSlots.length)
      const again = planListingMerge({ ...stored(plan.document!, plan.slots!), source: { sourceSha256: plan.sourceSha256 } }, newDoc, row.sourceSha256!, productIds)
      expect(again.report.action).toBe('UNCHANGED')
      if (plan.report.countChanges.length) {
        const countKey = oldSlots.find((s) => /Showing/.test(JSON.stringify(s.text ?? '')))!.key
        const bad = structuredClone(oldSlots)
        const c = bad.find((s) => s.key === countKey)!
        c.text = JSON.parse(JSON.stringify(c.text).replace('Showing', 'Displaying'))
        expect(planListingMerge(stored(oldDoc, bad), newDoc, row.sourceSha256!, productIds).report.action).toBe('REFUSE')
      }
    }, 120000)
  }
})

describe('LISTING-MERGE-1: mergeListings against an in-memory Payload (find/update wiring)', () => {
  const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Array<{ path: string; routeId: string; state: string; export: boolean; indexable: boolean; sourceFile?: string; sourceSha256?: string }> }
  const productIds = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
  const PATHS = ['/fans/', '/product-category/fans/', '/product-category/fans/page/2/', '/product-tag/hudson/']
  /** A record as the import stored it before the additions (cards removed, counts back), with one staff-edited element. */
  const oldRecord = (p: string, shift: number) => {
    const row = ledger.routes.find((r) => r.path === p)!
    const newDoc = importedDocument(APP, row, productIds) as { children: unknown[] }
    const strip = (n: unknown): unknown => {
      if (!n || typeof n !== 'object') return n
      const e = n as { children?: unknown[] }
      if (e.children) e.children = e.children.filter((c) => !(c && typeof c === 'object' && /\bpost-49\d\d\b/.test((c as { attrs?: { class?: string } }).attrs?.class ?? ''))).map(strip)
      return e
    }
    const fix = (n: unknown): unknown => {
      if (typeof n === 'string') return n.replace(/Showing all (\d+) results/, (_m, t) => `Showing all ${Number(t) - shift} results`).replace(/Showing (\d+)–(\d+) of (\d+) results/, (_m, a, b, t) => `Showing ${a}–${Math.min(Number(b), Number(t) - shift)} of ${Number(t) - shift} results`)
      if (n && typeof n === 'object') { const e = n as { children?: unknown[] }; if (e.children) e.children = e.children.map(fix) }
      return n
    }
    const doc = structuredClone(newDoc)
    doc.children = doc.children.map(strip).map(fix)
    const slots = extractSlots(doc as unknown as Doc, { productIds })
    const label = slots.find((s) => s.label)
    if (label) label.label = `${label.label} (staff)`
    return { id: p, routeId: row.routeId, path: p, document: doc as unknown as Doc, slots, source: { sourceSha256: 'imported-old', sourceFile: 'x' }, disposition: { state: row.state, export: row.export, indexable: row.indexable }, edited: label?.key, editedLabel: label?.label }
  }
  const fake = (records: ReturnType<typeof oldRecord>[]) => {
    const updates: Array<{ id: unknown; data: Record<string, unknown>; context: unknown }> = []
    const payload = {
      find: async (a: { where: { routeId: { equals: string } } }) => ({ docs: records.filter((r) => r.routeId === a.where.routeId.equals) }),
      update: async (a: { id: unknown; data: Record<string, unknown>; context: unknown }) => {
        updates.push(a)
        const r = records.find((x) => x.id === a.id)!
        Object.assign(r, a.data)
        return r
      },
    }
    return { payload: payload as never, updates }
  }
  it('dry run writes nothing; apply writes the four records once through the import context; the rerun changes nothing', async () => {
    const k = 1 // CATALOG-FANS-1 at the production base adds one card
    const total = extractSlots(importedDocument(APP, ledger.routes.find((r) => r.path === '/fans/')!, productIds), { productIds }).length
    expect(total).toBeGreaterThan(0)
    const records = PATHS.map((p) => oldRecord(p, k))
    const { payload, updates } = fake(records)
    const dry = await mergeListings(payload, APP, { apply: false })
    expect(updates).toHaveLength(0)
    expect(dry.map((r) => [r.path, r.action, r.refusals.join(' | ')])).toEqual(PATHS.map((p) => [p, 'MERGE', '']))
    const applied = await mergeListings(payload, APP, { apply: true })
    expect(applied.map((r) => r.action)).toEqual(['MERGE', 'MERGE', 'MERGE', 'MERGE'])
    expect(updates).toHaveLength(4)
    for (const u of updates) {
      expect(Object.keys(u.data).sort()).toEqual(['document', 'slots', 'source'])
      expect(JSON.stringify(u.context)).toContain('true')
    }
    for (const r of records) {
      if (r.edited) expect(r.slots.some((s) => s.label === r.editedLabel), `${r.path}: the staff edit survives`).toBe(true)
      expect(r.source.sourceSha256).toBe(ledger.routes.find((x) => x.path === r.path)!.sourceSha256)
    }
    const rerun = await mergeListings(payload, APP, { apply: true })
    expect(rerun.map((r) => r.action)).toEqual(['UNCHANGED', 'UNCHANGED', 'UNCHANGED', 'UNCHANGED'])
    expect(updates).toHaveLength(4)
  }, 120000)
  it('refuses (and writes nothing for) a record whose result count was edited, but still merges the others', async () => {
    const records = PATHS.map((p) => oldRecord(p, 1))
    const hud = records.find((r) => r.path === '/product-tag/hudson/')!
    const c = hud.slots.find((s) => /Showing all/.test(JSON.stringify(s.text ?? '')))!
    c.text = JSON.parse(JSON.stringify(c.text).replace('Showing all', 'All'))
    const { payload, updates } = fake(records)
    const out = await mergeListings(payload, APP, { apply: true })
    expect(out.find((r) => r.path === '/product-tag/hudson/')!.action).toBe('REFUSE')
    expect(updates.map((u) => u.id)).not.toContain('/product-tag/hudson/')
    expect(updates).toHaveLength(3)
  }, 120000)
})
