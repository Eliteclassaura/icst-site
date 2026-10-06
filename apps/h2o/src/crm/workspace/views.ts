import { accountsHref, contactsHref, inboxHref, spFrom } from './prefs'
import { parseAccountsParams, parseContactsParams } from './directory'
import { inboxWhere, parseInboxParams } from './queries'
import { accountsWhere, contactsWhere } from './directory'
import type { Where } from 'payload'
import type { CrmSession } from './session'

/**
 * Wave 1 W1-6 saved views: which lists can be saved, and how a stored query is made safe.
 *
 * `normalizeViewQuery` re-parses the raw query with the list's own parser and rebuilds it, so a view can only hold
 * known keys with validated values (enums, UUIDs, sort keys). Paging and the search flag are dropped: a view is a
 * filter, and search terms are never stored.
 */
export const VIEW_LISTS = ['inbox', 'accounts', 'contacts', 'followups'] as const
export type ViewList = (typeof VIEW_LISTS)[number]

export const VIEW_PATH: Record<ViewList, string> = {
  inbox: '/crm/rfqs/',
  accounts: '/crm/accounts/',
  contacts: '/crm/contacts/',
  followups: '/crm/follow-ups/',
}

const query = (href: string) => href.split('?')[1] ?? ''

export function normalizeViewQuery(list: ViewList, raw: unknown): string {
  const sp = spFrom(typeof raw === 'string' ? raw.replace(/^\?/, '').slice(0, 2000) : '')
  delete sp.page
  delete sp.s
  if (list === 'inbox') return query(inboxHref(parseInboxParams(sp)))
  if (list === 'accounts') return query(accountsHref(parseAccountsParams(sp)))
  if (list === 'contacts') return query(contactsHref(parseContactsParams(sp)))
  const who = ['mine', 'team', 'unassigned'].includes(String(sp.who)) ? String(sp.who) : null
  const when = ['due', 'overdue', 'open', 'done'].includes(String(sp.when)) ? String(sp.when) : null
  return [who ? `who=${who}` : null, when ? `when=${when}` : null].filter(Boolean).join('&')
}

/** Where a saved view opens. */
export const viewHref = (list: ViewList, q: string) => `${VIEW_PATH[list]}${q ? `?${q}` : ''}`

/**
 * ERS readiness (CT 2026-10-05): a saved view is a **segment** — a stable filter definition the server evaluates. The
 * same parser and `where` builders as the screen are used, so a segment means exactly what the list shows (minus any
 * search text, which is never stored). Evaluated as the given user; access control applies.
 */
export async function segmentWhere(
  s: CrmSession,
  list: ViewList,
  query: string,
  now: Date = new Date(),
): Promise<{ collection: 'crm-rfqs' | 'crm-accounts' | 'crm-contacts' | 'crm-tasks'; where: Where }> {
  const sp = spFrom(normalizeViewQuery(list, query))
  if (list === 'inbox') return { collection: 'crm-rfqs', where: await inboxWhere(s, { ...parseInboxParams(sp), q: null }, now) }
  if (list === 'accounts') return { collection: 'crm-accounts', where: accountsWhere(s, parseAccountsParams(sp), null) }
  if (list === 'contacts') return { collection: 'crm-contacts', where: contactsWhere(s, parseContactsParams(sp), null) }
  const and: Where[] = []
  if (sp.who === 'mine') and.push({ assignee: { equals: s.userId } })
  if (sp.who === 'unassigned') and.push({ assignee: { exists: false } })
  and.push(sp.when === 'done' ? { status: { in: ['DONE', 'CANCELLED'] } } : { status: { in: ['OPEN', 'IN_PROGRESS'] } })
  if (sp.when === 'overdue') and.push({ due_at: { less_than: now.toISOString() } })
  return { collection: 'crm-tasks', where: { and } }
}
