/**
 * Slot hygiene fixes (R1 residual, Control Tower 2026-10-05). Offline; writes ops/seo-pass/data/slot-fixes.json.
 *
 *   pnpm exec tsx ops/seo-pass/build-slot-fixes.ts [--evidence=<file>]
 *
 * Imported page elements that the strict save-hook validator rejects (content-slots validateSlots) make every write to their
 * record fail. Their DATA is fixed, the validator is not loosened:
 *   - a link to this site (h2ocooling.com, any scheme) → its site path; a consolidated page → its redirect destination;
 *   - R2.4: any internal link (valid or not) to a page that answers 301 → that redirect's final URL;
 *     a held file → its verified served path (public/wp-content/uploads);
 *   - an external http link → https only where the target was verified to serve the page over https (EXTERNAL below);
 *   - anything else → unlinked (the text stays);
 *   - an alt text over 300 characters → its own leading whole sentences up to 300 characters (held text, nothing added).
 * Every fixed record is re-validated with the same validator as an editor write (0 errors required) and every change is
 * recorded.
 * Claim edits (data/claim-edits.json, Control Tower rulings): a recorded sentence removal or single-word correction in a
 * page's own text, applied inside one text run (never across formatting), exactly once, and never leaving a paragraph
 * empty. Nothing is added. The batch writes the fixed elements in the same request as the decided change, never on their own.
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
  'http://www.brentwoodindustries.com/products/cooling-tower/mechanical-assembly.php': { to: 'https://www.brentwoodindustries.com/products/cooling-tower/', evidence: 'retired page (https 404); OGCS unlinks R1 relink to the manufacturer category page, verified 200 on 2026-10-05 "Cooling Tower Components & Solutions | Brentwood Industries" (CT accepted)' },
  'http://www.owlnet.rice.edu/~ceng402/proj05/ewalk/ceng402/intro.html': { to: null, evidence: 'https 404' },
  'http://m.coolingtowerdepot.com/content/parts/splash-fill-packaged-cooling-tower-features': { to: '/product/splash-fill/', evidence: 'third-party retailer (no https response); OGCS unlinks R1 relink to the ICS product page (CT accepted)' },
  'http://h2cooling.com': { to: null, evidence: 'typo domain; now a parked domain-sale page' },
}
/** Per-page targets for an external URL (OGCS unlinks R1, CT accepted 2026-10-05): the typo domain is the company name in
 * prose; on /industrial-cooling-towers/ "Contact ICS" links to the contact page, elsewhere it stays unlinked text. */
const EXTERNAL_ON_PAGE: Record<string, Record<string, { to: string; evidence: string }>> = {
  '/industrial-cooling-towers/': { 'http://h2cooling.com': { to: '/contact-us/', evidence: 'OGCS unlinks R1: "Contact ICS" → /contact-us/ (CT accepted)' } },
}
/** Alt texts with no sentence boundary inside 300 characters: the held fragment used (verbatim from the same alt). */
const ALT_FRAGMENT: Record<string, string> = { '/cooling-tower-spray-nozzles/': 'Cooling Tower Spray Nozzles: A Selection Guide' }

const uploads = path.join(APP, 'public/wp-content/uploads')
const filesByName = new Map<string, string[]>()
const index = (dir: string) => { for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) index(p); else filesByName.set(n.toLowerCase(), [...(filesByName.get(n.toLowerCase()) ?? []), '/' + path.relative(path.join(APP, 'public'), p).split(path.sep).join('/')]) } }
index(uploads)

const valid = (href: string) => href.startsWith('#') || /^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/.test(href) || (href.startsWith('/') && !href.startsWith('//') && (knownPaths.has(href.split(/[?#]/)[0]!) || publicFileExists(href)))
type Change = { from: string; to: string | null; action: 'site-path' | 'redirect-destination' | 'held-file' | 'https' | 'unlink'; reason: string }
function fixUrl(url: string, page = ''): Change | null {
  const onPage = EXTERNAL_ON_PAGE[page]?.[url]
  if (onPage) return { from: url, to: onPage.to, action: 'site-path', reason: onPage.evidence }
  const moved = redirectedSitePath(url)
  if (moved) return moved
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
  if (ext) return { from: url, to: ext.to, action: !ext.to ? 'unlink' : ext.to.startsWith('/') ? 'site-path' : 'https', reason: ext.evidence }
  return { from: url, to: null, action: 'unlink', reason: 'not a site path or a verified https destination' }
}
/** R2.4 item h (CT 2026-10-05): a link to a page that answers 301 (a redirect source in the ledger or this batch) points at
 * its final URL directly, so no internal link costs a hop. Site paths and own-site absolute URLs; the fragment is kept. */
function redirectedSitePath(url: string): Change | null {
  const m = /^(?:https?:\/\/(?:www\.)?h2ocooling\.com)?(\/(?!\/)[^?#]*)([?#].*)?$/i.exec(url)
  if (!m) return null
  let p = m[1]!
  if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/'
  let key: string
  try { key = decodeURIComponent(p) } catch { return null }
  const to = redirectTo.get(key)
  if (!to) return null
  const hash = m[2]?.startsWith('#') ? m[2] : ''
  return { from: url, to: to + hash, action: 'redirect-destination', reason: `internal link to a 301 source → its final URL ${to}` }
}
const redirectLinks = (s: ContentSlot): boolean => {
  if (s.kind === 'action') return !!redirectedSitePath(s.href ?? '')
  if (s.kind !== 'text' || !s.text) return false
  let hit = false
  const visit = (n: LNode) => { if (n.type === 'link' && redirectedSitePath(n.fields?.url ?? '')) hit = true; (n.children ?? []).forEach(visit) }
  visit((s.text as unknown as { root: LNode }).root)
  return hit
}
type LNode = { type: string; text?: string; format?: number; fields?: { url?: string }; children?: LNode[] } & Record<string, unknown>
function fixLexical(state: LexicalState, changes: Change[], page = ''): LexicalState {
  const visit = (nodes: LNode[]): LNode[] => nodes.flatMap((n) => {
    if (n.type === 'link') {
      const c = fixUrl(n.fields?.url ?? '', page)
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

/** `allowEmpty` (CT F1 ruling 2026-10-05): a removal may empty its whole element (a wrong spec line or boilerplate sentence);
 * the product template hides an empty line, and a panel left without text. */
/** R2.2 (claims sweep): `slot` targets one element (its key); `element: 'heading'` edits a heading; `op: 'set'` replaces a
 * text element with restricted markdown (plain text and [text](/path/) links) when a ruling adds a link. */
type ClaimEdit = { run?: number; path: string; op: 'remove' | 'replace' | 'set'; find: string; replace?: string; markdown?: string; allowEmpty?: boolean; slot?: string; element?: 'heading' | 'alt'; row?: string; reason: string }
const normText = (t: string) => t.replace(/[\s\u00a0\u200b]+/g, ' ').replace(/\s+([,.;:!?)])/g, '$1').trim()
/** Restricted markdown → Lexical: text runs and internal links only. */
function markdownLexical(md: string): LexicalState {
  const text = (t: string) => ({ type: 'text', text: t, format: 0, detail: 0, mode: 'normal', style: '', version: 1 })
  const children: unknown[] = []
  let last = 0
  for (const m of md.matchAll(/\[([^\]]+)\]\((\/[^)\s]*)\)/g)) {
    if (m.index! > last) children.push(text(md.slice(last, m.index)))
    children.push({ type: 'link', fields: { url: m[2], newTab: false, linkType: 'custom' }, children: [text(m[1]!)], format: '', indent: 0, version: 3, direction: 'ltr' })
    last = m.index! + m[0].length
  }
  if (last < md.length) children.push(text(md.slice(last)))
  return { root: { type: 'root', children: [{ type: 'paragraph', children, format: '', indent: 0, version: 1, direction: 'ltr', textFormat: 0, textStyle: '' }], format: '', indent: 0, version: 1, direction: 'ltr' } } as unknown as LexicalState
}
const claimEdits = (JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/claim-edits.json'), 'utf8')) as { edits: ClaimEdit[] }).edits
const claimEditsFor = new Map<string, ClaimEdit[]>()
for (const e of claimEdits) claimEditsFor.set(e.path, [...(claimEditsFor.get(e.path) ?? []), e])
const appliedEdits = new Set<ClaimEdit>()
/** Edits whose text no editable element holds: these belong in the text-override registry, never here (stops the build). */
const notEditable: string[] = []
/** Apply one claim edit to a lexical state: the text run that contains `find` (once) changes; null when no single run holds it. */
function editLexical(state: LexicalState, edit: ClaimEdit): LexicalState | null {
  if (edit.run !== undefined) {
    // R2.2: one exact text run, by its position among the element's text nodes; its whole text must equal `find`.
    let i = -1, ok = false
    const visitRun = (nodes: LNode[]): LNode[] => nodes.map((n) => {
      if (n.type === 'text' && typeof n.text === 'string') { i++; if (i === edit.run && n.text === edit.find) { ok = true; return { ...n, text: edit.op === 'replace' ? edit.replace ?? '' : '' } } return n }
      return n.children ? { ...n, children: visitRun(n.children) } : n
    })
    const root = (state as unknown as { root: LNode }).root
    const next = { root: { ...root, children: visitRun(root.children ?? []) } } as unknown as LexicalState
    return ok ? next : null
  }
  let hits = 0
  const visit = (nodes: LNode[]): LNode[] => nodes.map((n) => {
    if (n.type === 'text' && typeof n.text === 'string' && n.text.includes(edit.find)) {
      hits++
      // A removal takes the sentence with exactly one adjacent space; nothing else in the run changes.
      const t = n.text
      const text = edit.op === 'replace' ? t.replace(edit.find, edit.replace ?? '') : t.includes(edit.find + ' ') ? t.replace(edit.find + ' ', '') : t.includes(' ' + edit.find) ? t.replace(' ' + edit.find, '') : t.replace(edit.find, '')
      return { ...n, text }
    }
    return n.children ? { ...n, children: visit(n.children) } : n
  })
  const root = (state as unknown as { root: LNode }).root
  const next = { root: { ...root, children: visit(root.children ?? []) } } as unknown as LexicalState
  if (hits === 1) return next
  if (hits > 1 || edit.op !== 'remove') return null
  return removeAcrossRuns(state, edit.find)
}
/** A sentence removal that spans the runs of one block (e.g. "… is" + linked company name + ". Kindly …"): runs wholly
 * inside the sentence are dropped (a link only as a whole), boundary text runs are trimmed; a link cut in two refuses. */
function removeAcrossRuns(state: LexicalState, find: string): LexicalState | null {
  const runText = (n: LNode): string => (n.type === 'text' ? n.text ?? '' : (n.children ?? []).map(runText).join(''))
  let done = 0
  const visitBlock = (block: LNode): LNode => {
    const runs = block.children ?? []
    const texts = runs.map(runText)
    const joined = texts.join('')
    const at = joined.indexOf(find)
    if (done || at < 0 || !runs.every((r) => r.type === 'text' || r.type === 'link' || r.type === 'linebreak')) return block.children ? { ...block, children: runs.map(visitBlock) } : block
    const end = at + find.length
    const out: LNode[] = []
    let pos = 0
    let joinAt = -1 // index in `out` of the run that follows the removed sentence
    for (const [i, r] of runs.entries()) {
      const from = pos, to = pos + texts[i]!.length
      pos = to
      if (to <= at || from >= end) { if (from >= end && joinAt < 0) joinAt = out.length; out.push(r); continue }
      if (from >= at && to <= end) continue // wholly inside: dropped
      if (r.type !== 'text') return block // a link cut in two: refuse (unchanged block → caller refuses)
      const t = r.text ?? ''
      if (to > end && joinAt < 0) joinAt = out.length
      out.push({ ...r, text: t.slice(0, Math.max(0, at - from)) + t.slice(Math.min(t.length, end - from)) })
    }
    // Tidy the join only: the run that follows the removed sentence loses its leading ". " or space.
    const tidy = out.map((r, i) => (i === joinAt && r.type === 'text' ? { ...r, text: (r.text ?? '').replace(/^[.,;:]?\s+/, '') } : r))
    done++
    return { ...block, children: tidy.filter((r) => !(r.type === 'text' && (r.text ?? '') === '')) }
  }
  const root = (state as unknown as { root: LNode }).root
  const next = { root: { ...root, children: (root.children ?? []).map(visitBlock) } } as unknown as LexicalState
  return done === 1 && lexicalText(next) !== lexicalText(state) ? next : null
}
const lexicalText = (state: LexicalState): string => { const t = (n: LNode): string => (n.type === 'text' ? n.text ?? '' : (n.children ?? []).map(t).join('')); return t((state as unknown as { root: LNode }).root) }
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
  const edits = claimEditsFor.get(decodeURIComponent(row.path)) ?? []
  const redirecting = slots.filter(redirectLinks).map((s) => s.key)
  if (!errors.length && !edits.length && !redirecting.length) continue
  const keys = new Set([...errors.map((e) => e.split(':')[0]!), ...redirecting])
  const next: ContentSlot[] = slots.map((s) => ({ ...s }))
  const record: (typeof fixes)[string] = { routeId: row.routeId, slots: [] }
  for (const s of next) {
    if (!keys.has(s.key)) continue
    const changes: Change[] = []
    if (s.kind === 'text' && s.text) {
      const before = slotFieldCanon(s, 'text')
      s.text = fixLexical(s.text, changes, row.path)
      record.slots.push({ key: s.key, kind: s.kind, field: 'text', before, after: s.text, afterCanon: slotFieldCanon(s, 'text'), changes })
    } else if (s.kind === 'action') {
      const before = slotFieldCanon(s, 'href')
      const c = fixUrl(s.href ?? '', row.path)
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
  for (const edit of edits) {
    // SEO-CONTENT-2: `element: 'alt'` rewords an image element's alt text (the whole alt is replaced)
    if (edit.element === 'alt') {
      const im = next.find((s) => s.kind === 'image' && (!edit.slot || s.key === edit.slot) && normText(s.alt ?? '') === normText(edit.find))
      if (!im) throw new Error(`${row.path}: alt edit not found: ${edit.find.slice(0, 60)}`)
      const existing = record.slots.find((r) => r.key === im.key && r.field === 'alt')
      const before = existing?.before ?? slotFieldCanon(im, 'alt')
      im.alt = edit.replace ?? ''
      const change: Change = { from: edit.find, to: edit.replace ?? '', action: 'claim-reworded' as never, reason: edit.reason }
      if (existing) { existing.after = im.alt; existing.afterCanon = slotFieldCanon(im, 'alt'); existing.changes.push(change) }
      else record.slots.push({ key: im.key, kind: im.kind, field: 'alt', before, after: im.alt, afterCanon: slotFieldCanon(im, 'alt'), changes: [change] })
      appliedEdits.add(edit)
      continue
    }
    if (edit.element === 'heading') {
      const h = next.find((s) => s.kind === 'heading' && (!edit.slot || s.key === edit.slot) && normText(s.heading ?? '').includes(normText(edit.find)))
      if (!h) throw new Error(`${row.path}: heading edit not found: ${edit.find.slice(0, 60)}`)
      const before = h.heading ?? ''
      h.heading = normText(before).replace(normText(edit.find), normText(edit.replace ?? '')).trim()
      record.slots.push({ key: h.key, kind: h.kind, field: 'heading' as never, before: JSON.stringify(before), after: h.heading, afterCanon: JSON.stringify(h.heading), changes: [{ from: edit.find, to: edit.replace ?? '', action: 'claim-reworded' as never, reason: edit.reason }] })
      appliedEdits.add(edit)
      continue
    }
    if (edit.op === 'set') {
      const t = next.find((s) => s.kind === 'text' && s.text && (!edit.slot || s.key === edit.slot) && normText(lexicalText(s.text)) === normText(edit.find))
      if (!t?.text) throw new Error(`${row.path}: set edit target not found: ${edit.find.slice(0, 60)}`)
      const existing = record.slots.find((r) => r.key === t.key)
      const before = existing?.before ?? slotFieldCanon(t, 'text')
      t.text = markdownLexical(edit.markdown ?? '')
      const change: Change = { from: edit.find, to: edit.markdown ?? '', action: 'claim-reworded' as never, reason: edit.reason }
      if (existing) { existing.after = t.text; existing.afterCanon = slotFieldCanon(t, 'text'); existing.changes.push(change) }
      else record.slots.push({ key: t.key, kind: t.kind, field: 'text', before, after: t.text, afterCanon: slotFieldCanon(t, 'text'), changes: [change] })
      appliedEdits.add(edit)
      continue
    }
    const slot = next.find((s) => s.kind === 'text' && s.text && (!edit.slot || s.key === edit.slot) && editLexical(s.text, edit))
    if (!slot?.text) {
      const target = next.find((s) => s.key === edit.slot)
      const nodes: string[] = []
      const collect = (n: LNode) => { if (n.type === 'text') nodes.push(n.text ?? ''); (n.children ?? []).forEach(collect) }
      if (target?.text) collect((target.text as unknown as { root: LNode }).root)
      notEditable.push(`${row.path}\t${edit.row ?? ''}\t${edit.find.slice(0, 80)}${edit.run !== undefined ? `\n   at run ${edit.run} of ${target?.kind ?? 'no slot'} ${edit.slot}: ${JSON.stringify((nodes[edit.run] ?? '').slice(0, 120))}` : ''}`)
      continue
    }
    const existing = record.slots.find((r) => r.key === slot.key)
    const before = existing?.before ?? slotFieldCanon(slot, 'text')
    slot.text = editLexical(slot.text, edit)!
    if (!edit.allowEmpty && !JSON.parse(slotFieldCanon(slot, 'text')).some((t: unknown[]) => t[0] === 't' && String(t[1]).trim())) throw new Error(`${row.path}: claim edit would leave ${slot.key} empty`)
    const change: Change = { from: edit.find, to: edit.op === 'replace' ? edit.replace ?? '' : null, action: (edit.op === 'remove' ? 'claim-removed' : 'word-corrected') as never, reason: edit.reason }
    if (existing) { existing.after = slot.text; existing.afterCanon = slotFieldCanon(slot, 'text'); existing.changes.push(change) }
    else record.slots.push({ key: slot.key, kind: slot.kind, field: 'text', before, after: slot.text, afterCanon: slotFieldCanon(slot, 'text'), changes: [change] })
    appliedEdits.add(edit)
  }
  const remaining = validateSlots(document, next, ctx, slots)
  if (remaining.length) throw new Error(`${row.path}: fixed elements still fail the validator: ${remaining.join('; ')}`)
  fixes[row.path] = record
  fixedRoutes++
}
if (notEditable.length) throw new Error(`claim edits that no editable element holds (move them to content/design/text-overrides.json):\n${notEditable.join('\n')}`)
const unapplied = claimEdits.filter((e) => !appliedEdits.has(e))
if (unapplied.length) throw new Error(`claim edits without a published route record: ${unapplied.map((e) => e.path).join(', ')}`)
// R2.2: an element an earlier batch already fixed starts from that batch's fixed value, not the imported one. `--baseline`
// names the slot-fixes.json that batch applied; its fixed value is recorded as an accepted starting state (`accept`).
const baselineFile = process.argv.find((a) => a.startsWith('--baseline='))?.slice(11)
if (baselineFile) {
  const prior = JSON.parse(readFileSync(baselineFile, 'utf8')) as typeof fixes
  for (const [p, rec] of Object.entries(fixes)) for (const f of rec.slots) {
    const was = prior[p]?.slots.find((x) => x.key === f.key && x.field === f.field) as ((typeof fixes)[string]['slots'][number] & { accept?: string[] }) | undefined
    // SEO-CONTENT-1: a baseline that is itself a built file also carries forward the starting states it already accepted.
    if (was) {
      const accept = [...new Set([...(was.accept ?? []), was.afterCanon])].filter((v) => v !== f.afterCanon && v !== f.before)
      if (accept.length) (f as typeof f & { accept?: string[] }).accept = accept
    }
  }
}
writeFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), JSON.stringify(fixes, null, 1) + '\n')
const changes = Object.values(fixes).flatMap((r) => r.slots.flatMap((s) => s.changes))
const evidence = process.argv.find((a) => a.startsWith('--evidence='))?.slice(11)
if (evidence) writeFileSync(evidence, ['path\tkey\tfield\taction\tfrom\tto\treason', ...Object.entries(fixes).flatMap(([p, r]) => r.slots.flatMap((s) => s.changes.map((c) => [p, s.key, s.field, c.action, c.from.replace(/\s+/g, ' '), (c.to ?? '').replace(/\s+/g, ' '), c.reason].join('\t'))))].join('\n') + '\n')
process.stdout.write(JSON.stringify({ routes: fixedRoutes, elements: Object.values(fixes).reduce((n, r) => n + r.slots.length, 0), changes: changes.length, byAction: changes.reduce<Record<string, number>>((a, c) => { a[c.action] = (a[c.action] ?? 0) + 1; return a }, {}) }, null, 1) + '\n')
