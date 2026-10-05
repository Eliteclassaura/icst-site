import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { migrateQuoteIntent, MAIN_OWNED_PARTS_HERO_PATHS, type IntentDecision } from '../rfq-intent'
import { renderQuoteAction, suppressedDuplicate } from '../rfq-controls'
import { applyPublicExclusions } from '../public-exclusions'
import { applyContentSlots, extractSlots, type ContentSlot } from '../content-slots'
import { renderSalmonNode } from '../../site/SalmonCanonical'
import type { SalmonDocument, SalmonNode } from '../../site/salmon'

/**
 * R1B quote intent (Control Tower D1–D6, durable intent). Intent is established once by source identity at
 * import (./rfq-intent), carried by the editable action slot, and rendered through the approved adapter.
 * Synthetic Typeform configuration only; nothing is submitted.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type El = Exclude<Node, string>
type Row = { routeId: string; path: string; state: string; export: boolean; sourceFile?: string; matchedArticle?: boolean; routeClass?: string }
const APP = path.resolve(__dirname, '../../..')
let routes: Row[] = []
let publicProducts = new Map<string, string>()
const decisions: Array<IntentDecision & { path: string }> = []
const docs = new Map<string, SalmonDocument & { children: Node[] }>()

beforeAll(async () => {
  const { releaseAuthority } = (await import(path.join(APP, 'release/authority.mjs'))) as { releaseAuthority: (r: string) => { routes: Row[] } }
  routes = releaseAuthority(APP).routes
  publicProducts = new Map(routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId]))
  const seen = new Set<string>()
  for (const r of routes) {
    if (seen.has(r.routeId) || !r.sourceFile?.startsWith('documents/') || r.state !== 'PUBLIC' || !r.export) continue
    seen.add(r.routeId)
    const doc = applyPublicExclusions(r.routeId, JSON.parse(readFileSync(path.join(APP, 'content/salmon', r.sourceFile), 'utf8'))).doc as unknown as SalmonDocument & { children: Node[] }
    for (const d of migrateQuoteIntent(doc as never, { routeId: r.routeId, publicProducts, matchedArticle: Boolean(r.matchedArticle) })) decisions.push({ ...d, path: r.path })
    docs.set(r.routeId, doc)
  }
}, 120_000)

const saved = { id: process.env.H2O_TYPEFORM_FORM_ID, origin: process.env.H2O_TYPEFORM_ORIGIN }
beforeEach(() => {
  process.env.H2O_TYPEFORM_FORM_ID = 'F22cAgx3'
  process.env.H2O_TYPEFORM_ORIGIN = 'https://form.typeform.com'
})
afterEach(() => {
  for (const [k, v] of [['H2O_TYPEFORM_FORM_ID', saved.id], ['H2O_TYPEFORM_ORIGIN', saved.origin]] as const)
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
})

const at = (nodes: Node[], key: string): El => {
  let list = nodes
  let n: Node | undefined
  for (const i of key.split('.').slice(1).map(Number)) {
    n = list[i]
    if (!n || typeof n === 'string') throw new Error(`no node ${key}`)
    list = n.children
  }
  return n as El
}
const quoteLinks = (html: string) => [...html.matchAll(/href="(https:\/\/form\.typeform\.com\/to\/F22cAgx3#[^"]+)"/g)].map((m) => Object.fromEntries(new URLSearchParams(new URL(m[1]!.replace(/&amp;/g, '&')).hash.slice(1))))
const render = (doc: SalmonDocument, node: Node, key = 'body.0') => renderToStaticMarkup(<>{renderQuoteAction(doc, node as never, key, (o, k) => renderSalmonNode(o as SalmonNode, k, doc), true) ?? renderSalmonNode(node as SalmonNode, key, doc)}</>)
const rule = (r: IntentDecision['rule']) => decisions.filter((d) => d.rule === r)

describe('quote-intent migration by source identity (ledger)', () => {
  it('D1: all 992 historical product-card positions resolve to a PUBLIC product; 108 sit on the nine listing pages', () => {
    expect(rule('D1')).toHaveLength(992)
    expect(rule('D1_UNRESOLVED')).toHaveLength(0)
    const listing = new Set(['/cooling-tower-fan-stacks/', '/drive-shafts-assembles/', '/fans/', '/fill-media/', '/frp-members/', '/gear-box/', '/motors/', '/nozzles/', '/tower-hardware/'])
    expect(rule('D1').filter((d) => listing.has(d.path))).toHaveLength(108)
    for (const d of rule('D1')) expect([...publicProducts.values()]).toContain(d.product)
  })
  // Master SEO Pass R1: six matched articles are consolidated into others by redirect (177 → 171).
  it('D2: 171 standalone duplicate widgets on matched articles, marked for conditional suppression only', () => {
    expect(rule('D2')).toHaveLength(171)
    expect(new Set(rule('D2').map((d) => d.elementId))).toEqual(new Set(['ee68c85']))
    expect(rule('D2').every((d) => d.action === 'SUPPRESS_IF_CANONICAL_INLINE')).toBe(true)
  })
  it('D3: every source "Contact for pricing" button (nine, one per parts landing) becomes quote intent', () => {
    expect(rule('D3').map((d) => d.routeId).sort()).toEqual(['SALMON-pages-2651', 'SALMON-pages-2696', 'SALMON-pages-2712', 'SALMON-pages-2724', 'SALMON-pages-2730', 'SALMON-pages-2739', 'SALMON-pages-2746', 'SALMON-pages-2752', 'SALMON-pages-2762'])
  })
  it('D5: exactly the two documented /contact/ prose hrefs become /contact-us/, wording unchanged', () => {
    expect(rule('D5').map((d) => [d.path, d.key]).sort()).toEqual([
      ['/environmental-advantage-cooling-towers-vs-cooling-systems/', 'body.26.5'],
      ['/guide-about-cooling-tower/', 'body.191.5'],
    ].sort())
    for (const d of rule('D5')) {
      const a = at(docs.get(d.routeId)!.children, d.key)
      expect(a.attrs.href).toBe('/contact-us/')
      expect(a.attrs['data-rfq-intent']).toBeUndefined()
    }
  })
  it('D6: "Get a Custom Quote" on /new-cooling-tower-page/ becomes quote intent', () => {
    expect(rule('D6').map((d) => [d.path, d.label])).toEqual([['/new-cooling-tower-page/', 'Get a Custom Quote']])
  })
  // Master SEO Pass R1: the three held articles published at cutover carry the same "Get A Quote" widget (13 → 16); the
  // daily log published by the CT sitemap-parity ruling (Part 3) carries it too (17).
  it('contract rule: the 17 R1A-reconciled explicit quote buttons, and not the ten Main-owned Parts hero actions', () => {
    expect(rule('CONTRACT_QUOTE_LABEL').map((d) => `${d.routeId}|${d.elementId}|${d.label}`).sort()).toEqual([
      'SALMON-pages-1230|708f65e3|Request a New Cooling Tower Quote', 'SALMON-pages-1722|3224225|Request a Quote', 'SALMON-pages-2081|064577b|Request a Quote',
      'SALMON-pages-2106|064577b|Request a Quote', 'SALMON-pages-2106|3e00d94|Request a Quote', 'SALMON-pages-2177|3e00d94|Request a Quote',
      'SALMON-pages-2228|064577b|Request a Project Quote', 'SALMON-pages-2228|3e00d94|Request a Project Quote', 'SALMON-pages-2406|d65b755|Request a Quote',
      'SALMON-pages-4140|6f1c713|Request a Free Price Quote', 'SALMON-pages-4140|7b5fa8c|Request Your Free Quote', 'SALMON-pages-48|1e67569|Request a Quote',
      'SALMON-posts-3173|ee68c85|Get A Quote', 'SALMON-posts-3493|ee68c85|Get A Quote', 'SALMON-posts-3494|ee68c85|Get A Quote',
      'SALMON-posts-4065|ee68c85|Get A Quote',
      'SALMON-posts-4077|ee68c85|Get A Quote',
    ].sort())
    expect(rule('MAIN_OWNED_PARTS_HERO').map((d) => d.path).sort()).toEqual([...MAIN_OWNED_PARTS_HERO_PATHS].sort())
    for (const d of rule('MAIN_OWNED_PARTS_HERO')) expect(at(docs.get(d.routeId)!.children, d.key).attrs['data-rfq-intent']).toBeUndefined()
  })
  it('ordinary Contact links stay Contact links (no word-based rewrite)', () => {
    let contact = 0
    for (const doc of docs.values()) {
      const walk = (n: Node) => {
        if (typeof n === 'string') return
        if (n.tag === 'a' && /\/contact-us\/?$/.test(n.attrs.href ?? '') && !n.attrs['data-rfq-intent']) contact++
        n.children.forEach(walk)
      }
      doc.children.forEach(walk)
    }
    expect(contact).toBeGreaterThan(100)
  })
})

describe('rendering quote intent through the approved adapter', () => {
  it('D1 on a listing page: category_and_family with page_path = listing and verified product context', () => {
    const d = rule('D1').find((x) => x.path === '/fans/')!
    const doc = docs.get(d.routeId)!
    const html = render(doc, at(doc.children, d.key), d.key)
    const [ctx] = quoteLinks(html)
    expect(ctx).toMatchObject({ page_path: '/fans/', cta_placement: 'category_and_family', product_id: d.product!.split('-').at(-1) })
    expect(ctx!.product_slug).toBeTruthy()
    expect(html).toContain('Request a Quote')
    expect(html).not.toContain('Buy Now')
  })
  it('D1 negatives: forged/mismatched relation, private product, non-listing page and repository mode never give product context', () => {
    const d = rule('D1').find((x) => x.path === '/fans/')!
    const doc = docs.get(d.routeId)!
    const node = at(doc.children, d.key)
    const other = [...publicProducts.values()].find((p) => p !== d.product)!
    for (const forged of [
      { ...node, attrs: { ...node.attrs, 'data-rfq-product': other } }, // relation ≠ card destination
      { ...node, attrs: { ...node.attrs, 'data-rfq-product': 'SALMON-product-999999999' } }, // unknown
      { ...node, attrs: { ...node.attrs, 'data-rfq-product': 'SALMON-pages-48' } }, // not a product
      { ...node, attrs: { ...node.attrs, href: 'https://evil.example/product/x/' } }, // foreign destination
    ])
      expect(quoteLinks(render(doc, forged, d.key)).filter((c) => c.product_id)).toEqual([])
    const home = rule('D1').find((x) => x.path === '/')
    if (home) {
      const hd = docs.get(home.routeId)!
      expect(quoteLinks(render(hd, at(hd.children, home.key), home.key)).filter((c) => c.cta_placement === 'category_and_family')).toEqual([])
    }
    expect(renderQuoteAction(doc, node as never, d.key, () => null, false)).toBeUndefined()
    // A held/private product (not in the PUBLIC set) was never stamped: no intent, no product.
    const held = routes.find((r) => /^SALMON-product-/.test(r.routeId) && r.state !== 'PUBLIC')
    if (held) expect([...publicProducts.values()]).not.toContain(held.routeId)
  })
  it('D3 and D6 and the contract rule: generic editorial_inline with the actual page path, label preserved', () => {
    for (const d of [rule('D3')[0]!, rule('D6')[0]!, rule('CONTRACT_QUOTE_LABEL')[0]!]) {
      const doc = docs.get(d.routeId)!
      const ctx = quoteLinks(render(doc, at(doc.children, d.key), d.key))
      expect(ctx).toEqual([{ page_path: d.path, cta_placement: 'editorial_inline' }])
      expect(render(doc, at(doc.children, d.key), d.key)).toContain(`>${d.label}<`)
    }
  })
  it('configuration unresolved: the plain /contact-us/ fallback with the same label, never a dead control', () => {
    delete process.env.H2O_TYPEFORM_FORM_ID
    const d = rule('D6')[0]!
    const doc = docs.get(d.routeId)!
    const html = render(doc, at(doc.children, d.key), d.key)
    expect(html).toContain('href="/contact-us/"')
    expect(html).toContain('Get a Custom Quote')
    expect(html).not.toContain('href="#"')
  })
  it('D2: the legacy duplicate is suppressed only where the canonical in-body control renders', () => {
    const d = rule('D2')[0]!
    const doc = docs.get(d.routeId)!
    const widget = (function find(nodes: Node[]): Node | null {
      for (const n of nodes) {
        if (typeof n === 'string') continue
        if (n.attrs['data-id'] === 'ee68c85') return n
        const f = find(n.children)
        if (f) return f
      }
      return null
    })(doc.children)!
    expect(suppressedDuplicate(doc, widget as never, true)).toBe(true)
    delete process.env.H2O_TYPEFORM_FORM_ID
    expect(suppressedDuplicate(doc, widget as never, true)).toBe(false) // canonical control not rendered → keep
    expect(suppressedDuplicate(doc, widget as never, false)).toBe(false)
  })
})

describe('durable intent across label edits (RFQ_LABEL_EDIT_STABILITY)', () => {
  const edit = (routeId: string, key: string, patch: Partial<ContentSlot>) => {
    const doc = docs.get(routeId)!
    const slots = extractSlots(doc as never)
    const slot = slots.find((s) => s.key === key)!
    expect(slot.kind).toBe('action')
    expect(slot.intent).toBe('quote')
    return applyContentSlots(doc as never, slots.map((s) => (s.key === key ? { ...s, ...patch } : s))) as unknown as SalmonDocument & { children: Node[] }
  }
  it('a relabelled D3 button still mounts the adapter, with the new label', () => {
    const d = rule('D3')[0]!
    const out = edit(d.routeId, d.key, { label: 'Ask for a price' })
    const html = render(out, at(out.children, d.key), d.key)
    expect(quoteLinks(html)).toEqual([{ page_path: d.path, cta_placement: 'editorial_inline' }])
    expect(html).toContain('Ask for a price')
  })
  it('a relabelled contract-rule button ("Contact us") is still a quote action', () => {
    const d = rule('CONTRACT_QUOTE_LABEL')[0]!
    const out = edit(d.routeId, d.key, { label: 'Contact us' })
    expect(quoteLinks(render(out, at(out.children, d.key), d.key))).toHaveLength(1)
  })
  it('a relabelled D1 card keeps its product relation and placement', () => {
    const d = rule('D1').find((x) => x.path === '/gear-box/')!
    const out = edit(d.routeId, d.key, { label: 'Get pricing' })
    const [ctx] = quoteLinks(render(out, at(out.children, d.key), d.key))
    expect(ctx).toMatchObject({ cta_placement: 'category_and_family', page_path: '/gear-box/' })
  })
  it('only a deliberate intent change makes it an ordinary link', () => {
    const d = rule('D6')[0]!
    const out = edit(d.routeId, d.key, { intent: 'none', href: '/contact-us/' })
    const html = render(out, at(out.children, d.key), d.key)
    expect(quoteLinks(html)).toEqual([])
    expect(html).toContain('/contact-us/')
  })
})
