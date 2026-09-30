import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { importContext } from '../collections/public-routes'
import { applyPublicExclusions, withheldNodesIn } from '../public-exclusions'
import { migrateQuoteIntent, type IntentDecision } from '../rfq-intent'
import { extractServiceSlots, extractSlots } from '../content-slots'
import { projectPublicAuthor } from '../public-author'

/**
 * Rerunnable import / reconciliation: accepted public release authority → Payload.
 *
 * Input: `release/authority.mjs` `releaseAuthority(root)` — the same function the accepted static release
 * uses — so the imported route set, dispositions, canonicals and redirects are exactly the baseline set.
 * Documents come from `content/salmon/**` (hash-verified against the authority) and the six English
 * services from `content/english-completion/service-pages.json`. Schema migration is separate: this only
 * writes rows.
 *
 * Rules:
 *   - PUBLIC + export rows are created published; every other row (REVIEW_HOLD, PRIVATE_ARCHIVE, REDIRECT)
 *     is created as a draft and can never be published (collection guard).
 *   - Nothing is synthesised: no product ids, no media, no links. `document` is the accepted source JSON
 *     without the raw source HTML (`contentHtml`), which no template renders.
 *   - Rerun: an existing record whose frozen source hash and disposition match is left alone (editorial
 *     edits survive); a changed authority row is reported `HELD_CONFLICT` and not overwritten.
 *   - Every row is reported: source id, target id, canonical path, family/template, disposition, media
 *     references, and APPLIED / UNCHANGED / HELD_CONFLICT / ERROR.
 */
type Row = {
  path: string
  routeId: string
  routeClass: string
  state: string
  export: boolean
  indexable: boolean
  sitemap: boolean
  searchable?: boolean
  canonical: string
  previousCanonical?: string
  sourceRobots?: string
  sourceFile?: string | null
  sourceSha256?: string | null
  matchedArticle?: boolean
  releaseOverride?: string | null
  redirect?: string | null
}
type Redirect = { source: string; destination: string; status: number; targetState?: string }
type Authority = { routes: Row[]; redirects: Redirect[] }
type Doc = Record<string, unknown>

export type LedgerLine = {
  sourceId: string
  recordRouteId: string
  targetId: string | null
  path: string
  family: string
  template: string
  state: string
  published: boolean
  mediaRefs: number
  mediaMissing: number
  status: 'APPLIED' | 'UNCHANGED' | 'HELD_CONFLICT' | 'ERROR'
  note: string
}

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const pathKey = (p: string) => {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

function familyOf(row: Row, seen: Set<string>): { family: string; recordRouteId: string; aliasOf: string | null } {
  if (row.routeId === 'RELEASE-SEARCH') return { family: 'search', recordRouteId: row.routeId, aliasOf: null }
  if (row.routeId.startsWith('ENGLISH-SERVICE-')) return { family: 'english-service', recordRouteId: row.routeId, aliasOf: null }
  if (seen.has(row.routeId)) return { family: 'alias', recordRouteId: `ALIAS-${row.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`, aliasOf: row.routeId }
  if (row.routeId.startsWith('LIVE-')) return { family: 'live', recordRouteId: row.routeId, aliasOf: null }
  return { family: 'salmon', recordRouteId: row.routeId, aliasOf: null }
}

/** Template the accepted dispatch will choose (reported for the mapping ledger; not stored). */
function templateOf(row: Row, family: string, doc: Doc | null, luxury: Set<string>): string {
  if (family === 'english-service') return 'EnglishServicePage'
  if (family === 'alias') return 'Wave4Library(resources)'
  if (family === 'search') return 'ReleaseSearchPage'
  if (family === 'live') return 'LiveEnglishDetail'
  if (row.path === '/cooling-tower-parts-online/') return 'PartsIndex'
  if (doc?.type === 'product' && row.routeId.startsWith('SALMON-product-')) return 'ProductDetail'
  if (['SALMON-pages-1797', 'SALMON-pages-1870'].includes(row.routeId)) return 'Wave4Library'
  if (row.routeId === 'SALMON-pages-1875') return 'Wave4ArticleIndex'
  if (row.matchedArticle) return 'Wave4ArticleDetail'
  return luxury.has(row.routeId) ? 'LuxuryCanonical' : 'SalmonCanonical'
}

export async function importAuthority(
  payload: Payload,
  root: string,
  opts: { limit?: number; only?: (routeId: string) => boolean; log?: (m: string) => void } = {},
): Promise<{ ledger: LedgerLine[]; redirects: Array<Redirect & { status2: string }>; intents: IntentDecision[] }> {
  const { releaseAuthority } = (await import(path.join(root, 'release/authority.mjs'))) as { releaseAuthority: (r: string) => Authority }
  const authority = releaseAuthority(root)
  const services = JSON.parse(readFileSync(path.join(root, 'content/english-completion/service-pages.json'), 'utf8')) as Doc[]
  const mediaIds = new Set<string>(
    [
      ...(JSON.parse(readFileSync(path.join(root, 'content/salmon/media-identities.json'), 'utf8')) as Doc[]),
      ...(JSON.parse(readFileSync(path.join(root, 'content/salmon/r2-live-media-identities.json'), 'utf8')) as Doc[]),
    ].map((m) => String(m.url)),
  )
  let luxury = new Set<string>()
  try {
    const { luxuryIds } = (await import(path.join(root, 'src/site/LuxuryCanonical'))) as { luxuryIds: Set<string> }
    luxury = luxuryIds
  } catch {
    /* template column only */
  }
  const ledger: LedgerLine[] = []
  const intents: IntentDecision[] = []
  // D1 relation targets: public, exported product routes by page path (the accepted authority, not labels).
  const publicProducts = new Map(
    authority.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]),
  )
  const seen = new Set<string>()
  let order = 0
  for (const row of authority.routes) {
    order++
    const fam = familyOf(row, seen)
    if (fam.family !== 'alias') seen.add(row.routeId)
    if (opts.only && !opts.only(fam.recordRouteId)) continue
    if (opts.limit && ledger.length >= opts.limit) break
    const line: LedgerLine = {
      sourceId: row.routeId, recordRouteId: fam.recordRouteId, targetId: null, path: row.path, family: fam.family, template: '',
      state: row.state, published: false, mediaRefs: 0, mediaMissing: 0, status: 'ERROR', note: '',
    }
    try {
      let document: Doc | null = null
      if (fam.family === 'salmon' || fam.family === 'live') {
        const file = path.join(root, 'content/salmon', String(row.sourceFile))
        const bytes = readFileSync(file)
        if (sha(bytes) !== row.sourceSha256) throw new Error('source hash mismatch')
        const parsed = JSON.parse(bytes.toString()) as Doc
        if (parsed.routeId !== row.routeId) throw new Error('source route identity mismatch')
        delete parsed.contentHtml
        // Accepted Main Factory exclusions never enter a stored record (see ../public-exclusions): replaced by
        // position-preserving stubs (identity match, not text), then verified absent.
        const excluded = applyPublicExclusions(row.routeId, parsed)
        if (withheldNodesIn(row.routeId, excluded.doc).length) throw new Error('withheld element survived exclusion')
        if (excluded.removed.length) line.note = `PUBLIC_EXCLUSIONS_APPLIED:${excluded.removed.join(',')}${excluded.collapsed.length ? `;COLLAPSED:${excluded.collapsed.join(',')}` : ''}`
        // ADR-028: the stored record carries the public author projection (title/H1/SEO/schema/archive text).
        document = projectPublicAuthor(excluded.doc)
        // Quote intent by source identity (D1–D6, contract import rule): stamped on the stored tree.
        const decisions = migrateQuoteIntent(document, { routeId: row.routeId, publicProducts, matchedArticle: Boolean(row.matchedArticle) })
        intents.push(...decisions)
        delete document.text // derived at composition from the rendered tree (never stored)
        const images = (parsed.images ?? []) as Array<{ src: string }>
        line.mediaRefs = images.length
        line.mediaMissing = images.filter((i) => {
          try {
            return !mediaIds.has(new URL(i.src, String(parsed.sourceUrl)).href)
          } catch {
            return true
          }
        }).length
      } else if (fam.family === 'english-service') {
        document = services.find((s) => s.id === row.routeId) ?? null
        if (!document) throw new Error('service source missing')
        const imgs = ['hero', 'detailImage', 'diagramImage', 'evidenceImage', 'supportImage', 'decisionImage', 'closingImage', 'processImage']
          .map((k) => document![k])
          .filter(Boolean) as string[]
        line.mediaRefs = imgs.length
        line.mediaMissing = imgs.filter((src) => !existsSync(path.join(root, 'public', src))).length
      }
      line.template = templateOf(row, fam.family, document, luxury)
      const publish = row.state === 'PUBLIC' && row.export === true
      const title =
        fam.family === 'english-service'
          ? String(document?.title ?? row.path)
          : String((document?.title as string) || ((document?.seo as Doc | undefined)?.title as string) || row.path)
      const data = {
        title: title || row.path,
        routeId: fam.recordRouteId,
        path: row.path,
        pathKey: pathKey(row.path),
        family: fam.family,
        routeClass: row.routeClass ?? null,
        seo: { canonical: row.canonical },
        disposition: {
          state: row.state, export: row.export, indexable: row.indexable, sitemap: row.sitemap, searchable: Boolean(row.searchable),
          redirect: row.redirect ?? null, matchedArticle: Boolean(row.matchedArticle), releaseOverride: row.releaseOverride ?? null,
        },
        document,
        slots:
          fam.family === 'salmon' || fam.family === 'live'
            ? extractSlots(document ?? {}, { productIds: publicProducts })
            : fam.family === 'english-service'
              ? extractServiceSlots(document ?? {})
              : [],
        source: {
          sourceUrl: (document?.sourceUrl as string) ?? null, sourceFile: row.sourceFile ?? null, sourceSha256: row.sourceSha256 ?? null,
          previousCanonical: row.previousCanonical ?? null, sourceRobots: row.sourceRobots ?? null, aliasOf: fam.aliasOf, order,
        },
        _status: publish ? 'published' : 'draft',
      }
      const existing = (
        await payload.find({ collection: 'public-routes' as never, where: { routeId: { equals: fam.recordRouteId } } as never, limit: 1, depth: 0, overrideAccess: true, select: { source: true, disposition: true, _status: true } as never })
      ).docs[0] as unknown as Doc | undefined
      if (existing) {
        const src = (existing.source ?? {}) as Doc
        const disp = (existing.disposition ?? {}) as Doc
        const same = (src.sourceSha256 ?? null) === (row.sourceSha256 ?? null) && disp.state === row.state && Boolean(disp.export) === row.export && Boolean(disp.indexable) === row.indexable
        line.targetId = String(existing.id)
        line.published = existing._status === 'published'
        line.status = same ? 'UNCHANGED' : 'HELD_CONFLICT'
        line.note = same ? 'present; editorial content preserved' : 'authority differs from the imported record; not overwritten'
      } else {
        const created = (await payload.create({
          collection: 'public-routes' as never,
          data: data as never,
          draft: !publish,
          overrideAccess: true,
          context: importContext,
          depth: 0,
        })) as unknown as Doc
        line.targetId = String(created.id)
        line.published = publish
        line.status = 'APPLIED'
      }
    } catch (err) {
      line.status = 'ERROR'
      line.note = String((err as Error).message ?? err).slice(0, 200)
    }
    ledger.push(line)
    if (opts.log && ledger.length % 100 === 0) opts.log(`imported ${ledger.length}`)
  }
  const redirects: Array<Redirect & { status2: string }> = []
  if (!opts.only && !opts.limit)
    for (const r of authority.redirects) {
      const found = (await payload.find({ collection: 'public-redirects' as never, where: { source: { equals: r.source } } as never, limit: 1, overrideAccess: true, depth: 0 })).docs[0] as unknown as Doc | undefined
      if (found) {
        const same = found.destination === r.destination && String(found.status) === String(r.status)
        redirects.push({ ...r, status2: same ? 'UNCHANGED' : 'HELD_CONFLICT' })
        continue
      }
      await payload.create({
        collection: 'public-redirects' as never,
        data: { source: r.source, destination: r.destination, status: String(r.status), active: true, authority: 'release/authority.mjs' } as never,
        overrideAccess: true,
        context: { ...importContext, skipPublishJob: true },
      })
      redirects.push({ ...r, status2: 'APPLIED' })
    }
  return { ledger, redirects, intents }
}
