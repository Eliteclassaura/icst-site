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
    // 112 link/alt fixes (R1 residual) + 12 claim edits (Locale Part B), then R2.2 (CT 2026-10-05): F1 product rulings, the OGCS
    // template claims, C4/C5 and the OGCS claims sweep R1 (with D3/D4), on 327 elements; R2.4: internal links to a page that answers
    // 301 point at its final URL (321 more links), 636 elements; R2.5: the OGCS cost/table edits, CS161 and author-alias links
    // (31 more), 667 elements; CLAIMS-R2 (CT 2026-10-06): ten Home elements reworded, seven of them newly fixed, 674 in all (some
    // carry several kinds).
    // R5b (CT 2026-10-07): + 41 location, Disaster Recovery, Thailand FAQ and legacy Thailand elements: 896.
    // SEO-CONTENT-1 (CT 2026-10-07): + 134 claim-edit elements (126 product HVAC bullets and lines, the ALU phrase, the project fact cards and
    // the All Projects card, the algae closing CTA) and 34 internal links to a held page repointed to its final URL (31 of them anchors on the held
    // pages themselves): 852.
    expect(fixed).toBe(1447) // FBG-CONTENT-1: + 24 (OGCS FBG-02/05/07/08/09/13 page-element fixes); STAGING-AUDIT CP-06: + 1 (the Brentwood CF150MAX H1); POSTLAUNCH-WEB-1: + 1 (CF2-03); CATALOG-FANS-2: + 5 (Howden HWD-01..03, HWS-01..02); CLIENT-FIX-1: + 8 (OGCS CF1-01..08); SEO-CONTENT-2.3: - 6 alt rows (IMG-FIX-1), + 3 buying-guide rows; SEO-CONTENT-2.2: + 171 elements (team audit, OEM, project cards, 72 alts) // SEO-CONTENT-2.1: + 89 elements (addendum 18; the four held locale twins' own self-links 71) // piece C (SEO-CONTENT-2): + 115 elements // piece B (SEO-CONTENT-2): + 41 elements // round 2 (OGCS staging QA tranche A/B, OEM/stock, BacMan paragraph): + 99 elements // R4 (CT 2026-10-07): + 6 parts hub elements and 1 Dry Soda element (OGCS R4C-01…07); + 3 Air Coolers (R4C-08…10)
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
    expect(changes).toHaveLength(1586) // FBG-CONTENT-1: + 25; HYBRID-RESTORE-1: + 3 (the hybrid article's three fixes are also keyed to its restored address, an alias record of its own); STAGING-AUDIT CP-06: + 1; POSTLAUNCH-WEB-1: + 1 (CF2-03); CATALOG-FANS-2: + 5; CLIENT-FIX-1: + 8; SEO-CONTENT-2.3: - 6 + 3; SEO-CONTENT-2.2: + 195 // SEO-CONTENT-2.1: + 89 // piece C: + 116 (HVAC tranche C) // CLAIMS-R2: + 10 Home rewordings; R4: + 7 (R4C-01…07); + 3 (R4C-08…10); R5b: + 58 run edits; SEO-CONTENT-1: + 134 claim edits, + 35 repointed links
    for (const c of changes) {
      expect(c.reason.length, c.from).toBeGreaterThan(0)
      if (c.action === 'https') expect(c.to).toMatch(/^https:\/\//)
      if (c.action === 'site-path') expect(knownPaths.has(c.to!), c.to!).toBe(true)
      if (c.action === 'redirect-destination') expect(knownPaths.has(c.to!.split('#')[0]!) || publicFileExists(c.to!), c.to!).toBe(true)
      if (c.action === 'held-file') expect(publicFileExists(c.to!), c.to!).toBe(true)
    }
    const text = (canon: string) => (JSON.parse(canon) as unknown[][]).filter((t) => t[0] === 't').map((t) => t[1]).join('')
    const isClaimEdit = (s: Fix['slots'][number]) => s.changes.some((c) => c.action === 'claim-removed' || c.action === 'word-corrected' || c.action === 'claim-reworded')
    for (const f of Object.values(fixes)) for (const s of f.slots) if (s.field === 'text' && !isClaimEdit(s)) expect(text(s.afterCanon)).toBe(text(s.before))
    expect(changes.find((c) => c.from === '/content/uploads/fans/Dynafab_FanStacks.pdf')?.to).toBe('/wp-content/uploads/2021/12/Dynafab_FanStacks.pdf')
  })
  it('shortens over-long alt text to its own leading sentences (≤300 characters, nothing added)', () => {
    const alts = Object.values(fixes).flatMap((f) => f.slots.filter((s) => s.field === 'alt' && s.changes.some((c) => c.action === 'alt-shortened')))
    expect(alts).toHaveLength(5) // piece C adds 3 reworded alt texts (claim-reworded, not shortened)
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

describe('claim edits (Locale Part B option A; R2.2: F1, OGCS template claims, C4/C5, claims sweep R1 with D3/D4)', () => {
  type Edit = { path: string; op: 'remove' | 'replace' | 'set'; find: string; replace?: string; run?: number; slot?: string; row?: string; reason: string }
  const edits = (JSON.parse(readFileSync(path.join(APP, 'ops/seo-pass/data/claim-edits.json'), 'utf8')) as { edits: Edit[] }).edits
  const text = (canon: string) => (JSON.parse(canon) as unknown[][]).filter((t) => t[0] === 't').map((t) => t[1]).join('')
  const plain = (s: Fix['slots'][number], v: string) => (s.field === 'text' ? text(v) : (JSON.parse(v) as string))
  const n = (hay: string, needle: string) => hay.split(needle).length - 1
  const fixFor = (p: string) => Object.entries(fixes).find(([k]) => decodeURIComponent(k) === p)?.[1]
  it('every recorded edit is applied once on its element and recorded as a change with its reason', () => {
    expect(edits).toHaveLength(1004) // POSTLAUNCH-WEB-1: + 1 (CF2-03); CATALOG-FANS-2: + 5; CLIENT-FIX-1: + 8 (CF1-01..08); SEO-CONTENT-2.3: - 6 alts, + 3 PL rows; SEO-CONTENT-2.2: + 195 (SC1-TA/OEM/PT/QA) // SEO-CONTENT-2.1: + 18 (SC1-CA-*) // piece C: + 116 (SC1-C-*) // R2.5: + 23 OGCS pre-flight edits and CS161; CLAIMS-R2: + 10 Home edits; R4: + 10 (R4C-01…10); R5b: + 58 (R5B-*); SEO-CONTENT-1: + 134 (SC1-*)
    for (const e of edits) {
      const slot = fixFor(e.path)?.slots.find((s) => (!e.slot || s.key === e.slot) && s.changes.some((c) => c.from === e.find))
      expect(slot, `${e.path} ${e.find.slice(0, 50)}`).toBeDefined()
      expect(e.reason.length).toBeGreaterThan(0)
      if (e.op === 'set') continue
      const before = plain(slot!, slot!.before), after = plain(slot!, slot!.afterCanon)
      // one occurrence fewer, less any that another edit on the same element writes back (a word-level diff can move a comma);
      // a find that an earlier edit on the element produced is not in the imported text, and must not be in the result
      const back = edits.filter((o) => o.path === e.path && o.slot === e.slot && o.op !== 'set').reduce((k, o) => k + n(o.replace ?? '', e.find), 0)
      expect(n(after, e.find), `${e.path} ${e.find.slice(0, 50)}`).toBeLessThanOrEqual(Math.max(0, n(before, e.find) - 1) + back)
    }
  })
  it('English pages and every translation lose the same two Locale Part B claims; the superseded 保証 wording is gone too', () => {
    const locb = edits.filter((e) => /Locale Part B claim hygiene/.test(e.reason))
    for (const p of ['/inspect-cooling-tower-part-2/', '/cooling-tower-fill/']) expect(locb.map((e) => e.path)).toContain(p)
    expect(locb.filter((e) => e.op === 'remove')).toHaveLength(10)
    // The 保証 → 確保 word edits are superseded by the claims sweep rewording of the same sentences (CS071, CS075).
    for (const p of ['/ja/冷却塔とは何ですか/', '/ja/寒冷地の冷却塔/']) for (const s of fixFor(p)?.slots ?? []) if (s.field === 'text') expect(text(s.afterCanon), p).not.toMatch(/寿命(?:が|を)保証/)
  })
})
