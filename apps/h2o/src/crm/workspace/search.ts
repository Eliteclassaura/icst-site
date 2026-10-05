import { RFQ_STATUS_LABEL, RELATIONSHIP_LABEL, label } from './labels'
import { contactName, contactSearchWhere, likeTerm } from './directory'
import { searchWhere } from './queries'
import { asUser, type CrmSession } from './session'
import { isUuid } from './validate'

/**
 * Wave 1 W1-2 grouped global search (⌘K palette and the phone Search page).
 *
 * One term, four groups — inquiries, accounts, contacts, plants — at most `GROUP_LIMIT` each, every read as the
 * signed-in user. The term arrives in a server-action POST body: it is never put in a URL, never written to a log
 * and never echoed into an error. Results carry only what a row shows (a name, a short context line, an href built
 * from ids), so nothing here widens what the user could already open.
 */

export const GROUP_LIMIT = 5
export const MIN_TERM = 2
export const MAX_TERM = 120

export type SearchKind = 'rfq' | 'account' | 'contact' | 'site'
export type SearchHit = { kind: SearchKind; id: string; title: string; context: string; href: string }
export type SearchGroup = { kind: SearchKind; label: string; hits: SearchHit[]; more: boolean }
export type SearchResult = { status: 'ok'; groups: SearchGroup[] } | { status: 'too_short' } | { status: 'error' }

export const GROUP_LABEL: Record<SearchKind, string> = {
  rfq: 'Inquiries',
  account: 'Accounts',
  contact: 'Contacts',
  site: 'Plants',
}

type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const id = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : typeof v === 'object' ? String(D(v).id ?? '') || null : String(v)

/** Normalise a raw term: a string, trimmed, bounded. `null` when it is too short to search. */
export function searchTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TERM)
  return likeTerm(t).length >= MIN_TERM ? t : null
}

const rfqTitle = (r: Doc, accountName: string | undefined) => {
  const sub = (r.submitted ?? {}) as Doc
  const person = [sub.first_name, sub.last_name].filter((x) => typeof x === 'string' && x.trim()).join(' ')
  return accountName || (typeof sub.company === 'string' && sub.company.trim() ? sub.company.trim() : '') || person || 'Unnamed inquiry'
}

async function names(s: CrmSession, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const res = await s.payload.find({ collection: 'crm-accounts', where: { id: { in: ids } }, depth: 0, limit: ids.length, ...asUser(s) })
  return new Map(res.docs.map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
}

export async function globalSearch(s: CrmSession, raw: unknown): Promise<SearchResult> {
  const q = searchTerm(raw)
  if (!q) return { status: 'too_short' }
  const term = likeTerm(q)
  const take = GROUP_LIMIT + 1
  try {
    const [rfqs, accounts, contacts, sites] = await Promise.all([
      searchWhere(s, q).then((where) =>
        s.payload.find({ collection: 'crm-rfqs', where, sort: '-received_at', depth: 0, limit: take, ...asUser(s) }),
      ),
      s.payload.find({
        collection: 'crm-accounts',
        where: {
          or: [
            { canonical_name: { like: term } },
            { legal_name: { like: term } },
            { 'aliases.alias': { like: term } },
            { 'domains.domain': { like: term.toLowerCase() } },
          ],
        },
        sort: 'canonical_name',
        depth: 0,
        limit: take,
        ...asUser(s),
      }),
      s.payload.find({ collection: 'crm-contacts', where: contactSearchWhere(q), sort: 'display_name', depth: 0, limit: take, ...asUser(s) }),
      s.payload.find({
        collection: 'crm-sites',
        where: { or: [{ site_name: { like: term } }, { city: { like: term } }, { region: { like: term } }] },
        sort: 'site_name',
        depth: 0,
        limit: take,
        ...asUser(s),
      }),
    ])
    const accIds = [
      ...new Set(
        [...rfqs.docs, ...contacts.docs, ...sites.docs]
          .map((d) => id(D(d).account))
          .filter(Boolean),
      ),
    ] as string[]
    const accName = await names(s, accIds)
    const cut = <T,>(docs: T[]) => ({ docs: docs.slice(0, GROUP_LIMIT), more: docs.length > GROUP_LIMIT })
    const r = cut(rfqs.docs as unknown as Doc[])
    const a = cut(accounts.docs as unknown as Doc[])
    const c = cut(contacts.docs as unknown as Doc[])
    const p = cut(sites.docs as unknown as Doc[])
    const groups: SearchGroup[] = [
      {
        kind: 'rfq',
        label: GROUP_LABEL.rfq,
        more: r.more,
        hits: r.docs.map((x) => ({
          kind: 'rfq' as const,
          id: String(x.id),
          title: rfqTitle(x, accName.get(String(id(x.account))) || undefined),
          context: `${String(x.rfq_number ?? '')} · ${RFQ_STATUS_LABEL[String(x.status)]?.label ?? 'Unknown'}`,
          href: `/crm/rfqs/${String(x.id)}/`,
        })),
      },
      {
        kind: 'account',
        label: GROUP_LABEL.account,
        more: a.more,
        hits: a.docs.map((x) => ({
          kind: 'account' as const,
          id: String(x.id),
          title: String(x.canonical_name ?? 'Unnamed account'),
          context: label(RELATIONSHIP_LABEL, x.relationship_state),
          href: `/crm/accounts/${String(x.id)}/`,
        })),
      },
      {
        kind: 'contact',
        label: GROUP_LABEL.contact,
        more: c.more,
        hits: c.docs.map((x) => ({
          kind: 'contact' as const,
          id: String(x.id),
          title: contactName(x),
          context: [x.title, accName.get(String(id(x.account)))].filter((v) => typeof v === 'string' && v).join(' · ') || 'No account linked',
          href: `/crm/contacts/${String(x.id)}/`,
        })),
      },
      {
        kind: 'site',
        label: GROUP_LABEL.site,
        more: p.more,
        hits: p.docs.map((x) => ({
          kind: 'site' as const,
          id: String(x.id),
          title: String(x.site_name ?? 'Unnamed site'),
          context: [accName.get(String(id(x.account))), [x.city, x.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Plant',
          href: id(x.account) ? `/crm/accounts/${String(id(x.account))}/#site-${String(x.id)}` : '/crm/accounts/',
        })),
      },
    ]
    return { status: 'ok', groups }
  } catch {
    // Never echo the term or the error (either can carry personal data).
    return { status: 'error' }
  }
}

/** Recent-item references kept by the browser: a kind and an id only, never a name. */
export type RecentRef = { kind: 'rfq' | 'account' | 'contact'; id: string }

export function parseRecent(raw: unknown): RecentRef[] {
  if (!Array.isArray(raw)) return []
  const out: RecentRef[] = []
  for (const r of raw.slice(0, 8)) {
    const kind = D(r)?.kind
    const rid = D(r)?.id
    if ((kind === 'rfq' || kind === 'account' || kind === 'contact') && isUuid(rid)) out.push({ kind, id: String(rid).toLowerCase() })
  }
  return out
}

/** Labels for recent items, resolved as the user. A record the user can no longer open is dropped. */
export async function recentItems(s: CrmSession, raw: unknown): Promise<SearchHit[]> {
  const refs = parseRecent(raw)
  const byKind = (k: RecentRef['kind']) => refs.filter((r) => r.kind === k).map((r) => r.id)
  const find = (collection: 'crm-rfqs' | 'crm-accounts' | 'crm-contacts', ids: string[]) =>
    ids.length
      ? s.payload
          .find({ collection, where: { id: { in: ids } }, depth: 0, limit: ids.length, ...asUser(s) })
          .then((r) => r.docs as unknown as Doc[])
          .catch(() => [] as Doc[])
      : Promise.resolve([] as Doc[])
  const [rfqs, accounts, contacts] = await Promise.all([find('crm-rfqs', byKind('rfq')), find('crm-accounts', byKind('account')), find('crm-contacts', byKind('contact'))])
  const accName = await names(s, [...new Set(rfqs.map((r) => id(r.account)).filter(Boolean))] as string[]).catch(() => new Map<string, string>())
  const hit = new Map<string, SearchHit>()
  for (const r of rfqs)
    hit.set(`rfq:${String(r.id)}`, { kind: 'rfq', id: String(r.id), title: rfqTitle(r, accName.get(String(id(r.account))) || undefined), context: String(r.rfq_number ?? ''), href: `/crm/rfqs/${String(r.id)}/` })
  for (const a of accounts)
    hit.set(`account:${String(a.id)}`, { kind: 'account', id: String(a.id), title: String(a.canonical_name ?? 'Unnamed account'), context: 'Account', href: `/crm/accounts/${String(a.id)}/` })
  for (const c of contacts)
    hit.set(`contact:${String(c.id)}`, { kind: 'contact', id: String(c.id), title: contactName(c), context: 'Contact', href: `/crm/contacts/${String(c.id)}/` })
  return refs.map((r) => hit.get(`${r.kind}:${r.id}`)).filter(Boolean) as SearchHit[]
}
