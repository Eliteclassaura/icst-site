import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'
import { importContext } from '../collections/public-routes'
import { applyPublicExclusions } from '../public-exclusions'
import { projectPublicAuthor } from '../public-author'
import { migrateQuoteIntent } from '../rfq-intent'
import { extractSlots, type ContentSlot } from '../content-slots'

/**
 * LISTING-MERGE-1.1 (CT 2026-10-09): a targeted, idempotent, BASE-AWARE production step for held LISTING records.
 *
 * The authority import never overwrites a stored record whose source hash changed (HELD_CONFLICT), because editors and the SEO batch may have
 * edited its page elements. A catalog addition (CATALOG-FANS-1/-2) changes four listing documents (product cards, result counts), and the stored
 * documents can ALSO differ from the current authority for other legitimate reasons (a later bundle, a newer projection of the same source).
 * This step is a three-way merge per page element:
 *   base   = the stored `document` (the structure as last imported; it is frozen, no editor path changes it) and its page-element list as imported;
 *   ours   = the stored page elements (`slots`), which carry every edit by staff or by the SEO batch;
 *   theirs = the new authority document (built exactly as the import builds it).
 * Per element (matched between base and theirs by kind, tag, Elementor id and content hash, then by position inside the gaps between matches):
 *   - source unchanged                      -> keep ours (edited or not);
 *   - source changed, not edited in the DB  -> take theirs;
 *   - source changed AND edited in the DB   -> REFUSE that element only: it keeps its stored value and is reported;
 *   - new in theirs                         -> take theirs (an added card, a new count line);
 *   - removed in theirs and unedited        -> dropped; removed and edited -> the whole route is REFUSED (a stored edit would be lost).
 * The structure (`document`) becomes the new imported document, as the import would have made it. Nothing else on the record is touched: no SEO
 * LISTING-MERGE-1.2: one explicit exception to the refusal. A results-count paragraph ("Showing 17-33 of 33 results") is derived data, not free text: when
 * BOTH the stored text and the stored structure's own text for it (the old source) are count texts, the new source text is taken even though the stored
 * element differs (the SEO batch/hygiene normalises these paragraphs). It is reported as "resolved". Anything else that conflicts still REFUSES that element.
 * title/meta/H1/canonical, no restored sections, no other field. A route whose disposition differs from the authority row is REFUSED. A second run
 * changes nothing (the stored source hash equals the authority's).
 */
type Doc = Record<string, unknown>

export type StoredListing = {
  id: string | number
  routeId: string
  path: string
  document: Doc | null
  slots: ContentSlot[] | null
  source: { sourceSha256?: string | null } & Doc
  disposition?: Doc | null
}
export type ElementNote = { key: string; title: string; reason?: string }
export type MergeReport = {
  path: string
  routeId: string
  action: 'UNCHANGED' | 'MERGE' | 'MERGE_PARTIAL' | 'REFUSE'
  /** Route-level reasons (the route is not applied). */
  refusals: string[]
  /** Elements that changed in the source AND were edited in the database: kept as stored, reported. */
  refusedElements: ElementNote[]
  /** Elements new in the authority (an added card, a new count line). */
  newElements: ElementNote[]
  /** Results-count paragraphs whose source changed and whose stored value differed (count text both before and after): the new source text was taken. */
  resolvedElements: ElementNote[]
  /** Elements whose source changed and that were not edited: the authority's value was taken. */
  takenElements: ElementNote[]
  /** Elements dropped because the authority removed them (never edited). */
  droppedElements: ElementNote[]
  countChanges: Array<{ before: string; after: string }>
  /** Elements whose source did not change (their stored value, edited or not, is kept), of which edited ones. */
  keptElements: number
  keptEditedElements: number
  /** Top-level document fields that differ between the stored structure and the new one (information; they take the new value). */
  documentFieldsChanged: string[]
}
export type MergePlan = { report: MergeReport; document?: Doc; slots?: ContentSlot[]; sourceSha256?: string }

const COUNT = /Showing (?:all )?(?:\d+–)?\d+(?: of \d+)? results?/
/** The plain text of a rich-text element when it holds only text (no link, no other inline node); null otherwise. */
const plainText = (state: unknown): string | null => {
  let out = ''
  let ok = true
  const walk = (n: { type?: string; text?: string; children?: unknown[] }) => {
    if (n.type === 'text') out += n.text ?? ''
    else if (n.type !== 'root' && n.type !== 'paragraph') ok = false
    for (const c of (n.children ?? []) as never[]) walk(c)
  }
  const root = (state as { root?: never } | null | undefined)?.root
  if (!root) return null
  walk(root)
  return ok ? out : null
}
/** A results-count text after normalising whitespace (NBSP included) and dashes: "Showing 1-16 of 33 results", "Showing all 27 results". */
const countText = (state: unknown): boolean => {
  const t = plainText(state)
  return t !== null && /^Showing (?:all )?[\d–-]+(?: of \d+)? results?$/.test(t.replace(/[\s\u00a0]+/g, ' ').replace(/[\u2010-\u2015\u2212]/g, '–').trim())
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const slotValues = (s: ContentSlot) => JSON.stringify([s.text ?? null, s.label ?? null, s.href ?? null, s.productRouteId ?? null, s.intent ?? null, s.image ?? null, s.imageUrl ?? null, s.imageWidth ?? null, s.imageHeight ?? null, s.alt ?? null, s.copy ?? null, s.heading ?? null])
const sig = (s: ContentSlot) => `${s.kind}|${s.tag}|${s.elementId ?? ''}|${s.sourceHash}`
const loose = (s: ContentSlot) => `${s.kind}|${s.tag}|${s.elementId ?? ''}`
const note = (s: ContentSlot, reason?: string): ElementNote => ({ key: s.key, title: String(s.title ?? s.label ?? s.heading ?? '').slice(0, 90), ...(reason ? { reason } : {}) })
const emptyReport = (stored: Pick<StoredListing, 'path' | 'routeId'>): MergeReport => ({ path: stored.path, routeId: stored.routeId, action: 'UNCHANGED', refusals: [], refusedElements: [], resolvedElements: [], newElements: [], takenElements: [], droppedElements: [], countChanges: [], keptElements: 0, keptEditedElements: 0, documentFieldsChanged: [] })

/** Order-preserving matches of two signature lists (longest common subsequence). */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const out: Array<[number, number]> = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++ } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  return out
}

export function planListingMerge(stored: StoredListing, newDocument: Doc, newSourceSha: string, productIds: Map<string, string>): MergePlan {
  const report = emptyReport(stored)
  if ((stored.source.sourceSha256 ?? null) === newSourceSha) return { report }
  const baseDoc = (stored.document ?? null) as Doc | null
  if (!baseDoc || !Array.isArray(stored.slots)) return { report: { ...report, action: 'REFUSE', refusals: ['stored record has no document or no page elements'] } }
  report.documentFieldsChanged = [...new Set([...Object.keys(baseDoc), ...Object.keys(newDocument)])].filter((k) => k !== 'text' && !same(baseDoc[k], newDocument[k])).sort()
  const ours = stored.slots
  const baseFresh = new Map(extractSlots(baseDoc, { productIds }).map((s) => [s.key, s]))
  const theirs = extractSlots(newDocument, { productIds })
  // an element is "edited" when its stored value differs from the value the stored structure gives it (unknown = treated as edited: never overwritten)
  const edited = (s: ContentSlot) => { const b = baseFresh.get(s.key); return !b || slotValues(s) !== slotValues(b) }
  const exact = lcsPairs(ours.map(sig), theirs.map(sig))
  const matchedOurs = new Map<number, number>(exact)
  const matchedTheirs = new Set(exact.map(([, j]) => j))
  // inside each gap between exact matches, pair the remaining elements of the same kind/tag/Elementor id in order (changed in the source)
  const pairs = new Map<number, number>()
  const anchors: Array<[number, number]> = [[-1, -1], ...exact, [ours.length, theirs.length]]
  for (let a = 0; a < anchors.length - 1; a++) {
    let j = anchors[a]![1] + 1
    const jEnd = anchors[a + 1]![1]
    for (let i = anchors[a]![0] + 1; i < anchors[a + 1]![0]; i++) {
      let k = j
      while (k < jEnd && loose(theirs[k]!) !== loose(ours[i]!)) k++
      if (k < jEnd) { pairs.set(i, k); matchedTheirs.add(k); j = k + 1 }
    }
  }
  const merged: ContentSlot[] = []
  const theirsToOurs = new Map<number, number>([...matchedOurs].map(([i, j]) => [j, i]))
  const pairedTheirsToOurs = new Map<number, number>([...pairs].map(([i, j]) => [j, i]))
  ours.forEach((s, i) => {
    if (matchedOurs.has(i) || pairs.has(i)) return
    if (edited(s)) report.refusals.push(`element ${s.key} ("${note(s).title}") was removed from the source but was edited in the database (the edit would be lost)`)
    else report.droppedElements.push(note(s))
  })
  theirs.forEach((t, j) => {
    const exactI = theirsToOurs.get(j)
    const pairI = pairedTheirsToOurs.get(j)
    if (exactI !== undefined) {
      const s = ours[exactI]!
      report.keptElements++
      if (edited(s)) report.keptEditedElements++
      merged.push({ ...s, key: t.key })
    } else if (pairI !== undefined) {
      const s = ours[pairI]!
      if (!edited(s)) {
        report.takenElements.push(note(t))
        merged.push(t)
      } else if (slotValues(s) === slotValues(t)) merged.push({ ...s, key: t.key }) // the edit already equals the new source value
      else if (countText(s.text) && countText(baseFresh.get(s.key)?.text)) {
        report.resolvedElements.push(note(t, 'resolved: count paragraph -> source'))
        merged.push(t)
      } else {
        report.refusedElements.push(note(t, `its source changed AND it was edited in the database (stored value kept; key ${s.key})`))
        merged.push({ ...s, key: t.key })
      }
      const was = baseFresh.get(s.key), now = JSON.stringify(t.text ?? '')
      if (was && COUNT.test(now) && COUNT.test(JSON.stringify(was.text ?? ''))) report.countChanges.push({ before: JSON.stringify(was.text ?? '').match(COUNT)![0], after: now.match(COUNT)![0] })
    } else {
      report.newElements.push(note(t))
      merged.push(t)
    }
  })
  if (report.refusals.length) return { report: { ...report, action: 'REFUSE' } }
  return { report: { ...report, action: report.refusedElements.length ? 'MERGE_PARTIAL' : 'MERGE' }, document: newDocument, slots: merged, sourceSha256: newSourceSha }
}

/** The stored-document projection the reviewed import applies (same steps as authority-import.ts and ops/seo-pass/scan-slots.ts). */
export function importedDocument(root: string, row: { routeId: string; sourceFile?: string | null; matchedArticle?: boolean }, publicProducts: Map<string, string>): Doc {
  const parsed = JSON.parse(readFileSync(path.join(root, 'content/salmon', String(row.sourceFile)), 'utf8')) as Doc
  delete parsed.contentHtml
  const document = projectPublicAuthor(applyPublicExclusions(row.routeId, parsed).doc)
  migrateQuoteIntent(document, { routeId: row.routeId, publicProducts, matchedArticle: Boolean(row.matchedArticle) })
  delete document.text
  return document
}

type Authority = { routes: Array<{ path: string; routeId: string; state: string; export: boolean; indexable: boolean; sourceFile?: string | null; sourceSha256?: string | null; matchedArticle?: boolean }> }

/** Runs the merge for the routes named in content/release/listing-merge.json. DRY-RUN unless `apply`. */
export async function mergeListings(payload: Payload, root: string, opts: { apply: boolean; log?: (m: string) => void }): Promise<MergeReport[]> {
  const { releaseAuthority } = (await import(path.join(root, 'release/authority.mjs'))) as { releaseAuthority: (r: string) => Authority }
  const authority = releaseAuthority(root)
  const wanted = (JSON.parse(readFileSync(path.join(root, 'content/release/listing-merge.json'), 'utf8')) as { routes: string[] }).routes
  const publicProducts = new Map(authority.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
  const reports: MergeReport[] = []
  let applied = 0
  for (const p of wanted) {
    const row = authority.routes.find((r) => r.path === p)
    if (!row || !row.sourceFile || !row.sourceSha256) {
      reports.push({ ...emptyReport({ path: p, routeId: '' }), action: 'REFUSE', refusals: ['no authority row with a source document'] })
      continue
    }
    const sha = createHash('sha256').update(readFileSync(path.join(root, 'content/salmon', row.sourceFile))).digest('hex')
    if (sha !== row.sourceSha256) {
      reports.push({ ...emptyReport({ path: p, routeId: row.routeId }), action: 'REFUSE', refusals: ['source file hash does not match the authority'] })
      continue
    }
    const found = await payload.find({ collection: 'public-routes' as never, where: { routeId: { equals: row.routeId } } as never, limit: 1, depth: 0, overrideAccess: true, draft: false })
    const rec = found.docs[0] as unknown as (StoredListing & { _status?: string }) | undefined
    if (!rec) {
      reports.push({ ...emptyReport({ path: p, routeId: row.routeId }), action: 'REFUSE', refusals: ['no stored record (the import creates it; nothing to merge)'] })
      continue
    }
    const disp = (rec.disposition ?? {}) as Doc
    const plan = planListingMerge(rec, importedDocument(root, row, publicProducts), row.sourceSha256, publicProducts)
    if (plan.report.action !== 'UNCHANGED' && (disp.state !== row.state || Boolean(disp.export) !== row.export || Boolean(disp.indexable) !== row.indexable))
      plan.report = { ...plan.report, action: 'REFUSE', refusals: [...plan.report.refusals, 'the stored disposition differs from the authority row'] }
    reports.push(plan.report)
    if (opts.apply && (plan.report.action === 'MERGE' || plan.report.action === 'MERGE_PARTIAL') && plan.document && plan.slots) {
      await payload.update({
        collection: 'public-routes' as never,
        id: rec.id,
        data: { document: plan.document, slots: plan.slots, source: { ...rec.source, sourceSha256: plan.sourceSha256 } } as never,
        context: importContext,
        overrideAccess: true,
        depth: 0,
      })
      applied++
      opts.log?.(`MERGED ${p}`)
    }
  }
  if (opts.apply && applied) opts.log?.(`${applied} record(s) updated; run the publication sync (the command does it)`)
  return reports
}
