import { readFileSync } from 'node:fs'
import path from 'node:path'
import { withoutDeadLoadMore } from './dead-widgets'
import { withoutPlaceholderCards } from './placeholder-cards'

/**
 * Text-override registry (Control Tower 2026-10-05, R2.1; content/design/text-overrides.json).
 *
 * A ruled claim correction for a string no editor-editable element can hold — an icon-list span, template-only markup, a
 * JSON-LD copy of a field — is applied here, when a document is read (repository/static and payload modes) and when it is
 * published (compose), so pages, search and structured data agree. Editable text is never corrected here: it goes through
 * the content batch (R2.2) so editors see what renders.
 *
 * Guardrails: the `find` string must occur exactly `count` times (default 1) in the entry's scope; nothing fuzzy or partial.
 * A document that already carries the replacement and no longer the original is treated as applied (idempotent). Any other
 * count is reported (tests and conformance fail; the runtime logs a warning with the entry id) and the entry is not applied.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type Doc = { routeId?: unknown; children?: unknown; text?: unknown; seo?: unknown } & Record<string, unknown>
export type TextOverride = { id: string; row: string; routeId: string; path: string; scope: 'body' | 'schema' | 'seo-h1' | 'body-range' | 'body-remove' | 'body-href'; find: string; replace: string; until?: string; count?: number; reason: string; unsaveable?: boolean; slotCopy?: boolean }
/** `slotCopy`: a verbatim non-slot copy (a table-of-contents link) of text an editable element also holds; that element is changed by its claim edit, the copy here. */
/** `body-range` (SEO-CONTENT-1 round 2): removes a run of sibling nodes in the page tree, from the node that holds `find` through the
 * node that holds `until` (`replace` is ''), with the line breaks and blank text that lead into it. For a ruled removal of markup (a
 * contact block of `<br>`-separated lines) that no editable element holds. */

let cache: Map<string, TextOverride[]> | undefined
export const textOverrides = (): TextOverride[] =>
  (JSON.parse(readFileSync(path.join(process.cwd(), 'content/design/text-overrides.json'), 'utf8')) as { overrides: TextOverride[] }).overrides
const byRoute = (): Map<string, TextOverride[]> => {
  if (!cache) {
    cache = new Map()
    for (const o of textOverrides()) cache.set(o.routeId, [...(cache.get(o.routeId) ?? []), o])
  }
  return cache
}
const occurrences = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0)

/** Count `find` in the entry's scope, and return a copy with it replaced (body: text nodes; schema: string values). */
const nodeText = (x: Node): string => (typeof x === 'string' ? x : x.children.map(nodeText).join(''))
const rangeOf = (kids: Node[], o: TextOverride): [number, number] | null => {
  const start = kids.findIndex((k) => nodeText(k).includes(o.find))
  if (start < 0) return null
  const end = kids.findIndex((k, i) => i >= start && nodeText(k).includes(o.until ?? ''))
  return end < 0 ? null : [start, end]
}
function inRange(doc: Doc, o: TextOverride, mode: 'count' | 'apply'): { n: number; doc: Doc } {
  let n = 0
  const walk = (x: Node): Node => {
    if (typeof x === 'string') return x
    const kids = x.children
    const range = rangeOf(kids, o)
    // the range is a run of siblings at one level (a few nodes), never a whole container
    if (range && range[1] - range[0] < 12 && !kids.slice(range[0], range[1] + 1).some((k) => typeof k !== 'string' && nodeText(k).length > 400)) {
      n++
      if (mode === 'apply') {
        let from = range[0]
        // the line break (and blank text) that leads into the block goes with it
        while (from > 0 && ((typeof kids[from - 1] === 'string' && !(kids[from - 1] as string).trim()) || (typeof kids[from - 1] !== 'string' && (kids[from - 1] as { tag: string }).tag === 'br'))) from--
        return { ...x, children: [...kids.slice(0, from), ...kids.slice(range[1] + 1)] }
      }
      return x
    }
    return { ...x, children: kids.map(walk) }
  }
  const children = Array.isArray(doc.children) ? (doc.children as Node[]).map(walk) : doc.children
  return { n, doc: mode === 'apply' ? { ...doc, children } : doc }
}
/** The flattened search text without the removed range (whitespace-insensitive match of the removed nodes' own text). */
function stripRangeText(text: string, original: Doc, o: TextOverride): string {
  let removed = ''
  const visit = (x: Node) => {
    if (typeof x === 'string') return
    const range = rangeOf(x.children, o)
    if (range) removed = x.children.slice(range[0], range[1] + 1).map(nodeText).join(' ')
    else x.children.forEach(visit)
  }
  ;(Array.isArray(original.children) ? (original.children as Node[]) : []).forEach(visit)
  const words = removed.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return words.length ? text.replace(new RegExp(`\\s*${words.join('\\s+')}`), '') : text
}
const collapse = (t: string) => t.replace(/[\s\u00a0]+/g, ' ').trim()
/** `body-remove` (SEO-CONTENT-2 piece C): removes the deepest element whose whole text equals `find` (a bare chip, list item,
 * excerpt or card line of a held article). An element left empty is dropped by the renderer (list items, table rows). */
function inRemove(doc: Doc, o: TextOverride, mode: 'count' | 'apply'): { n: number; doc: Doc } {
  let n = 0
  const walk = (x: Node): Node | null => {
    if (typeof x === 'string') return x
    const kids = x.children.map(walk)
    const deeper = x.children.some((k) => typeof k !== 'string' && collapse(nodeText(k)) === collapse(o.find))
    if (!deeper && collapse(nodeText(x)) === collapse(o.find) && x.children.length > 0) {
      n++
      // A heading, list item or row is emptied, not dropped: the later siblings keep their positions, so the slot keys that address them stay valid
      // (the renderer shows an emptied heading as nothing).
      if (mode === 'apply' && /^(h[1-6]|li|tr)$/.test(x.tag)) return { ...x, children: [] }
      return mode === 'apply' ? null : x
    }
    return { ...x, children: kids.filter((k): k is Node => k !== null) }
  }
  const children = Array.isArray(doc.children) ? (doc.children as Node[]).map(walk).filter((k): k is Node => k !== null) : doc.children
  return { n, doc: mode === 'apply' ? { ...doc, children } : doc }
}
/** `body-href` (SEO-CONTENT-2 piece C): a link whose href equals `find` points at `replace`; an empty `replace` unlinks it (the
 * anchor text stays, as a plain span). */
function inHref(doc: Doc, o: TextOverride, mode: 'count' | 'apply', needle: string): { n: number; doc: Doc } {
  let n = 0
  const walk = (x: Node): Node => {
    if (typeof x === 'string') return x
    const kids = x.children.map(walk)
    if (x.tag === 'a' && x.attrs.href === needle) {
      n++
      if (mode === 'apply') return o.replace === '' ? { tag: 'span', attrs: {}, children: kids } : { ...x, attrs: { ...x.attrs, href: o.replace }, children: kids }
    }
    return { ...x, children: kids }
  }
  const children = Array.isArray(doc.children) ? (doc.children as Node[]).map(walk) : doc.children
  return { n, doc: mode === 'apply' ? { ...doc, children } : doc }
}
function inScope(doc: Doc, o: TextOverride, mode: 'count' | 'apply', needle = o.find): { n: number; doc: Doc } {
  if (o.scope === 'body-range') return inRange(doc, o, mode)
  if (o.scope === 'body-remove') return inRemove(doc, o, mode)
  if (o.scope === 'body-href') return inHref(doc, o, mode, needle)
  let n = 0
  const swap = (s: string) => { const k = occurrences(s, needle); n += k; return mode === 'apply' && k ? s.split(o.find).join(o.replace) : s }
  if (o.scope === 'body') {
    const walk = (x: Node): Node => (typeof x === 'string' ? swap(x) : { ...x, children: x.children.map(walk) })
    const children = Array.isArray(doc.children) ? (doc.children as Node[]).map(walk) : doc.children
    return { n, doc: mode === 'apply' ? { ...doc, children } : doc }
  }
  const walkJson = (v: unknown): unknown => (typeof v === 'string' ? swap(v) : Array.isArray(v) ? v.map(walkJson) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walkJson(x)])) : v)
  const seo = (doc.seo ?? {}) as Record<string, unknown>
  // `seo-h1` (SEO-CONTENT-2.2): the stored page H1 list, which the page's breadcrumb and Service JSON-LD are generated from
  if (o.scope === 'seo-h1') { const h1 = walkJson(seo.h1 ?? []); return { n, doc: mode === 'apply' ? { ...doc, seo: { ...seo, h1 } } : doc } }
  const schema = walkJson(seo.schema ?? [])
  return { n, doc: mode === 'apply' ? { ...doc, seo: { ...seo, schema } } : doc }
}

/** Apply the registry to one document. Returns the document and any entry that did not match exactly. */
export function applyTextOverrides<T extends Doc>(doc: T): { doc: T; problems: string[] } {
  const entries = typeof doc.routeId === 'string' ? byRoute().get(doc.routeId) : undefined
  if (!entries?.length) return { doc, problems: [] }
  let out: Doc = doc
  const problems: string[] = []
  for (const o of entries) {
    const want = o.count ?? 1
    const found = inScope(out, o, 'count').n
    if (found === want) {
      const before = out
      out = inScope(out, o, 'apply').doc
      // the search text carries the same words
      if (typeof out.text === 'string') out = { ...out, text: o.scope === 'body-range' ? stripRangeText(out.text as string, before, o) : o.scope === 'body-remove' ? (out.text as string).split(o.find).join('') : o.scope === 'body-href' ? (out.text as string) : (out.text as string).split(o.find).join(o.replace) }
      continue
    }
    if (found === 0 && (o.scope === 'body-range' || o.scope === 'body-remove' || o.replace === '')) continue // a removal: already applied
    if (found === 0 && inScope(out, o, 'count', o.replace).n >= want) continue // already applied
    problems.push(`${o.id} (${o.row}) ${o.path}: "${o.find.slice(0, 60)}" found ${found}× in ${o.scope}, expected ${want}×`)
  }
  return { doc: out as T, problems }
}

/** The runtime form: apply, and log a warning (with the entry id) for an entry that no longer matches exactly. */
export function withTextOverrides<T extends Doc>(doc: T): T {
  const { doc: out, problems } = applyTextOverrides(doc)
  for (const p of problems) console.warn(`[text-override] ${p}`)
  // HOME-LOADMORE-1: leftover "Load More" widgets with no script behind them (./dead-widgets), in every document read
  // PLACEHOLDER-CARDS-1: the retired demo products' loop cards (./placeholder-cards)
  return withoutPlaceholderCards(withoutDeadLoadMore(out))
}
