/**
 * Slot hygiene scan (R1 residual, Control Tower 2026-10-05). Offline; reads the repository authorities only.
 *
 *   pnpm exec tsx ops/seo-pass/scan-slots.ts [--out=<file>] [--paths=<file with one path per line>]
 *
 * Rebuilds every imported salmon/live record's stored page tree exactly as the reviewed import does (public exclusions,
 * then the author projection, then the quote-intent stamps), extracts its page elements (content slots), and runs the
 * REAL save-hook validator (content-slots validateSlots) over them as an unchanged write would. Any element the strict
 * validator rejects would make every write to that record fail (publish, withdraw, SEO), so the batch must carry a fix for it.
 * Output: one row per offending element, with the validator's own message.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { applyPublicExclusions, withheldIdsFor } from '../../src/content/public-exclusions'
import { projectPublicAuthor } from '../../src/content/public-author'
import { migrateQuoteIntent } from '../../src/content/rfq-intent'
import { extractSlots, validateSlots, type ContentSlot } from '../../src/content/content-slots'
import { publicFileExists } from '../../src/content/public-files'

type Doc = Record<string, unknown>
type Row = { path: string; routeId: string; state: string; export: boolean; matchedArticle?: boolean; sourceFile?: string }
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Row[] }
const only = arg('paths') ? new Set(readFileSync(arg('paths')!, 'utf8').trim().split('\n')) : null
const knownPaths = new Set(ledger.routes.map((r) => r.path))
const publicProducts = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))

export function storedDocument(row: Row): Doc {
  const parsed = JSON.parse(readFileSync(path.join(APP, 'content/salmon', String(row.sourceFile)), 'utf8')) as Doc
  delete parsed.contentHtml
  const document = projectPublicAuthor(applyPublicExclusions(row.routeId, parsed).doc)
  migrateQuoteIntent(document, { routeId: row.routeId, publicProducts, matchedArticle: Boolean(row.matchedArticle) })
  delete document.text
  return document
}

if (process.argv[1]?.endsWith("scan-slots.ts")) main()
function main() {
const rows: Array<{ path: string; routeId: string; key: string; kind: string; error: string }> = []
const seenRoute = new Set<string>()
for (const row of ledger.routes) {
  if (!row.sourceFile || !/^(?:SALMON|LIVE)-/.test(row.routeId) || row.routeId.startsWith('ENGLISH-SERVICE-')) continue
  if (seenRoute.has(row.routeId)) continue // an alias record carries no slots
  seenRoute.add(row.routeId)
  if (only && !only.has(row.path)) continue
  const document = storedDocument(row)
  const slots: ContentSlot[] = extractSlots(document, { productIds: publicProducts })
  const ctx = { knownPaths, knownFile: publicFileExists, productRouteIds: new Set(publicProducts.values()), withheldElementIds: withheldIdsFor(row.routeId) }
  for (const error of validateSlots(document, slots, ctx, slots)) {
    const key = error.split(':')[0]!
    rows.push({ path: row.path, routeId: row.routeId, key, kind: slots.find((s) => s.key === key)?.kind ?? '?', error })
  }
}
const out = arg('out')
if (out) writeFileSync(out, JSON.stringify(rows, null, 1) + '\n')
const byRoute = new Map<string, number>()
for (const r of rows) byRoute.set(r.path, (byRoute.get(r.path) ?? 0) + 1)
process.stdout.write(JSON.stringify({ offendingElements: rows.length, offendingRoutes: byRoute.size, byMessage: rows.reduce<Record<string, number>>((a, r) => { const m = r.error.replace(/^[^:]+: /, '').replace(/\/[^\s]+ is not a site route/, '<path> is not a site route'); a[m] = (a[m] ?? 0) + 1; return a }, {}) }, null, 1) + '\n')
}
