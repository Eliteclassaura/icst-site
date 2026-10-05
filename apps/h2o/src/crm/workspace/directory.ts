import type { Where } from 'payload'
import { activeFromLedger, type LedgerRow } from '../suppression'
import { OPEN_RFQ_STATUSES, ACTIVE_RFQ_STATUSES } from './labels'
import {
  activityRows,
  crmUsers,
  hydrate,
  hydrateTasks,
  nameMap,
  suppressionsByKey,
  type ActivityRow,
  type Person,
  type RfqRow,
  type TaskRow,
} from './queries'
import { asUser, type CrmSession } from './session'
import { isUuid } from './validate'

/**
 * Wave 1 W1-1 read models: the Accounts and Contacts directories and the contact profile.
 *
 * Every read runs as the signed-in user (`overrideAccess: false`), so the CRM-1 access rules and the non-admin page
 * cap apply unchanged. Directory search terms never come from the URL: the page passes the term it read from the
 * list-search cookie (`listSearch.ts`), so a name or an email address never lands in history or proxy logs.
 */

type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const id = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : typeof v === 'object' ? String(D(v).id ?? '') || null : String(v)

export const DIRECTORY_PAGE_SIZE = 50

const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
const pageOf = (v: string | string[] | undefined) => Math.max(1, Math.min(1000, Number.parseInt(one(v) ?? '1', 10) || 1))
/** Escape LIKE wildcards; the term is matched literally. */
export const likeTerm = (q: string) => q.replace(/[%_]/g, ' ').trim()

// ────────────────────────────────────────────── accounts ──

export type AccountsParams = {
  owner: 'me' | 'unassigned' | string | null
  relationship: string | null
  state: 'active' | 'archived'
  sort: 'name' | 'recent'
  page: number
}

const RELATIONSHIPS = ['VERIFIED_CUSTOMER', 'VERIFIED_PAST_CUSTOMER', 'PROSPECT', 'CANDIDATE', 'UNKNOWN']

/** Parse directory URL params. Unknown values are dropped; malformed ids are ignored, never queried. */
export function parseAccountsParams(sp: Record<string, string | string[] | undefined>): AccountsParams {
  const owner = one(sp.owner)
  const rel = one(sp.relationship)
  return {
    owner: owner === 'me' || owner === 'unassigned' ? owner : isUuid(owner) ? owner : null,
    relationship: rel && RELATIONSHIPS.includes(rel) ? rel : null,
    state: one(sp.state) === 'archived' ? 'archived' : 'active',
    sort: one(sp.sort) === 'recent' ? 'recent' : 'name',
    page: pageOf(sp.page),
  }
}

export type AccountRow = {
  id: string
  name: string
  domain: string | null
  relationship: string
  ownerId: string | null
  ownerName: string | null
  openRfqs: number | null
  lastActivityAt: string | null
  updatedAt: string
}

function ownerWhere(s: CrmSession, owner: string | null): Where[] {
  if (owner === 'me') return [{ owner: { equals: s.userId } }]
  if (owner === 'unassigned') return [{ owner: { exists: false } }]
  if (owner) return [{ owner: { equals: owner } }]
  return []
}

/** Open-RFQ count and newest activity per record. Bounded: one count and one 1-row read per listed record. */
async function perRecordFacts(s: CrmSession, field: 'account' | 'contact', ids: string[]) {
  const facts = new Map<string, { openRfqs: number | null; lastActivityAt: string | null }>()
  await Promise.all(
    ids.map(async (rid) => {
      const [open, last] = await Promise.all([
        s.payload
          .count({ collection: 'crm-rfqs', where: { and: [{ [field]: { equals: rid } }, { status: { in: [...ACTIVE_RFQ_STATUSES] } }] }, ...asUser(s) })
          .then((c) => c.totalDocs)
          .catch(() => null),
        s.payload
          .find({ collection: 'crm-activities', where: { [field]: { equals: rid } }, sort: '-occurred_at', depth: 0, limit: 1, ...asUser(s) })
          .then((r) => (r.docs[0] ? String(D(r.docs[0]).occurred_at ?? '') || null : null))
          .catch(() => null),
      ])
      facts.set(rid, { openRfqs: open, lastActivityAt: last })
    }),
  )
  return facts
}

export async function loadAccountsDirectory(s: CrmSession, p: AccountsParams, q: string | null) {
  const people = await crmUsers(s)
  const names = nameMap(people)
  const and: Where[] = [
    p.state === 'archived' ? { account_state: { in: ['ARCHIVED', 'MERGED'] } } : { account_state: { in: ['ACTIVE', 'DORMANT'] } },
    ...ownerWhere(s, p.owner),
  ]
  if (p.relationship) and.push({ relationship_state: { equals: p.relationship } })
  const term = q ? likeTerm(q) : ''
  if (term)
    and.push({
      or: [
        { canonical_name: { like: term } },
        { legal_name: { like: term } },
        { 'aliases.alias': { like: term } },
        { 'domains.domain': { like: term.toLowerCase() } },
      ],
    })
  const res = await s.payload.find({
    collection: 'crm-accounts',
    where: { and },
    sort: p.sort === 'recent' ? '-updatedAt' : 'canonical_name',
    depth: 0,
    limit: DIRECTORY_PAGE_SIZE,
    page: p.page,
    ...asUser(s),
  })
  const docs = res.docs as unknown as Doc[]
  const facts = await perRecordFacts(s, 'account', docs.map((d) => String(d.id)))
  const rows: AccountRow[] = docs.map((a) => {
    const owner = id(a.owner)
    const domains = ((a.domains ?? []) as Doc[]).filter((x) => x.domain_status !== 'RETIRED')
    const f = facts.get(String(a.id))
    return {
      id: String(a.id),
      name: String(a.canonical_name ?? ''),
      domain: domains[0] ? String(domains[0].domain) : null,
      relationship: String(a.relationship_state ?? 'UNKNOWN'),
      ownerId: owner,
      ownerName: owner ? (names.get(owner) ?? 'CRM user') : null,
      openRfqs: f?.openRfqs ?? null,
      lastActivityAt: f?.lastActivityAt ?? null,
      updatedAt: String(a.updatedAt ?? ''),
    }
  })
  return { rows, total: res.totalDocs, page: res.page ?? p.page, pages: res.totalPages ?? 1, people }
}

// ────────────────────────────────────────────── contacts ──

export type ContactsParams = {
  owner: 'me' | 'unassigned' | string | null
  linked: 'yes' | 'no' | null
  state: 'active' | 'archived'
  sort: 'name' | 'recent'
  page: number
}

export function parseContactsParams(sp: Record<string, string | string[] | undefined>): ContactsParams {
  const owner = one(sp.owner)
  const linked = one(sp.linked)
  return {
    owner: owner === 'me' || owner === 'unassigned' ? owner : isUuid(owner) ? owner : null,
    linked: linked === 'yes' || linked === 'no' ? linked : null,
    state: one(sp.state) === 'archived' ? 'archived' : 'active',
    sort: one(sp.sort) === 'recent' ? 'recent' : 'name',
    page: pageOf(sp.page),
  }
}

export type ContactRow = {
  id: string
  name: string
  title: string | null
  accountId: string | null
  accountName: string | null
  ownerId: string | null
  ownerName: string | null
  openRfqs: number | null
  lastActivityAt: string | null
  doNotContact: boolean
}

export const contactName = (c: Doc): string =>
  String(c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed contact')

/** Contact search: name parts, the email identity, and the company as originally supplied. */
export const contactSearchWhere = (q: string): Where => {
  const term = likeTerm(q)
  return {
    or: [
      { display_name: { like: term } },
      { first_name: { like: term } },
      { last_name: { like: term } },
      { email_match_key: { like: term.toLowerCase() } },
      { company_name_original: { like: term } },
    ],
  }
}

export async function loadContactsDirectory(s: CrmSession, p: ContactsParams, q: string | null) {
  const people = await crmUsers(s)
  const names = nameMap(people)
  const and: Where[] = [
    p.state === 'archived' ? { record_state: { in: ['ARCHIVED', 'MERGED'] } } : { record_state: { equals: 'ACTIVE' } },
    ...ownerWhere(s, p.owner),
  ]
  if (p.linked === 'yes') and.push({ account: { exists: true } })
  if (p.linked === 'no') and.push({ account: { exists: false } })
  if (q && likeTerm(q)) and.push(contactSearchWhere(q))
  const res = await s.payload.find({
    collection: 'crm-contacts',
    where: { and },
    sort: p.sort === 'recent' ? '-updatedAt' : 'display_name',
    depth: 0,
    limit: DIRECTORY_PAGE_SIZE,
    page: p.page,
    ...asUser(s),
  })
  const docs = res.docs as unknown as Doc[]
  const accIds = [...new Set(docs.map((c) => id(c.account)).filter(Boolean))] as string[]
  const [accounts, facts, dnc] = await Promise.all([
    accIds.length
      ? s.payload.find({ collection: 'crm-accounts', where: { id: { in: accIds } }, depth: 0, limit: accIds.length, ...asUser(s) })
      : null,
    perRecordFacts(s, 'contact', docs.map((d) => String(d.id))),
    suppressionsByKey(s, [...new Set(docs.map((c) => c.email_match_key as string).filter(Boolean))]),
  ])
  const accName = new Map((accounts?.docs ?? []).map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
  const rows: ContactRow[] = docs.map((c) => {
    const owner = id(c.owner)
    const acc = id(c.account)
    const f = facts.get(String(c.id))
    return {
      id: String(c.id),
      name: contactName(c),
      title: (c.title as string) || null,
      accountId: acc,
      accountName: acc ? (accName.get(acc) ?? null) : null,
      ownerId: owner,
      ownerName: owner ? (names.get(owner) ?? 'CRM user') : null,
      openRfqs: f?.openRfqs ?? null,
      lastActivityAt: f?.lastActivityAt ?? null,
      doNotContact: (dnc.get(c.email_match_key as string)?.length ?? 0) > 0,
    }
  })
  return { rows, total: res.totalDocs, page: res.page ?? p.page, pages: res.totalPages ?? 1, people }
}

// ────────────────────────────────────────────── contact profile ──

export type ContactProfile = {
  contact: Doc
  name: string
  account: { id: string; name: string } | null
  ownerName: string | null
  suppressions: LedgerRow[]
  rfqs: RfqRow[]
  rfqTotal: number
  openRfqTotal: number
  tasks: TaskRow[]
  activity: ActivityRow[]
  notes: Array<{ id: string; body: string; authorName: string | null; createdAt: string }>
  openReviews: number
  people: Person[]
}

export async function loadContact(s: CrmSession, contactId: string, now: Date = new Date()): Promise<ContactProfile | null> {
  if (!isUuid(contactId)) return null
  let contact: Doc
  try {
    contact = (await s.payload.findByID({ collection: 'crm-contacts', id: contactId, depth: 0, ...asUser(s) })) as unknown as Doc
  } catch {
    return null
  }
  if (!contact) return null
  const people = await crmUsers(s)
  const names = nameMap(people)
  const accId = id(contact.account)
  const [account, rfqs, openRfqs, tasks, activity, notes, reviews, ledger] = await Promise.all([
    accId
      ? s.payload
          .findByID({ collection: 'crm-accounts', id: accId, depth: 0, ...asUser(s) })
          .then((a) => ({ id: accId, name: String(D(a).canonical_name ?? '') }))
          .catch(() => null)
      : null,
    s.payload.find({ collection: 'crm-rfqs', where: { contact: { equals: contactId } }, sort: '-received_at', depth: 0, limit: 25, ...asUser(s) }),
    s.payload.count({ collection: 'crm-rfqs', where: { and: [{ contact: { equals: contactId } }, { status: { in: [...OPEN_RFQ_STATUSES, 'QUALIFIED'] } }] }, ...asUser(s) }),
    s.payload.find({
      collection: 'crm-tasks',
      where: { and: [{ contact: { equals: contactId } }, { status: { in: ['OPEN', 'IN_PROGRESS'] } }] },
      sort: 'due_at',
      depth: 0,
      limit: 25,
      ...asUser(s),
    }),
    s.payload.find({ collection: 'crm-activities', where: { contact: { equals: contactId } }, sort: '-occurred_at', depth: 0, limit: 30, ...asUser(s) }),
    s.payload.find({ collection: 'crm-notes', where: { contact: { equals: contactId } }, sort: '-createdAt', depth: 0, limit: 20, ...asUser(s) }),
    s.payload.count({ collection: 'crm-identity-reviews', where: { and: [{ contact: { equals: contactId } }, { state: { equals: 'OPEN' } }] }, ...asUser(s) }),
    contact.email_match_key
      ? s.payload.find({
          collection: 'crm-suppressions',
          where: { email_match_key: { equals: String(contact.email_match_key) } },
          depth: 0,
          limit: 100,
          ...asUser(s),
        })
      : null,
  ])
  const owner = id(contact.owner)
  return {
    contact,
    name: contactName(contact),
    account,
    ownerName: owner ? (names.get(owner) ?? 'CRM user') : null,
    suppressions: ledger ? activeFromLedger(ledger.docs as unknown as LedgerRow[]) : [],
    rfqs: await hydrate(s, rfqs.docs as unknown as Doc[], people, now),
    rfqTotal: rfqs.totalDocs,
    openRfqTotal: openRfqs.totalDocs,
    tasks: await hydrateTasks(s, tasks.docs as unknown as Doc[], people, now),
    activity: await activityRows(s, activity.docs as unknown as Doc[], people),
    notes: (notes.docs as unknown as Doc[]).map((n) => ({
      id: String(n.id),
      body: String(n.body ?? ''),
      authorName: id(n.author) ? (names.get(String(id(n.author))) ?? 'CRM user') : null,
      createdAt: String(n.createdAt ?? ''),
    })),
    openReviews: reviews.totalDocs,
    people,
  }
}
