/**
 * Card and board rendering (C5.5 workstreams A, D, E).
 *
 * Every card is a whole, self-contained HTML document: no network, no script, all CSS inlined,
 * fonts either base64'd or pointed at the bundle's own `assets/fonts/`. It carries the `@dsCard`
 * marker the design pane reads and a `<meta name="viewport">` fixed to the width it was rendered
 * for.
 *
 * That last part is the correction to the C5.5 spike's observation 5 ("the hero at 390 shows the
 * media overlapping the heading"). A static card cannot make a CSS media query resolve against
 * anything but the *viewport it is displayed in*: a 390-wide card opened in a 1440-wide frame runs
 * the desktop rules on a narrow box, and the overlap follows. So a card declares the viewport it
 * is faithful at, and the render check opens it at exactly that width — which is where the phone
 * layout is actually verified (`apps/<client>/e2e/design-qa.spec.ts`).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { escapeHtml } from './safety/markup.ts'
import type { FixtureBrand } from './brand.ts'

export type CardMeta = {
  group: string
  name: string
  viewport: number
  block: string
  fixture: string
}

/** Blocks that paint their own full-bleed background and must not sit inside the container. */
const BLEED = new Set(['hero', 'cta'])

export function renderCardBody(
  Component: (p: never) => ReactElement | null,
  props: unknown,
  block: string,
  kind: 'layout' | 'chrome',
): string {
  const el = Component(props as never)
  const body = renderToStaticMarkup(el)
  if (kind === 'chrome' || BLEED.has(block)) return body
  return `<div class="ds-container" style="padding-block:var(--s-7)">${body}</div>`
}

/**
 * Wrap a rendered body into a complete card document.
 *
 * The `Content-Security-Policy` meta is belt and braces: `checkMarkup` already refuses script and
 * off-document URLs at build time, but a card is a file that travels — into a hosted project, into
 * an artifact, onto a reviewer's disk — and the browser should enforce the same rule wherever it
 * ends up. `frame-ancestors` is deliberately absent: browsers ignore it in a meta element and log
 * a console error, and a card that logs on open fails its own render check.
 */
export function cardDocument(meta: CardMeta, css: string, body: string): string {
  const title = `${meta.name} · ${meta.viewport}`
  // A card is a whole document, and a document needs one h1. Most blocks are fragments that
  // legitimately start at h2, so — exactly as the /dev/blocks route does — the card supplies a
  // screen-reader-only heading naming what is on it, and blocks that own the page heading (the
  // hero) keep theirs.
  const heading = /<h1[\s>]/i.test(body) ? '' : `<h1 class="visually-hidden">${escapeHtml(meta.name)}</h1>`
  return `<!-- @dsCard group="${escapeHtml(meta.group)}" name="${escapeHtml(meta.name)}" viewport="${meta.viewport}" -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${meta.viewport}, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<main id="main" data-block="${escapeHtml(meta.block)}" data-fixture="${escapeHtml(meta.fixture)}" data-viewport="${meta.viewport}">${heading}${body}</main>
</body>
</html>
`
}

/** Escaped table of key/value rows used by several boards. */
function rows(pairs: Array<[string, string]>): string {
  return pairs
    .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('')
}

export type TypeBoardInput = {
  scale: Array<{ token: string; value: string }>
  fonts: Array<{
    role: string
    family: string
    license: string
    embedded: boolean
    reason?: string
    fallbacks: string[]
  }>
  brand: FixtureBrand
}

/**
 * The Type board doubles as the font-rights notice: a family that could not be embedded is named
 * here with its licence and the reason, so nobody approves type they will not receive (R49).
 */
export function typeBoard(input: TypeBoardInput): string {
  const specimens = input.scale
    .map(
      (s) =>
        `<div class="ds-stack"><p class="ds-label">${escapeHtml(s.token)} — ${escapeHtml(s.value)}</p>` +
        `<p style="font-size:${escapeHtml(s.value)};font-family:var(--font-display);line-height:1.1;margin:0">Grumpy wizards make toxic brew</p></div>`,
    )
    .join('')
  const rights = input.fonts
    .map((f) => {
      const state = f.embedded
        ? '<strong>embedded</strong>'
        : `<strong>not embedded</strong> — ${escapeHtml(f.reason ?? 'licence does not permit redistribution')}`
      return `<li><strong>${escapeHtml(f.family)}</strong> (${escapeHtml(f.role)}) · licence ${escapeHtml(f.license)} · ${state}<br><span class="ds-label">fallback: ${escapeHtml(f.fallbacks.join(', ') || 'none declared')}</span></li>`
    })
    .join('')
  return `<h1>Type</h1>
<p>Every size in the contract's scale, set in the display family. ${escapeHtml(input.brand.siteName)}.</p>
<section class="ds-stack">${specimens}</section>
<h2>Font rights</h2>
<ul class="ds-stack">${rights}</ul>
<p class="ds-label">A family that is not embedded renders in its fallback stack here and everywhere this bundle is opened. That is the design you will get until a redistributable licence is supplied.</p>`
}

export function colorBoard(
  swatches: Array<{ token: string; value: string }>,
  pairs: Array<{ foreground: string; background: string; use: string; ratio: number; passes: boolean }>,
): string {
  const cells = swatches
    .map(
      (s) =>
        `<figure style="margin:0"><div style="block-size:80px;border:1px solid var(--color-border);background:var(--color-${escapeHtml(kebab(s.token))})"></div>` +
        `<figcaption class="ds-label">${escapeHtml(s.token)} · ${escapeHtml(s.value)}</figcaption></figure>`,
    )
    .join('')
  const table = pairs
    .map(
      (p) =>
        `<tr><th scope="row">${escapeHtml(p.foreground)} on ${escapeHtml(p.background)}</th><td>${escapeHtml(p.use)}</td><td>${p.ratio.toFixed(2)}:1</td><td>${p.passes ? 'pass' : 'FAIL'}</td></tr>`,
    )
    .join('')
  return `<h1>Colours</h1>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:var(--s-4)">${cells}</div>
<h2>Declared contrast pairs</h2>
<table><thead><tr><th scope="col">Pair</th><th scope="col">Use</th><th scope="col">Ratio</th><th scope="col">WCAG</th></tr></thead><tbody>${table}</tbody></table>`
}

export function spacingBoard(spacing: Array<[string, string]>, container: Array<[string, string]>): string {
  const bars = spacing
    .map(
      ([k, v]) =>
        `<div style="display:flex;gap:var(--s-3);align-items:center"><span class="ds-label" style="inline-size:6ch">${escapeHtml(k)}</span>` +
        `<span style="display:block;block-size:12px;inline-size:${escapeHtml(v)};background:var(--color-accent)"></span>` +
        `<span class="ds-label">${escapeHtml(v)}</span></div>`,
    )
    .join('')
  return `<h1>Spacing</h1><div class="ds-stack">${bars}</div>
<h2>Container</h2><table><tbody>${rows(container)}</tbody></table>`
}

export function radiiMotionBoard(radii: Array<[string, string]>, motion: Array<[string, string]>): string {
  const chips = radii
    .map(
      ([k, v]) =>
        `<figure style="margin:0"><div style="block-size:64px;background:var(--color-surface-raised);border:1px solid var(--color-border);border-radius:${escapeHtml(v)}"></div><figcaption class="ds-label">${escapeHtml(k)} · ${escapeHtml(v)}</figcaption></figure>`,
    )
    .join('')
  return `<h1>Radii &amp; motion</h1>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:var(--s-4)">${chips}</div>
<h2>Motion</h2><table><tbody>${rows(motion)}</tbody></table>
<p class="ds-label">Reduced motion disables every animation; the cards in this bundle are static by construction.</p>`
}

export function chromeBoard(brand: FixtureBrand, blocks: string[]): string {
  return `<h1>Chrome</h1>
<p>Header and footer render from CMS globals on the real site; here they render from the shared fixtures with the ${escapeHtml(brand.id === 'neutral' ? 'neutral preset' : brand.siteName)} identity injected.</p>
<ul>${blocks.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
}

/** `surfaceRaised` → `surface-raised`, matching the compiled custom-property names. */
export function kebab(token: string): string {
  return token.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function boardDocument(
  name: string,
  group: string,
  viewport: number,
  css: string,
  body: string,
): string {
  return cardDocument(
    { group, name, viewport, block: 'foundation', fixture: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    css,
    `<div class="ds-container" style="padding-block:var(--s-7)">${body}</div>`,
  )
}
