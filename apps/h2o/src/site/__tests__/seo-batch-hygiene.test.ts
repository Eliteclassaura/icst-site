/**
 * R1 residual (Control Tower 2026-10-05): the batch's slot hygiene and lifecycle read-back.
 *
 * Commander's R1 apply failed 49 writes on the strict save-hook validator (imported legacy links, a legacy upload path,
 * over-long alt text). The validator stays strict; the batch fixes the DATA, and every fixed record passes the same validator
 * (content-slots validateSlots) that a Payload write runs. Withdrawals are proved by the main row's status, not by a document
 * merely being returned to an admin read.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { extractSlots, lexicalParts, validateSlots, type ContentSlot } from '../../content/content-slots'
import { withheldIdsFor } from '../../content/public-exclusions'
import { publicFileExists } from '../../content/public-files'
import { storedDocument } from '../../../ops/seo-pass/scan-slots'
import { slotFieldCanon } from '../../../ops/seo-pass/lexical-canon.mjs'
import { publishedAsDecided, withdrawnAsDecided } from '../../../ops/seo-pass/lifecycle.mjs'

type Row = { path: string; routeId: string; state: string; export: boolean; sourceFile?: string; matchedArticle?: boolean }
type Fix = { routeId: string; slots: Array<{ key: string; kind: string; field: 'text' | 'href' | 'alt'; before: string; after: unknown; afterCanon: string; changes: Array<{ from: string; to: string | null; action: string; reason: string }> }> }
const APP = process.cwd()
const ledger = JSON.parse(readFileSync(path.join(APP, 'content/release/route-ledger.json'), 'utf8')) as { routes: Row[] }
const fixes = JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/slot-fixes.json'), 'utf8')) as Record<string, Fix>
const knownPaths = new Set(ledger.routes.map((r) => r.path))
const products = new Map(ledger.routes.filter((r) => /^SALMON-product-[0-9]+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export).map((r) => [r.path, r.routeId] as [string, string]))
const ctxFor = (routeId: string) => ({ knownPaths, knownFile: publicFileExists, productRouteIds: new Set(products.values()), withheldElementIds: withheldIdsFor(routeId) })

describe('slot hygiene: data fixed, validator strict', () => {
  it('every imported record passes the real save-hook validator once its batch fixes are applied (0 errors site-wide)', () => {
    const seen = new Set<string>()
    let records = 0, fixed = 0
    for (const row of ledger.routes) {
      if (!row.sourceFile || !/^(?:SALMON|LIVE)-/.test(row.routeId) || seen.has(row.routeId)) continue
      seen.add(row.routeId)
      const document = storedDocument(row as never)
      const slots = extractSlots(document, { productIds: products }) as ContentSlot[]
      const fix = fixes[row.path]
      const next = slots.map((s) => ({ ...s }))
      for (const f of fix?.slots ?? []) {
        const slot = next.find((s) => s.key === f.key)!
        expect(slotFieldCanon(slot, f.field), `${row.path} ${f.key} imported value`).toBe(f.before)
        ;(slot as unknown as Record<string, unknown>)[f.field] = f.after
        expect(slotFieldCanon(slot, f.field)).toBe(f.afterCanon)
        fixed++
      }
      expect(validateSlots(document, next, ctxFor(row.routeId), slots), row.path).toEqual([])
      records++
    }
    expect(records).toBeGreaterThan(1000)
    // 112 link/alt fixes (R1 residual) + 12 claim edits (CT ruling, Locale Part B).
    expect(fixed).toBe(124)
  }, 120000)
  it('reproduces the R1 failures: without the fixes the strict validator rejects exactly the recorded elements', () => {
    const row = ledger.routes.find((r) => r.path === '/understanding-cooling-tower-parts/')!
    const document = storedDocument(row as never)
    const slots = extractSlots(document, { productIds: products }) as ContentSlot[]
    expect(validateSlots(document, slots, ctxFor(row.routeId), slots)).toEqual([
      'body.3.1.1.7.9: only site paths or https links are allowed',
      'body.3.1.1.7.25.1: only site paths or https links are allowed',
      'body.3.1.1.7.89: only site paths or https links are allowed',
    ])
  })
  it('records every change; https only for verified targets; an unlinked link keeps its text', () => {
    const changes = Object.values(fixes).flatMap((f) => f.slots.flatMap((s) => s.changes.map((c) => ({ ...c, s }))))
    expect(changes).toHaveLength(127)
    for (const c of changes) {
      expect(c.reason.length, c.from).toBeGreaterThan(0)
      if (c.action === 'https') expect(c.to).toMatch(/^https:\/\//)
      if (c.action === 'site-path') expect(knownPaths.has(c.to!), c.to!).toBe(true)
      if (c.action === 'redirect-destination') expect(knownPaths.has(c.to!) || publicFileExists(c.to!), c.to!).toBe(true)
      if (c.action === 'held-file') expect(publicFileExists(c.to!), c.to!).toBe(true)
    }
    const text = (canon: string) => (JSON.parse(canon) as unknown[][]).filter((t) => t[0] === 't').map((t) => t[1]).join('')
    const isClaimEdit = (s: Fix['slots'][number]) => s.changes.some((c) => c.action === 'claim-removed' || c.action === 'word-corrected')
    for (const f of Object.values(fixes)) for (const s of f.slots) if (s.field === 'text' && !isClaimEdit(s)) expect(text(s.afterCanon)).toBe(text(s.before))
    expect(changes.find((c) => c.from === '/content/uploads/fans/Dynafab_FanStacks.pdf')?.to).toBe('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')
  })
  it('shortens over-long alt text to its own leading sentences (≤300 characters, nothing added)', () => {
    const alts = Object.values(fixes).flatMap((f) => f.slots.filter((s) => s.field === 'alt'))
    expect(alts).toHaveLength(5)
    for (const a of alts) {
      const before = JSON.parse(a.before) as string, after = a.after as string
      expect(after.length).toBeLessThanOrEqual(300)
      expect(before.includes(after)).toBe(true)
    }
  })
  it('no fixed text slot keeps a link the validator would reject', () => {
    for (const f of Object.values(fixes)) for (const s of f.slots) if (s.field === 'text') for (const url of lexicalParts(s.after as never).urls) expect(/^https:\/\//.test(url) || url.startsWith('#') || knownPaths.has(url.split(/[?#]/)[0]!) || publicFileExists(url), url).toBe(true)
  })
})

describe('held public files are site links only when verified to exist in the served tree', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'h2o-public-'))
  mkdirSync(path.join(root, 'wp-content/uploads/2021/12'), { recursive: true })
  writeFileSync(path.join(root, 'wp-content/uploads/2021/12/Doc.pdf'), 'x')
  it('accepts an existing held upload; refuses missing files, other prefixes, traversal and non-document types', () => {
    expect(publicFileExists('/wp-content/uploads/2021/12/Doc.pdf', root)).toBe(true)
    expect(publicFileExists('/wp-content/uploads/2021/12/Missing.pdf', root)).toBe(false)
    expect(publicFileExists('/content/uploads/2021/12/Doc.pdf', root)).toBe(false)
    expect(publicFileExists('/wp-content/uploads/../../etc/passwd.pdf', root)).toBe(false)
    expect(publicFileExists('/wp-content/uploads/2021/12/', root)).toBe(false)
    expect(publicFileExists('/wp-content/uploads/2021/12/Doc.php', root)).toBe(false)
  })
  it('the served tree holds the restored Dynafab document the fix points to', () => {
    expect(publicFileExists('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')).toBe(true)
  })
})

describe('lifecycle read-back', () => {
  const want = { state: 'REDIRECT', redirect: '/cooling-tower-design/', indexable: false }
  it('a withdrawn page is proved by an unpublished main row, the decided disposition, and an empty published-only query', () => {
    // What R1 saw for its 13 successful withdrawals: the admin read returns the main row, now a draft.
    const main = { _status: 'draft', disposition: { state: 'REDIRECT', redirect: '/cooling-tower-design/' } }
    expect(withdrawnAsDecided(main, [], want)).toBe(true)
    expect(withdrawnAsDecided({ ...main, _status: 'published' }, [main], want)).toBe(false)
    expect(withdrawnAsDecided(main, [main], want)).toBe(false)
    expect(withdrawnAsDecided({ ...main, disposition: { state: 'PUBLIC', redirect: null } }, [], want)).toBe(false)
    expect(withdrawnAsDecided(null, [], want)).toBe(false)
  })
  it('a published page is proved by a published main row with the decided disposition', () => {
    expect(publishedAsDecided({ _status: 'published', disposition: { state: 'PUBLIC', indexable: true } }, { indexable: true })).toBe(true)
    expect(publishedAsDecided({ _status: 'draft', disposition: { state: 'PUBLIC', indexable: true } }, { indexable: true })).toBe(false)
  })
})

describe('claim edits (Control Tower ruling 2026-10-05, option A + 保証 → 確保)', () => {
  const edits = (JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/claim-edits.json'), 'utf8')) as { edits: Array<{ path: string; op: 'remove' | 'replace'; find: string; replace?: string }> }).edits
  const text = (canon: string) => (JSON.parse(canon) as unknown[][]).filter((t) => t[0] === 't').map((t) => t[1]).join('')
  it('each recorded edit is applied exactly once: the sentence (with one adjacent space) is removed, or the one word replaced; nothing else changes', () => {
    expect(edits).toHaveLength(12)
    for (const e of edits) {
      const fix = Object.entries(fixes).find(([p]) => decodeURIComponent(p) === e.path)?.[1]
      expect(fix, e.path).toBeDefined()
      const slot = fix!.slots.find((s) => s.changes.some((c) => c.from === e.find))!
      const before = text(slot.before), after = text(slot.afterCanon)
      expect(before.split(e.find).length - 1, e.path).toBe(1)
      if (e.op === 'replace') expect(after).toBe(before.replace(e.find, e.replace!))
      else {
        expect(after).not.toContain(e.find)
        expect(before.length - after.length - e.find.length, e.path).toBeLessThanOrEqual(2) // the sentence and its joining space/punctuation only
        expect(after.trim().length, e.path).toBeGreaterThan(0)
      }
    }
  })
  it('English pages and every translation lose the same two claims (no locale or English page keeps either)', () => {
    const removed = edits.filter((e) => e.op === 'remove').map((e) => e.path)
    for (const p of ['/inspect-cooling-tower-part-2/', '/cooling-tower-fill/']) expect(removed).toContain(p)
    expect(removed).toHaveLength(10)
    expect(edits.filter((e) => e.op === 'replace').map((e) => [e.find, e.replace])).toEqual([['安全性と寿命が保証されます', '安全性と寿命が確保されます'], ['常に安全性と寿命を保証するように', '常に安全性と寿命を確保するように']])
  })
})
