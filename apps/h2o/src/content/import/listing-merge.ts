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
 * LISTING-MERGE-1 (CT 2026-10-09): a targeted, idempotent production step for held LISTING records.
 *
 * The authority import never overwrites a stored record whose source hash changed (HELD_CONFLICT), because editors and the
 * fresh-database SEO batch may have edited its page elements. A catalog addition (CATALOG-FANS-1/-2) changes four listing
 * documents (a product card per new product and the result counts). This step applies ONLY that delta:
 *   - the stored page structure (`document`) becomes the new imported document (the structure is import-only and frozen);
 *   - every page element (slot) keeps its stored value, edited or not, except an element whose SOURCE changed (a result count);
 *   - a route is REFUSED, and reported for a manual ruling, when an element whose source changed was also edited since import,
 *     when any other structural change is found (only appended cards, appended image/link records and result-count text may
 *     differ), or when the disposition differs.
 * No SEO title/meta/H1, restored section or page element outside the delta is touched. A second run changes nothing.
 */
type Doc = Record<string, unknown>
type Node = string | { tag: string; attrs?: Record<string, string>; children?: Node[] }

export type StoredListing = {
  id: string | number
  routeId: string
  path: string
  document: Doc | null
  slots: ContentSlot[] | null
  source: { sourceSha256?: string | null } & Doc
  disposition?: Doc | null
}
export type MergeReport = {
  path: string
  routeId: string
  action: 'UNCHANGED' | 'MERGE' | 'REFUSE'
  refusals: string[]
  cardsAdded: string[]
  countChanges: Array<{ before: string; after: string }>
  slotsCarriedEdited: number
  slotsNew: number
  slotsSourceChanged: number
  untouched: string[]
}
export type MergePlan = { report: MergeReport; document?: Doc; slots?: ContentSlot[]; sourceSha256?: string }

const COUNT = /Showing (?:all )?(?:\d+–)?\d+(?: of \d+)? results?/
const isEl = (n: Node | undefined): n is Exclude<Node, string> => typeof n === 'object' && n !== null
const textOf = (n: Node): string => (typeof n === 'string' ? n : (n.children ?? []).map(textOf).join(''))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const slotValues = (s: ContentSlot) => JSON.stringify([s.text ?? null, s.label ?? null, s.href ?? null, s.productRouteId ?? null, s.intent ?? null, s.image ?? null, s.imageUrl ?? null, s.imageWidth ?? null, s.imageHeight ?? null, s.alt ?? null, s.copy ?? null, s.heading ?? null])

type Trial = { cards: string[]; counts: Array<{ before: string; after: string }>; problems: string[]; map: Map<string, string> }
const newTrial = (): Trial => ({ cards: [], counts: [], problems: [], map: new Map() })
const absorb = (to: Trial, from: Trial) => {
  to.cards.push(...from.cards)
  to.counts.push(...from.counts)
  for (const [k, v] of from.map) to.map.set(k, v)
}
const brief = (n: Node) => textOf(n).replace(/\s+/g, ' ').trim().slice(0, 90)

/** Walks `after` against `before`: every old child must reappear in order (its element key is mapped to the new key); extra new children are the added cards; changed strings must be result counts. */
function align(before: Node[], after: Node[], out: Trial, atOld: string, atNew: string): boolean {
  let j = 0
  for (let i = 0; i < before.length; i++) {
    const b = before[i]!
    let matched = false
    while (j < after.length) {
      const a = after[j]!
      const trial = newTrial()
      if (compat(b, a, trial, `${atOld}.${i}`, `${atNew}.${j}`)) {
        absorb(out, trial)
        j++
        matched = true
        break
      }
      if (isEl(a)) out.cards.push(brief(a))
      else if (a.trim() !== '') out.problems.push(`${atOld}: new text between existing nodes`)
      j++
    }
    if (!matched) {
      out.problems.push(`${atOld}.${i}: an existing node is missing or changed`)
      return false
    }
  }
  for (; j < after.length; j++) {
    const a = after[j]!
    if (isEl(a)) out.cards.push(brief(a))
    else if (a.trim() !== '') out.problems.push(`${atOld}: new trailing text`)
  }
  return true
}
function compat(b: Node, a: Node, out: Trial, atOld: string, atNew: string): boolean {
  if (typeof b === 'string' || typeof a === 'string') {
    if (typeof b !== 'string' || typeof a !== 'string') return false
    if (b === a) return true
    if (COUNT.test(b) && COUNT.test(a) && b.replace(COUNT, '#') === a.replace(COUNT, '#')) {
      out.counts.push({ before: b.match(COUNT)![0], after: a.match(COUNT)![0] })
      return true
    }
    return false
  }
  if (b.tag !== a.tag || !same(b.attrs ?? {}, a.attrs ?? {})) return false
  if (!align(b.children ?? [], a.children ?? [], out, atOld, atNew)) return false
  out.map.set(atOld, atNew)
  return true
}

const appendOnly = (before: unknown, after: unknown) => {
  const b = Array.isArray(before) ? before : [],
    a = Array.isArray(after) ? after : []
  let j = 0
  for (const item of b) {
    while (j < a.length && !same(a[j], item)) j++
    if (j >= a.length) return false
    j++
  }
  return true
}

export function planListingMerge(stored: StoredListing, newDocument: Doc, newSourceSha: string, productIds: Map<string, string>): MergePlan {
  const report: MergeReport = { path: stored.path, routeId: stored.routeId, action: 'UNCHANGED', refusals: [], cardsAdded: [], countChanges: [], slotsCarriedEdited: 0, slotsNew: 0, slotsSourceChanged: 0, untouched: [] }
  if ((stored.source.sourceSha256 ?? null) === newSourceSha) return { report }
  const oldDoc = (stored.document ?? null) as Doc | null
  if (!oldDoc || !Array.isArray(stored.slots)) return { report: { ...report, action: 'REFUSE', refusals: ['stored record has no document or no page elements'] } }
  // 1. only the listing delta may differ in the structure
  for (const k of new Set([...Object.keys(oldDoc), ...Object.keys(newDocument)])) {
    if (k === 'children' || k === 'images' || k === 'links' || k === 'text') continue
    if (!same(oldDoc[k], newDocument[k])) report.refusals.push(`document field "${k}" differs (only cards, image/link records and result counts may change)`)
  }
  for (const k of ['images', 'links'])
    if (!appendOnly(oldDoc[k], newDocument[k])) report.refusals.push(`document.${k}: an existing record changed or was removed`)
  const trial = newTrial()
  const ok = align((oldDoc.children ?? []) as Node[], (newDocument.children ?? []) as Node[], trial, 'body', 'body')
  report.refusals.push(...trial.problems)
  if (!ok) report.refusals.push('the page structure changed beyond appended cards and result counts')
  report.cardsAdded = trial.cards
  report.countChanges = trial.counts
  // 2. page elements: stored values survive; a changed-source element that was also edited is a conflict
  const oldFresh = extractSlots(oldDoc, { productIds })
  const newFresh = extractSlots(newDocument, { productIds })
  const oldFreshByKey = new Map(oldFresh.map((s) => [s.key, s]))
  const storedByKey = new Map(stored.slots.map((s) => [s.key, s]))
  const oldKeyOfNew = new Map([...trial.map].map(([o, n]) => [n, o]))
  for (const s of stored.slots) if (ok && !trial.map.has(s.key)) report.refusals.push(`element ${s.key} no longer exists in the new document`)
  const merged: ContentSlot[] = []
  for (const f of newFresh) {
    const ko = oldKeyOfNew.get(f.key)
    const s = ko ? storedByKey.get(ko) : undefined
    const o = ko ? oldFreshByKey.get(ko) : undefined
    if (!s || !o) {
      merged.push(f)
      report.slotsNew++
      continue
    }
    const edited = slotValues(s) !== slotValues(o)
    const sourceChanged = slotValues(o) !== slotValues(f) || o.sourceHash !== f.sourceHash
    if (sourceChanged) {
      report.slotsSourceChanged++
      if (edited) {
        report.refusals.push(`element ${ko} ("${String(f.title ?? '').slice(0, 60)}"): its source changed AND it was edited since import (stored value differs from the import value)`)
        merged.push({ ...s, key: f.key })
      } else merged.push(f)
    } else {
      if (edited) report.slotsCarriedEdited++
      merged.push({ ...s, key: f.key })
    }
  }
  report.untouched = ['SEO title/meta/H1 and canonical', 'restored sections', `${stored.slots.length - report.slotsSourceChanged} page elements keep their stored value (${report.slotsCarriedEdited} of them edited)`]
  if (report.refusals.length) return { report: { ...report, action: 'REFUSE' } }
  return { report: { ...report, action: 'MERGE' }, document: newDocument, slots: merged, sourceSha256: newSourceSha }
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
      reports.push({ path: p, routeId: '', action: 'REFUSE', refusals: ['no authority row with a source document'], cardsAdded: [], countChanges: [], slotsCarriedEdited: 0, slotsNew: 0, slotsSourceChanged: 0, untouched: [] })
      continue
    }
    const sha = createHash('sha256').update(readFileSync(path.join(root, 'content/salmon', row.sourceFile))).digest('hex')
    if (sha !== row.sourceSha256) {
      reports.push({ path: p, routeId: row.routeId, action: 'REFUSE', refusals: ['source file hash does not match the authority'], cardsAdded: [], countChanges: [], slotsCarriedEdited: 0, slotsNew: 0, slotsSourceChanged: 0, untouched: [] })
      continue
    }
    const found = await payload.find({ collection: 'public-routes' as never, where: { routeId: { equals: row.routeId } } as never, limit: 1, depth: 0, overrideAccess: true, draft: false })
    const rec = found.docs[0] as unknown as (StoredListing & { _status?: string }) | undefined
    if (!rec) {
      reports.push({ path: p, routeId: row.routeId, action: 'REFUSE', refusals: ['no stored record (the import creates it; nothing to merge)'], cardsAdded: [], countChanges: [], slotsCarriedEdited: 0, slotsNew: 0, slotsSourceChanged: 0, untouched: [] })
      continue
    }
    const disp = (rec.disposition ?? {}) as Doc
    const plan = planListingMerge(rec, importedDocument(root, row, publicProducts), row.sourceSha256, publicProducts)
    if (plan.report.action !== 'UNCHANGED' && (disp.state !== row.state || Boolean(disp.export) !== row.export || Boolean(disp.indexable) !== row.indexable))
      plan.report = { ...plan.report, action: 'REFUSE', refusals: [...plan.report.refusals, 'the stored disposition differs from the authority row'] }
    reports.push(plan.report)
    if (opts.apply && plan.report.action === 'MERGE' && plan.document && plan.slots) {
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
