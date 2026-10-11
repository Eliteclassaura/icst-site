/**
 * SEARCH-CLEAN-1 (QA): the text the public search indexes and shows. Page bodies are imported from WordPress, so they can carry
 * builder shortcodes (`[/vc_column_text]`, `[vc_tta_section title="specifications"]`, `[gallery …]`) and HTML entities
 * (`6&#8242;`, `&amp;`, `&#8211;`). Neither belongs in a title or a snippet. This runs on every title and body before indexing,
 * so the index, the result titles and the snippets are all clean (the search is noindex: this is for the reader).
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', times: '×', deg: '°', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', frac12: '½', frac14: '¼', frac34: '¾',
}

/** Decode numeric and named entities once (a string is never decoded twice, so `&amp;#8242;` stays `&#8242;`). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole
      return String.fromCodePoint(code)
    }
    const named = NAMED[body.toLowerCase()]
    return named ?? whole
  })
}

/** Builder shortcodes: `[vc_…]`, `[/vc_…]`, and any other `[name attributes]` or `[/name]` (a letter after the bracket). */
const SHORTCODE = /\[\/?[a-z][a-z0-9_-]*(?:\s[^\]]*)?\]/gi

/** The clean text for a title or a snippet: no shortcodes, decoded entities, single spaces, trimmed. */
export function cleanSearchText(input: string): string {
  return decodeEntities(input.replace(SHORTCODE, ' ')).replace(/\s+/g, ' ').trim()
}
