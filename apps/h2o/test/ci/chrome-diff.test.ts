import { describe, expect, it } from 'vitest'
import { diffChrome, diffUnder } from '../../ops/ci/chrome-diff-core'
import { DEFAULT_SITE_CHROME } from '../../src/site/site-chrome-content'

const clone = () => structuredClone(DEFAULT_SITE_CHROME)

describe('DEPLOY-PIPE-1 chrome diff (published global vs code defaults)', () => {
  it('equal chrome → no differences', () => {
    expect(diffChrome(DEFAULT_SITE_CHROME, clone())).toEqual([])
  })
  it('a stale footer Useful Links (the UPDATE-1 case): the removed items show up as differences under footer.columns[0]', () => {
    const stale = clone()
    stale.footer.columns[0]!.links = [{ label: 'Expert Industrial Cooling Solutions', href: '/' }, { label: 'Search', href: '/search/' }, ...stale.footer.columns[0]!.links]
    const d = diffChrome(DEFAULT_SITE_CHROME, stale)
    expect(d.length).toBeGreaterThan(0)
    expect(diffUnder(d, ['footer.columns[0]']).length).toBe(d.length)
    expect(d.some((x) => x.path === 'footer.columns[0].links.length')).toBe(true)
    expect(diffUnder(d, ['navigation'])).toEqual([])
  })
  it('a stale header menu (the Parts → Fans subtree) is found under navigation, with the old and new label', () => {
    const stale = clone()
    const parts = stale.navigation.findIndex((n) => /parts/i.test(n.label))
    expect(parts).toBeGreaterThanOrEqual(0)
    const first = stale.navigation[parts]!.items?.[0] ?? stale.navigation[parts]!.sections?.[0]?.items[0]
    first!.label = 'An older label'
    const d = diffChrome(DEFAULT_SITE_CHROME, stale)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ published: 'An older label' })
    expect(diffUnder(d, [`navigation[${parts}]`])).toHaveLength(1)
  })
  it('ignores row ids; an extra published group is reported', () => {
    const p = clone() as unknown as { navigation: Array<Record<string, unknown>> }
    p.navigation[0]!.id = 'abc'
    expect(diffChrome(DEFAULT_SITE_CHROME, p as never)).toEqual([])
    p.navigation.push({ label: 'Extra', href: '/x/' })
    expect(diffChrome(DEFAULT_SITE_CHROME, p as never).some((x) => x.path === 'navigation.length')).toBe(true)
  })
})
