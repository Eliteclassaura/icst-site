/**
 * Slot hygiene fixes (R1 residual, Control Tower 2026-10-05). Offline; writes ops/seo-pass/data/slot-fixes.json.
 *
 *   pnpm exec tsx ops/seo-pass/build-slot-fixes.ts [--evidence=<file>]
 *
 * Imported page elements that the strict save-hook validator rejects (content-slots validateSlots) make every write to their
 * record fail. Their DATA is fixed, the validator is not loosened:
 *   - a link to this site (h2ocooling.com, any scheme) → its site path; a consolidated page → its redirect destination;
 *     a held file → its verified served path (public/wp-content/uploads);
 *   - an external http link → https only where the target was verified to serve the page over https (EXTERNAL below);
 *   - anything else → unlinked (the text stays);
 *   - an alt text over 300 characters → its own leading whole sentences up to 300 characters (held text, nothing added).
 * Every fixed record is re-validated with the same validator as an editor write (0 errors required) and every change is
 * recorded. The batch writes the fixed elements in the same request as the decided change, never on their own.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { extractSlots, validateSlots, type ContentSlot, type LexicalState } from '../../src/content/content-slots'
import { withheldIdsFor } from '../../src/content/public-exclusions'
import { publicFileExists } from '../../src/content/public-files'
import { storedDocument } from './scan-slots'
import { slotFieldCanon } from './lexical-canon.mjs'

type Row = { path: string; routeId: string; state: string; export: boolean; redirect?: string | null; sourceFile?: string; matchedArticle?: boolean }
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Row[]; redirects: Array<{ source: string; destination: string }> }
const knownPaths = new Set(ledger.routes.map((r) => r.path))
const products = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
const batchRedirects = readFileSync(path.join(APP, 'ops/seo-pass/data/redirects.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')).map(([s, d]) => [decodeURIComponent(s!), d!] as const)
const redirectTo = new Map<string, string>([...ledger.redirects.map((r) => [decodeURIComponent(r.source), r.destination] as const), ...batchRedirects])
for (const r of ledger.routes) if (r.state === 'REDIRECT' && r.redirect) redirectTo.set(decodeURIComponent(r.path), r.redirect)

/** External http targets checked over https on 2026-10-05 (read-only GET): the https URL to use, or null to unlink. */
const EXTERNAL: Record<string, { to: string | null; evidence: string }> = {
  'http://www.osha.gov/laws-regs': { to: 'https://www.osha.gov/laws-regs', evidence: 'https 200 "Laws and Regulations | OSHA"' },
  'http://www.osha.gov/': { to: 'https://www.osha.gov/', evidence: 'https 200 "Home | OSHA"' },
  'http://www.brentwoodindustries.com/products/cooling-tower/accessories/driseals.php': { to: 'https://www.brentwoodindustries.com/products/cooling-tower/accessories-for-cooling-tower/cooling-tower-water-air-management-accessories/driseals/', evidence: 'https 301 → 200 (manufacturer moved the page; final https URL used)' },
  'http://www.brentwoodindustries.com/products/cooling-tower/mechanical-assembly.php': { to: null, evidence: 'https 404' },
  'http://www.owlnet.rice.edu/~ceng402/proj05/ewalk/ceng402/intro.html': { to: null, evidence: 'https 404' },
  'http://m.coolingtowerdepot.com/content/parts/splash-fill-packaged-cooling-tower-features': { to: null, evidence: 'no https response' },
  'http://h2cooling.com': { to: null, evidence: 'typo domain; now a parked domain-sale page' },
}
/** Alt texts with no sentence boundary inside 300 characters: the held fragment used (verbatim from the same alt). */
const ALT_FRAGMENT: Record<string, string> = { '/cooling-tower-spray-nozzles/': 'Cooling Tower Spray Nozzles: A Selection Guide' }

const uploads = path.join(APP, 'public/wp-content/uploads')
const filesByName = new Map<string, string[]>()
const index = (dir: string) => { for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) index(p); else filesByName.set(n.toLowerCase(), [...(filesByName.get(n.toLowerCase()) ?? []), '/' + path.relative(path.join(APP, 'public'), p).split(path.sep).join('/')]) } }
index(uploads)

const valid = (href: string) => href.startsWith('#') || /^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/.test(href) || (href.startsWith('/') && !href.startsWith('//') && (knownPaths.has(href.split(/[?#]/)[0]!) || publicFileExists(href)))
type Change = { from: string; to: string | null; action: 'site-path' | 'redirect-destination' | 'held-file' | 'https' | 'unlink'; reason: string }
function fixUrl(url: string): Change | null {
  if (valid(url)) return null
  const own = /^https?:\/\/(?:www\.)?h2ocooling\.com(\/[^?#]*)?([?#].*)?$/i.exec(url)
  if (own) {
    let p = own[1] || '/'
    if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/'
    const key = decodeURIComponent(p)
    if (knownPaths.has(p) && !redirectTo.has(key)) return { from: url, to: p, action: 'site-path', reason: 'own-site absolute link → site path' }
    if (redirectTo.has(key)) return { from: url, to: redirectTo.get(key)!, action: 'redirect-destination', reason: `own-site link to a consolidated page → its 301 destination` }
    if (publicFileExists(p)) return { from: url, to: p, action: 'held-file', reason: 'own-site file link → served held file' }
    return { from: url, to: null, action: 'unlink', reason: 'own-site link to a page that does not exist' }
  }
  if (url.startsWith('/content/uploads/') || url.startsWith('/wp-content/uploads/')) {
    const found = filesByName.get(path.basename(url.split(/[?#]/)[0]!).toLowerCase()) ?? []
    if (found.length === 1 && publicFileExists(found[0]!)) return { from: url, to: found[0]!, action: 'held-file', reason: 'legacy upload path → the verified restored file (same name, unique)' }
    return { from: url, to: null, action: 'unlink', reason: 'legacy upload path without a verified served file' }
  }
  const ext = EXTERNAL[url]
  if (ext) return { from: url, to: ext.to, action: ext.to ? 'https' : 'unlink', reason: ext.evidence }
  return { from: url, to: null, action: 'unlink', reason: 'not a site path or a verified https destination' }
}
type LNode = { type: string; text?: string; format?: number; fields?: { url?: string }; children?: LNode[] } & Record<string, unknown>
function fixLexical(state: LexicalState, changes: Change[]): LexicalState {
  const visit = (nodes: LNode[]): LNode[] => nodes.flatMap((n) => {
    if (n.type === 'link') {
      const c = fixUrl(n.fields?.url ?? '')
      if (!c) return [{ ...n, children: visit(n.children ?? []) }]
      changes.push(c)
      return c.to ? [{ ...n, fields: { ...n.fields, url: c.to }, children: visit(n.children ?? []) }] : visit(n.children ?? [])
    }
    return [n.children ? { ...n, children: visit(n.children) } : n]
  })
  const root = (state as unknown as { root: LNode }).root
  return { root: { ...root, children: visit(root.children ?? []) } } as unknown as LexicalState
}
function shortenAlt(p: string, alt: string): string {
  if (ALT_FRAGMENT[p]) { if (!alt.includes(ALT_FRAGMENT[p]!)) throw new Error(`alt fragment not in held alt for ${p}`); return ALT_FRAGMENT[p]! }
  const sentences = alt.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? []
  let out = ''
  for (const s of sentences) { if ((out + s).trim().length > 300) break; out += s }
  if (!out.trim()) throw new Error(`no whole sentence within 300 characters for ${p}`)
  return out.trim()
}

const fixes: Record<string, { routeId: string; slots: Array<{ key: string; kind: string; field: 'text' | 'href' | 'alt'; before: string; after: unknown; afterCanon: string; changes: Change[] }> }> = {}
const seen = new Set<string>()
let fixedRoutes = 0
for (const row of ledger.routes) {
  if (!row.sourceFile || !/^(?:SALMON|LIVE)-/.test(row.routeId) || seen.has(row.routeId)) continue
  seen.add(row.routeId)
  const document = storedDocument(row as never)
  const slots = extractSlots(document, { productIds: products })
  const ctx = { knownPaths, knownFile: publicFileExists, productRouteIds: new Set(products.values()), withheldElementIds: withheldIdsFor(row.routeId) }
  const errors = validateSlots(document, slots, ctx, slots)
  if (!errors.length) continue
  const keys = new Set(errors.map((e) => e.split(':')[0]!))
  const next: ContentSlot[] = slots.map((s) => ({ ...s }))
  const record: (typeof fixes)[string] = { routeId: row.routeId, slots: [] }
  for (const s of next) {
    if (!keys.has(s.key)) continue
    const changes: Change[] = []
    if (s.kind === 'text' && s.text) {
      const before = slotFieldCanon(s, 'text')
      s.text = fixLexical(s.text, changes)
      record.slots.push({ key: s.key, kind: s.kind, field: 'text', before, after: s.text, afterCanon: slotFieldCanon(s, 'text'), changes })
    } else if (s.kind === 'action') {
      const before = slotFieldCanon(s, 'href')
      const c = fixUrl(s.href ?? '')
      if (c) { changes.push(c); s.href = c.to ?? '' }
      record.slots.push({ key: s.key, kind: s.kind, field: 'href', before, after: s.href, afterCanon: slotFieldCanon(s, 'href'), changes })
    } else if (s.kind === 'image') {
      const before = slotFieldCanon(s, 'alt')
      const alt = shortenAlt(row.path, s.alt ?? '')
      changes.push({ from: s.alt ?? '', to: alt, action: 'unlink' as never, reason: `alt shortened ${(s.alt ?? '').length} → ${alt.length} characters (held text)` })
      s.alt = alt
      record.slots.push({ key: s.key, kind: s.kind, field: 'alt', before, after: s.alt, afterCanon: slotFieldCanon(s, 'alt'), changes: changes.map((c) => ({ ...c, action: 'alt-shortened' as never })) })
    }
  }
  const remaining = validateSlots(document, next, ctx, slots)
  if (remaining.length) throw new Error(`${row.path}: fixed elements still fail the validator: ${remaining.join('; ')}`)
  fixes[row.path] = record
  fixedRoutes++
}
writeFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), JSON.stringify(fixes, null, 1) + '\n')
const changes = Object.values(fixes).flatMap((r) => r.slots.flatMap((s) => s.changes))
const evidence = process.argv.find((a) => a.startsWith('--evidence='))?.slice(11)
if (evidence) writeFileSync(evidence, ['path\tkey\tfield\taction\tfrom\tto\treason', ...Object.entries(fixes).flatMap(([p, r]) => r.slots.flatMap((s) => s.changes.map((c) => [p, s.key, s.field, c.action, c.from.replace(/\s+/g, ' '), (c.to ?? '').replace(/\s+/g, ' '), c.reason].join('\t'))))].join('\n') + '\n')
process.stdout.write(JSON.stringify({ routes: fixedRoutes, elements: Object.values(fixes).reduce((n, r) => n + r.slots.length, 0), changes: changes.length, byAction: changes.reduce<Record<string, number>>((a, c) => { a[c.action] = (a[c.action] ?? 0) + 1; return a }, {}) }, null, 1) + '\n')
