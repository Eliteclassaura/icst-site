import { readFileSync } from 'node:fs'
import path from 'node:path'

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
export type TextOverride = { id: string; row: string; routeId: string; path: string; scope: 'body' | 'schema'; find: string; replace: string; count?: number; reason: string }

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
function inScope(doc: Doc, o: TextOverride, mode: 'count' | 'apply', needle = o.find): { n: number; doc: Doc } {
  let n = 0
  const swap = (s: string) => { const k = occurrences(s, needle); n += k; return mode === 'apply' && k ? s.split(o.find).join(o.replace) : s }
  if (o.scope === 'body') {
    const walk = (x: Node): Node => (typeof x === 'string' ? swap(x) : { ...x, children: x.children.map(walk) })
    const children = Array.isArray(doc.children) ? (doc.children as Node[]).map(walk) : doc.children
    return { n, doc: mode === 'apply' ? { ...doc, children } : doc }
  }
  const walkJson = (v: unknown): unknown => (typeof v === 'string' ? swap(v) : Array.isArray(v) ? v.map(walkJson) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walkJson(x)])) : v)
  const seo = (doc.seo ?? {}) as Record<string, unknown>
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
      out = inScope(out, o, 'apply').doc
      // the search text carries the same words
      if (typeof out.text === 'string') out = { ...out, text: (out.text as string).split(o.find).join(o.replace) }
      continue
    }
    if (found === 0 && inScope(out, o, 'count', o.replace).n >= want) continue // already applied
    problems.push(`${o.id} (${o.row}) ${o.path}: "${o.find.slice(0, 60)}" found ${found}× in ${o.scope}, expected ${want}×`)
  }
  return { doc: out as T, problems }
}

/** The runtime form: apply, and log a warning (with the entry id) for an entry that no longer matches exactly. */
export function withTextOverrides<T extends Doc>(doc: T): T {
  const { doc: out, problems } = applyTextOverrides(doc)
  for (const p of problems) console.warn(`[text-override] ${p}`)
  return out
}
