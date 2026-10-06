/**
 * OGCS claims sweep R1 → R2.2 edit data (Control Tower rulings 2026-10-05). Offline; writes a plan file only.
 *
 *   pnpm exec tsx ops/seo-pass/build-claims-sweep.ts <SWEEP.tsv> [--out=<dir>]
 *
 * Applies GATE and SHOULD rows (REWORD, REMOVE): [owner] rows with their safe default, [datasheet] rows as removals.
 * Skips OPTIONAL rows, KEEP rows (unless CT gave a new default, OVERRIDE_TEXT), VERIFY_APPLIED (ruling A, already a recorded
 * edit), RULED rows (already recorded edits; their coverage is asserted instead) and the AUTHOR_BIO row (a code authority).
 *
 * Each ruled sentence is located in the page's own imported tree (the document the slot builder reads) at ELEMENT level: the
 * one block element (p, li, td, heading …) whose text holds it, compared the way the page renders (entities decoded,
 * whitespace collapsed, no space before punctuation). The element's new text is mapped back onto its text runs by a
 * character diff, so labels, bold and links keep their place; each changed run becomes one exact edit (whole run before →
 * after). Routing:
 *   - a run inside an editable element (text or heading slot) → a recorded claim edit (R2.2 content batch);
 *   - a run no editor can reach (template-only markup, metadata, structured data) → the text-override registry (R2.1 code).
 * A sentence that is not found, or found in more than one different element, stops nothing silently: it is reported.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { extractSlots } from '../../src/content/content-slots'
import { storedDocument } from './scan-slots'

type Row = { path: string; routeId: string; state: string; export: boolean; sourceFile?: string; matchedArticle?: boolean }
type El = { tag: string; attrs: Record<string, string>; children: Node[] }
type Node = string | El
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Row[] }
const decode = (v: string) => { try { return decodeURIComponent(v) } catch { return v } }
const routeOf = new Map(ledger.routes.filter((r) => r.state === 'PUBLIC' && r.sourceFile).map((r) => [decode(r.path), r]))
const [tsvFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? path.join(APP, 'ops/seo-pass/data')
if (!tsvFile) throw new Error('usage: build-claims-sweep.ts <SWEEP.tsv> [--out=<dir>]')

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
const entities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
/** Rendered-text comparison form. */
const norm = (s: string) => entities(s).normalize('NFC').replace(/\u200b/g, '').replace(/[\s\u00a0]+/g, ' ').replace(/\s+([,.;:!?)])/g, '$1').trim()

/** CT rulings that change a row's proposed text (relayed 2026-10-05). */
const OVERRIDE_TEXT: Record<string, string> = {}
/**
 * Owner answers to the 12 claim questions (CT relay 2026-10-05, OGCS list 847abd04): RESTORE drops the edit (the original
 * claim stays and conformance asserts it is present); a substitution list keeps the claim but applies the Q6 wording.
 */
/** Rows that reword a sentence CT ruling A already removed (Locale B claim edits, applied first): the removal stands. */
const SUPERSEDED_BY_RULING_A = new Set(['CS049', 'CS066', 'CS074', 'CS085'])
const OWNER_RESTORE: Record<string, { q: string; present: string }> = {
  CS063: { q: 'Q5', present: 'over 20 years of experience and has completed more than 500 installations across Southeast Asia' },
}
const OWNER_SUBS: Record<string, { q: string; subs: Sub[]; present: string }> = {
  CS025: { q: 'Q4 (CTI-licensed restored) + Q6', subs: [{ old: 'has decades of experience', neu: 'has extensive experience' }], present: 'The ICS team is CTI-licensed' },
  CS021: { q: 'Q7 (footprint restored, owner confirmed final) + Q6', subs: [{ old: 'With decades of engineering experience', neu: 'With extensive engineering experience' }], present: 'manufacturing facilities operating across the country' },
}
export const ownerPresent = { ...Object.fromEntries(Object.entries(OWNER_RESTORE).map(([k, v]) => [k, v.present])), ...Object.fromEntries(Object.entries(OWNER_SUBS).map(([k, v]) => [k, v.present])) }
/**
 * Rows whose ruled text cannot be applied as written, placed by Main with the same intent (each reported in the return):
 * a rendered placeholder in the fetched text, a link the rewording would drop, a duplicated card blurb, a title template.
 */
const MAIN_SUBS: Record<string, { note: string; subs: Sub[] }> = {
  CS010: { note: 'the claim clause removed; the "ICS website" link and its call to action kept', subs: [{ old: 'maintenance that guarantees peak performance, visit the', neu: 'maintenance, visit the' }] },
  CS065: { note: 'the fetched text began with the rendered "Historical source image unavailable" placeholder', subs: [{ old: 'Scope of Work : In 2018, ICS & ICS Thailand (ICST) were selected by PTT Gas to upgrade their Air Cooled Heat Exchangers (ACHE) by a guaranteed minimum of 15% increased airflow.', neu: 'Scope of Work: In 2018, ICS & ICS Thailand (ICST) were selected by PTT Gas to upgrade their Air Cooled Heat Exchangers (ACHE) against a minimum 15% airflow-increase target.' }] },
  CS096: { note: 'brochure card blurb: "global service network" removed (one edit covers CS096 and CS097)', subs: [{ old: 'capabilities, project experience, and global service network', neu: 'capabilities, and project experience' }] },
  CS097: { note: 'as CS096', subs: [{ old: 'capabilities, project experience, and global service network', neu: 'capabilities, and project experience' }] },
  CS147: { note: 'the stored SEO title is "Best Hudson Fans … | Cooling Tower Fans" (the " - ICS" suffix is the template)', subs: [{ old: 'Best Hudson Fans', neu: 'Hudson Fans' }] },
}
/** Rows whose ruling adds a link (a run edit cannot): the element's full new text as restricted markdown ([text](/path/)). */
const SET_ELEMENT: Record<string, { old: string; markdown: string; note: string }> = {
  CS057: { old: 'Small commercial towers (up to 200 tons) typically cost $50,000 – $150,000 , while medium commercial towers (200 – 500 tons) range from $150,000 – $500,000 .', markdown: 'For typical market price ranges by tower size, see our [cooling tower cost guide](/cooling-tower-cost/).', note: 'service-page price ranges replaced by a link to the cost guide (OGCS reason: link /cooling-tower-cost/)' },
}
type Sub = { old: string; neu: string }
function substitutions(r: Record<string, string>): Sub[] {
  if (OWNER_SUBS[r.row!]) return OWNER_SUBS[r.row!]!.subs
  if (MAIN_SUBS[r.row!]) return MAIN_SUBS[r.row!]!.subs
  const p = OVERRIDE_TEXT[r.row!] ?? r.proposed_text!
  if (/^\(replace substrings?\)/.test(p)) return [...p.matchAll(/"([^"]+)"\s*→\s*"([^"]*)"/g)].map((m) => ({ old: m[1]!, neu: m[2]! }))
  if (r.action === 'REMOVE' || !p.trim()) return [{ old: r.current_text!, neu: '' }]
  return [{ old: r.current_text!, neu: p }]
}

const BLOCKS = new Set(['p', 'li', 'td', 'th', 'dt', 'dd', 'blockquote', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'summary'])
type Run = { key: string; raw: string; ancestors: string[] }
type Block = { key: string; runs: Run[] }
/** Innermost block elements with their text runs (a nested block is its own block). */
function blocks(children: Node[]): Block[] {
  const res: Block[] = []
  const walk = (n: Node, key: string, anc: string[], block: Block | null) => {
    if (typeof n === 'string') { block?.runs.push({ key, raw: n, ancestors: anc }); return }
    let b = block
    if (BLOCKS.has(n.tag)) { b = { key, runs: [] }; res.push(b) }
    n.children.forEach((c, i) => walk(c, `${key}.${i}`, [...anc, key], b))
  }
  children.forEach((c, i) => walk(c, `body.${i}`, [], null))
  return res.filter((b) => b.runs.some((r) => r.raw.trim()))
}
/** Word-level edit script old → new (LCS over word and whitespace tokens), as character ranges of `a`: a change never
 * splits a word, so a link or bold run keeps its exact words. */
function diffOps(a: string, b: string): Array<[number, number, string]> {
  const ta = a.match(/\s+|[^\s]+/g) ?? [], tb = b.match(/\s+|[^\s]+/g) ?? []
  const n = ta.length, m = tb.length
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = ta[i] === tb[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const offs: number[] = []
  let o = 0
  for (const t of ta) { offs.push(o); o += t.length }
  offs.push(o)
  const ops: Array<[number, number, string]> = []
  let i = 0, j = 0, cur: [number, number, string] | null = null
  const flush = () => { if (cur) { ops.push(cur); cur = null } }
  while (i < n || j < m) {
    if (i < n && j < m && ta[i] === tb[j]) { flush(); i++; j++ }
    else if (j < m && (i === n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) { cur ??= [offs[i]!, offs[i]!, '']; cur[2] += tb[j]; j++ }
    else { cur ??= [offs[i]!, offs[i]!, '']; cur[1] = offs[i + 1]!; i++ }
  }
  flush()
  return ops
}
/** Ordinal of a text run among the non-empty text nodes of its element (the order Lexical stores them in). */
function runOrdinal(children: Node[], slotKey: string, runKey: string): number {
  const keys: string[] = []
  const walk = (n: Node, key: string) => { if (typeof n === 'string') { if (n && key.startsWith(slotKey + '.')) keys.push(key); return } n.children.forEach((c, i) => walk(c, `${key}.${i}`)) }
  children.forEach((c, i) => walk(c, `body.${i}`))
  return keys.indexOf(runKey)
}
type Plan = { run?: number; op?: 'set'; row: string; path: string; routeId: string; find: string; replace: string; where: 'slot-text' | 'slot-heading' | 'override'; field: 'body' | 'seo'; slotKey?: string; runKey?: string; reason: string }
const plans: Plan[] = []
/** The earlier recorded claim edits (no `row`), which the slot builder applies first: run text before any sweep edit. */
type Manual = { path: string; op: string; find: string; replace?: string }
const manualEdits = (JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/claim-edits.json'), 'utf8')) as { edits: Array<Manual & { row?: string }> }).edits.filter((e) => !e.row && e.op !== 'set')
const base = new Map<string, string>()
function preload(routePath: string, children: Node[], textSlots: Set<string>) {
  const mine = manualEdits.filter((e) => decode(e.path) === decode(routePath))
  if (!mine.length) return
  // the slot builder applies each recorded edit once, to the first element (document order) that holds it
  const used = new Set<Manual>()
  const walk = (n: Node, key: string) => {
    if (typeof n === 'string') {
      let t = base.get(`${routePath}\u0000${key}`) ?? n
      const inSlot = [...textSlots].some((k) => key.startsWith(k + '.'))
      for (const e of mine) if (inSlot && !used.has(e) && t.includes(e.find) && used.add(e)) t = e.op === 'replace' ? t.replace(e.find, e.replace ?? '') : t.includes(e.find + ' ') ? t.replace(e.find + ' ', '') : t.includes(' ' + e.find) ? t.replace(' ' + e.find, '') : t.replace(e.find, '')
      if (t !== n) base.set(`${routePath}\u0000${key}`, t)
      return
    }
    n.children.forEach((c, i) => walk(c, `${key}.${i}`))
  }
  children.forEach((c, i) => walk(c, `body.${i}`))
}
const preloaded = new Set<string>()
/** Cumulative run text per page: a run edited by more than one row gets one edit, original → final. */
const overlay = new Map<string, string>()
const pushRun = (pl: Plan) => {
  const k = `${pl.path}\u0000${pl.runKey}`
  const prior = plans.find((x) => x.runKey && `${x.path}\u0000${x.runKey}` === k)
  overlay.set(k, pl.replace)
  if (prior) { prior.replace = pl.replace; prior.row += '+' + pl.row; prior.reason += ' | ' + pl.reason; return }
  plans.push(pl)
}
const unresolved: Array<{ row: string; path: string; old: string; why: string }> = []
const lines = readFileSync(tsvFile, 'utf8').replace(/\r/g, '').trim().split('\n')
const head = lines.shift()!.split('\t')
/** TSV fields as written by a CSV writer: a field wrapped in quotes has doubled inner quotes. */
const field = (v: string) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v)
const table = lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i]!, field(v)])))
/**
 * Defects ruled FIX in the same batch (CT 2026-10-05): D4 broken LaTeX markup and D3 raw WPBakery shortcodes, as synthetic
 * rows (one per affected text run, found in the page's own tree) through the same placement as the sweep rows.
 */
const LATEX_PAGES = ['/cooling-tower-performance-curve/', '/cooling-tower-thermography/', '/cooling-tower-variable-frequency-drive/']
const SHORTCODE_PAGES = ['/resources/cooling-tower-brochures/']
const delatex = (t: string) => t.replace(/\$\s*Delta T\s*\$/g, 'ΔT').replace(/\$(>?)(\d+)\^\{circ\}text\{C\}\$/g, '$1$2 °C').replace(/\$([0-9.,%°FC<>]+)\$/g, '$1')
const unshort = (t: string) => t.replace(/\[\/?vc_[^\]]*\]/g, '').replace(/\s{2,}/g, ' ')
const coveredBySweep = (t: string) => /Download our brochures to learn how ICS incorporates|ICS: 2024 Brochure/.test(t)
let synthetic = 0
for (const [pages, fix, tag, why] of [[LATEX_PAGES, delatex, 'D4', 'broken LaTeX markup rendered as text ("$15%$", "$10^{circ}text{C}$")'], [SHORTCODE_PAGES, unshort, 'D3', 'raw WPBakery shortcodes rendered as text']] as const) {
  for (const p of pages) {
    const route = routeOf.get(p)
    if (!route) { unresolved.push({ row: tag, path: p, old: '', why: 'no published route record' }); continue }
    const doc = storedDocument(route as never) as { children: Node[] }
    const walk = (n: Node) => {
      if (typeof n === 'string') {
        const next = fix(n)
        if (next !== n && !(tag === 'D3' && coveredBySweep(n))) table.push({ exact_run: 'yes', row: `${tag}-${++synthetic}`, severity: 'GATE', action: next.trim() ? 'REWORD' : 'REMOVE', path: p, lang: 'en', field: 'body', current_text: n, proposed_text: next.trim(), reason: `CT ruling 2026-10-05: FIX ${tag}, ${why}`, owner: '' })
        return
      }
      n.children.forEach(walk)
    }
    doc.children.forEach(walk)
  }
}
let skipped = 0
for (const r of table) {
  const keep = r.action === 'KEEP' && !OVERRIDE_TEXT[r.row!]
  if (r.severity === 'OPTIONAL' || keep || r.action === 'VERIFY_APPLIED' || r.action === 'RULED' || r.path!.startsWith('AUTHOR_BIO') || OWNER_RESTORE[r.row!] || SUPERSEDED_BY_RULING_A.has(r.row!)) { skipped++; continue }
  const meta = !r.field!.startsWith('body')
  for (const p of r.path!.split(';').map((s) => s.trim()).filter(Boolean)) {
    const route = routeOf.get(decode(p))
    if (!route) { unresolved.push({ row: r.row!, path: p, old: r.current_text!, why: 'no published route record' }); continue }
    const doc = storedDocument(route as never) as Record<string, unknown>
    const reason = `OGCS claims sweep R1 ${r.row} (${r.severity}${r.owner ? ' ' + r.owner : ''}; CT accepted 2026-10-05): ${r.reason}`
    for (const s of substitutions(r)) {
      const want = norm(s.old)
      if (meta) {
        const seo = doc.seo as { title?: string; meta?: Array<{ name: string; value: string }>; schema?: unknown[] }
        const hay = [String(doc.title ?? ''), seo.title ?? '', ...(seo.meta ?? []).map((m) => m.value), JSON.stringify(seo.schema ?? [])]
        const found = hay.find((h) => norm(h).includes(want))
        if (!found) { unresolved.push({ row: r.row!, path: p, old: s.old, why: 'metadata string not found' }); continue }
        plans.push({ row: r.row!, path: route.path, routeId: route.routeId, find: s.old, replace: s.neu, where: 'override', field: 'seo', reason })
        continue
      }
      const slots = extractSlots(doc as never)
      const slotByKey = new Map(slots.map((sl) => [sl.key, sl]))
      if (r.exact_run) {
        // a defect fix of one text run: that run, by its exact text (unique on the page), whole before → whole after
        const runs: Array<{ key: string; raw: string; ancestors: string[] }> = []
        const walk = (n: Node, key: string, anc: string[]) => { if (typeof n === 'string') { if (n === r.current_text) runs.push({ key, raw: n, ancestors: anc }); return } n.children.forEach((c, i) => walk(c, `${key}.${i}`, [...anc, key])) }
        ;((doc.children as Node[]) ?? []).forEach((c, i) => walk(c, `body.${i}`, []))
        if (runs.length !== 1) { unresolved.push({ row: r.row!, path: p, old: r.current_text!, why: `${runs.length} runs hold this exact text` }); continue }
        const run = runs[0]!
        const slotKey = [...run.ancestors].reverse().find((k) => slotByKey.has(k))
        const slot = slotKey ? slotByKey.get(slotKey) : undefined
        const stripped = r.current_text!.replace(/\[\/?vc_[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim()
        // a shortcode run that keeps text stays separated from the run before it (the shortcodes were the only separator)
        const fixed = stripped === r.current_text!.trim() ? r.proposed_text! : stripped ? ' ' + stripped : ''
        pushRun({ row: r.row!, path: route.path, routeId: route.routeId, find: run.raw, replace: fixed.trim() ? fixed : '', where: slot?.kind === 'text' ? 'slot-text' : slot?.kind === 'heading' ? 'slot-heading' : 'override', field: 'body', slotKey, runKey: run.key, run: slotKey ? runOrdinal(doc.children as Node[], slotKey, run.key) : undefined, reason })
        continue
      }
      const set = SET_ELEMENT[r.row!]
      if (set) {
        const el = blocks((doc.children as Node[]) ?? []).filter((bk) => norm(bk.runs.map((x) => x.raw).join('')).includes(norm(set.old)))
        const slot = el.length === 1 ? slotByKey.get(el[0]!.key) : undefined
        if (!slot || slot.kind !== 'text') { unresolved.push({ row: r.row!, path: p, old: set.old, why: 'set-element target is not one text element' }); continue }
        const whole = norm(el[0]!.runs.map((x) => x.raw).join(''))
        plans.push({ op: 'set', row: r.row!, path: route.path, routeId: route.routeId, find: whole, replace: whole.replace(norm(set.old), set.markdown), where: 'slot-text', field: 'body', slotKey: slot.key, reason: reason + ' [' + set.note + ']' })
        continue
      }
      if (!preloaded.has(route.path)) { preload(route.path, (doc.children as Node[]) ?? [], new Set(slots.filter((sl) => sl.kind === 'text').map((sl) => sl.key))); preloaded.add(route.path) }
      const before = (x: Run) => base.get(`${route.path}\u0000${x.key}`) ?? x.raw
      const live = (bk: Block): Block => ({ ...bk, runs: bk.runs.map((x) => ({ ...x, raw: overlay.get(`${route.path}\u0000${x.key}`) ?? before(x), orig: before(x) }) as Run & { orig: string }) })
      let holders = blocks((doc.children as Node[]) ?? []).map(live).filter((b) => norm(b.runs.map((x) => x.raw).join('')).includes(want))
      // text that sits directly in a layout element (no block element around it): the string node is its own holder
      if (!holders.length) {
        const loose: Block[] = []
        const walk = (n: Node, key: string, anc: string[]) => { if (typeof n === 'string') { if (norm(n).includes(want)) loose.push({ key, runs: [{ key, raw: n, ancestors: anc }] }); return } n.children.forEach((c, i) => walk(c, `${key}.${i}`, [...anc, key])) }
        ;((doc.children as Node[]) ?? []).forEach((c, i) => walk(c, `body.${i}`, []))
        holders = loose
      }
      // the same sentence as a heading and as its table-of-contents link (or a repeated heading) is edited everywhere
      const distinct = new Set(holders.map((b) => norm(b.runs.map((x) => x.raw).join(''))))
      if (!holders.length) { unresolved.push({ row: r.row!, path: p, old: s.old, why: 'not found in the imported tree' }); continue }
      if (distinct.size > 1 && holders.length > 2) { unresolved.push({ row: r.row!, path: p, old: s.old, why: `${holders.length} different elements hold it` }); continue }
      for (const b of holders) {
        // a whole-element removal (also with zero-width characters in the source) clears every run of the element
        if (!s.neu && norm(b.runs.map((x) => x.raw).join('')) === want) {
          for (const run of b.runs) {
            if (!run.raw.trim() && !run.raw.includes('\u200b')) continue
            const slotKey = [b.key, ...[...run.ancestors].reverse()].find((k) => slotByKey.has(k))
            const slot = slotKey ? slotByKey.get(slotKey) : undefined
            pushRun({ row: r.row!, path: route.path, routeId: route.routeId, find: (run as Run & { orig?: string }).orig ?? run.raw, replace: '', where: slot?.kind === 'text' ? 'slot-text' : slot?.kind === 'heading' ? 'slot-heading' : 'override', field: 'body', slotKey, runKey: run.key, run: slotKey ? runOrdinal(doc.children as Node[], slotKey, run.key) : undefined, reason })
          }
          continue
        }
        // decoded run texts (the stored text is decoded; an entity in a run stops that run)
        const texts = b.runs.map((x) => x.raw)
        if (texts.some((t) => entities(t) !== t)) { unresolved.push({ row: r.row!, path: p, old: s.old, why: 'entity-encoded run' }); continue }
        const joined = texts.join('')
        // locate `old` in the joined raw text, tolerating whitespace differences at run boundaries
        const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const words = norm(s.old).split(' ').map((w) => { const m2 = /^(.*?)([,.;:!?)]*)$/.exec(w)!; return esc(m2[1]!) + (m2[2] ? '\\s*' + esc(m2[2]) : '') })
        const m = new RegExp('[\\u200b]*' + words.join('[\\s\\u00a0\\u200b]*'), 'u').exec(joined)
        if (!m) { unresolved.push({ row: r.row!, path: p, old: s.old, why: 'whitespace mapping failed' }); continue }
        const neu = s.neu ? norm(s.neu) : ''
        let next = joined.slice(0, m.index) + neu + joined.slice(m.index + m[0].length)
        if (!neu) next = next.replace(/^\s+/, '').replace(/\s{2,}/g, ' ')
        // map the element change onto its runs
        const bounds: number[] = []
        let pos = 0
        for (const t of texts) { bounds.push(pos); pos += t.length }
        const newRuns = [...texts]
        // a removal deletes exactly the matched span (and one adjacent space); a rewording is mapped word by word
        const ops: Array<[number, number, string]> = neu ? diffOps(joined, next) : (() => {
          let st = m.index, en = m.index + m[0].length
          if (joined[en] === ' ') en++
          else if (st > 0 && joined[st - 1] === ' ') st--
          return [[st, en, '']]
        })()
        // apply ops right to left; an op spanning runs puts its insertion in the first run it touches
        for (const [aS, aE, ins] of ops.reverse()) {
          for (let k = texts.length - 1; k >= 0; k--) {
            const s0 = bounds[k]!, e0 = s0 + texts[k]!.length
            const from = Math.max(aS, s0), to = Math.min(aE, e0)
            if (aS === aE ? aS >= s0 && aS <= e0 : from < to) {
              newRuns[k] = newRuns[k]!.slice(0, from - s0) + (k === firstRunOf(aS, aE) ? ins : '') + newRuns[k]!.slice(to - s0)
              if (aS === aE) break // a pure insertion lands in one run only
            }
          }
        }
        function firstRunOf(aS: number, aE: number) {
          for (let k = 0; k < texts.length; k++) { const s0 = bounds[k]!, e0 = s0 + texts[k]!.length; if (aS === aE ? aS >= s0 && aS <= e0 : Math.max(aS, s0) < Math.min(aE, e0)) return k }
          return 0
        }
        if (!neu) next = joined.slice(0, ops[0]![0]) + joined.slice(ops[0]![1])
        if (norm(newRuns.join('')) !== norm(next)) { unresolved.push({ row: r.row!, path: p, old: s.old, why: 'run mapping mismatch' }); continue }
        for (const [k, run] of b.runs.entries()) {
          if (newRuns[k] === run.raw) continue
          const slotKey = [b.key, ...[...run.ancestors].reverse()].find((a) => slotByKey.has(a))
          const slot = slotKey ? slotByKey.get(slotKey) : undefined
          const where: Plan['where'] = slot?.kind === 'text' ? 'slot-text' : slot?.kind === 'heading' ? 'slot-heading' : 'override'
          pushRun({ row: r.row!, path: route.path, routeId: route.routeId, find: (run as Run & { orig?: string }).orig ?? run.raw, replace: newRuns[k]!, where, field: 'body', slotKey, runKey: run.key, run: slotKey ? runOrdinal(doc.children as Node[], slotKey, run.key) : undefined, reason })
        }
      }
    }
  }
}
{ // the same run edited by two rows that rule the same text (CS096/CS097): one edit
  const seen = new Set<string>()
  for (let i = plans.length - 1; i >= 0; i--) { const k = `${plans[i]!.path}\u0000${plans[i]!.field}\u0000${plans[i]!.runKey ?? plans[i]!.find}`; if (seen.has(k)) plans.splice(i, 1); else seen.add(k) }
  plans.reverse(); plans.reverse()
}
writeFileSync(path.join(out, 'claims-sweep-plan.json'), JSON.stringify({ skipped, plans, unresolved, ownerPresent }, null, 1) + '\n')
const by = plans.reduce<Record<string, number>>((acc, p) => ((acc[p.where] = (acc[p.where] ?? 0) + 1), acc), {})
process.stdout.write(JSON.stringify({ rows: table.length, skipped, plans: plans.length, by, unresolved: unresolved.length }) + '\n')
for (const u of unresolved) process.stdout.write(`UNRESOLVED ${u.row} ${u.path} :: ${u.why} :: ${u.old.slice(0, 90)}\n`)
