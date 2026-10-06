import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseAccountsParams, parseContactsParams } from '../workspace/directory'
import { isPaletteShortcut } from '../workspace/keyboard'
import {
  accountsHref,
  contactsHref,
  cookieOptions,
  inboxHref,
  listReturnPath,
  scopeFrom,
  scopeReturnPath,
  searchRequested,
  storedTerm,
} from '../workspace/prefs'
import { parseInboxParams } from '../workspace/queries'
import { parseRecent, searchTerm } from '../workspace/search'
import { businessDate, nextWeekStart, quickDueDates } from '../workspace/time'

/**
 * CRM Wave 1 Patch A — unit and static tests (no database). DB-backed behaviour (roles, audit rows, hooks, search
 * grouping) is in `__dbtests__/wave1-patch-a.dbtest.ts`.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(DIR, '..', '..')
const CRM_APP = path.join(SRC, 'app', '(crm)')
const read = (f: string) => readFileSync(f, 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : []
  })
const UUID = '01920000-0000-7000-8000-000000000001'

describe('W1-2: search terms never enter a URL', () => {
  it('the inbox parser ignores a legacy ?q= (the term only comes from the list-search cookie)', () => {
    expect(parseInboxParams({ q: 'jane.doe@example.test' }).q).toBeNull()
  })

  it('URL builders never emit a search term, even when the params carry one', () => {
    const p = { ...parseInboxParams({ view: 'mine', owner: 'me' }), q: 'jane.doe@example.test' }
    const href = inboxHref(p, {}, { search: true, rfq: UUID, tab: 'activity' })
    expect(href).not.toMatch(/jane|example|[?&]q=/)
    expect(href).toContain('s=1')
    expect(href).toContain('view=mine')
    expect(accountsHref(parseAccountsParams({}), {}, true)).toBe('/crm/accounts/?s=1')
    expect(contactsHref(parseContactsParams({ linked: 'no' }))).toBe('/crm/contacts/?linked=no')
  })

  it('the return path after a search keeps only validated filters (free text and unknown keys are dropped)', () => {
    const back = 'view=mine&owner=jane%40example.test&q=secret&motion=PARTS&evil=1&page=4&status=RECEIVED&status=BOGUS'
    const out = listReturnPath('inbox', back, true)
    expect(out).toBe('/crm/rfqs/?view=mine&status=RECEIVED&motion=PARTS&s=1')
    expect(listReturnPath('contacts', 'owner=Jane&linked=yes', false)).toBe('/crm/contacts/?linked=yes')
    expect(listReturnPath('accounts', 'relationship=PROSPECT&sort=recent', true)).toBe('/crm/accounts/?relationship=PROSPECT&sort=recent&s=1')
    expect(listReturnPath('inbox', 12 as unknown, false)).toBe('/crm/rfqs/')
  })

  it('the stored term applies only when the URL asks for it, and is bounded', () => {
    expect(searchRequested({ s: '1' })).toBe(true)
    expect(searchRequested({})).toBe(false)
    expect(searchRequested({ s: 'yes' })).toBe(false)
    expect(storedTerm('  a   b  ')).toBe('a b')
    expect(storedTerm(undefined)).toBeNull()
    expect(storedTerm('x'.repeat(500))).toHaveLength(120)
  })

  it('the list-search cookie is HttpOnly, SameSite=Strict, scoped to /crm/ and short-lived', () => {
    const o = cookieOptions(1800, true)
    expect(o).toEqual({ httpOnly: true, sameSite: 'strict', path: '/crm/', maxAge: 1800, secure: true })
  })

  it('global search terms are normalised and need two real characters (wildcards do not count)', () => {
    expect(searchTerm('a')).toBeNull()
    expect(searchTerm('%_')).toBeNull()
    expect(searchTerm(' ab ')).toBe('ab')
    expect(searchTerm(42)).toBeNull()
    expect(searchTerm('y'.repeat(400))).toHaveLength(120)
  })

  it('no CRM page builds a GET form or link carrying `q`', () => {
    const offenders = walk(CRM_APP).filter((f) => {
      const t = read(f)
      return /[?&]q=/.test(t) || /method="get"[^>]*>[\s\S]{0,400}name="q"/.test(t)
    })
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
    // The only `name="q"` inputs post to server actions.
    const qInputs = walk(CRM_APP).filter((f) => /name="q"/.test(read(f)))
    for (const f of qInputs) expect(read(f)).toMatch(/action=\{(listSearchAction|clearListSearchAction)\}/)
  })
})

describe('W1-2: recent items and the ⌘K shortcut', () => {
  it('recent items are kind + id only; names, bad kinds and bad ids are dropped; at most 8', () => {
    const raw = [
      { kind: 'rfq', id: UUID, name: 'Jane Doe' },
      { kind: 'user', id: UUID },
      { kind: 'contact', id: 'not-a-uuid' },
      ...Array.from({ length: 10 }, () => ({ kind: 'account', id: UUID })),
    ]
    const out = parseRecent(raw)
    expect(out[0]).toEqual({ kind: 'rfq', id: UUID })
    expect(out.every((r) => Object.keys(r).sort().join() === 'id,kind')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(8)
    expect(parseRecent('nope')).toEqual([])
  })

  const input = { tagName: 'INPUT', type: 'search', getAttribute: () => null, closest: () => null }
  const body = { tagName: 'BODY', getAttribute: () => null, closest: () => null }
  it('opens on ⌘K and Ctrl-K, never inside a text field, never with Alt/Shift or during composition', () => {
    expect(isPaletteShortcut({ key: 'k', metaKey: true, target: body })).toBe(true)
    expect(isPaletteShortcut({ key: 'K', ctrlKey: true, target: body })).toBe(true)
    expect(isPaletteShortcut({ key: 'k', metaKey: true, target: input })).toBe(false)
    expect(isPaletteShortcut({ key: 'k', target: body })).toBe(false)
    expect(isPaletteShortcut({ key: 'k', metaKey: true, shiftKey: true, target: body })).toBe(false)
    expect(isPaletteShortcut({ key: 'k', metaKey: true, altKey: true, target: body })).toBe(false)
    expect(isPaletteShortcut({ key: 'k', metaKey: true, isComposing: true, target: body })).toBe(false)
    expect(isPaletteShortcut({ key: 'j', metaKey: true, target: body })).toBe(false)
  })
})

describe('W1-8: one remembered scope', () => {
  it('defaults the same way on every page (Admin → Team, Sales → Mine) and honours a stored choice', () => {
    expect(scopeFrom(undefined, true)).toBe('team')
    expect(scopeFrom(undefined, false)).toBe('mine')
    expect(scopeFrom('team', false)).toBe('team')
    expect(scopeFrom('mine', true)).toBe('mine')
    expect(scopeFrom('everyone', false)).toBe('mine')
  })

  it('returns only to My Work or Follow-ups (no open redirect)', () => {
    expect(scopeReturnPath('/crm/follow-ups/?when=overdue&x=1')).toBe('/crm/follow-ups/?when=overdue')
    expect(scopeReturnPath('/crm/follow-ups/?when=evil')).toBe('/crm/follow-ups/')
    expect(scopeReturnPath('https://evil.example/')).toBe('/crm/')
    expect(scopeReturnPath('//evil.example/')).toBe('/crm/')
    expect(scopeReturnPath(undefined)).toBe('/crm/')
  })

  it('My Work and Follow-ups both read the remembered scope', () => {
    for (const f of ['page.tsx', path.join('follow-ups', 'page.tsx')]) expect(read(path.join(CRM_APP, 'crm', f))).toMatch(/scopeFrom\(/)
  })
})

describe('W1-9: quick due dates are Denver business days', () => {
  // 2026-10-02 is a Friday; 2026-10-03/04 a weekend.
  it('Friday: tomorrow is Monday, next week is Monday', () => {
    const fri = new Date('2026-10-02T17:00:00Z')
    expect(quickDueDates(fri)).toEqual({ today: '2026-10-02', tomorrow: '2026-10-05', next_week: '2026-10-05' })
  })
  it('Wednesday: tomorrow is Thursday, next week is the following Monday', () => {
    const wed = new Date('2026-09-30T15:00:00Z')
    expect(quickDueDates(wed)).toEqual({ today: '2026-09-30', tomorrow: '2026-10-01', next_week: '2026-10-05' })
  })
  it('uses the Denver calendar day, not UTC (late evening in Denver is already tomorrow in UTC)', () => {
    const late = new Date('2026-10-01T04:30:00Z') // 22:30 on 30 Sep in Denver
    expect(businessDate(late)).toBe('2026-09-30')
    expect(quickDueDates(late).today).toBe('2026-09-30')
  })
  it('Sunday: next week is the next day (Monday)', () => {
    expect(businessDate(nextWeekStart(new Date('2026-10-04T18:00:00Z')))).toBe('2026-10-05')
  })
})

describe('W1-1 / W1-8 static guarantees', () => {
  it('the RFQ detail shows one primary action and puts the rest under More', () => {
    const t = read(path.join(CRM_APP, 'crm', '_components', 'RfqDetail.tsx'))
    expect(t).toMatch(/<Overflow /)
    for (const d of ['NoteDialog', 'LogDialog', 'CloseDialog']) expect(t).toMatch(new RegExp(`<${d}[^>]*buttonClassName=\\{MENU\\}`))
  })

  it('every new record page requires a CRM session', () => {
    for (const f of ['accounts/page.tsx', 'accounts/new/page.tsx', 'contacts/page.tsx', 'contacts/new/page.tsx', 'contacts/[id]/page.tsx', 'search/page.tsx'])
      expect(read(path.join(CRM_APP, 'crm', f))).toMatch(/requireCrmSession\(/)
  })

  it('server actions for Patch A resolve the session again (direct POSTs are possible)', () => {
    const t = read(path.join(CRM_APP, 'crm', 'actions.ts'))
    for (const fn of ['globalSearchAction', 'recentItemsAction', 'listSearchAction', 'clearListSearchAction', 'scopeAction', 'newAccountAction', 'newContactAction']) {
      const body = t.slice(t.indexOf(`export async function ${fn}`))
      expect(body.slice(0, 600)).toMatch(/actionSession\(\)/)
    }
  })

  it('search and palette code never logs', () => {
    const files = [path.join(SRC, 'crm', 'workspace', 'search.ts'), path.join(CRM_APP, 'crm', '_components', 'SearchPanel.tsx'), path.join(CRM_APP, 'crm', '_components', 'CommandPalette.tsx')]
    for (const f of files) expect(read(f)).not.toMatch(/console\.|logger\./)
  })
})
