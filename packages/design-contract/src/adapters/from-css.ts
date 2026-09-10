/**
 * Adapter: existing website CSS (+ optional design-token notes) → design-contract.json.
 *
 * Reads every `:root { --x: y }` declaration from a stylesheet, records the line it came
 * from, and maps the legacy variable names onto the contract's roles. Everything it emits
 * is labelled `inferred` so a later Figma/Claude design pass can override it deliberately.
 *
 * The role mapping below is specific to the Syed AI naming scheme (`--c-*`, `--fs-*`, `--s-*`);
 * other sites get their own mapping object — the parser is generic.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { type DesignContract, type Source, CONTRACT_VERSION } from '../schema.ts'

export type CssVar = { name: string; value: string; line: number }

/** Extract custom properties declared inside any `:root{...}` block, with 1-based line numbers. */
export function parseRootVars(css: string): CssVar[] {
  const out: CssVar[] = []
  const re = /:root\s*\{([^}]*)\}/g
  for (const m of css.matchAll(re)) {
    const blockStart = css.slice(0, m.index).split('\n').length
    const body = m[1]!
    // strip comments but keep newlines so line numbers stay right
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    const lines = clean.split('\n')
    lines.forEach((ln, i) => {
      for (const d of ln.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
        out.push({ name: d[1]!, value: d[2]!.trim(), line: blockStart + i })
      }
    })
  }
  return out
}

export type FromCssOptions = {
  cssPath: string
  /** Optional markdown notes (DESIGN-TOKENS.md) — recorded as a consulted source */
  notesPath?: string
  client: string
  name: string
  brandName: string
  /** Font files already resolved by the fonts step (paths under /public) */
  fonts: DesignContract['typography']['display'] extends infer T ? { display: T; text: T } : never
}

export function fromCss(opts: FromCssOptions): DesignContract {
  const css = readFileSync(opts.cssPath, 'utf8')
  const file = basename(opts.cssPath)
  const vars = parseRootVars(css)
  const byName = new Map(vars.map((v) => [v.name, v]))

  const src = (name: string, note?: string): Source => {
    const v = byName.get(name)
    if (!v) throw new Error(`from-css: expected ${name} in ${file} :root`)
    return { kind: 'inferred', ref: `${file}:${v.line}`, note }
  }
  const val = (name: string): string => {
    const v = byName.get(name)
    if (!v) throw new Error(`from-css: expected ${name} in ${file} :root`)
    return v.value
  }
  const hex = (name: string) => ({ value: val(name).toUpperCase(), source: src(name) })
  const len = (name: string) => ({ value: val(name).replace(/\s+/g, ' '), source: src(name) })
  const num = (name: string) => ({ value: Number(val(name)), source: src(name) })
  const str = (name: string) => ({ value: val(name), source: src(name) })

  // Heading weight/line-height are set in rules, not :root — read them from the CSS too.
  const headingRule = css.match(/h1,h2\{[^}]*font-weight:var\((--w-[a-z]+)\)[^}]*\}/)
  const headingWeightVar = headingRule?.[1] ?? '--w-semi'
  const headingLine = headingRule ? css.slice(0, headingRule.index).split('\n').length : 0
  const opsz = css.match(/font-variation-settings:\s*"opsz"\s*(\d+)/)?.[1] ?? '14'

  const paletteNames = vars.filter((v) => v.name.startsWith('--c-')).map((v) => v.name)
  const palette = Object.fromEntries(paletteNames.map((n) => [n.replace('--c-', ''), hex(n)]))

  const spacing = Object.fromEntries(
    vars.filter((v) => /^--s-\d$/.test(v.name)).map((v) => [v.name.replace('--s-', ''), len(v.name)]),
  )
  const scale = Object.fromEntries(
    vars.filter((v) => /^--fs-/.test(v.name)).map((v) => [v.name.replace('--fs-', ''), len(v.name)]),
  )
  const weights = Object.fromEntries(
    vars.filter((v) => /^--w-/.test(v.name)).map((v) => [v.name.replace('--w-', ''), num(v.name)]),
  )
  const lineHeights = Object.fromEntries(
    vars.filter((v) => /^--lh-/.test(v.name)).map((v) => [v.name.replace('--lh-', ''), num(v.name)]),
  )
  const letterSpacing = Object.fromEntries(
    vars.filter((v) => /^--ls-/.test(v.name)).map((v) => [v.name.replace('--ls-', ''), str(v.name)]),
  )

  // Breakpoints: collect max-width media queries actually used, most frequent first.
  const bpCounts = new Map<number, number>()
  for (const m of css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)) {
    const n = Number(m[1])
    bpCounts.set(n, (bpCounts.get(n) ?? 0) + 1)
  }
  const bpSource: Source = {
    kind: 'inferred',
    ref: `${file}:@media`,
    note: 'max-width queries observed in the stylesheet',
  }
  // `keyboardHint` is the single 1500px rule that shows the command-palette keyboard hint; it is a media query, not a layout tier (ADR-023).
  const named: Record<string, number> = { keyboardHint: 1500, wide: 1180, tablet: 900, phone: 600 }
  const breakpoints = Object.fromEntries(
    Object.entries(named)
      .filter(([, px]) => bpCounts.has(px))
      .map(([k, px]) => [
        k,
        { value: px, source: { ...bpSource, note: `${bpCounts.get(px)} rules at ${px}px` } },
      ]),
  )

  const shadows: Record<string, { value: string; source: Source }> = {}
  const shadowSeen = new Set<string>()
  for (const m of css.matchAll(/box-shadow:\s*([^;}]+)/g)) {
    const v = m[1]!.trim()
    if (shadowSeen.has(v) || v === 'none') continue
    shadowSeen.add(v)
    const line = css.slice(0, m.index).split('\n').length
    const key =
      ['float', 'raised', 'overlay', 'modal'][shadows && Object.keys(shadows).length] ??
      `shadow${Object.keys(shadows).length}`
    shadows[key] = {
      value: v,
      source: {
        kind: 'inferred',
        ref: `${file}:${line}`,
        note: 'literal in a rule; no shadow token existed',
      },
    }
  }

  const contract: DesignContract = {
    $schema: 'https://factory.local/schemas/design-contract-v1.json',
    version: CONTRACT_VERSION,
    meta: {
      client: opts.client,
      name: opts.name,
      sources: [opts.cssPath, ...(opts.notesPath ? [opts.notesPath] : [])],
    },
    brand: {
      name: opts.brandName,
      wordmark: { text: 'syed', accentSuffix: '.ai', subline: 'SYED ABDUL · AI SEARCH' },
      logo: {
        svg: '/assets/img/logo.svg',
        png: '/assets/img/logo.png',
        monogramSvg: '/assets/img/favicon.svg',
      },
      colorScheme: val('--c-bg') && css.includes('color-scheme:dark') ? 'dark' : 'both',
    },
    palette,
    colors: {
      canvas: hex('--c-bg'),
      surface: hex('--c-surface-1'),
      surfaceRaised: hex('--c-surface-2'),
      surfaceWell: hex('--c-surface-3'),
      textPrimary: hex('--c-text'),
      textBody: hex('--c-text-2'),
      textMuted: hex('--c-text-3'),
      accent: hex('--c-gold'),
      accentLight: hex('--c-gold-light'),
      accentDark: hex('--c-gold-dark'),
      accentContrast: hex('--c-on-gold'),
      border: hex('--c-line'),
      borderSoft: hex('--c-line-soft'),
      controlBorder: {
        value: hex('--c-gold-dark').value,
        source: {
          kind: 'declared',
          ref: 'design-contract:a11y',
          note: 'Legacy inputs used --c-line on --c-surface-2 (1.67:1, fails WCAG 1.4.11 non-text contrast 3:1). Quiet gold from the palette gives 3.62:1 on the input surface and 4.06:1 on canvas.',
        },
      },
      success: hex('--c-live'),
      warning: {
        value: hex('--c-gold').value,
        source: { kind: 'default', ref: 'compiler', note: 'no warning colour in legacy; accent reused' },
      },
      error: hex('--c-alert'),
    },
    typography: {
      display: {
        ...opts.fonts.display,
        opticalRules: {
          'font-optical-sizing': 'none',
          'font-variation-settings': `"opsz" ${opsz}`,
        },
      },
      text: opts.fonts.text,
      weights: {
        ...weights,
        heading: {
          value: Number(val(headingWeightVar)),
          source: {
            kind: 'inferred',
            ref: `${file}:${headingLine}`,
            note: `h1,h2 use var(${headingWeightVar}); DESIGN-TOKENS.md says 500 — CSS wins (A1)`,
          },
        },
      },
      scale,
      lineHeights: {
        ...lineHeights,
        d1: { value: 1.1, source: { kind: 'inferred', ref: `${file}:.t-d1` } },
        d2: { value: 1.14, source: { kind: 'inferred', ref: `${file}:.t-d2` } },
        d3: { value: 1.2, source: { kind: 'inferred', ref: `${file}:.t-d3` } },
        lead: { value: 1.65, source: { kind: 'inferred', ref: `${file}:.t-lead` } },
      },
      letterSpacing,
      measure: {
        value: { min: 55, ideal: 66, max: 75 },
        source: {
          kind: 'default',
          ref: 'master-prompt',
          note: 'readable prose measure 55–75ch; .takeaway ul uses 82ch max-width',
        },
      },
      headingWrap: { value: 'balance', source: { kind: 'inferred', ref: `${file}:h1,h2 text-wrap:balance` } },
      uppercaseOnlyFor: ['label', 'button', 'table-head', 'takeaway-eyebrow'],
    },
    layout: {
      spacing,
      containerMax: len('--maxw'),
      navHeight: len('--nav-h'),
      breakpoints,
      grids: {
        two: {
          value: { columns: 2, gap: 'var(--s-6)' },
          source: { kind: 'inferred', ref: `${file}:.grid-2` },
        },
        three: {
          value: { columns: 3, gap: 'var(--s-6)' },
          source: { kind: 'inferred', ref: `${file}:.grid-3` },
        },
      },
      radii: { base: len('--radius') },
      borders: {
        hair: { value: '1px solid var(--c-line-soft)', source: { kind: 'inferred', ref: `${file}:.rule` } },
        visible: { value: '1px solid var(--c-line)', source: { kind: 'inferred', ref: `${file}:.tbl-wrap` } },
        accent: { value: '2px solid var(--c-gold)', source: { kind: 'inferred', ref: `${file}:.takeaway` } },
      },
      shadows,
      zIndex: {
        rail: { value: 60, source: { kind: 'inferred', ref: `${file}:.scroll-rail` } },
        chat: { value: 70, source: { kind: 'inferred', ref: `${file}:.chat-fab` } },
      },
    },
    motion: {
      durations: { base: str('--dur') },
      easings: { base: str('--ease') },
      reducedMotion: {
        value: 'disable-all',
        source: { kind: 'inferred', ref: `${file}:@media (prefers-reduced-motion:reduce)` },
      },
    },
    focus: {
      outline: {
        value: '1px solid var(--c-gold)',
        source: { kind: 'inferred', ref: `${file}::focus-visible` },
      },
      offset: { value: '3px', source: { kind: 'inferred', ref: `${file}::focus-visible` } },
    },
    components: {
      button: { variants: ['solid', 'ghost', 'sm'], states: ['hover', 'focus-visible', 'disabled'] },
      rule: { variants: ['hair', 'gold', 'gold-thin'], states: [] },
      table: { variants: ['compare', 'price'], states: [] },
      pill: { variants: ['live', 'beta', 'wip'], states: [] },
      monogram: { variants: ['default', 'sm'], states: ['hover'] },
    },
    images: {
      hero: { ratio: '16:9', note: 'hero-1600 is 1600×900; served via <picture> with 760/1100/1600 widths' },
      og: { ratio: '1.91:1', note: '1200×630' },
      portrait: { ratio: '4:5', note: 'desk-900 is 900×1129' },
      cta: { ratio: '2.6:1', note: 'cta-1600 is 1600×612' },
    },
    accessibility: {
      contrastPairs: [
        { foreground: 'textPrimary', background: 'canvas', use: 'body-text' },
        { foreground: 'textBody', background: 'canvas', use: 'body-text' },
        { foreground: 'textBody', background: 'surfaceRaised', use: 'body-text' },
        { foreground: 'textMuted', background: 'canvas', use: 'caption-only' },
        { foreground: 'accent', background: 'canvas', use: 'body-text' },
        { foreground: 'accentContrast', background: 'accent', use: 'body-text' },
        { foreground: 'error', background: 'canvas', use: 'body-text' },
        { foreground: 'success', background: 'canvas', use: 'ui-component' },
        { foreground: 'border', background: 'canvas', use: 'decorative' },
        { foreground: 'controlBorder', background: 'surfaceRaised', use: 'ui-component' },
        { foreground: 'controlBorder', background: 'canvas', use: 'ui-component' },
      ],
      notes: [
        'Display face (Bodoni Moda) only at ≥28px: hairlines vanish on the dark ground below that.',
        'Uppercase only on labels/buttons/table heads; headings are sentence case.',
        'prefers-reduced-motion disables typewriter, counters, parallax, magnetic buttons and sheen.',
        'Focus ring is a 1px accent outline offset 3px; never removed.',
        'Hairline dividers (--c-line, --c-line-soft) are decorative and exempt from non-text contrast; form-control borders use controlBorder (≥3:1).',
      ],
    },
    legacyVars: Object.fromEntries(
      vars.map((v) => [
        v.name,
        {
          value: v.value.replace(/\s+/g, ' '),
          source: { kind: 'inferred' as const, ref: `${file}:${v.line}` },
        },
      ]),
    ),
  }
  return contract
}
