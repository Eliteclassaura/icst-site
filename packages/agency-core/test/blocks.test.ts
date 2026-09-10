import { describe, it, expect } from 'vitest'
import { blockManifest } from '../src/blocks/manifest'
import { layoutBlocks } from '../src/blocks/payload'
import * as fx from '../src/blocks/fixtures/index'
import { headerProps, footerProps, formSelects } from '../src/blocks/chrome'
import { resolveImage } from '../src/blocks/render'

describe('component registry (C4, ADR-024)', () => {
  it('the CMS block set equals the layout half of the manifest — no orphan configs, no unrenderable blocks', () => {
    const cms = layoutBlocks.map((b) => b.slug).sort()
    const layout = blockManifest
      .filter((b) => b.kind === 'layout')
      .map((b) => b.slug)
      .sort()
    expect(cms).toEqual(layout)
  })
  it('every block has a default fixture with real copy', () => {
    for (const b of blockManifest) {
      const f = (fx as unknown as Record<string, { default: unknown }>)[b.slug]
      expect(f?.default, b.slug).toBeTruthy()
      expect(JSON.stringify(f.default)).not.toMatch(/lorem|ipsum|TODO|placeholder text/i)
    }
  })
  it('no fixture types a count that exists as data (ADR-023 §7)', () => {
    const text = JSON.stringify(fx)
    // "12 terms", "seventeen questions", "six builds" … must be derived at render time, never written.
    expect(text).not.toMatch(
      /\b(\d+|two|three|four|five|six|seven|ten|twelve|thirteen|seventeen)\s+(questions|builds|terms|steps|case studies)\b/i,
    )
  })
  it('evidence items always carry a dated, linked source', () => {
    for (const it of fx.evidenceGrid.default.items) {
      expect(it.source.href).toMatch(/^https:\/\//)
      expect(it.source.date).toBeTruthy()
      expect(it.source.publisher).toBeTruthy()
    }
  })
  it('glossary anchors are unique, lower-case and stable', () => {
    const a = fx.glossaryList.default.terms.map((t) => t.anchor)
    expect(new Set(a).size).toBe(a.length)
    for (const x of a) expect(x).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('chrome mappers', () => {
  it('headerProps prefers the wordmark and drops incomplete links', () => {
    const p = headerProps(
      {
        primary: [{ label: 'A', href: '/a/' }, { label: '', href: '/b/' }, { label: 'C' }],
        ctaLabel: 'Go',
        ctaHref: '/go/',
      },
      { brandName: 'Brand', wordmark: { text: 'syed', accentSuffix: '.ai', subline: 'Role' } },
      { currentPath: '/a/' },
    )
    expect(p.brand).toMatchObject({ name: 'syed', accent: '.ai', role: 'Role', href: '/' })
    expect(p.links).toEqual([{ label: 'A', href: '/a/', external: false }])
    expect(p.cta).toEqual({ label: 'Go', href: '/go/' })
  })
  it('footerProps formats offices from the Offices collection shape and never invents a year', () => {
    const p = footerProps(
      { columns: [{ heading: 'Work', links: [{ label: 'X', href: '/x/' }] }] },
      {
        legalName: 'syed.ai — Syed Abdul',
        offices: [
          {
            name: 'Lahore',
            address: { country: 'Pakistan' },
            footerRole: 'Engineering',
            hoursDisplay: 'Mon–Fri',
          },
          'unpopulated-id',
        ],
      },
      { siteName: 'syed.ai' },
    )
    expect(p.offices).toEqual([{ city: 'Lahore', region: 'Pakistan · Engineering', hours: 'Mon–Fri' }])
    expect(p.copyrightHolder).toBe('syed.ai — Syed Abdul')
    expect(p.year).toBeUndefined()
  })
  it('formSelects turns form-config rows into labelled selects with the flagged default', () => {
    const s = formSelects({
      selects: [
        {
          key: 'budget',
          label: 'Monthly budget',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b', default: true },
          ],
        },
        { key: 'broken', label: '', options: [] },
      ],
    })
    expect(s).toEqual([{ name: 'budget', label: 'Monthly budget', options: ['A', 'B'], defaultValue: 'B' }])
  })
})

describe('resolveImage', () => {
  it('maps a populated Media doc to an ImageRef with sorted srcset and ignores bare ids', () => {
    expect(resolveImage('uuid-only')).toBeUndefined()
    const img = resolveImage({
      url: '/media/x.webp',
      alt: 'Alt',
      width: 1600,
      height: 900,
      sizes: {
        w1100: { url: '/media/x-1100.webp', width: 1100, mimeType: 'image/webp' },
        w480: { url: '/media/x-480.webp', width: 480, mimeType: 'image/webp' },
        og: { url: '/media/x-og.webp', width: 1200, mimeType: 'image/webp' },
      },
    })
    expect(img?.sources?.map((s) => s.width)).toEqual([480, 1100, 1200])
    expect(img).toMatchObject({
      url: '/media/x.webp',
      alt: 'Alt',
      width: 1600,
      height: 900,
      decorative: false,
    })
  })
})

describe('derived counts (ADR-023 §7)', async () => {
  const { withCount, numberWord } = await import('../src/blocks/shared/count')
  it('substitutes the item count as a word and capitalises at sentence start', () => {
    expect(withCount('{{count}} moves, in order.', 5)).toBe('Five moves, in order.')
    expect(withCount('across the {{count}} decisions', 9)).toBe('across the nine decisions')
    expect(withCount('no placeholder', 3)).toBe('no placeholder')
    expect(withCount(undefined, 3)).toBeUndefined()
    expect(numberWord(13)).toBe('13')
  })
})
