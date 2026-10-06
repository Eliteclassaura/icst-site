/**
 * R2.4 (Control Tower 2026-10-05; SEO Checker baseline items a, c, d, f): what every served HTML head must carry, as pure
 * checks on the page's HTML. Used by check-conformance.mjs (hosted) and by the unit tests (rendered pages).
 *
 *   a  og:title and twitter:title equal the served <title>; og:description and twitter:description equal the served meta
 *      description (exactly one of each).
 *   d  og:url, og:image and twitter:card are present; the structured data names the Organization and WebSite @ids.
 *   f  no legacy WordPress title suffix (English pages; the preserved locale pages keep their live titles, owner decision).
 *   c  a paginated archive (/…/page/N/): the title names "Page N" and the meta description is present.
 */
export const ORGANIZATION_ID = 'https://h2ocooling.com/#organization'
export const WEBSITE_ID = 'https://h2ocooling.com/#website'
/** The legacy WordPress site-title suffixes (the decided titles end in "- ICS" or carry none). */
export const LEGACY_SUFFIX = /\s[-|–]\s(?:New Cooling Tower Construction, Parts, Maintenance, Upgrades|H2O Cooling(?: Towers)?|Industrial Cooling Solutions, Inc\.?)\s*$/i

export const entities = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? entities(m[1]) : undefined }
/** Every value of a meta tag by its property or name (og:* is a property, twitter:* and description a name; either accepted). */
export function metaValues(html, key) {
  const out = []
  for (const m of html.matchAll(/<meta\b[^>]*>/g)) if (attr(m[0], 'property') === key || attr(m[0], 'name') === key) out.push(attr(m[0], 'content') ?? '')
  return out
}
export const servedTitleOf = (html) => entities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] ?? '')
/** The @ids the page's JSON-LD names (any depth). */
export function jsonLdIds(html) {
  const ids = new Set()
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v['@id'] === 'string') ids.add(v['@id']); Object.values(v).forEach(walk) } }
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) { try { walk(JSON.parse(m[1])) } catch { ids.add('(unparseable JSON-LD)') } }
  return ids
}

/** Problems with a page's standard head, given the served title and meta description ('' when the page has none). */
export function headProblems(html, { title, meta }, { legacySuffix = true, projectPage = false } = {}) {
  const problems = []
  const one = (key, want) => {
    const v = metaValues(html, key)
    if (v.length !== 1) problems.push(`${v.length} ${key}`)
    else if (want !== undefined && v[0] !== want) problems.push(`${key} "${v[0].slice(0, 70)}" ≠ "${want.slice(0, 70)}"`)
  }
  one('og:title', title)
  one('twitter:title', title)
  if (meta) { one('og:description', meta); one('twitter:description', meta) }
  one('og:url')
  one('twitter:card')
  // a project page without its own verified photo carries none (Design Fixes A1: never another project's photo)
  if (!metaValues(html, 'og:image').length && !projectPage) problems.push('no og:image')
  const ids = jsonLdIds(html)
  if (!ids.has(ORGANIZATION_ID)) problems.push('no Organization @id')
  if (!ids.has(WEBSITE_ID)) problems.push('no WebSite @id')
  if (legacySuffix && LEGACY_SUFFIX.test(title)) problems.push(`legacy title suffix: "${title}"`)
  return problems
}

/** Problems with a paginated archive page's title and meta (item c). */
export function paginationProblems(pathname, { title, meta }) {
  const n = /\/page\/(\d+)\/$/.exec(pathname)?.[1]
  if (!n) return []
  const problems = []
  if (!new RegExp(`\\bPage ${n}\\b`).test(title)) problems.push(`title does not name Page ${n}: "${title}"`)
  if (!meta) problems.push('no meta description')
  return problems
}
