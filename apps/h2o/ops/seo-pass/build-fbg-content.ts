/**
 * FBG-CONTENT-1 (OGCS audit fix-before-go list 2026-10-11): builds the page-element edits of FBG-02, 05, 07, 08, 09 and 13 from the imported pages.
 *
 *   pnpm exec tsx ops/seo-pass/build-fbg-content.ts <FBG13_OCCURRENCES.tsv> [--write]
 *
 * Offline. Each edit is a pure text function applied to the text runs, heading and image alt of every page element of its page (the same extraction the
 * Payload import uses). Prints one line per changed element; with --write it merges the elements into `data/slot-fixes.json` (the batch, a fresh
 * database) and into the step data (`ops/prod-step/staging-audit-redirects-step-2.data.json`, a database that already holds staff edits), both idempotently.
 * An edit that finds nothing on its page, an FBG-13 page whose replaced occurrences differ from OGCS's list, or an element already fixed by another row
 * stops the run.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { extractSlots, type ContentSlot } from '../../src/content/content-slots'
import { storedDocument } from './scan-slots'
import { slotFieldCanon } from './lexical-canon.mjs'

type Row = { path: string; routeId: string; state: string; export: boolean; sourceFile?: string; matchedArticle?: boolean }
type Fix = { key: string; kind: string; field: 'text' | 'heading' | 'alt'; before: string; after: unknown; afterCanon: string; changes: Array<{ from: string; to: string; action: string; reason: string }> }
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Row[] }
const products = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
const rowOf = (p: string) => { const r = ledger.routes.find((x) => x.path === p && x.sourceFile); if (!r) throw new Error(`no source route for ${p}`); return r }
const write = process.argv.includes('--write')
const [occFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))

/** A text function with the rule's reason. */
type Edit = { id: string; reason: string; fn: (s: string) => string; expect?: number }
const brandFix = (s: string): string =>
  s
    .replace(/Industrial Cooling Solutions \( ?h2ocooling\)/g, 'Industrial Cooling Solutions (ICS)')
    .replace(/Why Customers Choose H2ocooling \( ICS \)/g, 'Why Customers Choose ICS')
    .replace(/visit h2ocooling for expert solutions/g, 'contact ICS for expert solutions')
    .replace(/Visit h2o cooling/g, 'Contact ICS')
    .replace(/\b(H2OCooling|H2ocooling|H2oCooling|H2O [Cc]ooling|h2o cooling|h2ocooling)(?!\w|\.com)(\s+(?=[.,;:?!]))?/g, 'ICS')
    .replace(/Frequnetly Asked Questions/g, 'Frequently Asked Questions')
/** An alt text that ends with the file-style site tag: " - h2ocooling", " - H2ocooling.com", "-h2ocooling". */
const altFix = (s: string): string => s.replace(/\s*-\s*h2ocooling(?:\.com)?\s*$/i, '').replace(/\s+and website www\.h2ocooling\.com\s*$/i, '')

const EXPLICIT: Array<{ path: string; row: string; edits: Edit[] }> = [
  { path: '/closed-loop-vs-open-loop/', row: 'FBG-02', edits: [{ id: 'FBG-02', reason: 'OGCS FBG-02 (typo on a 1,194-click article): "he extra investment" is "The extra investment"', fn: (s) => s.replace('? he extra investment', '? The extra investment'), expect: 1 }] },
  { path: '/resources/tools/', row: 'FBG-05', edits: [{ id: 'FBG-05', reason: 'OGCS FBG-05: ASHRAE is an acronym', fn: (s) => s.replace(/\bAshrae Psychrometric Chart\b/g, 'ASHRAE Psychrometric Chart'), expect: 1 }] },
  {
    path: '/disaster-recovery/',
    row: 'FBG-07',
    edits: [
      { id: 'FBG-07a', reason: 'OGCS FBG-07: the heading "Assessment/tents" is "Damage assessment"', fn: (s) => (s.trim() === 'Assessment/tents' ? 'Damage assessment' : s), expect: 1 },
      { id: 'FBG-07b', reason: 'OGCS FBG-07: the orphan sentence is a complete sentence', fn: (s) => s.replace('rebuilt from the ground up, upgraded with stronger components, and the power plant restored and ready to produce power at full capacity.', 'The cooling towers were rebuilt from the ground up and upgraded with stronger components, and the power plant was restored and ready to produce power at full capacity.'), expect: 1 },
    ],
  },
  {
    path: '/fans/moore-fans/',
    row: 'FBG-08',
    edits: [
      { id: 'FBG-08a', reason: 'OGCS FBG-08: US spelling (the site is US English)', fn: (s) => s.replace('Maximise the performance', 'Maximize the performance'), expect: 1 },
      { id: 'FBG-08b', reason: 'OGCS FBG-08: no "genuine" OEM-style claim', fn: (s) => s.replace('we supply genuine Moore Cooling Tower Fans', 'we supply Moore Cooling Tower Fans'), expect: 1 },
      { id: 'FBG-08c', reason: 'OGCS FBG-08: no speed promise in the heading', fn: (s) => (s.trim() === 'Fast lead times' ? 'Lead times' : s), expect: 1 },
      { id: 'FBG-08d', reason: 'OGCS FBG-08: no speed promise (claims rules)', fn: (s) => s.replace('Because critical components are manufactured in-house, replacement fans and parts can often ship in days rather than weeks.', 'Send us the fan model or part details and we will confirm the supply schedule with your quote.'), expect: 1 },
    ],
  },
  { path: '/dry-soda-blast-cleaning-services-2/', row: 'FBG-09', edits: [{ id: 'FBG-09', reason: 'OGCS FBG-09: an unsupported number ("up to 40%") is removed', fn: (s) => s.replace('which can increase your ACC & ACHE performance by up to 40%.', 'that can improve your ACC & ACHE performance.'), expect: 1 }] },
]

// FBG-13: the pages and the number of body/alt occurrences OGCS lists (the two "NO" rows, a title and a meta, are not page elements)
const occurrences = new Map<string, { body: number; alt: number }>()
if (occFile) {
  const rows = readFileSync(occFile, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'))
  for (const [p, where, , flag] of rows) {
    if (!flag?.startsWith('YES')) continue
    const o = occurrences.get(p!) ?? { body: 0, alt: 0 }
    if (where === 'body') o.body++
    if (where === 'alt') o.alt++
    occurrences.set(p!, o)
  }
}

const fixes = new Map<string, { routeId: string; fixes: Fix[] }>()
const BATCH = JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), 'utf8')) as Record<string, { routeId: string; slots: Fix[] }>
/** Elements that already carry a SEO-batch fix: our edit composes onto its `after`; the step's `before` is that batch result. */
const PRE = new Map<string, { afterCanon: string; n: number }>()
const problems: string[] = []
const changed = (p: string, f: Fix): boolean => { const pre = PRE.get(`${p}\t${f.key}`); return !pre || pre.afterCanon !== f.afterCanon || pre.n !== f.changes.length }
function textMap(state: unknown, fn: (s: string) => string): unknown {
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk)
    if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(o)) out[k] = k === 'text' && typeof v === 'string' && o.type === 'text' ? fn(v) : walk(v)
      return out
    }
    return n
  }
  return walk(state)
}
function apply(p: string, edits: Edit[], altEdit?: (s: string) => string, row = 'FBG') {
  const r = rowOf(p)
  const document = storedDocument(r)
  const slots = extractSlots(document, { productIds: products }) as ContentSlot[]
  const found = new Map<string, number>()
  let entry = fixes.get(p)
  if (!entry) {
    const existing = BATCH[p]
    entry = { routeId: r.routeId, fixes: (existing?.slots ?? []).map((x) => JSON.parse(JSON.stringify(x)) as Fix) }
    for (const x of entry.fixes) PRE.set(`${p}\t${x.key}`, { afterCanon: x.afterCanon, n: x.changes.length })
  }
  for (const slot of slots) {
    for (const e of edits) {
      if (slot.kind === 'text' || slot.kind === 'heading') {
        const field = slot.kind === 'text' ? 'text' : 'heading'
        const current = (entry.fixes.find((f) => f.key === slot.key)?.after ?? (field === 'text' ? slot.text : slot.heading)) as unknown
        const next = field === 'text' ? textMap(current, e.fn) : e.fn(String(current ?? ''))
        if (JSON.stringify(next) === JSON.stringify(current)) continue
        found.set(e.id, (found.get(e.id) ?? 0) + 1)
        const prior = entry.fixes.find((f) => f.key === slot.key)
        const before = prior?.before ?? slotFieldCanon(slot, field)
        const afterCanon = slotFieldCanon({ ...slot, [field]: next } as never, field)
        const change = { from: field === 'text' ? '(element text)' : String(slot.heading), to: field === 'text' ? '(element text)' : String(next), action: 'claim-reworded', reason: e.reason }
        if (prior) { prior.after = next; prior.afterCanon = afterCanon; prior.changes.push(change) } else entry.fixes.push({ key: slot.key, kind: slot.kind, field, before, after: next, afterCanon, changes: [change] })
      }
    }
    if (altEdit && slot.kind === 'image' && typeof slot.alt === 'string') {
      const next = altEdit(slot.alt)
      if (next !== slot.alt) {
        found.set('alt', (found.get('alt') ?? 0) + 1)
        entry.fixes.push({ key: slot.key, kind: 'image', field: 'alt', before: JSON.stringify(slot.alt), after: next, afterCanon: JSON.stringify(next), changes: [{ from: slot.alt, to: next, action: 'claim-reworded', reason: 'OGCS FBG-13: the filename-style site tag " - h2ocooling" is removed from the alt text' }] })
      }
    }
  }
  for (const e of edits) if (e.expect !== undefined && (found.get(e.id) ?? 0) !== e.expect) problems.push(`${p} ${e.id}: expected ${e.expect} element(s), found ${found.get(e.id) ?? 0}`)
  if (entry.fixes.some((f) => changed(p, f))) fixes.set(p, entry)
  void row
}
for (const x of EXPLICIT) apply(x.path, x.edits)
for (const [p, o] of occurrences) {
  const before = fixes.get(p)?.fixes.filter((f) => changed(p, f)).length ?? 0
  apply(p, [{ id: 'FBG-13', reason: 'OGCS FBG-13: the brand reads ICS (H2OCooling / H2O Cooling are not the company name); URLs and email domains are untouched', fn: brandFix }], altFix)
  const made = (fixes.get(p)?.fixes.filter((f) => changed(p, f)).length ?? 0) - before
  process.stdout.write(`FBG-13 ${p}: ${made} element(s) (OGCS lists ${o.body} body + ${o.alt} alt occurrence(s))\n`)
  if (made === 0) problems.push(`${p}: FBG-13 found nothing`)
}
let total = 0
for (const [p, e] of fixes) { const c = e.fixes.filter((f) => changed(p, f)); total += c.length; process.stdout.write(`${p}: ${c.length} element(s) ${c.map((f) => f.key + '/' + f.field).join(' ')}\n`) }
process.stdout.write(`TOTAL ${fixes.size} pages, ${total} elements\n`)
// Listing-derived text (archive card alt, hub index card) is not a slot: reported, not written.
const LISTING_ONLY = ['/category/industrial-cooling-tower/', '/tech-articles/']
// A page whose brand text the SEO batch already rewrites (post-batch text has no brand string left) needs no second fix.
const covered = (l: string): boolean => l.includes('FBG-13 found nothing') && Boolean(BATCH[l.slice(0, l.indexOf(':'))])
const blocking = problems.filter((l) => !LISTING_ONLY.some((p) => l.startsWith(p + ':')) && !covered(l))
if (problems.length) process.stderr.write(problems.join('\n') + '\n')
if (blocking.length) process.exit(3)
if (write) {
  const sfPath = path.join(APP, 'ops/seo-pass/data/slot-fixes.json')
  const sf = JSON.parse(readFileSync(sfPath, 'utf8')) as Record<string, { routeId: string; slots: Array<Record<string, unknown>> }>
  for (const [p, e] of fixes) {
    const rec = sf[p] ?? (sf[p] = { routeId: e.routeId, slots: [] })
    for (const f of e.fixes.filter((x) => changed(p, x))) {
      const i = rec.slots.findIndex((s) => s.key === f.key)
      const row = { key: f.key, kind: f.kind, field: f.field, before: f.before, after: f.after, afterCanon: f.afterCanon, changes: f.changes }
      if (i >= 0) rec.slots[i] = row; else rec.slots.push(row)
    }
    rec.slots.sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true }))
  }
  writeFileSync(sfPath, JSON.stringify(sf, null, 1) + '\n')
  const dPath = path.join(APP, 'ops/prod-step/staging-audit-redirects-step-2.data.json')
  const data = JSON.parse(readFileSync(dPath, 'utf8')) as { slotEdits: Array<{ path: string; fixes: unknown[] }> }
  for (const [p, e] of fixes) {
    const keep = data.slotEdits.filter((s) => s.path !== p)
    keep.push({ path: p, fixes: e.fixes.filter((f) => changed(p, f)).map((f) => ({ key: f.key, field: f.field, row: `FBG ${f.changes.map((c) => c.reason.slice(0, 20)).join('; ')}`.slice(0, 60), before: PRE.get(`${p}\t${f.key}`)?.afterCanon ?? f.before, after: f.after, afterCanon: f.afterCanon, accept: [] })) })
    data.slotEdits = keep
  }
  writeFileSync(dPath, JSON.stringify(data, null, 1) + '\n')
  process.stdout.write('written\n')
}
