import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadPage } from '../site/content'

// Main-B ICST parts category template (ICST-PARTS-CATEGORY): nine category pages share one structure.
const root = path.resolve(__dirname, '../../../../../clients')
const CATEGORIES = [
  ['fans', 'Fans'],
  ['motors', 'Motors'],
  ['nozzles', 'Nozzles'],
  ['fill-media', 'Fill media'],
  ['frp-members', 'FRP members'],
  ['gear-box', 'Gear box'],
  ['tower-hardware', 'Tower hardware'],
  ['cooling-tower-fan-stacks', 'Cooling tower fan stacks'],
  ['drive-shafts-assembles', 'Drive shaft assemblies'],
] as const

describe('ICST parts category pages', () => {
  it.each(CATEGORIES)('%s: hero, chips with its own current link, a product grid, and the phone band', (slug, label) => {
    const page = loadPage('icst', [slug], root)!
    expect(page).not.toBeNull()
    // Copy (hero + articleBody) from the copy pack, with the chips, product grid and phone band of the template.
    expect(page.layout.map((b) => b.blockType)).toEqual(['hero', 'chipNav', 'articleBody', 'productGrid', 'phoneCta'])
    const hero = page.layout[0] as unknown as { title: string }
    expect(hero.title.length).toBeGreaterThan(0)
    expect(label.length).toBeGreaterThan(0)
    const chips = page.layout[1] as unknown as { links: Array<{ href: string }>; currentPath: string }
    expect(chips.links.map((l) => l.href)).toEqual(CATEGORIES.map(([s]) => `/${s}/`))
    expect(chips.currentPath).toBe(`/${slug}/`)
    const grid = page.layout[3] as unknown as { items: Array<{ title: string }>; actionLabel: string }
    expect(grid.items.length).toBeGreaterThanOrEqual(3)
    expect(grid.actionLabel).toBe('Request a quote')
  })

  it('the parts hub chips point at the nine category pages and mark the hub as current', () => {
    const hub = loadPage('icst', ['parts'], root)!
    const chips = hub.layout.find((b) => b.blockType === 'chipNav') as unknown as { links: Array<{ href: string }>; currentPath: string }
    expect(chips.links.map((l) => l.href)).toEqual(CATEGORIES.map(([s]) => `/${s}/`))
    expect(chips.currentPath).toBe('/parts/')
  })

  it('no category page carries a price or a client-preview path', () => {
    for (const [slug] of CATEGORIES) {
      const text = JSON.stringify(loadPage('icst', [slug], root))
      expect(text).not.toMatch(/\$|USD|THB|client-preview/)
    }
  })
})

describe('new towers and cooling towers pages', () => {
  it('/new-towers/ is primary: its own title and H1, no canonical override', () => {
    const page = loadPage('icst', ['new-towers'], root)!
    expect(page.title).toBe('New cooling towers')
    expect(page.canonical).toBeUndefined()
    expect((page.layout[0] as unknown as { title: string }).title).toBe('New cooling towers')
  })
  it('/cooling-towers/ keeps 200 with a distinct title and H1, and canonicalises to /new-towers/', () => {
    const page = loadPage('icst', ['cooling-towers'], root)!
    expect(page.canonical).toBe('/new-towers/')
    expect(page.title).not.toBe(loadPage('icst', ['new-towers'], root)!.title)
    expect((page.layout[0] as unknown as { title: string }).title).toBe('Cooling tower services')
  })
  it('a canonical must be a same-site path ending in a slash (fail closed)', () => {
    const bad = (value: string) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'canon-'))
      mkdirSync(path.join(dir, 'icst', 'content', 'pages'), { recursive: true })
      writeFileSync(path.join(dir, 'icst', 'content', 'pages', 'x.json'), JSON.stringify({ title: 'X', canonical: value, layout: [] }))
      return () => loadPage('icst', ['x'], dir)
    }
    for (const v of ['https://evil.example/', '//evil.example/', '/a/../b/', '/no-slash']) expect(bad(v)).toThrow(/canonical/)
    expect(bad('/new-towers/')()).toMatchObject({ canonical: '/new-towers/' })
  })
})

describe('copied pages (ICST_COPY_PACK) are clean', () => {
  it('no page carries a price, a store label or a WooCommerce artefact (RFQ-only site)', () => {
    const dir = path.join(root, 'icst', 'content', 'pages')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== '_index.json')) {
      const text = readFileSync(path.join(dir, f), 'utf8')
      expect(text, f).not.toMatch(/\$\s?\d|\bUSD\b|\bTHB\b|Original price|Current price|Add to cart|Quick View|Out of stock/)
    }
  })
})

describe('page titles carry the brand at most once', () => {
  it('no title repeats the brand token (ICST) or the full name', () => {
    const dir = path.join(root, 'icst', 'content', 'pages')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== '_index.json')) {
      const title = (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { title: string }).title
      const brand = (title.match(/\bICST\b/g) ?? []).length + (title.match(/International Cooling Solutions/g) ?? []).length
      expect(brand, `${f}: ${title}`).toBeLessThanOrEqual(1)
    }
  })
})
