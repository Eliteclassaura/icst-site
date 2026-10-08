/**
 * Gate B item 3: unsent drafts and list context, kept in this browser tab only.
 *
 * `sessionStorage` is per tab and is gone when the tab closes; nothing here ever uses `localStorage`, and nothing is
 * sent to the server. Customer text (a note, a reply, an inquiry being typed in) lives only in the tab until it is
 * saved or discarded, and every key is wiped at sign-out. All helpers take the storage as an argument so they are
 * testable, and every read and write is guarded: storage can be missing, full or blocked.
 */
export const CRM_STORAGE_PREFIX = 'crm.'
export const DRAFT_PREFIX = `${CRM_STORAGE_PREFIX}draft.`
export const LIST_PREFIX = `${CRM_STORAGE_PREFIX}list.`

/** One field is at most this long (the longest CRM text field is 20,000 characters); a draft at most this many fields. */
const MAX_FIELD = 20_000
const MAX_FIELDS = 24

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
export type Draft = Record<string, string>

/** Field types worth keeping. Never hidden fields (tokens, versions), passwords, files, checkboxes or selects. */
export const DRAFT_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'url', 'search'])
const NEVER_NAMES = /pass|token|secret|code|otp|expected/i

export const draftable = (name: string, type: string): boolean => Boolean(name) && DRAFT_TYPES.has(type) && !NEVER_NAMES.test(name)

export const draftKey = (scope: string): string => `${DRAFT_PREFIX}${scope}`

/** Only plain words in a scope, so a key never carries anything but ids and fixed names. */
export const isSafeScope = (scope: string): boolean => /^[A-Za-z0-9:_.-]{1,160}$/.test(scope)

export function readDraft(store: StorageLike | null, scope: string): Draft {
  if (!store || !isSafeScope(scope)) return {}
  try {
    const raw = store.getItem(draftKey(scope))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Draft = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>).slice(0, MAX_FIELDS)) {
      if (typeof v === 'string' && v.length <= MAX_FIELD) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Store the fields that differ from their starting value; with nothing left to keep, the draft is removed. */
export function writeDraft(store: StorageLike | null, scope: string, fields: Draft): void {
  if (!store || !isSafeScope(scope)) return
  const keep: Draft = {}
  for (const [k, v] of Object.entries(fields).slice(0, MAX_FIELDS)) if (v.trim() !== '') keep[k] = v.slice(0, MAX_FIELD)
  try {
    if (Object.keys(keep).length === 0) store.removeItem(draftKey(scope))
    else store.setItem(draftKey(scope), JSON.stringify(keep))
  } catch {
    /* storage full or blocked: the draft is simply not kept */
  }
}

export function clearDraft(store: StorageLike | null, scope: string): void {
  if (!store || !isSafeScope(scope)) return
  try {
    store.removeItem(draftKey(scope))
  } catch {
    /* ignore */
  }
}

/** Set once sign-out has started, so a page-hide save cannot write a list address back after the wipe. */
export const signOut = { started: false }

export const OWNER_KEY = `${CRM_STORAGE_PREFIX}owner`

const resetListeners = new Set<() => void>()
/** Subscribe to "the tab's CRM storage was wiped" (a record page's back link re-reads when it happens). */
export const onStorageReset = (fn: () => void): (() => void) => {
  resetListeners.add(fn)
  return () => resetListeners.delete(fn)
}
export const notifyStorageReset = (): void => {
  for (const fn of resetListeners) fn()
}

/**
 * One person per tab's saved CRM state. The storage remembers whose it is (`crm.owner`, an opaque user id). When a
 * different person, or nobody known, is signed in (session expiry, sign-out in another tab, a forced re-login, the
 * MFA page), everything under `crm.` is wiped and the new id is written, so one person's drafts, recent items and list
 * context are never offered to the next. Returns true when it wiped.
 */
export function reconcileOwner(store: StorageLike | null, userId: string | null | undefined): boolean {
  if (!store || !userId) return false
  let wiped = false
  try {
    if (store.getItem(OWNER_KEY) !== userId) {
      clearAllCrmStorage(store)
      wiped = true
      store.setItem(OWNER_KEY, userId)
    }
  } catch {
    /* storage blocked: nothing is kept, so nothing can leak */
  }
  return wiped
}

/** Sign-out: remove every CRM key from this tab (drafts and list context). */
export function clearAllCrmStorage(store: StorageLike | null): number {
  if (!store) return 0
  let n = 0
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k?.startsWith(CRM_STORAGE_PREFIX)) keys.push(k)
    }
    for (const k of keys) {
      store.removeItem(k)
      n++
    }
  } catch {
    /* ignore */
  }
  return n
}

// ──────────────────────────────────────────────────────────── list context ──

export const LIST_KEYS = ['rfqs', 'accounts', 'contacts'] as const
export type ListKind = (typeof LIST_KEYS)[number]

/** A list URL that is safe to link back to: the list's own path, with an optional plain query string. */
export function isListUrl(kind: ListKind, url: unknown): url is string {
  return typeof url === 'string' && url.length <= 2000 && new RegExp(`^/crm/${kind}/(\\?[A-Za-z0-9_=&%.,+~:-]*)?$`).test(url)
}

export type ListContext = { url: string; windowY: number; paneY: number; selected: string[]; at: number }

export const listKey = (kind: ListKind): string => `${LIST_PREFIX}${kind}`

/** Bulk selection is stored as record ids only (the part of "id|updatedAt" before the bar). */
export const idOf = (value: string): string => value.split('|')[0] ?? ''

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 10_000_000) : 0)

export function readListContext(store: StorageLike | null, kind: ListKind): ListContext | null {
  if (!store) return null
  try {
    const raw = store.getItem(listKey(kind))
    if (!raw) return null
    const p = JSON.parse(raw) as Record<string, unknown>
    if (!isListUrl(kind, p.url)) return null
    const selected = Array.isArray(p.selected) ? p.selected.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{8,40}$/i.test(x)).slice(0, 100) : []
    return { url: p.url, windowY: num(p.windowY), paneY: num(p.paneY), selected, at: num(p.at) }
  } catch {
    return null
  }
}

export function writeListContext(store: StorageLike | null, kind: ListKind, ctx: ListContext): void {
  if (!store || !isListUrl(kind, ctx.url)) return
  try {
    store.setItem(listKey(kind), JSON.stringify({ ...ctx, selected: ctx.selected.slice(0, 100) }))
  } catch {
    /* ignore */
  }
}

/** The path and query of the current page, the way the list URL was stored. */
export const currentListUrl = (loc: Pick<Location, 'pathname' | 'search'>): string => `${loc.pathname}${loc.search}`
