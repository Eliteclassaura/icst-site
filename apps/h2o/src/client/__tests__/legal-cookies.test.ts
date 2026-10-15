import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandCookieBlocks, loadInventory, validateInventory, type CookieInventory } from '../site/cookies'
import { listPages } from '../site/content'
import { ATTR_KEY } from '../../rfq-native/attribution'
import { DRAFT_KEY } from '../../rfq-native/draft'

const root = path.resolve(__dirname, '../../../../../clients')
type Section = { heading: string; paragraphs: string[]; bullets?: Array<{ text: string }> }
const words = (page: { layout: Array<Record<string, unknown>> }) =>
  page.layout
    .flatMap((b) => (b.sections as Section[] | undefined) ?? [])
    .flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? []).map((x) => x.text)])
    .join(' ')
    .split(/\s+/).length

describe('legal pages carried from the live ICST text', () => {
  const pages = listPages('icst', root)
  const privacy = pages.find((p) => p.path === '/privacy-policy/')!
  const terms = pages.find((p) => p.path === '/terms-and-conditions/')!
  it('exist with their live paths, are indexable, and keep the text (about 2,060 and 770 words)', () => {
    expect(privacy.page.noindex).toBeUndefined()
    expect(terms.page.noindex).toBeUndefined()
    expect(words(privacy.page as never)).toBeGreaterThan(2040)
    expect(words(terms.page as never)).toBeGreaterThan(760)
  })
  it('record their source file hash and say the live "Contact Us" button label was left out', () => {
    for (const p of [privacy, terms]) {
      const src = (p.page as unknown as { _source: { sha256: string; note: string } })._source
      expect(src.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(src.note).toContain('unchanged')
    }
  })
  it('carry the live last-updated line as page meta and the policy text names the client company', () => {
    expect(JSON.stringify(privacy.page.layout)).toContain('Last updated: May 6, 2025')
    expect(JSON.stringify(privacy.page.layout)).toContain('International Cooling Solutions Thailand')
  })
})

describe('cookie inventory', () => {
  const ok: CookieInventory = { status: 'APPROVED', reviewedOn: '2026-10-16', cookies: [{ name: 'sid', provider: 'this site', purpose: 'keeps you signed in', category: 'essential', duration: 'session', firstParty: true }] }
  it('the committed inventory is valid, pending owner/counsel review, and lists exactly the storage keys the form uses (no cookies for visitors)', () => {
    const inv = loadInventory('icst', root)!
    expect(inv.status).toBe('PENDING_OWNER_COUNSEL_REVIEW')
    expect(inv.reviewedOn).toBeNull()
    expect(inv.cookies.map((c) => c.name).sort()).toEqual([ATTR_KEY, DRAFT_KEY].sort())
    expect(inv.cookies.every((c) => c.provider.includes('sessionStorage'))).toBe(true)
    expect(JSON.stringify(inv)).not.toMatch(/h2o/i)
    expect(readFileSync(path.join(root, 'icst/cookies/README.md'), 'utf8')).toContain('PENDING')
  })
  it('validates entries: required fields, category, duplicates, and an approved list needs a review date', () => {
    expect(validateInventory(ok).ok).toBe(true)
    expect(validateInventory({ ...ok, cookies: [{ ...ok.cookies[0], category: 'tracking' }] }).ok).toBe(false)
    expect(validateInventory({ ...ok, cookies: [ok.cookies[0], ok.cookies[0]] }).ok).toBe(false)
    expect(validateInventory({ ...ok, reviewedOn: null }).ok).toBe(false)
    expect(validateInventory({ status: 'x', reviewedOn: null, cookies: [] }).ok).toBe(false)
  })
  it('the notice block becomes a table of exactly the inventory; an approved empty list says so; pending says pending', () => {
    const layout = [{ blockType: 'cookieInventory' }] as never
    const t = expandCookieBlocks(layout, ok)
    expect(t).toHaveLength(1)
    expect(JSON.stringify(t)).toContain('keeps you signed in')
    expect(JSON.stringify(expandCookieBlocks(layout, { ...ok, cookies: [] }))).toContain('sets no cookies')
    expect(JSON.stringify(expandCookieBlocks(layout, { status: 'PENDING_REAL_LIST', reviewedOn: null, cookies: [] }))).toContain('PENDING')
    expect(validateInventory({ ...ok, status: 'PENDING_OWNER_COUNSEL_REVIEW', reviewedOn: null }).ok).toBe(true)
    expect(expandCookieBlocks([{ blockType: 'hero' }] as never, null)).toHaveLength(1)
  })
  it('under the production policy a pending inventory refuses to render', () => {
    const prod = { H2O_INDEXING_POLICY: 'production' } as unknown as NodeJS.ProcessEnv
    expect(() => expandCookieBlocks([{ blockType: 'cookieInventory' }] as never, { status: 'PENDING_REAL_LIST', reviewedOn: null, cookies: [] }, prod)).toThrow(/COPY_PENDING_APPROVAL/)
    expect(() => expandCookieBlocks([{ blockType: 'cookieInventory' }] as never, ok, prod)).not.toThrow()
  })
})
