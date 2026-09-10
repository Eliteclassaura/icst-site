import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fromCss, parseRootVars } from '../src/adapters/from-css.ts'
import { installFonts, SYED_FONTS } from '../src/fonts.ts'
import { compile } from '../src/compile.ts'
import { parseContract } from '../src/schema.ts'
import { contrastRatio } from '../src/contrast.ts'
import { emitCss } from '../src/emit/index.ts'

const REPO = resolve(import.meta.dirname, '../../..')
const LEGACY_CSS = resolve(REPO, 'legacy-reference/syed-ai-site/assets/css/site.css')
const COMMITTED = resolve(REPO, 'apps/syed-ai/design/design-contract.json')

let tmp: string
let contractA: ReturnType<typeof fromCss>
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dc-'))
  const fonts = { display: installFonts(SYED_FONTS.display, tmp), text: installFonts(SYED_FONTS.text, tmp) }
  contractA = fromCss({ cssPath: LEGACY_CSS, client: 'syed-ai', name: 't', brandName: 'syed.ai', fonts })
})

describe('parseRootVars', () => {
  it('reads every :root declaration in the legacy stylesheet with line numbers', () => {
    const vars = parseRootVars(readFileSync(LEGACY_CSS, 'utf8'))
    expect(vars.length).toBe(54) // 51 in the main block + 3 chat tokens at line 828
    const bg = vars.find((v) => v.name === '--c-bg')!
    expect(bg.value).toBe('#060504')
    expect(bg.line).toBe(13)
    expect(vars.find((v) => v.name === '--chat-w')?.value).toBe('392px')
  })
  it('ignores declarations inside comments', () => {
    const vars = parseRootVars(':root{ /* --x: 1; */ --y: 2; }')
    expect(vars.map((v) => v.name)).toEqual(['--y'])
  })
})

describe('contract from legacy CSS', () => {
  it('validates against the schema and round-trips through JSON', () => {
    const json = JSON.parse(JSON.stringify(contractA))
    expect(() => parseContract(json)).not.toThrow()
  })
  it('labels every legacy-derived value as inferred with a file:line reference', () => {
    for (const [, t] of Object.entries(contractA.palette)) {
      expect(t.source.kind).toBe('inferred')
      expect(t.source.ref).toMatch(/^site\.css:\d+$/)
    }
  })
  it('keeps the brand signature: radius 0, dark scheme, Bodoni Moda + Jost, heading weight 600, opsz 14', () => {
    expect(contractA.layout.radii.base!.value).toBe('0')
    expect(contractA.brand.colorScheme).toBe('dark')
    expect(contractA.typography.display.family).toBe('Bodoni Moda')
    expect(contractA.typography.text.family).toBe('Jost')
    expect(contractA.typography.weights.heading!.value).toBe(600)
    expect(contractA.typography.display.opticalRules['font-variation-settings']).toBe('"opsz" 14')
  })
  it('the committed apps/syed-ai contract equals a fresh derivation (excluding font origins)', () => {
    const committed = parseContract(JSON.parse(readFileSync(COMMITTED, 'utf8')))
    expect(committed.legacyVars).toEqual(contractA.legacyVars)
    expect(committed.colors).toEqual(contractA.colors)
    expect(committed.typography.scale).toEqual(contractA.typography.scale)
  })
})

describe('emitters', () => {
  it('are deterministic: two compiles produce byte-identical files', () => {
    const a = join(tmp, 'a'),
      b = join(tmp, 'b')
    compile(contractA, a)
    compile(contractA, b)
    for (const f of readdirSync(a))
      expect(readFileSync(join(a, f), 'utf8')).toBe(readFileSync(join(b, f), 'utf8'))
  })
  it('reproduce every legacy :root custom property with an identical value', () => {
    const css = emitCss(contractA)
    const emitted = new Map(parseRootVars(css).map((v) => [v.name, v.value]))
    for (const v of parseRootVars(readFileSync(LEGACY_CSS, 'utf8'))) {
      expect(emitted.get(v.name), v.name).toBe(v.value.replace(/\s+/g, ' '))
    }
    expect(emitted.get('--radius')).toBe('0')
  })
  it('emit semantic role aliases alongside legacy names', () => {
    const css = emitCss(contractA)
    expect(css).toMatch(/--color-canvas: #060504;/)
    expect(css).toMatch(/--color-accent: #CFAF67;/)
    expect(css).toMatch(/--color-control-border: #8A6A30;/)
  })
  it('contrast report: every declared pair passes WCAG AA for its use', () => {
    const res = compile(contractA, join(tmp, 'c'))
    expect(res.contrast.pass, JSON.stringify(res.contrast.results.filter((r) => !r.pass))).toBe(true)
    expect(res.contrast.results.length).toBeGreaterThanOrEqual(10)
  })
  it('records the legacy input-border failure that motivated controlBorder', () => {
    // #443C2E on #191510 — the legacy .field input border — fails 3:1
    expect(contrastRatio('#443C2E', '#191510')).toBeLessThan(3)
    expect(contrastRatio(contractA.colors.controlBorder.value, '#191510')).toBeGreaterThanOrEqual(3)
    expect(contractA.colors.controlBorder.source.kind).toBe('declared')
  })
  it('fonts: self-hosted WOFF2 with OFL licence, no Google Fonts URL anywhere', () => {
    const fontsCss = readFileSync(join(tmp, 'a', 'fonts.css'), 'utf8')
    expect(fontsCss).not.toMatch(/googleapis|gstatic/)
    expect(fontsCss).toMatch(
      /src: url\("\/fonts\/bodoni-moda-latin-standard-normal\.woff2"\) format\("woff2"\) tech\(variations\)/,
    )
    expect(contractA.typography.display.license.name).toBe('OFL-1.1')
    expect(readdirSync(join(tmp, 'fonts'))).toEqual(
      expect.arrayContaining(['LICENSE-bodoni-moda.txt', 'LICENSE-jost.txt', 'jost-latin-wght-normal.woff2']),
    )
  })
})

describe('contrast arithmetic', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })
})

describe('Figma handoff contract agrees with the compiled contract (ADR-023)', () => {
  const root = resolve(import.meta.dirname, '../../..')
  const doc = readFileSync(join(root, 'docs/figma-contract.md'), 'utf8')
  const syed = parseContract(
    JSON.parse(readFileSync(join(root, 'apps/syed-ai/design/design-contract.json'), 'utf8')),
  )
  const namesInRow = (label: string) => {
    const row = doc.split('\n').find((l) => l.startsWith(`| \`${label}\``))
    if (!row) throw new Error(`no row for ${label}`)
    const cell = row.split('|')[2] ?? ''
    return [...cell.matchAll(/`([a-zA-Z0-9-]+)(?:`…`([a-zA-Z0-9-]+))?`/g)].flatMap((m) => {
      // expand `n1`…`n4`
      const first = m[1] ?? ''
      if (m[2]) {
        const a = first.match(/^([a-z]+)(\d+)$/)
        const b = m[2].match(/^([a-z]+)(\d+)$/)
        if (a && b && a[1] === b[1]) {
          const out: string[] = []
          for (let i = Number(a[2]); i <= Number(b[2]); i++) out.push(`${a[1]}${i}`)
          return out
        }
      }
      return [first]
    })
  }
  it('breakpoint names match, so a Figma export never produces inferred duplicates', () => {
    expect(namesInRow('breakpoint').sort()).toEqual(Object.keys(syed.layout.breakpoints).sort())
  })
  it('type/size names match the compiled scale', () => {
    expect(namesInRow('type/size').sort()).toEqual(Object.keys(syed.typography.scale).sort())
  })
  it('type/leading names match', () => {
    expect(namesInRow('type/leading').sort()).toEqual(Object.keys(syed.typography.lineHeights).sort())
  })
  it('CSS variables for breakpoints are kebab-case', () => {
    expect(emitCss(syed)).toMatch(/--bp-keyboard-hint: 1500px/)
  })
})
