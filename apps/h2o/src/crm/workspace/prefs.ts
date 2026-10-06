import { parseAccountsParams, parseContactsParams, type AccountsParams, type ContactsParams } from './directory'
import { parseInboxParams, type InboxParams } from './queries'

/**
 * Wave 1 W1-2 / W1-8: per-browser workspace preferences, kept out of URLs.
 *
 * List search (audit finding 8): a search term can be a person's name or email address. It is posted to a server
 * action, which stores it in a short-lived, HttpOnly, SameSite=Strict cookie scoped to `/crm/`; the list URL only
 * carries `s=1` ("apply my search"). So the term never enters browser history, a shared link, a Referer or a proxy
 * access log. A plain visit to the list (no `s=1`) ignores a leftover term, and a legacy `?q=` is never read.
 *
 * Scope (audit finding 5): My Work and Follow-ups share one remembered Mine/Team choice. Without one, both default
 * the same way (Admin → Team, Sales → Mine).
 *
 * Every URL built here comes from a parsed, validated params object, so only known keys with checked values
 * (enums, UUIDs, page numbers) can appear — never free text.
 */

export const LISTS = ['inbox', 'accounts', 'contacts'] as const
export type ListKey = (typeof LISTS)[number]
export const LIST_PATH: Record<ListKey, string> = { inbox: '/crm/rfqs/', accounts: '/crm/accounts/', contacts: '/crm/contacts/' }
export const listSearchCookie = (list: ListKey) => `crm_q_${list}`
export const SEARCH_FLAG = 's'
export const SEARCH_TTL_SECONDS = 30 * 60
export const SCOPE_COOKIE = 'crm_scope'
export const SCOPE_TTL_SECONDS = 365 * 24 * 3600
/** Polish R1: table density (comfortable by default; "compact" tightens every list). */
export const DENSITY_COOKIE = 'crm_density'
export type Density = 'comfortable' | 'compact'
export const densityFrom = (v: unknown): Density => (v === 'compact' ? 'compact' : 'comfortable')

export const cookieOptions = (maxAge: number, secure: boolean) =>
  ({ httpOnly: true, sameSite: 'strict' as const, path: '/crm/', maxAge, secure })

export const isList = (v: unknown): v is ListKey => typeof v === 'string' && (LISTS as readonly string[]).includes(v)

type SP = Record<string, string | string[] | undefined>

/** URLSearchParams → the record shape the page parsers take (repeated keys become arrays). */
export function spFrom(qs: string): SP {
  const out: SP = {}
  const params = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs)
  for (const k of new Set(params.keys())) {
    const all = params.getAll(k)
    out[k] = all.length > 1 ? all : all[0]
  }
  return out
}

/** Is the stored search term to be applied on this request? */
export const searchRequested = (sp: SP) => sp[SEARCH_FLAG] === '1'

const build = (path: string, entries: Array<[string, string | null | undefined]>) => {
  const q = new URLSearchParams()
  for (const [k, v] of entries) if (v) q.append(k, v)
  const s = q.toString()
  return `${path}${s ? `?${s}` : ''}`
}

/** Inbox URL from validated params. `search` adds the `s=1` flag; `extra` is for the pane (`rfq`, `tab`). */
export function inboxHref(
  p: InboxParams,
  over: Partial<Record<'view' | 'owner' | 'received' | 'reply' | 'type' | 'office' | 'source' | 'cta' | 'linked' | 'account' | 'contact' | 'sort' | 'page', string | null>> = {},
  opts: { search?: boolean; status?: string[] | null; motions?: string[] | null; countries?: string[] | null; rfq?: string | null; tab?: string | null } = {},
) {
  const base: Record<string, string | null> = {
    view: p.view === 'open' ? null : p.view,
    owner: p.owner,
    received: p.received,
    reply: p.reply,
    type: p.type,
    office: p.office,
    source: p.source,
    cta: p.cta,
    linked: p.accountLinked,
    account: p.account,
    contact: p.contact,
    sort: p.sort === 'received_desc' ? null : p.sort,
    page: p.page > 1 ? String(p.page) : null,
    ...over,
  }
  const status = opts.status === undefined ? p.status : (opts.status ?? [])
  const motions = opts.motions === undefined ? p.motions : (opts.motions ?? [])
  const countries = opts.countries === undefined ? p.countries : (opts.countries ?? [])
  return build(LIST_PATH.inbox, [
    ...Object.entries(base),
    ...status.map((st) => ['status', st] as [string, string]),
    ...motions.map((x) => ['motion', x] as [string, string]),
    ...countries.map((x) => ['country', x] as [string, string]),
    [SEARCH_FLAG, opts.search ? '1' : null],
    ['rfq', opts.rfq ?? null],
    ['tab', opts.tab ?? null],
  ])
}

export function accountsHref(p: AccountsParams, over: Partial<Record<keyof AccountsParams, string | null>> = {}, search = false) {
  const base: Record<string, string | null> = {
    owner: p.owner,
    naming: p.naming,
    relationship: p.relationship,
    state: p.state === 'active' ? null : p.state,
    sort: p.sort === 'name' ? null : p.sort,
    page: p.page > 1 ? String(p.page) : null,
    ...over,
  }
  return build(LIST_PATH.accounts, [...Object.entries(base), [SEARCH_FLAG, search ? '1' : null]])
}

export function contactsHref(p: ContactsParams, over: Partial<Record<keyof ContactsParams, string | null>> = {}, search = false) {
  const base: Record<string, string | null> = {
    owner: p.owner,
    linked: p.linked,
    state: p.state === 'active' ? null : p.state,
    sort: p.sort === 'name' ? null : p.sort,
    page: p.page > 1 ? String(p.page) : null,
    ...over,
  }
  return build(LIST_PATH.contacts, [...Object.entries(base), [SEARCH_FLAG, search ? '1' : null]])
}

/**
 * Where a list-search action returns to: the list path plus the caller's current filters, re-parsed and re-built
 * so nothing unvalidated survives. Paging restarts at 1 because the result set changed.
 */
export function listReturnPath(list: ListKey, rawQuery: unknown, search: boolean): string {
  const sp = spFrom(typeof rawQuery === 'string' ? rawQuery.slice(0, 2000) : '')
  delete sp.page
  if (list === 'inbox') return inboxHref(parseInboxParams(sp), {}, { search })
  if (list === 'accounts') return accountsHref(parseAccountsParams(sp), {}, search)
  return contactsHref(parseContactsParams(sp), {}, search)
}

/** The stored list-search term, bounded; `null` when absent or blank. */
export const storedTerm = (v: string | undefined): string | null => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return t || null
}

// ────────────────────────────────────────────── scope ──

export type Scope = 'mine' | 'team'
export const defaultScope = (isAdmin: boolean): Scope => (isAdmin ? 'team' : 'mine')
export const scopeFrom = (cookie: string | undefined, isAdmin: boolean): Scope =>
  cookie === 'mine' || cookie === 'team' ? cookie : defaultScope(isAdmin)

/** Where a scope change returns to: My Work or Follow-ups, with Follow-ups' `when` kept if valid. */
export function scopeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/crm/'
  if (raw.startsWith('/crm/follow-ups/')) {
    const when = spFrom(raw.split('?')[1] ?? '').when
    return ['due', 'overdue', 'open', 'done'].includes(String(when)) ? `/crm/follow-ups/?when=${String(when)}` : '/crm/follow-ups/'
  }
  return '/crm/'
}

/** Polish R1: back to the inbox view the density toggle was used on (rebuilt from parsed params), else My Work. */
export function densityReturnPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith(LIST_PATH.inbox)) return '/crm/'
  const sp = spFrom(raw.split('?')[1] ?? '')
  return inboxHref(parseInboxParams(sp), {}, { search: searchRequested(sp) })
}
