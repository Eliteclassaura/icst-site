/**
 * R2.2 claims conformance: the comparable text of a rendered page (vitest mock and Commander's read-back use the same rule).
 * Styles dropped; inline tags removed without a gap (a link or bold run stays inside its sentence), other tags become a space;
 * entities decoded; Unicode NFC; whitespace collapsed.
 */
const INLINE = /^(?:a|abbr|b|bdi|bdo|cite|code|data|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)$/i
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
export function pageText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (_, tag) => (INLINE.test(tag) ? '' : ' '))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#39);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
}
