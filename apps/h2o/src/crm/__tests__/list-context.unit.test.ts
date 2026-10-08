import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clearAllCrmStorage,
  clearDraft,
  draftable,
  idOf,
  isListUrl,
  isSafeScope,
  readDraft,
  reconcileOwner,
  OWNER_KEY,
  readListContext,
  writeDraft,
  writeListContext,
  type StorageLike,
} from '../workspace/ui/draftStore'

function memory(): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
    dump: () => Object.fromEntries(m),
  }
}

const ID = '0199a111-2222-7333-8444-555566667777'

describe('unsent drafts (Gate B item 3)', () => {
  it('keeps only changed text, restores it, and clears it', () => {
    const s = memory()
    writeDraft(s, `note:${ID}`, { body: 'Call back about cell 4', empty: '   ' })
    expect(readDraft(s, `note:${ID}`)).toEqual({ body: 'Call back about cell 4' })
    clearDraft(s, `note:${ID}`)
    expect(readDraft(s, `note:${ID}`)).toEqual({})
  })

  it('removes the draft when nothing is left to keep', () => {
    const s = memory()
    writeDraft(s, 'new-inquiry', { message: 'x' })
    writeDraft(s, 'new-inquiry', { message: '' })
    expect(s.dump()).toEqual({})
  })

  it('never keeps hidden fields, passwords, codes, tokens or non-text controls', () => {
    expect(draftable('body', 'textarea')).toBe(true)
    expect(draftable('email', 'email')).toBe(true)
    expect(draftable('token', 'text')).toBe(false)
    expect(draftable('password', 'password')).toBe(false)
    expect(draftable('mfaCode', 'text')).toBe(false)
    expect(draftable('expectedUpdatedAt', 'text')).toBe(false)
    expect(draftable('rfqId', 'hidden')).toBe(false)
    expect(draftable('priority', 'select-one')).toBe(false)
    expect(draftable('', 'text')).toBe(false)
  })

  it('refuses a scope that is not plain ids and fixed words', () => {
    expect(isSafeScope(`reply:${ID}`)).toBe(true)
    expect(isSafeScope('a b')).toBe(false)
    expect(isSafeScope('jane@example.test')).toBe(false)
    const s = memory()
    writeDraft(s, 'bad scope', { body: 'x' })
    expect(s.dump()).toEqual({})
  })

  it('survives broken or hostile stored values', () => {
    const s = memory()
    s.setItem('crm.draft.note:1', '{not json')
    expect(readDraft(s, 'note:1')).toEqual({})
    s.setItem('crm.draft.note:2', JSON.stringify(['a']))
    expect(readDraft(s, 'note:2')).toEqual({})
    s.setItem('crm.draft.note:3', JSON.stringify({ body: 5, ok: 'fine' }))
    expect(readDraft(s, 'note:3')).toEqual({ ok: 'fine' })
    expect(readDraft(null, 'note:1')).toEqual({})
  })

  it('does not throw when storage is full or blocked', () => {
    const full: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('blocked') }, key: () => null, length: 0 }
    expect(() => writeDraft(full, 'note:1', { body: 'x' })).not.toThrow()
    expect(() => clearDraft(full, 'note:1')).not.toThrow()
    expect(() => clearAllCrmStorage(full)).not.toThrow()
  })

  it('sign-out removes every CRM key and nothing else', () => {
    const s = memory()
    writeDraft(s, `reply:${ID}`, { body: 'Hello' })
    writeListContext(s, 'rfqs', { url: '/crm/rfqs/?page=2', windowY: 10, paneY: 0, selected: [ID], at: 1 })
    s.setItem('theme', 'dark')
    expect(clearAllCrmStorage(s)).toBe(2)
    expect(s.dump()).toEqual({ theme: 'dark' })
  })
})

describe('one person per tab (Auditor note)', () => {
  const A = '0199a111-aaaa-7333-8444-555566667777'
  const B = '0199a111-bbbb-7333-8444-555566667777'
  const fill = (s: ReturnType<typeof memory>) => {
    writeDraft(s, `reply:${ID}`, { body: 'A private reply draft' })
    writeListContext(s, 'rfqs', { url: '/crm/rfqs/?owner=me', windowY: 5, paneY: 0, selected: [ID], at: 1 })
    s.setItem('crm.recent.v1', JSON.stringify([{ kind: 'rfq', id: ID }]))
  }

  it('the first page for a person claims the tab and keeps nothing of anyone else’s', () => {
    const s = memory()
    expect(reconcileOwner(s, A)).toBe(true)
    expect(s.getItem(OWNER_KEY)).toBe(A)
  })

  it('the same person keeps their drafts, recents and list context across pages', () => {
    const s = memory()
    reconcileOwner(s, A)
    fill(s)
    expect(reconcileOwner(s, A)).toBe(false)
    expect(readDraft(s, `reply:${ID}`)).toEqual({ body: 'A private reply draft' })
    expect(readListContext(s, 'rfqs')?.url).toBe('/crm/rfqs/?owner=me')
    expect(s.getItem('crm.recent.v1')).toBeTruthy()
  })

  it('user B in the same tab is not offered user A’s drafts, recents or list context', () => {
    const s = memory()
    reconcileOwner(s, A)
    fill(s)
    expect(reconcileOwner(s, B)).toBe(true)
    expect(readDraft(s, `reply:${ID}`)).toEqual({})
    expect(readListContext(s, 'rfqs')).toBeNull()
    expect(s.getItem('crm.recent.v1')).toBeNull()
    expect(s.getItem(OWNER_KEY)).toBe(B)
  })

  it('state left with no recorded owner is wiped, and other keys are untouched', () => {
    const s = memory()
    fill(s)
    s.setItem('theme', 'dark')
    expect(reconcileOwner(s, B)).toBe(true)
    expect(readDraft(s, `reply:${ID}`)).toEqual({})
    expect(s.getItem('theme')).toBe('dark')
  })

  it('does nothing without a user id or without storage', () => {
    const s = memory()
    fill(s)
    expect(reconcileOwner(s, undefined)).toBe(false)
    expect(reconcileOwner(null, A)).toBe(false)
    expect(readDraft(s, `reply:${ID}`)).toEqual({ body: 'A private reply draft' })
  })

  it('does not throw when storage is blocked', () => {
    const blocked: StorageLike = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {}, key: () => null, length: 0 }
    expect(() => reconcileOwner(blocked, A)).not.toThrow()
  })
})

describe('list context (Gate B item 3)', () => {
  it('stores the list address, scroll and ticked record ids, and reads them back', () => {
    const s = memory()
    const url = `/crm/rfqs/?owner=me&status=NEW&status=IN_REVIEW&page=3&rfq=${ID}`
    writeListContext(s, 'rfqs', { url, windowY: 812, paneY: 40, selected: [ID], at: 5 })
    expect(readListContext(s, 'rfqs')).toEqual({ url, windowY: 812, paneY: 40, selected: [ID], at: 5 })
  })

  it('keeps the three lists apart', () => {
    const s = memory()
    writeListContext(s, 'rfqs', { url: '/crm/rfqs/?page=2', windowY: 1, paneY: 0, selected: [], at: 1 })
    expect(readListContext(s, 'contacts')).toBeNull()
    expect(readListContext(s, 'accounts')).toBeNull()
  })

  it('only accepts the list’s own path with a plain query', () => {
    expect(isListUrl('rfqs', '/crm/rfqs/')).toBe(true)
    expect(isListUrl('rfqs', '/crm/rfqs/?page=2&owner=me')).toBe(true)
    expect(isListUrl('rfqs', '/crm/contacts/?page=2')).toBe(false)
    expect(isListUrl('rfqs', 'https://evil.example/crm/rfqs/')).toBe(false)
    expect(isListUrl('rfqs', '//evil.example/crm/rfqs/')).toBe(false)
    expect(isListUrl('rfqs', '/crm/rfqs/?x=<script>')).toBe(false)
    expect(isListUrl('rfqs', '/crm/rfqs/abc/')).toBe(false)
    expect(isListUrl('rfqs', 42)).toBe(false)
  })

  it('refuses to write or read a bad address, and drops ids that are not ids', () => {
    const s = memory()
    writeListContext(s, 'rfqs', { url: 'https://evil.example/', windowY: 1, paneY: 1, selected: [], at: 1 })
    expect(s.dump()).toEqual({})
    s.setItem('crm.list.rfqs', JSON.stringify({ url: '/crm/rfqs/', windowY: -5, paneY: 'x', selected: [ID, '<b>', 7], at: 1 }))
    expect(readListContext(s, 'rfqs')).toEqual({ url: '/crm/rfqs/', windowY: 0, paneY: 0, selected: [ID], at: 1 })
  })

  it('reads the record id from a bulk checkbox value', () => {
    expect(idOf(`${ID}|2026-10-08T10:00:00.000Z`)).toBe(ID)
    expect(idOf(ID)).toBe(ID)
  })
})

describe('customer data never goes to localStorage here', () => {
  const files = [
    'src/crm/workspace/ui/draftStore.ts',
    'src/crm/workspace/ui/SignOutClear.tsx',
    'src/crm/workspace/ui/ActionForm.tsx',
    'src/app/(crm)/crm/_components/ListContext.tsx',
  ]
  it.each(files)('%s uses no localStorage', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(src).not.toMatch(/localStorage/)
  })
  it('recent records live in sessionStorage under the crm. prefix, so sign-out clears them', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(crm)/crm/_components/SearchPanel.tsx'), 'utf8')
    expect(src).toMatch(/RECENT_KEY = 'crm\.recent\.v1'/)
    expect(src).toMatch(/sessionStorage\.getItem\(RECENT_KEY\)/)
    expect(src).toMatch(/sessionStorage\.setItem\(RECENT_KEY/)
    // The only localStorage call left is removing the old device-wide key.
    const calls = [...src.matchAll(/localStorage\.(\w+)/g)].map((m) => m[1])
    expect(calls).toEqual(['removeItem'])
  })
  it('no other CRM source file writes customer data to localStorage', () => {
    const bad: string[] = []
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(n) && !/SearchPanel\.tsx$/.test(n) && /localStorage\.(set|get)Item/.test(readFileSync(p, 'utf8'))) bad.push(p)
      }
    }
    walk(join(process.cwd(), 'src/app/(crm)'))
    walk(join(process.cwd(), 'src/crm'))
    expect(bad.filter((p) => !p.includes('__tests__'))).toEqual([])
  })
  it('no other CRM file stores a draft or list context outside the store module', () => {
    const root = join(process.cwd(), 'src/app/(crm)')
    const bad: string[] = []
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(n) && /crm\.draft\.|crm\.list\./.test(readFileSync(p, 'utf8'))) bad.push(p)
      }
    }
    walk(root)
    expect(bad).toEqual([])
  })
})
