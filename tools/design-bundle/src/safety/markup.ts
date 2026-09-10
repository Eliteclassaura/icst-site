/**
 * Markup, CSS, SVG and URL policy for design artefacts (C5.5 workstreams D, H).
 *
 * Design artefacts are static pictures of a design system. They therefore need no script, no
 * network, no embedding and no navigation, which makes an allow-list practical: everything the
 * cards legitimately contain is a tag, an attribute, a `data:` image or a relative font URL.
 *
 * These functions **refuse**; they do not rewrite. Sanitising by rewriting invites a parser
 * differential — the checker and the browser disagreeing about where a tag ends — and a design
 * bundle has no reason to accept input that needs repairing. A refusal names the rule and the
 * offending fragment so a human can fix the source.
 */

export type MarkupFinding = { rule: string; detail: string }

/**
 * C0 controls (except tab/LF/CR) and DEL: never legitimate in generated markup, and a classic way
 * to smuggle a token past a naive parser. Matching control characters is the whole purpose here,
 * which is exactly what `no-control-regex` normally warns about.
 */
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/** Anything that can execute, embed, navigate away, or reach the network. */
const MARKUP_RULES: Array<[string, RegExp, string]> = [
  ['script-element', /<\s*script\b/i, '<script> is never allowed in a design artefact'],
  ['event-handler', /<[^>]*?\son[a-z]+\s*=/i, 'inline event handler attribute'],
  [
    'javascript-url',
    /(?:href|src|xlink:href|action|formaction|data|poster)\s*=\s*["']?\s*(?:javascript|vbscript)\s*:/i,
    'script URL',
  ],
  ['embed-element', /<\s*(iframe|frame|frameset|object|embed|applet|portal)\b/i, 'embedding element'],
  ['base-element', /<\s*base\b/i, '<base> rewrites every relative URL'],
  ['meta-refresh', /<\s*meta[^>]+http-equiv\s*=\s*["']?\s*refresh/i, 'meta refresh navigates'],
  ['foreign-object', /<\s*foreignObject\b/i, 'SVG <foreignObject> re-enters HTML parsing'],
  // A *resource* URL fetches at render time; an anchor's href only navigates when clicked, and a
  // design artefact legitimately links out (a cited source, a profile). So this rule covers what
  // loads — src, poster, SVG hrefs, and <link> — and leaves <a href> to the reviewer.
  [
    'external-resource',
    /(?:\ssrc|\sposter|xlink:href)\s*=\s*["']?(?:https?:)?\/\//i,
    'absolute or protocol-relative external resource URL',
  ],
  [
    'external-stylesheet',
    /<\s*link\b[^>]*href\s*=\s*["']?(?:https?:)?\/\//i,
    'external stylesheet or resource link',
  ],
  [
    'doctype-entity',
    /<!DOCTYPE[^>]*\[/i,
    'internal DTD subset enables entity expansion (XXE / billion laughs)',
  ],
  ['entity-declaration', /<!ENTITY\b/i, 'entity declaration'],
  ['import-directive', /@import\b/i, '@import fetches a stylesheet'],
  ['css-external-url', /url\(\s*["']?(?:https?:)?\/\//i, 'CSS url() pointing off-document'],
  ['css-expression', /expression\s*\(/i, 'legacy CSS expression() executes script'],
  // `behavior:` is the IE binding property; the leading guard keeps `scroll-behavior:` out of it.
  ['css-binding', /(?:^|[^\w-])(?:-moz-binding|behavior)\s*:/i, 'CSS binding executes script'],
  ['srcdoc', /\bsrcdoc\s*=/i, 'srcdoc injects a nested document'],
  ['form-action', /<\s*form\b[^>]*\saction\s*=\s*["']?(?:https?:)?\/\//i, 'form posting off-site'],
]

/** Only these protocols may appear in a design artefact's URLs. */
export function isAllowedUrl(url: string, opts: { allowData?: boolean } = {}): boolean {
  const u = url.trim()
  if (u === '') return false
  if (CTRL.test(u)) return false
  if (/^data:/i.test(u))
    return (
      Boolean(opts.allowData) && /^data:(image\/(png|jpeg|gif|webp|avif|svg\+xml)|font\/woff2?);/i.test(u)
    )
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return false // any other scheme, including http(s), mailto, javascript
  if (u.startsWith('//')) return false // protocol-relative
  return true // in-document (#…) or relative
}

/** Check generated or imported markup. `context` only shapes the message. */
export function checkMarkup(html: string, context = 'markup'): MarkupFinding[] {
  const findings: MarkupFinding[] = []
  for (const [rule, re, why] of MARKUP_RULES) {
    const m = re.exec(html)
    if (m) findings.push({ rule, detail: `${why} in ${context}: ${m[0].slice(0, 60)}` })
  }
  if (CTRL.test(html)) findings.push({ rule: 'control-character', detail: `control character in ${context}` })
  return findings
}

/** CSS-only subset — used on the concatenated stylesheet before it is inlined into a card. */
export function checkCss(css: string, context = 'css'): MarkupFinding[] {
  const findings: MarkupFinding[] = []
  for (const rule of [
    'import-directive',
    'css-external-url',
    'css-expression',
    'css-binding',
    'javascript-url',
  ] as const) {
    const found = MARKUP_RULES.find(([r]) => r === rule)
    if (!found) continue
    const m = found[1].exec(css)
    if (m) findings.push({ rule, detail: `${found[2]} in ${context}: ${m[0].slice(0, 60)}` })
  }
  return findings
}

/**
 * SVG admission. SVG is XML with a scripting surface, so it gets the markup rules plus the ones
 * specific to it. Refuses rather than strips (see the module note).
 */
export function checkSvg(svg: string, context = 'svg'): MarkupFinding[] {
  const findings = checkMarkup(svg, context)
  if (!/<svg[\s>]/i.test(svg))
    findings.push({ rule: 'svg-not-svg', detail: `${context} does not contain an <svg> root` })
  if (
    /<\s*(set|animate|animateTransform|animateMotion)\b[^>]*attributeName\s*=\s*["']?(?:href|xlink:href)/i.test(
      svg,
    )
  )
    findings.push({ rule: 'svg-animated-href', detail: 'SMIL animation rewriting an href' })
  if (/<\s*use\b[^>]*(?:xlink:)?href\s*=\s*["']?(?!#)/i.test(svg))
    findings.push({ rule: 'svg-external-use', detail: '<use> referencing something outside the document' })
  if (/<\s*image\b[^>]*(?:xlink:)?href\s*=\s*["']?(?!data:)/i.test(svg))
    findings.push({ rule: 'svg-external-image', detail: '<image> referencing a non-data URL' })
  if (svg.length > 512_000) findings.push({ rule: 'svg-too-large', detail: `${svg.length} bytes` })
  return findings
}

/** Decode a `data:image/svg+xml` URL so its payload can be checked; returns null when it is not one. */
export function decodeSvgDataUrl(url: string): string | null {
  const m = /^data:image\/svg\+xml(;[^,]*)?,([\s\S]*)$/i.exec(url.trim())
  if (!m) return null
  const meta = m[1] ?? ''
  const body = m[2] ?? ''
  try {
    return /;base64/i.test(meta) ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body)
  } catch {
    return body
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** HTML-escape a value that is being interpolated into generated markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] as string)
}

/** Escape a value being interpolated into a CSS string or comment. */
export function escapeCss(value: string): string {
  return value.replace(/[\\"'<>{}();]/g, (c) => '\\' + c.charCodeAt(0).toString(16) + ' ')
}
