import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Checker, type Issue } from './check.ts'

/**
 * KIT-0 M6: client theme tokens. `clients/<slug>/theme/tokens.json` is the one source (from the client's Figma variables);
 * `renderTokensCss` turns it into `theme/tokens.css` (`--client-*` custom properties, light and dark). The generator fails closed:
 * a missing token, a colour that is not `#rrggbb`, or a text/UI pair below WCAG AA contrast stops the build.
 *
 * Mapping these `--client-*` properties onto the CRM (`--c-accent`, `--c-accent-deep`: three definitions in crm.css today) and the
 * site token families is a later step in hot files (after the 1.3b head); this item adds only new files.
 */
export const COLOR_KEYS = ['accent', 'accentDeep', 'accentOn', 'text', 'textMuted', 'surface', 'surfaceAlt', 'rule', 'success', 'warning', 'error'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]
/** A value is `null` only when listed in `pending` (observed gap awaiting the Design Director); it is then omitted from the CSS. */
export type Palette = Record<ColorKey, string | null>
export type Pending = { token: string; reason: string }
export type Tokens = {
  schemaVersion: 1
  source: string
  /** `['light']` = the client has no dark theme (dark is null and no dark CSS is emitted); never derived silently. */
  modes: ['light'] | ['light', 'dark']
  light: Palette
  dark: Palette | null
  pending: Pending[]
  radii: { control: string; card: string; cta: string }
  fonts: { body: string; display: string }
}

const HEX = /^#[0-9a-fA-F]{6}$/
const LEN = /^[0-9]{1,2}(px|rem)$/
const FONT = /^[A-Za-z0-9 ,'"._-]{2,120}$/

export const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const lin = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Pairs that must pass: [foreground, background, minimum ratio, why]. */
const PAIRS: Array<[ColorKey, ColorKey, number, string]> = [
  ['text', 'surface', 4.5, 'body text on the page'],
  ['text', 'surfaceAlt', 4.5, 'body text on a panel'],
  ['textMuted', 'surface', 4.5, 'secondary text on the page'],
  ['accentOn', 'accent', 4.5, 'text on an accent button'],
  ['accent', 'surface', 3, 'accent as a link, icon or control outline'],
  ['error', 'surface', 4.5, 'error text'],
]

export function validateTokens(raw: unknown): { ok: true; tokens: Tokens } | { ok: false; issues: Issue[] } {
  const c = new Checker()
  const top = c.obj(raw, '$', ['schemaVersion', 'source', 'modes', 'light', 'dark', 'pending', 'radii', 'fonts'])
  if (!top) return { ok: false, issues: c.issues }
  if (top.schemaVersion !== 1) c.fail('$.schemaVersion', 'must be 1')
  c.str(top.source, '$.source', { max: 200 })
  const modesOk = Array.isArray(top.modes) && (top.modes.join() === 'light' || top.modes.join() === 'light,dark')
  if (!modesOk) c.fail('$.modes', "must be ['light'] or ['light', 'dark']")
  const hasDark = modesOk && (top.modes as string[]).includes('dark')
  const pending = new Set<string>()
  for (const [i, e] of c.arr(top.pending, '$.pending', { max: 50 }).entries()) {
    const pe = c.obj(e, `$.pending[${i}]`, ['token', 'reason'])
    if (!pe) continue
    const t = c.str(pe.token, `$.pending[${i}].token`, { max: 60 })
    c.str(pe.reason, `$.pending[${i}].reason`, { max: 300 })
    if (t) pending.add(t)
  }
  if (modesOk && !hasDark && top.dark !== null) c.fail('$.dark', 'must be null when modes is [light]: a missing dark theme is not derived silently')
  if (hasDark && top.dark === null) c.fail('$.dark', 'is required when modes includes dark')
  for (const mode of ['light', 'dark'] as const) {
    if (mode === 'dark' && !hasDark) continue
    const pal = c.obj(top[mode], `$.${mode}`, COLOR_KEYS)
    if (!pal) continue
    for (const k of COLOR_KEYS) {
      if (!(k in pal)) continue
      if (pal[k] === null) {
        if (!pending.has(`${mode}.${k}`)) c.fail(`$.${mode}.${k}`, `is null but not listed in pending as ${mode}.${k}`)
      } else c.str(pal[k], `$.${mode}.${k}`, { pattern: HEX, what: 'a #rrggbb colour' })
    }
    for (const [fg, bg, min, why] of PAIRS) {
      const a = pal[fg]
      const b = pal[bg]
      if (typeof a !== 'string' || typeof b !== 'string' || !HEX.test(a) || !HEX.test(b)) continue
      const r = contrast(a, b)
      if (r < min) c.fail(`$.${mode}.${fg}`, `${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1 (${why})`)
    }
  }
  for (const mode of ['light', 'dark'] as const) {
    const pal = top[mode] as Palette | null
    if (!pal || typeof pal !== 'object') continue
    const st = deriveStates(pal)
    const surface = pal.surface
    const on = pal.accentOn
    if (!st || typeof surface !== 'string' || typeof on !== 'string' || !HEX.test(surface) || !HEX.test(on)) continue
    for (const [name, where, min, why] of STATE_PAIRS) {
      const color = st[name]
      if (!HEX.test(color)) continue
      const r = where === 'label' ? contrast(on, color) : contrast(color, surface)
      if (r < min) c.fail(`$.${mode}.accentDeep`, `derived ${name} is ${r.toFixed(2)}:1, needs ${min}:1 (${why})`)
    }
  }
  const radii = c.obj(top.radii, '$.radii', ['control', 'card', 'cta'])
  if (radii) for (const k of Object.keys(radii)) c.str(radii[k], `$.radii.${k}`, { pattern: LEN, what: 'a length like 4px or 0.5rem' })
  const fonts = c.obj(top.fonts, '$.fonts', ['body', 'display'])
  if (fonts) for (const k of Object.keys(fonts)) c.str(fonts[k], `$.fonts.${k}`, { pattern: FONT, what: 'a font-family list' })
  return c.issues.length ? { ok: false, issues: c.issues } : { ok: true, tokens: top as unknown as Tokens }
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
/** Darken toward black by a fraction (0..1). Deterministic: used to derive the pressed state. */
export const shade = (hex: string, f: number) => `#${rgb(hex).map((v) => hex2(v * (1 - f))).join('')}`

/**
 * Interactive states are DERIVED from the palette (client files rarely draw them): hover = accentDeep, pressed = accentDeep darkened 12%,
 * link = accent, link hover = accentDeep, focus ring = accent. Each derived pair is contrast-checked; a failure stops the build.
 */
export function deriveStates(p: Palette): Record<string, string> | null {
  if (!p.accent || !p.accentDeep) return null
  return { accentHover: p.accentDeep, accentActive: shade(p.accentDeep, 0.12), link: p.accent, linkHover: p.accentDeep, focusRing: p.accent }
}
/** [state, what it sits on, minimum, why]: `label` = accentOn text on the state colour; `page` = the state colour on the page surface. */
const STATE_PAIRS: Array<[string, 'label' | 'page', number, string]> = [
  ['accentHover', 'label', 4.5, 'label on a hovered accent button'],
  ['accentActive', 'label', 4.5, 'label on a pressed accent button'],
  ['linkHover', 'page', 4.5, 'hovered link text on the page'],
  ['focusRing', 'page', 3, 'focus ring against the page'],
]

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
const block = (sel: string, p: Palette) =>
  `${sel} {\n${COLOR_KEYS.filter((k) => p[k] !== null)
    .map((k) => `  --client-${kebab(k)}: rgb(${rgb(p[k] as string).join(' ')});`)
    .concat(Object.entries(deriveStates(p) ?? {}).map(([k, v]) => `  --client-${kebab(k)}: rgb(${rgb(v).join(' ')});`))
    .join('\n')}\n}\n`

/** Deterministic CSS: same tokens, same bytes. Dark applies by `prefers-color-scheme` unless a theme is forced either way. */
export function renderTokensCss(t: Tokens): string {
  const dark = t.dark
  return [
    `/* Generated by tools/client-kit from theme/tokens.json (${t.source}). Do not edit. */`,
    '/* Interactive states (hover, pressed, link, focus ring) are DERIVED from accent/accentDeep and contrast-checked; they are not drawn in the client file. */',
    ...(t.pending.length ? [`/* PENDING sign-off, not emitted or not final: ${t.pending.map((p) => `${p.token} (${p.reason})`).join('; ')} */`] : []),
    ...(dark ? [] : ['/* No dark theme: this client is light only. */']),
    block(':root', t.light),
    `:root {\n  --client-radius-control: ${t.radii.control};\n  --client-radius-card: ${t.radii.card};\n  --client-radius-cta: ${t.radii.cta};\n  --client-font-body: ${t.fonts.body};\n  --client-font-display: ${t.fonts.display};\n}\n`,
    ...(dark
      ? [
          `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', dark).replace(/^/gm, '  ').replace(/ +$/gm, '')}}\n`,
          block(':root[data-theme="dark"]', dark),
        ]
      : []),
  ].join('\n')
}

export class TokensError extends Error {
  readonly issues: Issue[]
  constructor(file: string, issues: Issue[]) {
    super(`Invalid theme tokens ${file}:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`)
    this.issues = issues
  }
}
export function loadTokens(clientDir: string): Tokens {
  const file = path.join(clientDir, 'theme', 'tokens.json')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new TokensError(file, [{ path: '$', message: `cannot read as JSON (${(e as Error).message})` }])
  }
  const r = validateTokens(raw)
  if (!r.ok) throw new TokensError(file, r.issues)
  return r.tokens
}
