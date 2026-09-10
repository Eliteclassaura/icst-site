import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as fixtures from '@factory/agency-core/blocks/fixtures'
import { applyBrand, brandDrift, hasBrandPlaceholder, NEUTRAL_BRAND, resolveBrand } from '../src/brand.ts'
import type { BrandOverrides } from '../src/brand.ts'

const root = resolve(import.meta.dirname, '../../..')
const blueprint = JSON.parse(
  readFileSync(resolve(root, 'apps/syed-ai/content/syed-ai.blueprint.json'), 'utf8'),
) as Parameters<typeof resolveBrand>[1]
const overrides = JSON.parse(
  readFileSync(resolve(root, 'apps/syed-ai/design/fixture-brand.json'), 'utf8'),
) as BrandOverrides

/**
 * The identity strings the pilot's seeded chrome produced before fixtures were neutralised. If the
 * injector stops reproducing these, the seeded header, footer and hero change — and the C5 parity
 * gate is comparing a different site. This is the guard that lets the fixtures be neutral without
 * moving the pilot.
 */
const PILOT_CHROME = {
  wordmark: 'syed',
  accent: '.ai',
  role: 'Syed Abdul · AI Search',
  copyrightHolder: 'syed.ai — Syed Abdul',
  social: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/syed', external: true }],
  offices: [
    {
      city: 'Celebration, Florida',
      region: 'United States · Strategy & client work',
      hours: 'Mon–Fri · 9–6 ET (UTC−5)',
    },
    { city: 'Abu Dhabi', region: 'United Arab Emirates · Gulf & EMEA', hours: 'Sun–Thu · 9–6 GST (UTC+4)' },
    { city: 'Lahore', region: 'Pakistan · Engineering', hours: 'Mon–Fri · 10–7 PKT (UTC+5)' },
  ],
  heroAlt:
    'Syed Abdul of syed.ai, generative engine optimization and AI search consultant, in a corner office at dusk',
}

/** Identity that must never appear in a shared fixture (ADR-026 §3, R50). */
const IDENTITY_DENY = ['syed', 'Syed Abdul', 'linkedin.com/in', 'Celebration', 'Abu Dhabi', 'Lahore']

describe('fixture identity (ADR-026 §3)', () => {
  it('no shared fixture carries a client identifier', () => {
    const hits: string[] = []
    const walk = (v: unknown, where: string) => {
      if (typeof v === 'string') {
        for (const lit of IDENTITY_DENY)
          if (v.toLowerCase().includes(lit.toLowerCase())) hits.push(`${where}: "${lit}"`)
        return
      }
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`))
      if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${where}.${k}`)
    }
    for (const [name, set] of Object.entries(fixtures)) {
      if (typeof set !== 'object' || set === null) continue
      walk(set, name)
    }
    expect(hits).toEqual([])
  })

  it('every fixture resolves cleanly under the neutral identity — no leftover placeholder or marker', () => {
    for (const [name, set] of Object.entries(fixtures)) {
      if (typeof set !== 'object' || set === null || typeof set === 'function') continue
      const applied = applyBrand(set, NEUTRAL_BRAND)
      const leftovers: string[] = []
      const walk = (v: unknown, where: string) => {
        if (hasBrandPlaceholder(v)) leftovers.push(`${where}: ${String(v)}`)
        if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`))
        if (v && typeof v === 'object') {
          if ('$brandList' in (v as Record<string, unknown>))
            leftovers.push(`${where}: unexpanded $brandList`)
          for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${where}.${k}`)
        }
      }
      walk(applied, name)
      expect(leftovers, name).toEqual([])
    }
  })
})

describe('brand resolution', () => {
  it('derives the fields the blueprint owns', () => {
    const b = resolveBrand('syed-ai', blueprint)
    expect(b.siteName).toBe('syed.ai')
    expect(b.siteUrl).toBe('https://syed.ai')
    expect(b.personName).toBe('Syed Abdul')
    expect(b.wordmark).toBe('syed')
    expect(b.accent).toBe('.ai')
    expect(b.social.map((s) => s.label)).toContain('LinkedIn')
  })

  it('refuses an overrides file that contradicts the blueprint', () => {
    expect(brandDrift(blueprint, overrides)).toEqual([])
    expect(brandDrift(blueprint, { ...overrides, personName: 'Someone Else' })).toEqual([
      'personName: overrides say "Someone Else", blueprint says "Syed Abdul"',
    ])
  })

  it('reproduces the pilot chrome exactly, so the parity baseline does not move', () => {
    const b = resolveBrand('syed-ai', blueprint, overrides)
    expect(b.wordmark).toBe(PILOT_CHROME.wordmark)
    expect(b.accent).toBe(PILOT_CHROME.accent)
    expect(b.role).toBe(PILOT_CHROME.role)
    expect(b.copyrightHolder).toBe(PILOT_CHROME.copyrightHolder)
    expect(b.heroAlt).toBe(PILOT_CHROME.heroAlt)
    expect(b.social).toEqual(PILOT_CHROME.social)
    expect(b.offices).toEqual(PILOT_CHROME.offices)

    const header = applyBrand(fixtures.header.default, b)
    expect(header.brand.name).toBe('syed')
    expect(header.brand.accent).toBe('.ai')
    expect(header.brand.role).toBe('Syed Abdul · AI Search')
    expect(header.brand.monogramPath).toBe(overrides.monogramPath)

    const footer = applyBrand(fixtures.footer.default, b)
    expect(footer.copyrightHolder).toBe('syed.ai — Syed Abdul')
    expect(footer.offices).toEqual(PILOT_CHROME.offices)
    const contact = footer.columns.find((c) => c.heading === 'Contact')
    expect(contact?.links.at(-1)).toEqual(PILOT_CHROME.social[0])

    const hero = applyBrand(fixtures.hero.default, b)
    expect(hero.image?.alt).toBe(PILOT_CHROME.heroAlt)
  })

  it('defaults to the neutral identity and never to a client', () => {
    const b = resolveBrand('preset', {})
    expect(b.siteName).toBe('Studio Example')
    expect(b.personName).toBe('Alex Doe')
    const footer = applyBrand(fixtures.footer.default, NEUTRAL_BRAND)
    expect(JSON.stringify(footer)).not.toMatch(/syed/i)
  })
})

describe('applyBrand', () => {
  it('substitutes scalars, expands list markers and preserves everything else', () => {
    const out = applyBrand(
      {
        title: 'Hello {{brand.siteName}}',
        n: 7,
        ok: true,
        links: [{ $brandList: 'social' }, { label: 'Keep', href: '/k' }],
      },
      NEUTRAL_BRAND,
    )
    expect(out.title).toBe('Hello Studio Example')
    expect(out.n).toBe(7)
    expect(out.ok).toBe(true)
    expect(out.links).toEqual([...NEUTRAL_BRAND.social, { label: 'Keep', href: '/k' }])
  })

  it('throws on a placeholder nobody defined rather than rendering it literally', () => {
    expect(() => applyBrand({ x: '{{brand.nope}}' }, NEUTRAL_BRAND)).toThrow(/unknown brand placeholder/)
    expect(() => applyBrand([{ $brandList: 'nope' }], NEUTRAL_BRAND)).toThrow(/unknown \$brandList/)
  })
})
