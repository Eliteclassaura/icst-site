/**
 * The typed content contract between Payload records and the accepted Main Factory templates.
 *
 * The templates render `SalmonDocument` (salmon + live families) and `EnglishService` (six English service
 * pages) exactly as they did from the repository authorities. A `public-routes` record stores that document
 * in `document`, plus editorial overrides that win over the stored document:
 *
 *   record.title            → document.title and the page heading (seo.h1[0]) when edited
 *   record.seo.title        → document.seo.title        (browser/search title)
 *   record.seo.description  → the `description` meta entry
 *
 * Nothing else is synthesised: no product ids, no media, no links. What the record does not carry, the
 * document does not gain.
 */
export type RouteRecord = {
  id?: string
  routeId: string
  path: string
  family: 'salmon' | 'live' | 'english-service' | 'alias' | 'search' | 'editorial'
  routeClass?: string | null
  title: string
  seo?: { title?: string | null; description?: string | null; canonical?: string | null } | null
  disposition?: {
    state: string
    export?: boolean | null
    indexable?: boolean | null
    sitemap?: boolean | null
    searchable?: boolean | null
    redirect?: string | null
  } | null
  document?: unknown
  source?: { sourceUrl?: string | null; aliasOf?: string | null; order?: number | null; sourceSha256?: string | null } | null
  contentSha256?: string | null
  /** Typed editor fields over the provenance tree (./content-slots). */
  slots?: ContentSlot[] | null
  /** Typed sections of a page created in Payload (family `editorial`, ./editorial). */
  sections?: unknown[] | null
  lead?: string | null
  _status?: 'draft' | 'published' | null
  updatedAt?: string
}

type Doc = Record<string, unknown>

import { applyPublicExclusions } from './public-exclusions'
import { nodeText } from './projection-text'
import { applyContentSlots, applyServiceSlots, type ContentSlot } from './content-slots'
import { composeEditorial } from './editorial'
import { projectPublicAuthor } from './public-author'

export function composePublicDocument(record: RouteRecord): Doc {
  const stored = (record.document && typeof record.document === 'object' ? structuredClone(record.document) : {}) as Doc
  if (record.family === 'english-service') {
    const base = applyServiceSlots(stored, record.slots)
    if (record.title) base.title = record.title
    // R1B (Control Tower F2): the service's editable SEO fields reach its metadata; they were ignored in R1A.
    base.seo = { title: record.seo?.title || null, description: record.seo?.description || null }
    return base
  }
  if (record.family === 'editorial') return composeEditorial(record, stored)
  // Accepted Main Factory exclusions (provenance id match), then typed editor overlay, then derived text.
  const excluded = applyPublicExclusions(record.source?.aliasOf ?? record.routeId, stored).doc
  // ADR-028 author identity projection (./public-author), before editor slots so an edit is never overridden.
  const base = applyContentSlots(projectPublicAuthor(excluded), record.slots)
  const seo = { ...((base.seo ?? {}) as Doc) } as Doc & { meta?: Array<{ name: string; value: string }>; h1?: string[] }
  // An edited page title is the page heading too (the templates show `seo.h1[0]` first). An unedited title
  // (equal to the stored document's) leaves the accepted heading exactly as it was.
  const imported = String(base.title || seo.title || record.path) // the importer's title rule
  if (record.title && record.title !== imported) {
    base.title = record.title
    seo.h1 = [record.title, ...(Array.isArray(seo.h1) ? seo.h1.slice(1) : [])]
  }
  const o = record.seo ?? {}
  if (o.title) seo.title = o.title
  // An edited SEO title or description also feeds the social tags (og:/twitter:) the source carries, so search and social
  // previews agree (Master SEO Pass R1, Control Tower brief 2026-10-04). Absent social tags are not invented.
  const social = (names: string[], value: string) => {
    if (Array.isArray(seo.meta)) seo.meta = seo.meta.map((m) => (names.includes(m.name) ? { ...m, value } : m))
  }
  if (o.title) social(['og:title', 'twitter:title'], o.title)
  if (o.description) {
    const meta = Array.isArray(seo.meta) ? [...seo.meta] : []
    const i = meta.findIndex((m) => m.name === 'description')
    if (i >= 0) meta[i] = { ...meta[i]!, value: o.description }
    else meta.push({ name: 'description', value: o.description })
    seo.meta = meta
    social(['og:description', 'twitter:description'], o.description)
  }
  base.seo = seo
  // Protected top-level identity wins over anything nested in the stored tree (Control Tower C5).
  base.routeId = record.source?.aliasOf ?? record.routeId
  // R1B (Control Tower F2/F3): `text` is always derived from the node tree the templates render (after
  // exclusions and editor slots). A stored or independently supplied summary never survives composition.
  base.text = nodeText((base.children as never[]) ?? [])
  return base
}
