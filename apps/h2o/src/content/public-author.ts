/**
 * Public author projection (R1B, ADR-028; Control Tower AUTHOR_PUBLIC_OUTPUT).
 *
 * ADR-028: no email address appears on a public surface. One accepted author archive route carries its
 * WordPress login email as the author's display name (title, H1, SEO title/meta, schema and archive text).
 * The route, its path and canonical are preserved; the public projection replaces every email-shaped author
 * identity with an approved display label, or with the neutral label when no label is approved. A name is
 * never inferred from the email (no local-part splitting, no capitalisation guesses). The same rule applies to
 * an article byline whose schema author name is email-shaped.
 *
 * Scope is the author identity: author archive routes (`/author/…/`) in full, and on every other page the SEO
 * metadata and JSON-LD (where WordPress emits the author as "Written by" and as the avatar caption). Private CRM contact fields are a different model and are not touched. Evidence
 * never reproduces the replaced value (tests use a synthetic marker).
 */
type Doc = Record<string, unknown>

export const EMAIL_SHAPE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
export const NEUTRAL_AUTHOR_LABEL = 'ICS Editorial Team'
/** Approved public display labels by author route id (none approved yet: the neutral label applies). */
export const APPROVED_AUTHOR_LABELS: Readonly<Record<string, string>> = Object.freeze({})

export const isAuthorRoute = (path: unknown) => typeof path === 'string' && /^\/author\/[^/]+\/$/.test(path)
const has = (s: string) => new RegExp(EMAIL_SHAPE.source).test(s)
const scrub = (s: string, label: string) => s.replace(EMAIL_SHAPE, label)

function scrubSchema(raw: string, label: string, whole: boolean): string {
  if (!has(raw)) return raw
  if (whole) return scrub(raw, label)
  try {
    const parsed = JSON.parse(raw) as unknown
    const walk = (v: unknown, key: string | null): unknown => {
      if (typeof v === 'string') return key === 'name' || key === 'author' || key === 'alternateName' ? scrub(v, label) : v
      if (Array.isArray(v)) return v.map((x) => walk(x, key))
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Doc).map(([k, x]) => [k, k === 'author' || key === 'author' ? walkAuthor(x) : walk(x, k)]))
      return v
    }
    const walkAuthor = (x: unknown): unknown => (typeof x === 'string' ? scrub(x, label) : Array.isArray(x) ? x.map(walkAuthor) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Doc).map(([k, y]) => [k, typeof y === 'string' && (k === 'name' || k === 'alternateName') ? scrub(y, label) : y])) : x)
    return JSON.stringify(walk(parsed, null))
  } catch {
    return raw
  }
}

/** Apply the projection to a salmon/live document (returns a new document when anything changed). */
export function projectPublicAuthor(doc: Doc): Doc {
  const path = doc.targetPath ?? doc.path
  const author = isAuthorRoute(path)
  const label = APPROVED_AUTHOR_LABELS[String(doc.routeId ?? '')] ?? NEUTRAL_AUTHOR_LABEL
  const seo = (doc.seo ?? {}) as Doc & { schema?: string[]; h1?: string[]; meta?: Array<{ name: string; value: string }>; title?: string }
  // Article metadata carries the author identity too ("Written by" meta, author avatar caption in JSON-LD):
  // on every page, email-shaped strings in SEO metadata and JSON-LD are author/contact identity (ADR-028).
  const seoHit = has(JSON.stringify(seo))
  if (!author && !seoHit) return doc
  const out = structuredClone(doc) as Doc
  const oseo = (out.seo ?? {}) as typeof seo
  if (Array.isArray(oseo.schema)) oseo.schema = oseo.schema.map((s) => (typeof s === 'string' ? scrubSchema(s, label, true) : s))
  if (Array.isArray(oseo.meta)) oseo.meta = oseo.meta.map((m) => ({ ...m, value: typeof m.value === 'string' ? scrub(m.value, label) : m.value }))
  if (author) {
    // The whole archive projection (title, H1, SEO, schema, body tree, captured chrome/structures, text):
    // every string is scrubbed; a mailto link becomes the contact route.
    const deep = (v: unknown, key: string | null): unknown => {
      if (typeof v === 'string') return key === 'href' && /^mailto:/i.test(v) ? '/contact-us/' : scrub(v, label)
      if (Array.isArray(v)) return v.map((x) => deep(x, null))
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Doc).map(([k, x]) => [k, deep(x, k)]))
      return v
    }
    const scrubbed = deep(out, null) as Doc
    for (const k of Object.keys(out)) delete out[k]
    Object.assign(out, scrubbed)
    return out
  }
  out.seo = oseo
  return out
}

/** Email-shaped strings still present in a public projection (for gates; values are never reported). */
export function emailShapedCount(value: unknown): number {
  return (JSON.stringify(value ?? null).match(EMAIL_SHAPE) ?? []).length
}
