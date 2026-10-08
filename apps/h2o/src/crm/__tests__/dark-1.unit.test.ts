import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMES, themeFrom } from '../workspace/theme'

/**
 * DARK-1: the theme value, and the two token sets in crm.css. The contrast checks compute WCAG 2.x ratios for the
 * pairs the workspace actually draws (text on surfaces, links, buttons, status text on its tint), in both themes.
 */
const css = readFileSync(path.join(__dirname, '../workspace/ui/crm.css'), 'utf8')

type Rgb = [number, number, number, number]
function block(selector: string): string {
  const i = css.indexOf(`${selector} {`)
  if (i < 0) throw new Error(`no block ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}
function tokens(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--c-[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}
function rgb(v: string): Rgb {
  const m = /^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/.exec(v)
  if (!m) throw new Error(`not an rgb() value: ${v}`)
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) / 100 : 1]
}
/** A translucent colour over an opaque one. */
const over = (top: Rgb, under: Rgb): Rgb => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])).concat(1) as Rgb
const lum = ([r, g, b]: Rgb) =>
  [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i]!, 0)
const ratio = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

const light = tokens(block('.crm-app'))
const dark = tokens(block("[data-theme='dark'] .crm-app"))
const darkSystem = tokens(block(".crm-app:not([data-theme='light'] *)"))

describe('DARK-1 theme value', () => {
  it('system is the default; only the three known values pass', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark'])
    expect(themeFrom('dark')).toBe('dark')
    expect(themeFrom('light')).toBe('light')
    expect(themeFrom('system')).toBe('system')
    for (const junk of [undefined, null, '', 'DARK', 'dark ', 'blue', 1, {}]) expect(themeFrom(junk)).toBe('system')
  })
})

describe('DARK-1 token sets', () => {
  it('the pinned-dark and system-dark blocks are identical', () => {
    expect(darkSystem).toEqual(dark)
  })
  it('every colour token of the light set has a dark value (fonts and sizes are shared)', () => {
    const colour = Object.keys(light).filter((k) => light[k]!.startsWith('rgb('))
    expect(colour.length).toBeGreaterThan(20)
    for (const k of colour.filter((k) => k !== '--c-white')) expect(dark[k], k).toBeDefined()
  })
  it('primary buttons and toasts use the on-strong token, never a fixed white', () => {
    expect(css).not.toMatch(/color: var\(--c-white\)/)
    expect(css.match(/color: var\(--c-on-strong\)/g)?.length).toBe(2)
  })
})

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('DARK-1 contrast, %s theme (WCAG AA)', (_, t) => {
  const c = (k: string) => rgb(t[k]!)
  const text = [
    ['--c-text', '--c-surface'],
    ['--c-text', '--c-canvas'],
    ['--c-text', '--c-n50'],
    ['--c-text-2', '--c-surface'],
    ['--c-text-2', '--c-canvas'],
    ['--c-text-2', '--c-n50'],
    ['--c-n700', '--c-surface'],
    ['--c-accent', '--c-surface'],
    ['--c-accent', '--c-canvas'],
    ['--c-accent-deep', '--c-b50'],
    ['--c-on-strong', '--c-accent'],
    ['--c-on-strong', '--c-accent-deep'],
    ['--c-on-strong', '--c-text'],
  ] as const
  it.each(text)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(ratio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5)
  })
  it.each([
    ['--c-error-text', '--c-error-tint'],
    ['--c-warning-text', '--c-warning-tint'],
    ['--c-success-text', '--c-success-tint'],
  ] as const)('%s on %s (over the surface) ≥ 4.5:1', (fg, tint) => {
    expect(ratio(c(fg), over(c(tint), c('--c-surface')))).toBeGreaterThanOrEqual(4.5)
  })
  it.each([
    ['--c-control', '--c-surface'],
    ['--c-accent', '--c-surface'],
    ['--c-error', '--c-surface'],
  ] as const)('%s on %s ≥ 3:1 (input borders, focus ring, error outline)', (fg, bg) => {
    expect(ratio(c(fg), c(bg))).toBeGreaterThanOrEqual(3)
  })
})
