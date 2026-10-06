import type { Where } from 'payload'
import { CRM_USERS } from '@factory/agency-core/cms/kernel'
import { activeFromLedger, type LedgerRow } from '../suppression'
import { emailKey } from '../normalize'
import { OPPORTUNITY_STAGE, TERMINAL_STAGES } from '../vocabulary'
import { interestOf, taskTitle, isCustomerUrgent, OPEN_RFQ_STATUSES, ACTIVE_RFQ_STATUSES } from './labels'
import { asUser, displayNameOf, type CrmSession } from './session'
import { endOfBusinessDay, isAgedUnassigned, nextWeekStart, parseDate, startOfBusinessDay } from './time'
import { isOffice, officeCalendar, type Office } from '../offices'
import { replyDue, type ReplyDue } from './replyDue'
import { officeSettings } from '../officeSettings'
import { isUuid } from './validate'
import { countryName, isCountryCode } from '../countries'
import { INQUIRY_TYPE_LABEL, type InquiryType } from '../inquiry-type'

/**
 * Sales Workspace read models. Every query runs as the signed-in user (`overrideAccess: false`), so the
 * accepted CRM-1 access rules — including the 100-row page cap for non-admins and admin-only fields —
 * apply unchanged. The single exception is the CRM user directory (`crmUsers`), documented below.
 *
 * No query computes money, rates or trends. Counts are `count()` results; lists are bounded pages.
 */

type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc
const id = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : typeof v === 'object' ? String(D(v).id ?? '') || null : String(v)

export type Loaded<T> = { status: 'ok'; data: T } | { status: 'error' }
async function safe<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { status: 'ok', data: await fn() }
  } catch {
    return { status: 'error' }
  }
}

// ────────────────────────────────────────────── people ──

export type Person = { id: string; name: string }

/**
 * The CRM user directory: users holding a CRM role, as `{ id, name }` only (no email, no roles, no other
 * field). Sales cannot read other users through the API (`users.read` is self-or-admin), yet the workspace
 * must show owner names and offer valid assignees. This one read is therefore trusted server code with
 * `overrideAccess`, projected to the two fields the UI needs. Assignment itself is still validated by the
 * RFQ/task hooks.
 */
export async function crmUsers(s: CrmSession): Promise<Person[]> {
  const res = await s.payload.find({
    collection: 'users',
    where: { roles: { in: [...CRM_USERS] } },
    depth: 0,
    limit: 200,
    overrideAccess: true,
    select: { name: true, roles: true } as never,
  })
  return (res.docs as unknown as Doc[])
    .map((u) => ({ id: String(u.id), name: displayNameOf(u) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const nameMap = (people: Person[]) => new Map(people.map((p) => [p.id, p.name]))

// ────────────────────────────────────────────── rows ──

export type Flags = { urgent: boolean; review: boolean; doNotContact: boolean }
export type RfqRow = {
  id: string
  rfqNumber: string
  receivedAt: string
  status: string
  company: string | null
  companyLinked: boolean
  contactName: string | null
  interest: string
  interestOrigin: 'CUSTOMER' | 'ITEM' | 'STAFF' | 'NONE'
  ownerId: string | null
  ownerName: string | null
  nextAction: { title: string; dueAt: string | null; overdue: boolean; kind: string } | null
  /** Polish R1: the first-reply countdown (office hours, D-1 due date). */
  reply: ReplyDue
  flags: Flags
  aged: boolean
  sourceSystem: string
  updatedAt: string
  /** Derived facets (owner request 2026-10-05). */
  countryCode: string | null
  /** Patch L1 queue. */
  office: Office | null
  countrySource: string
  type: string
  typeSource: string
  motion: string | null
  accountId: string | null
  contactId: string | null
  opportunityId: string | null
}

export async function suppressionsByKey(s: CrmSession, keys: string[]): Promise<Map<string, LedgerRow[]>> {
  const out = new Map<string, LedgerRow[]>()
  if (keys.length === 0) return out
  const res = await s.payload.find({
    collection: 'crm-suppressions',
    where: { email_match_key: { in: keys } },
    depth: 0,
    limit: 100,
    ...asUser(s),
  })
  const grouped = new Map<string, LedgerRow[]>()
  for (const r of res.docs as unknown as Array<LedgerRow & { email_match_key: string }>)
    grouped.set(r.email_match_key, [...(grouped.get(r.email_match_key) ?? []), r])
  for (const [k, rows] of grouped) out.set(k, activeFromLedger(rows))
  return out
}

/**
 * "Due today" = due by the end of today in the viewer's zone (Patch L1), plus every open HIGH-priority task that has no
 * due date. CRM-1 never invents a due date for a system task (the first-response SLA is an owner input,
 * E1.1), so without this an undated first-response task would never appear in Due today or on My Work and
 * could only be found under All open. It is shown with the words "No due date", never as overdue.
 */
const dueTodayOrUndatedHigh = (eodIso: string): Where => ({
  or: [{ due_at: { less_than_equal: eodIso } }, { and: [{ due_at: { exists: false } }, { priority: { equals: 'HIGH' } }] }],
})

/** The match key of the address a customer submitted, or undefined when it is absent or not an email. */
const submittedKey = (submitted: Doc): string | undefined => emailKey(submitted.email)?.matchKey

/** Active suppressions for one contact (by its email identity). Empty when none, or no email. */
export async function activeSuppressionsForContact(s: CrmSession, emailMatchKey: string | null) {
  if (!emailMatchKey) return []
  return (await suppressionsByKey(s, [emailMatchKey])).get(emailMatchKey) ?? []
}

export async function hydrate(s: CrmSession, docs: Doc[], people: Person[], now: Date): Promise<RfqRow[]> {
  // Aging counts business days of the office handling each inquiry (Patch L1).
  const offices = await officeSettings(s.payload)
  if (docs.length === 0) return []
  const rfqIds = docs.map((d) => String(d.id))
  const accountIds = [...new Set(docs.map((d) => id(d.account)).filter(Boolean))] as string[]
  const contactIds = [...new Set(docs.map((d) => id(d.contact)).filter(Boolean))] as string[]
  const [accounts, contacts, items, tasks, reviews, firstReplies] = await Promise.all([
    accountIds.length
      ? s.payload.find({ collection: 'crm-accounts', where: { id: { in: accountIds } }, depth: 0, limit: 100, ...asUser(s) })
      : null,
    contactIds.length
      ? s.payload.find({ collection: 'crm-contacts', where: { id: { in: contactIds } }, depth: 0, limit: 100, ...asUser(s) })
      : null,
    s.payload.find({
      collection: 'crm-rfq-items',
      where: { and: [{ rfq: { in: rfqIds } }, { line_no: { equals: 1 } }] },
      depth: 0,
      limit: 100,
      ...asUser(s),
    }),
    s.payload.find({
      collection: 'crm-tasks',
      where: { and: [{ rfq: { in: rfqIds } }, { status: { in: ['OPEN', 'IN_PROGRESS'] } }] },
      sort: 'due_at',
      depth: 0,
      limit: 100,
      ...asUser(s),
    }),
    s.payload.find({
      collection: 'crm-identity-reviews',
      where: { and: [{ rfq: { in: rfqIds } }, { state: { equals: 'OPEN' } }] },
      depth: 0,
      limit: 100,
      ...asUser(s),
    }),
    // Polish R1: each inquiry's first-response task in any state (open → countdown; done → "Replied").
    s.payload.find({
      collection: 'crm-tasks',
      where: { and: [{ rfq: { in: rfqIds } }, { kind: { equals: 'RFQ_FIRST_RESPONSE' } }] },
      sort: 'createdAt',
      depth: 0,
      limit: 200,
      ...asUser(s),
    }),
  ])
  const accountName = new Map((accounts?.docs ?? []).map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
  const contactById = new Map((contacts?.docs ?? []).map((c) => [String(c.id), c as unknown as Doc]))
  const firstItem = new Map(items.docs.map((i) => [String(id(D(i).rfq)), D(i).product_title_source as string | null]))
  const nextTask = new Map<string, Doc>()
  for (const t of tasks.docs as unknown as Doc[]) {
    const r = String(id(t.rfq))
    if (!nextTask.has(r)) nextTask.set(r, t)
  }
  const reviewed = new Set(reviews.docs.map((r) => String(id(D(r).rfq))))
  // An open first-response task wins over an older done or cancelled one.
  const firstReply = new Map<string, Doc>()
  for (const t of firstReplies.docs as unknown as Doc[]) {
    const r = String(id(t.rfq))
    const prev = firstReply.get(r)
    if (!prev || t.status === 'OPEN' || t.status === 'IN_PROGRESS') firstReply.set(r, t)
  }
  // Do-not-contact is honoured by the linked contact's identity and, for an RFQ left unlinked (ambiguous
  // identity), by the submitted address itself — an unlinked inquiry never hides an active suppression.
  const keyOf = (d: Doc): string | undefined =>
    (contactById.get(String(id(d.contact)))?.email_match_key as string | undefined) ??
    submittedKey((d.submitted ?? {}) as Doc)
  const keys = [...new Set(docs.map(keyOf).filter(Boolean))] as string[]
  const dnc = await suppressionsByKey(s, keys)
  const names = nameMap(people)
  return docs.map((d) => {
    const submitted = (d.submitted ?? {}) as Doc
    const contact = contactById.get(String(id(d.contact)))
    const accId = id(d.account)
    const t = nextTask.get(String(d.id))
    const due = t ? parseDate(t.due_at) : null
    const received = parseDate(d.received_at) ?? now
    const interest = interestOf({
      otherAnswers: submitted.other_answers,
      firstItemTitle: firstItem.get(String(d.id)) ?? null,
      motion: (d.motion as string) ?? null,
    })
    const subName = [submitted.first_name, submitted.last_name].filter((x) => typeof x === 'string' && x).join(' ')
    const ownerId = id(d.assignee)
    const key = keyOf(d)
    return {
      id: String(d.id),
      rfqNumber: String(d.rfq_number ?? ''),
      receivedAt: received.toISOString(),
      status: String(d.status),
      company: accId ? accountName.get(accId) || null : (submitted.company as string) || null,
      companyLinked: Boolean(accId),
      contactName: (contact?.display_name as string) || subName || null,
      interest: interest.text,
      interestOrigin: interest.origin,
      ownerId,
      ownerName: ownerId ? (names.get(ownerId) ?? 'CRM user') : null,
      nextAction: t
        ? { title: taskTitle(t.title), dueAt: due ? due.toISOString() : null, overdue: Boolean(due && due < now), kind: String(t.kind ?? 'GENERAL') }
        : null,
      reply: (() => {
        const fr = firstReply.get(String(d.id))
        const st = fr ? (fr.status === 'IN_PROGRESS' ? 'OPEN' : String(fr.status)) : null
        return replyDue(fr && st ? { status: st, dueAt: parseDate(fr.due_at) } : null, now, officeCalendar(d.office, offices))
      })(),
      flags: {
        urgent: isCustomerUrgent(submitted.other_answers),
        review: reviewed.has(String(d.id)),
        doNotContact: Boolean(key && (dnc.get(key)?.length ?? 0) > 0),
      },
      aged: !ownerId && (OPEN_RFQ_STATUSES as readonly string[]).includes(String(d.status)) && isAgedUnassigned(received, now, officeCalendar(d.office, offices)),
      sourceSystem: String(d.source_system ?? 'UNKNOWN'),
      updatedAt: String(d.updatedAt ?? ''),
      countryCode: (d.country_code as string) || null,
      office: isOffice(d.office) ? d.office : null,
      countrySource: String(d.country_source ?? 'UNKNOWN'),
      type: String(d.inquiry_type ?? 'UNKNOWN'),
      typeSource: String(d.inquiry_type_source ?? 'NONE'),
      motion: (d.motion as string) || null,
      accountId: accId,
      contactId: id(d.contact),
      opportunityId: id(d.opportunity),
    }
  })
}

// ────────────────────────────────────────────── inbox ──

export const INBOX_VIEWS = ['open', 'unassigned', 'mine', 'review', 'waiting', 'qualified', 'closed'] as const
export type InboxView = (typeof INBOX_VIEWS)[number]
export const INBOX_VIEW_LABEL: Record<InboxView, string> = {
  open: 'Open',
  unassigned: 'Unassigned',
  mine: 'Mine',
  review: 'Needs review',
  waiting: 'Waiting for customer',
  qualified: 'Qualified',
  closed: 'Closed',
}

export type InboxParams = {
  view: InboxView
  q: string | null
  status: string[]
  owner: 'me' | 'unassigned' | string | null
  /** Polish R1: `week` = since Monday 00:00 in the viewer's zone (My Work "This week"). */
  received: 'today' | 'week' | '7d' | '30d' | null
  /** Polish R1: open first replies that are overdue, or due by the end of today (viewer's zone). */
  reply: 'overdue' | 'today' | null
  /** Owner request 2026-10-05: several motions at once (multi-select). */
  motions: string[]
  /** ISO codes and/or "UNKNOWN" (multi-select). */
  countries: string[]
  /** Quick type chip: Parts · New tower · Repair/Service (derived `inquiry_type`). */
  type: Exclude<InquiryType, 'UNKNOWN' | 'OTHER'> | null
  /** Patch L1: the office queue (US / TH). */
  office: Office | null
  source: string | null
  cta: string | null
  accountLinked: 'yes' | 'no' | null
  account: string | null
  contact: string | null
  sort: 'received_desc' | 'received_asc' | 'status' | 'country' | 'type'
  page: number
}

const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
const many = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : [])

/** Parse URL search params. Unknown values are dropped; malformed ids are ignored, never queried. */
export function parseInboxParams(sp: Record<string, string | string[] | undefined>): InboxParams {
  const view = (INBOX_VIEWS as readonly string[]).includes(one(sp.view) ?? '') ? (one(sp.view) as InboxView) : 'open'
  const statuses = (Array.isArray(sp.status) ? sp.status : sp.status ? [sp.status] : []).filter((x) =>
    ['RECEIVED', 'NEEDS_REVIEW', 'IN_REVIEW', 'QUALIFIED', 'REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING', 'CLOSED'].includes(x),
  )
  const owner = one(sp.owner)
  // W1-2 (audit finding 8): the search term is never read from the URL. The inbox page supplies it from the
  // list-search cookie (prefs.ts); a legacy `?q=` link is ignored rather than honoured.
  const q = null
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(sp.page) ?? '1', 10) || 1))
  const received = one(sp.received)
  const linked = one(sp.linked)
  const sort = one(sp.sort)
  return {
    view,
    q,
    status: statuses,
    owner: owner === 'me' || owner === 'unassigned' ? owner : isUuid(owner) ? owner : null,
    received: received === 'today' || received === 'week' || received === '7d' || received === '30d' ? received : null,
    reply: one(sp.reply) === 'overdue' || one(sp.reply) === 'today' ? (one(sp.reply) as 'overdue') : null,
    motions: [...new Set(many(sp.motion).filter((x) => ['NEW_TOWER', 'REBUILD_REPLACEMENT', 'REPAIR', 'UPGRADE_RETROFIT', 'MAINTENANCE_INSPECTION', 'PARTS', 'OTHER_APPROVED'].includes(x)))],
    countries: [...new Set(many(sp.country).map((x) => x.toUpperCase()).filter((x) => x === 'UNKNOWN' || isCountryCode(x)))].slice(0, 30),
    type: one(sp.type) === 'PARTS' || one(sp.type) === 'NEW_TOWER' || one(sp.type) === 'REPAIR_SERVICE' ? (one(sp.type) as 'PARTS') : null,
    office: isOffice(one(sp.office)) ? (one(sp.office) as Office) : null,
    source: ['NATIVE_FORM', 'NATIVE_CHAT', 'TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT'].includes(one(sp.source) ?? '') ? one(sp.source) : null,
    cta: /^[a-z_]{1,64}$/.test(one(sp.cta) ?? '') ? one(sp.cta) : null,
    accountLinked: linked === 'yes' || linked === 'no' ? linked : null,
    account: isUuid(one(sp.account)) ? one(sp.account) : null,
    contact: isUuid(one(sp.contact)) ? one(sp.contact) : null,
    sort: sort === 'received_asc' || sort === 'status' || sort === 'country' || sort === 'type' ? sort : 'received_desc',
    page,
  }
}

export const PAGE_SIZE = 50

async function rfqIdsWithOpenTask(s: CrmSession, kind: string, mineOnly: boolean): Promise<string[]> {
  const res = await s.payload.find({
    collection: 'crm-tasks',
    where: {
      and: [
        { kind: { equals: kind } },
        { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        { rfq: { exists: true } },
        ...(mineOnly ? [{ assignee: { equals: s.userId } }] : []),
      ],
    },
    depth: 0,
    limit: 100,
    ...asUser(s),
  })
  return [...new Set(res.docs.map((t) => String(id(D(t).rfq))))]
}

/** Polish R1: inquiries whose open first-response task is overdue, or due by the end of today (viewer's zone). */
export async function rfqIdsWithReplyDue(s: CrmSession, which: 'overdue' | 'today', now: Date): Promise<string[]> {
  const due: Where =
    which === 'overdue'
      ? { due_at: { less_than: now.toISOString() } }
      : { and: [{ due_at: { greater_than_equal: now.toISOString() } }, { due_at: { less_than_equal: endOfBusinessDay(now, s.timeZone).toISOString() } }] }
  const res = await s.payload.find({
    collection: 'crm-tasks',
    where: { and: [{ kind: { equals: 'RFQ_FIRST_RESPONSE' } }, { status: { in: ['OPEN', 'IN_PROGRESS'] } }, { rfq: { exists: true } }, due] },
    depth: 0,
    limit: 500,
    ...asUser(s),
  })
  return [...new Set(res.docs.map((t) => String(id(D(t).rfq))))]
}

/** Local midnight starting the Monday of the week containing `now` (Sat/Sun belong to the week that started Monday). */
export function weekStart(now: Date, zone: string): Date {
  const next = nextWeekStart(now, zone)
  return startOfBusinessDay(new Date(next.getTime() - 7 * 24 * 3600 * 1000 + 12 * 3600 * 1000), zone)
}

async function rfqIdsWithOpenReview(s: CrmSession): Promise<string[]> {
  const res = await s.payload.find({
    collection: 'crm-identity-reviews',
    where: { and: [{ state: { equals: 'OPEN' } }, { rfq: { exists: true } }] },
    depth: 0,
    limit: 100,
    ...asUser(s),
  })
  return [...new Set(res.docs.map((r) => String(id(D(r).rfq))))]
}

async function viewWhere(s: CrmSession, view: InboxView): Promise<Where> {
  switch (view) {
    case 'open':
      return { status: { in: [...OPEN_RFQ_STATUSES] } }
    case 'unassigned':
      return { and: [{ status: { in: [...OPEN_RFQ_STATUSES] } }, { assignee: { exists: false } }] }
    case 'mine':
      return { and: [{ assignee: { equals: s.userId } }, { status: { in: [...ACTIVE_RFQ_STATUSES] } }] }
    case 'review': {
      const ids = await rfqIdsWithOpenReview(s)
      return { or: [{ status: { equals: 'NEEDS_REVIEW' } }, ...(ids.length ? [{ id: { in: ids } }] : [])] }
    }
    case 'waiting': {
      const ids = await rfqIdsWithOpenTask(s, 'MISSING_INFORMATION', false)
      return ids.length ? { id: { in: ids } } : { id: { equals: '00000000-0000-4000-8000-000000000000' } }
    }
    case 'qualified':
      return { status: { equals: 'QUALIFIED' } }
    case 'closed':
      return { status: { in: ['REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING', 'CLOSED'] } }
  }
}

export async function searchWhere(s: CrmSession, q: string): Promise<Where> {
  const like = q.replace(/[%_]/g, ' ')
  const contactHits = await s.payload.find({
    collection: 'crm-contacts',
    where: { or: [{ email_match_key: { like: like.toLowerCase() } }, { display_name: { like } }] },
    depth: 0,
    limit: 25,
    ...asUser(s),
  })
  const contactIds = contactHits.docs.map((c) => String(c.id))
  return {
    or: [
      { rfq_number: { like: like.toUpperCase() } },
      { 'submitted.company': { like } },
      { 'submitted.email': { like } },
      { 'submitted.last_name': { like } },
      { 'submitted.first_name': { like } },
      ...(contactIds.length ? [{ contact: { in: contactIds } }] : []),
    ],
  }
}

export async function inboxWhere(s: CrmSession, p: InboxParams, now: Date): Promise<Where> {
  const and: Where[] = [await viewWhere(s, p.view)]
  if (p.status.length) and.push({ status: { in: p.status } })
  if (p.owner === 'me') and.push({ assignee: { equals: s.userId } })
  else if (p.owner === 'unassigned') and.push({ assignee: { exists: false } })
  else if (p.owner) and.push({ assignee: { equals: p.owner } })
  if (p.received) {
    const from =
      p.received === 'today'
        ? startOfBusinessDay(now, s.timeZone)
        : p.received === 'week'
          ? weekStart(now, s.timeZone)
          : new Date(now.getTime() - (p.received === '7d' ? 7 : 30) * 24 * 3600 * 1000)
    and.push({ received_at: { greater_than_equal: from.toISOString() } })
  }
  if (p.reply) {
    const ids = await rfqIdsWithReplyDue(s, p.reply, now)
    and.push(ids.length ? { id: { in: ids } } : { id: { equals: '00000000-0000-4000-8000-000000000000' } })
  }
  if (p.motions.length) and.push({ motion: { in: p.motions } })
  if (p.type) and.push({ inquiry_type: { equals: p.type } })
  if (p.office) and.push({ office: { equals: p.office } })
  if (p.countries.length) {
    const codes = p.countries.filter((c) => c !== 'UNKNOWN')
    const unknown = p.countries.includes('UNKNOWN')
    and.push({ or: [...(codes.length ? [{ country_code: { in: codes } }] : []), ...(unknown ? [{ country_code: { exists: false } }] : [])] })
  }
  if (p.source) and.push({ source_system: { equals: p.source } })
  if (p.cta) and.push({ 'attribution.cta_placement': { equals: p.cta } })
  if (p.accountLinked === 'yes') and.push({ account: { exists: true } })
  if (p.accountLinked === 'no') and.push({ account: { exists: false } })
  if (p.account) and.push({ account: { equals: p.account } })
  if (p.contact) and.push({ contact: { equals: p.contact } })
  if (p.q) and.push(await searchWhere(s, p.q))
  return { and }
}

export type Inbox = {
  rows: RfqRow[]
  total: number
  page: number
  pages: number
  viewCounts: Partial<Record<InboxView, number>>
  people: Person[]
}

export async function loadInbox(s: CrmSession, p: InboxParams, now: Date = new Date()): Promise<Inbox> {
  const people = await crmUsers(s)
  const where = await inboxWhere(s, p, now)
  const res = await s.payload.find({
    collection: 'crm-rfqs',
    where,
    sort:
      p.sort === 'received_asc'
        ? 'received_at'
        : p.sort === 'status'
          ? 'status'
          : p.sort === 'country'
            ? ['country_code', '-received_at']
            : p.sort === 'type'
              ? ['inquiry_type', '-received_at']
              : '-received_at',
    depth: 0,
    limit: PAGE_SIZE,
    page: p.page,
    ...asUser(s),
  })
  const viewCounts: Partial<Record<InboxView, number>> = {}
  await Promise.all(
    INBOX_VIEWS.map(async (v) => {
      try {
        const c = await s.payload.count({ collection: 'crm-rfqs', where: await viewWhere(s, v), ...asUser(s) })
        viewCounts[v] = c.totalDocs
      } catch {
        /* a failed count is shown as unavailable, never as 0 */
      }
    }),
  )
  return {
    rows: await hydrate(s, res.docs as unknown as Doc[], people, now),
    total: res.totalDocs,
    page: res.page ?? p.page,
    pages: res.totalPages ?? 1,
    viewCounts,
    people,
  }
}

// ────────────────────────────────────────────── my work ──

export type Scope = 'mine' | 'team'
export type TaskRow = {
  id: string
  title: string
  kind: string
  status: string
  priority: string
  /** MANUAL, SYSTEM_RULE or INTAKE. A SYSTEM_RULE due date (D-1) needs a reason to change. */
  source: string
  dueAt: string | null
  overdue: boolean
  assigneeId: string | null
  assigneeName: string | null
  rfqId: string | null
  rfqNumber: string | null
  /** Polish R1: the inquiry's name for links (account, else the submitted company or person; never "Inquiry"). */
  rfqLabel?: string | null
  accountId: string | null
  accountName: string | null
  updatedAt: string
  createdAt: string
}
export type ActivityRow = {
  id: string
  type: string
  summary: string
  occurredAt: string
  actorKind: string
  actorName: string | null
  rfqId: string | null
  /** Human name of the linked inquiry (company, else the submitter's name), so links say where they go. */
  rfqLabel?: string | null
}
export type ReviewRow = { id: string; reason: string; rfqId: string | null; createdAt: string; rfqLabel?: string | null }

export type MyWork = {
  unassigned: Loaded<{ count: number; rows: RfqRow[] }>
  assigned: Loaded<{ count: number; rows: RfqRow[] }>
  followUps: Loaded<{ count: number; overdue: number; rows: TaskRow[]; overdueRows: TaskRow[] }>
  waiting: Loaded<{ count: number; rows: TaskRow[] }>
  recent: Loaded<{ rows: ActivityRow[] }>
  reviews: Loaded<{ count: number; rows: ReviewRow[] }>
  pipeline: Loaded<{ open: number; qualifiedRfqs: number }>
  people: Person[]
}

export async function hydrateTasks(s: CrmSession, docs: Doc[], people: Person[], now: Date): Promise<TaskRow[]> {
  const rfqIds = [...new Set(docs.map((t) => id(t.rfq)).filter(Boolean))] as string[]
  const accIds = [...new Set(docs.map((t) => id(t.account)).filter(Boolean))] as string[]
  const [rfqs, accs] = await Promise.all([
    rfqIds.length
      ? s.payload.find({ collection: 'crm-rfqs', where: { id: { in: rfqIds } }, depth: 0, limit: 100, ...asUser(s) })
      : null,
    accIds.length
      ? s.payload.find({ collection: 'crm-accounts', where: { id: { in: accIds } }, depth: 0, limit: 100, ...asUser(s) })
      : null,
  ])
  const rfqNo = new Map((rfqs?.docs ?? []).map((r) => [String(r.id), String(D(r).rfq_number ?? '')]))
  const rfqName = await rfqLabels(s, rfqIds)
  const accName = new Map((accs?.docs ?? []).map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
  const names = nameMap(people)
  return docs.map((t) => {
    const due = parseDate(t.due_at)
    const a = id(t.assignee)
    const done = t.status === 'DONE' || t.status === 'CANCELLED'
    return {
      id: String(t.id),
      title: taskTitle(t.title),
      kind: String(t.kind ?? 'GENERAL'),
      status: String(t.status ?? 'OPEN'),
      priority: String(t.priority ?? 'NORMAL'),
      source: String(t.source ?? 'MANUAL'),
      dueAt: due ? due.toISOString() : null,
      overdue: Boolean(!done && due && due < now),
      assigneeId: a,
      assigneeName: a ? (names.get(a) ?? 'CRM user') : null,
      rfqId: id(t.rfq),
      rfqNumber: rfqNo.get(String(id(t.rfq))) ?? null,
      rfqLabel: rfqName.get(String(id(t.rfq))) ?? null,
      accountId: id(t.account),
      accountName: accName.get(String(id(t.account))) ?? null,
      updatedAt: String(t.updatedAt ?? ''),
      createdAt: String(t.createdAt ?? ''),
    }
  })
}

export async function activityRows(s: CrmSession, docs: Doc[], people: Person[]): Promise<ActivityRow[]> {
  const names = nameMap(people)
  return docs.map((a) => {
    const actor = id(a.actor)
    return {
      id: String(a.id),
      type: String(a.type),
      summary: String(a.summary ?? ''),
      occurredAt: String(a.occurred_at ?? a.createdAt ?? ''),
      actorKind: String(a.actor_kind ?? 'SYSTEM'),
      actorName: actor ? (names.get(actor) ?? 'CRM user') : null,
      rfqId: id(a.rfq),
    }
  })
}

/**
 * Names for linked inquiries: the linked account's name, else the company the customer supplied, else the
 * submitter's name, else "Unnamed inquiry". Never the RFQ number, an email address or an id (UI-1 M4: a link's
 * text must say where it goes, and identical "Open"/"View" links are not descriptive).
 */
export async function rfqLabels(s: CrmSession, rfqIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(rfqIds.filter(Boolean))] as string[]
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const rfqs = await s.payload.find({ collection: 'crm-rfqs', where: { id: { in: ids } }, depth: 0, limit: ids.length, ...asUser(s) })
  const accIds = [...new Set(rfqs.docs.map((r) => id(D(r).account)).filter(Boolean))] as string[]
  const accounts = accIds.length
    ? await s.payload.find({ collection: 'crm-accounts', where: { id: { in: accIds } }, depth: 0, limit: accIds.length, ...asUser(s) })
    : null
  const accName = new Map((accounts?.docs ?? []).map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
  for (const r of rfqs.docs as unknown as Doc[]) {
    const sub = (r.submitted ?? {}) as Doc
    const person = [sub.first_name, sub.last_name].filter((x) => typeof x === 'string' && x.trim()).join(' ')
    const name =
      accName.get(String(id(r.account))) ||
      (typeof sub.company === 'string' && sub.company.trim() ? sub.company.trim() : '') ||
      person ||
      'Unnamed inquiry'
    out.set(String(r.id), name)
  }
  return out
}

export async function loadMyWork(s: CrmSession, scope: Scope, now: Date = new Date()): Promise<MyWork> {
  const people = await crmUsers(s).catch(() => [] as Person[])
  const mine = scope === 'mine'
  const eod = endOfBusinessDay(now, s.timeZone).toISOString()
  const openTask = { status: { in: ['OPEN', 'IN_PROGRESS'] } }

  const unassigned = safe(async () => {
    // Team work that needs an owner: shown under both Mine and Team (frozen decision).
    const where: Where = { and: [{ status: { in: [...OPEN_RFQ_STATUSES] } }, { assignee: { exists: false } }] }
    const res = await s.payload.find({ collection: 'crm-rfqs', where, sort: '-received_at', depth: 0, limit: 8, ...asUser(s) })
    return { count: res.totalDocs, rows: await hydrate(s, res.docs as unknown as Doc[], people, now) }
  })
  const assigned = safe(async () => {
    const where: Where = {
      and: [
        mine ? { assignee: { equals: s.userId } } : { assignee: { exists: true } },
        { status: { in: [...ACTIVE_RFQ_STATUSES] } },
        { opportunity: { exists: false } },
      ],
    }
    const res = await s.payload.find({ collection: 'crm-rfqs', where, sort: 'received_at', depth: 0, limit: 8, ...asUser(s) })
    return { count: res.totalDocs, rows: await hydrate(s, res.docs as unknown as Doc[], people, now) }
  })
  const followUps = safe(async () => {
    const base: Where[] = [openTask, { kind: { not_equals: 'MISSING_INFORMATION' } }, ...(mine ? [{ assignee: { equals: s.userId } }] : [])]
    // W1-9 overdue digest: the oldest overdue follow-ups, with the count.
    const [res, overdue] = await Promise.all([
      s.payload.find({
        collection: 'crm-tasks',
        where: { and: [...base, dueTodayOrUndatedHigh(eod)] },
        sort: 'due_at',
        depth: 0,
        limit: 8,
        ...asUser(s),
      }),
      s.payload.find({
        collection: 'crm-tasks',
        where: { and: [...base, { due_at: { less_than: now.toISOString() } }] },
        sort: 'due_at',
        depth: 0,
        limit: 5,
        ...asUser(s),
      }),
    ])
    return {
      count: res.totalDocs,
      overdue: overdue.totalDocs,
      rows: await hydrateTasks(s, res.docs as unknown as Doc[], people, now),
      overdueRows: await hydrateTasks(s, overdue.docs as unknown as Doc[], people, now),
    }
  })
  const waiting = safe(async () => {
    const where: Where = {
      and: [openTask, { kind: { equals: 'MISSING_INFORMATION' } }, ...(mine ? [{ assignee: { equals: s.userId } }] : [])],
    }
    const res = await s.payload.find({ collection: 'crm-tasks', where, sort: 'due_at', depth: 0, limit: 8, ...asUser(s) })
    return { count: res.totalDocs, rows: await hydrateTasks(s, res.docs as unknown as Doc[], people, now) }
  })
  const recent = safe(async () => {
    let where: Where = {}
    if (mine) {
      const my = await s.payload.find({
        collection: 'crm-rfqs',
        where: { assignee: { equals: s.userId } },
        sort: '-updatedAt',
        depth: 0,
        limit: 100,
        ...asUser(s),
      })
      const ids = my.docs.map((d) => String(d.id))
      if (ids.length === 0) return { rows: [] }
      where = { rfq: { in: ids } }
    }
    const res = await s.payload.find({ collection: 'crm-activities', where, sort: '-occurred_at', depth: 0, limit: 10, ...asUser(s) })
    const rows = await activityRows(s, res.docs as unknown as Doc[], people)
    const labels = await rfqLabels(s, rows.map((r) => r.rfqId))
    return { rows: rows.map((r) => ({ ...r, rfqLabel: r.rfqId ? (labels.get(r.rfqId) ?? null) : null })) }
  })
  const reviews = safe(async () => {
    const res = await s.payload.find({
      collection: 'crm-identity-reviews',
      where: { state: { equals: 'OPEN' } },
      sort: '-createdAt',
      depth: 0,
      limit: 5,
      ...asUser(s),
    })
    const labels = await rfqLabels(s, res.docs.map((r) => id(D(r).rfq)))
    return {
      count: res.totalDocs,
      rows: res.docs.map((r) => {
        const rfqId = id(D(r).rfq)
        return {
          id: String(r.id),
          reason: String(D(r).reason),
          rfqId,
          rfqLabel: rfqId ? (labels.get(rfqId) ?? null) : null,
          createdAt: String(D(r).createdAt ?? ''),
        }
      }),
    }
  })
  const pipeline = safe(async () => {
    const [open, qualified] = await Promise.all([
      s.payload.count({
        collection: 'crm-opportunities',
        where: { stage: { not_in: [...TERMINAL_STAGES] } },
        ...asUser(s),
      }),
      s.payload.count({ collection: 'crm-rfqs', where: { status: { equals: 'QUALIFIED' } }, ...asUser(s) }),
    ])
    return { open: open.totalDocs, qualifiedRfqs: qualified.totalDocs }
  })
  const [a, b, c, d, e, f, g] = await Promise.all([unassigned, assigned, followUps, waiting, recent, reviews, pipeline])
  return { unassigned: a, assigned: b, followUps: c, waiting: d, recent: e, reviews: f, pipeline: g, people }
}

// ────────────────────────────────────────────── rfq detail ──

export type RfqDetail = {
  rfq: Doc
  row: RfqRow
  contact: Doc | null
  account: Doc | null
  site: Doc | null
  accountSites: Array<{ id: string; name: string }>
  items: Doc[]
  tasks: TaskRow[]
  activity: ActivityRow[]
  notes: Array<{ id: string; body: string; authorName: string | null; createdAt: string; mine: boolean }>
  reviews: ReviewRow[]
  suppressions: LedgerRow[]
  people: Person[]
  intakeState: string | null
  /** CRM email M2/M3: the conversation with the customer, oldest first. */
  messages: EmailMessageRow[]
}

export type EmailMessageRow = {
  id: string
  direction: 'OUTBOUND' | 'INBOUND'
  status: string
  statusCode: string | null
  authorName: string | null
  from: string | null
  to: string | null
  subject: string
  body: string
  messageId: string | null
  occurredAt: string
  sentAt: string | null
  /** Inbound only: attachments that were withheld (names). */
  attachmentsWithheld: string[]
}

export async function loadRfq(s: CrmSession, rfqId: string, now: Date = new Date()): Promise<RfqDetail | null> {
  if (!isUuid(rfqId)) return null
  let rfq: Doc
  try {
    rfq = (await s.payload.findByID({ collection: 'crm-rfqs', id: rfqId, depth: 0, ...asUser(s) })) as unknown as Doc
  } catch {
    return null
  }
  if (!rfq) return null
  const people = await crmUsers(s)
  const [row] = await hydrate(s, [rfq], people, now)
  const byId = async (collection: 'crm-contacts' | 'crm-accounts' | 'crm-sites', v: unknown) => {
    const i = id(v)
    if (!i) return null
    try {
      return (await s.payload.findByID({ collection, id: i, depth: 0, ...asUser(s) })) as unknown as Doc
    } catch {
      return null
    }
  }
  const [contact, account, site, items, tasks, activity, notes, reviews, messages] = await Promise.all([
    byId('crm-contacts', rfq.contact),
    byId('crm-accounts', rfq.account),
    byId('crm-sites', rfq.site),
    s.payload.find({ collection: 'crm-rfq-items', where: { rfq: { equals: rfqId } }, sort: 'line_no', depth: 0, limit: 50, ...asUser(s) }),
    s.payload.find({ collection: 'crm-tasks', where: { rfq: { equals: rfqId } }, sort: 'due_at', depth: 0, limit: 50, ...asUser(s) }),
    s.payload.find({ collection: 'crm-activities', where: { rfq: { equals: rfqId } }, sort: '-occurred_at', depth: 0, limit: 60, ...asUser(s) }),
    s.payload.find({ collection: 'crm-notes', where: { rfq: { equals: rfqId } }, sort: '-createdAt', depth: 0, limit: 50, ...asUser(s) }),
    s.payload.find({ collection: 'crm-identity-reviews', where: { and: [{ rfq: { equals: rfqId } }, { state: { equals: 'OPEN' } }] }, depth: 0, limit: 10, ...asUser(s) }),
    s.payload.find({ collection: 'crm-email-messages', where: { rfq: { equals: rfqId } }, sort: 'occurred_at', depth: 0, limit: 200, ...asUser(s) }),
  ])
  const accountSites = account
    ? (
        await s.payload.find({ collection: 'crm-sites', where: { account: { equals: String(account.id) } }, sort: 'site_name', depth: 0, limit: 50, ...asUser(s) })
      ).docs.map((x) => ({ id: String(x.id), name: String(D(x).site_name ?? 'Unnamed site') }))
    : []
  let intakeState: string | null = null
  if (id(rfq.intake_event)) {
    try {
      const ev = (await s.payload.findByID({ collection: 'crm-intake-events', id: String(id(rfq.intake_event)), depth: 0, ...asUser(s) })) as unknown as Doc
      intakeState = (ev?.processing_state as string) ?? null
    } catch {
      intakeState = null
    }
  }
  const names = nameMap(people)
  return {
    rfq,
    row: row!,
    contact,
    account,
    site,
    accountSites,
    items: items.docs as unknown as Doc[],
    tasks: await hydrateTasks(s, tasks.docs as unknown as Doc[], people, now),
    activity: await activityRows(s, activity.docs as unknown as Doc[], people),
    notes: (notes.docs as unknown as Doc[]).map((n) => ({
      id: String(n.id),
      body: String(n.body ?? ''),
      authorName: id(n.author) ? (names.get(String(id(n.author))) ?? 'CRM user') : null,
      createdAt: String(n.createdAt ?? ''),
      mine: id(n.author) === s.userId,
    })),
    reviews: reviews.docs.map((r) => ({
      id: String(r.id),
      reason: String(D(r).reason),
      rfqId: rfqId,
      createdAt: String(D(r).createdAt ?? ''),
    })),
    suppressions: await activeSuppressionsForContact(
      s,
      (contact?.email_match_key as string) ?? submittedKey((rfq.submitted ?? {}) as Doc) ?? null,
    ),
    people,
    intakeState,
    messages: (messages.docs as unknown as Doc[]).map((m) => ({
      id: String(m.id),
      direction: m.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
      status: String(m.status ?? ''),
      statusCode: typeof m.status_code === 'string' ? m.status_code : null,
      authorName: id(m.author) ? (names.get(String(id(m.author))) ?? 'CRM user') : null,
      from: typeof m.from_address === 'string' ? m.from_address : null,
      to: typeof m.to_address === 'string' ? m.to_address : null,
      subject: String(m.subject ?? ''),
      body: String(m.body_text ?? ''),
      messageId: typeof m.message_id === 'string' ? m.message_id : null,
      occurredAt: String(m.occurred_at ?? ''),
      sentAt: typeof m.sent_at === 'string' ? m.sent_at : null,
      attachmentsWithheld: Array.isArray(m.attachments_withheld)
        ? (m.attachments_withheld as Array<{ name?: unknown }>).map((a) => String(a?.name ?? 'unnamed'))
        : [],
    })),
  }
}

// ────────────────────────────────────────────── pipeline ──

export type PipelineRow = {
  id: string
  name: string
  accountId: string | null
  accountName: string | null
  motion: string | null
  ownerName: string | null
  nextStep: string | null
  nextStepDue: string | null
  nextStepOverdue: boolean
  expectedDecision: string | null
  value: { kind: 'KNOWN'; display: string } | { kind: 'UNKNOWN' | 'NOT_ENTERED' | 'WITHHELD' }
  originRfqId: string | null
}
export type PipelineGroup = { stage: string; count: number; rows: PipelineRow[] }

/** Grouped pipeline table (NOT Kanban). No totals, no sums, no probabilities are computed. */
export async function loadPipeline(
  s: CrmSession,
  opts: { owner: 'me' | null; includeClosed: boolean },
  now: Date = new Date(),
): Promise<PipelineGroup[]> {
  const people = await crmUsers(s)
  const names = nameMap(people)
  const stages = OPPORTUNITY_STAGE.filter((st) => opts.includeClosed || !(TERMINAL_STAGES as readonly string[]).includes(st))
  return Promise.all(
    stages.map(async (stage) => {
      const where: Where = { and: [{ stage: { equals: stage } }, ...(opts.owner === 'me' ? [{ owner: { equals: s.userId } }] : [])] }
      const res = await s.payload.find({
        collection: 'crm-opportunities',
        where,
        sort: 'next_step_due_at',
        depth: 0,
        limit: 50,
        ...asUser(s),
      })
      const accIds = [...new Set(res.docs.map((o) => id(D(o).account)).filter(Boolean))] as string[]
      const accs = accIds.length
        ? await s.payload.find({ collection: 'crm-accounts', where: { id: { in: accIds } }, depth: 0, limit: 100, ...asUser(s) })
        : null
      const accName = new Map((accs?.docs ?? []).map((a) => [String(a.id), String(D(a).canonical_name ?? '')]))
      return {
        stage,
        count: res.totalDocs,
        rows: (res.docs as unknown as Doc[]).map((o) => {
          const due = parseDate(o.next_step_due_at)
          const status = String(o.amount_status ?? 'UNKNOWN')
          const owner = id(o.owner)
          return {
            id: String(o.id),
            name: String(o.name ?? ''),
            accountId: id(o.account),
            accountName: accName.get(String(id(o.account))) ?? null,
            motion: (o.motion as string) ?? null,
            ownerName: owner ? (names.get(owner) ?? 'CRM user') : null,
            nextStep: (o.next_step as string) || null,
            nextStepDue: due ? due.toISOString() : null,
            nextStepOverdue: Boolean(due && due < now),
            expectedDecision: (o.expected_decision_date as string) || null,
            value:
              status === 'KNOWN' && typeof o.amount_display === 'string' && o.amount_display
                ? { kind: 'KNOWN' as const, display: o.amount_display }
                : {
                    kind:
                      status === 'NOT_ENTERED'
                        ? ('NOT_ENTERED' as const)
                        : status === 'WITHHELD_OR_NOT_AVAILABLE'
                          ? ('WITHHELD' as const)
                          : ('UNKNOWN' as const),
                  },
            originRfqId: id(o.origin_rfq),
          }
        }),
      }
    }),
  )
}

// ────────────────────────────────────────────── follow-ups ──

export type FollowUpFilter = { who: 'mine' | 'team' | 'unassigned'; when: 'due' | 'overdue' | 'open' | 'done' }

export async function loadFollowUps(s: CrmSession, f: FollowUpFilter, now: Date = new Date()) {
  const people = await crmUsers(s)
  const and: Where[] = []
  if (f.who === 'mine') and.push({ assignee: { equals: s.userId } })
  if (f.who === 'unassigned') and.push({ assignee: { exists: false } })
  if (f.when === 'done') and.push({ status: { in: ['DONE', 'CANCELLED'] } })
  else and.push({ status: { in: ['OPEN', 'IN_PROGRESS'] } })
  if (f.when === 'due') and.push(dueTodayOrUndatedHigh(endOfBusinessDay(now, s.timeZone).toISOString()))
  if (f.when === 'overdue') and.push({ due_at: { less_than: now.toISOString() } })
  const res = await s.payload.find({
    collection: 'crm-tasks',
    where: { and },
    sort: f.when === 'done' ? '-completed_at' : 'due_at',
    depth: 0,
    limit: 100,
    ...asUser(s),
  })
  return { total: res.totalDocs, rows: await hydrateTasks(s, res.docs as unknown as Doc[], people, now), people }
}

// ────────────────────────────────────────────── account context ──

export async function loadAccount(s: CrmSession, accountId: string, now: Date = new Date()) {
  if (!isUuid(accountId)) return null
  let account: Doc
  try {
    account = (await s.payload.findByID({ collection: 'crm-accounts', id: accountId, depth: 0, ...asUser(s) })) as unknown as Doc
  } catch {
    return null
  }
  const people = await crmUsers(s)
  const names = nameMap(people)
  const [contacts, sites, rfqs, opps, activity, reviews, tasks] = await Promise.all([
    s.payload.find({ collection: 'crm-contacts', where: { account: { equals: accountId } }, sort: 'display_name', depth: 0, limit: 100, ...asUser(s) }),
    s.payload.find({ collection: 'crm-sites', where: { account: { equals: accountId } }, sort: 'site_name', depth: 0, limit: 100, ...asUser(s) }),
    s.payload.find({ collection: 'crm-rfqs', where: { account: { equals: accountId } }, sort: '-received_at', depth: 0, limit: 25, ...asUser(s) }),
    s.payload.find({ collection: 'crm-opportunities', where: { account: { equals: accountId } }, sort: 'stage', depth: 0, limit: 50, ...asUser(s) }),
    s.payload.find({ collection: 'crm-activities', where: { account: { equals: accountId } }, sort: '-occurred_at', depth: 0, limit: 15, ...asUser(s) }),
    s.payload.find({ collection: 'crm-identity-reviews', where: { and: [{ account: { equals: accountId } }, { state: { equals: 'OPEN' } }] }, depth: 0, limit: 5, ...asUser(s) }),
    // W1-9: open follow-ups first (soonest due), then the most recently finished.
    s.payload.find({
      collection: 'crm-tasks',
      where: { and: [{ account: { equals: accountId } }, { status: { in: ['OPEN', 'IN_PROGRESS'] } }] },
      sort: 'due_at',
      depth: 0,
      limit: 25,
      ...asUser(s),
    }),
  ])
  const siteIds = sites.docs.map((x) => String(x.id))
  const assets = siteIds.length
    ? await s.payload.find({ collection: 'crm-assets', where: { site: { in: siteIds } }, sort: 'asset_name', depth: 0, limit: 100, ...asUser(s) })
    : null
  const keys = [...new Set(contacts.docs.map((c) => D(c).email_match_key as string).filter(Boolean))]
  const dnc = await suppressionsByKey(s, keys)
  return {
    account,
    ownerName: id(account.owner) ? (names.get(String(id(account.owner))) ?? 'CRM user') : null,
    contacts: (contacts.docs as unknown as Doc[]).map((c) => ({
      id: String(c.id),
      name: String(c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed contact'),
      title: (c.title as string) || null,
      email: (c.email as string) || null,
      doNotContact: (dnc.get(c.email_match_key as string)?.length ?? 0) > 0,
    })),
    sites: (sites.docs as unknown as Doc[]).map((x) => ({
      id: String(x.id),
      name: String(x.site_name ?? 'Unnamed site'),
      place: [x.city, x.region].filter(Boolean).join(', ') || null,
      assets: (assets?.docs ?? [])
        .filter((a) => id(D(a).site) === String(x.id))
        .map((a) => ({ id: String(a.id), name: String(D(a).asset_name ?? 'Unnamed asset'), condition: String(D(a).condition_state ?? 'UNKNOWN') })),
    })),
    rfqs: await hydrate(s, rfqs.docs as unknown as Doc[], people, now),
    rfqTotal: rfqs.totalDocs,
    opportunities: (opps.docs as unknown as Doc[]).map((o) => ({
      id: String(o.id),
      name: String(o.name ?? ''),
      stage: String(o.stage ?? ''),
      ownerName: id(o.owner) ? (names.get(String(id(o.owner))) ?? 'CRM user') : null,
    })),
    activity: await activityRows(s, activity.docs as unknown as Doc[], people),
    openReviews: reviews.totalDocs,
    tasks: await hydrateTasks(s, tasks.docs as unknown as Doc[], people, now),
    taskTotal: tasks.totalDocs,
    people,
  }
}

/** Accounts for the Link-account picker: search by name (as the user), bounded. */
export async function searchAccounts(s: CrmSession, q: string | null) {
  const like = (q ?? '').replace(/[%_]/g, ' ').trim()
  const res = await s.payload.find({
    collection: 'crm-accounts',
    where: like ? { or: [{ canonical_name: { like } }, { 'aliases.alias': { like } }, { 'domains.domain': { like: like.toLowerCase() } }] } : {},
    sort: 'canonical_name',
    depth: 0,
    limit: 20,
    ...asUser(s),
  })
  return (res.docs as unknown as Doc[]).map((a) => ({
    id: String(a.id),
    name: String(a.canonical_name ?? ''),
    relationship: String(a.relationship_state ?? 'UNKNOWN'),
    domains: ((a.domains ?? []) as Doc[]).map((d) => ({ domain: String(d.domain), status: String(d.domain_status) })),
  }))
}

// ────────────────────────────────────────────── My Work dashboard (Polish R1) ──

export type DashTileKey = 'new_today' | 'reply_overdue' | 'reply_today' | 'waiting' | 'review'
export type DashTile = { key: DashTileKey; label: string; scope: 'Team' | 'Mine'; href: string; count: number | null; tone: 'neutral' | 'error' | 'warning' }
export type WeekBucket = { key: string; label: string; count: number; href: string }
export type Dashboard = {
  tiles: DashTile[]
  week: Loaded<{ total: number; byType: WeekBucket[]; byCountry: WeekBucket[] }>
  openFollowUps: Loaded<{ count: number; overdue: number; rows: TaskRow[] }>
}

/**
 * CT brief must-have 2. Every tile counts with the inbox's own filter (`inboxWhere`) for the URL it links to, so the
 * number on the tile is the number of rows the click shows. Overdue / due-today replies and waiting follow the
 * Mine/Team switch (Mine adds owner = me); new today and needs review are team queues.
 */
export async function loadDashboard(s: CrmSession, scope: Scope, now: Date = new Date()): Promise<Dashboard> {
  const mine = scope === 'mine'
  const tileDefs: Array<Omit<DashTile, 'count' | 'href'> & { q: Record<string, string> }> = [
    { key: 'new_today', label: 'New today', scope: 'Team', tone: 'neutral', q: { received: 'today' } },
    { key: 'reply_overdue', label: 'Overdue replies', scope: mine ? 'Mine' : 'Team', tone: 'error', q: { reply: 'overdue', ...(mine ? { owner: 'me' } : {}) } },
    { key: 'reply_today', label: 'Replies due today', scope: mine ? 'Mine' : 'Team', tone: 'warning', q: { reply: 'today', ...(mine ? { owner: 'me' } : {}) } },
    { key: 'waiting', label: 'Waiting on customer', scope: mine ? 'Mine' : 'Team', tone: 'neutral', q: { view: 'waiting', ...(mine ? { owner: 'me' } : {}) } },
    { key: 'review', label: 'Needs review', scope: 'Team', tone: 'warning', q: { view: 'review' } },
  ]
  const tiles = await Promise.all(
    tileDefs.map(async ({ q, ...t }) => {
      const p = parseInboxParams(q)
      const href = `/crm/rfqs/?${new URLSearchParams(q).toString()}`
      try {
        const c = await s.payload.count({ collection: 'crm-rfqs', where: await inboxWhere(s, p, now), ...asUser(s) })
        return { ...t, href, count: c.totalDocs }
      } catch {
        return { ...t, href, count: null } // shown as unavailable, never as 0
      }
    }),
  )
  const week = safe(async () => {
    const p = parseInboxParams({ received: 'week' })
    const res = await s.payload.find({ collection: 'crm-rfqs', where: await inboxWhere(s, p, now), depth: 0, limit: 500, pagination: false, ...asUser(s) })
    const docs = res.docs as unknown as Doc[]
    const tally = (keyOf: (d: Doc) => string) => {
      const m = new Map<string, number>()
      for (const d of docs) m.set(keyOf(d), (m.get(keyOf(d)) ?? 0) + 1)
      return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }
    const TYPES = ['PARTS', 'NEW_TOWER', 'REPAIR_SERVICE'] as const
    const byType = tally((d) => (TYPES as readonly string[]).includes(String(d.inquiry_type)) ? String(d.inquiry_type) : 'OTHER').map(([k, n]) => ({
      key: k,
      label: k === 'OTHER' ? 'Not stated' : (INQUIRY_TYPE_LABEL[k as InquiryType] ?? k),
      count: n,
      href: k === 'OTHER' ? '/crm/rfqs/?received=week' : `/crm/rfqs/?received=week&type=${k}`,
    }))
    const byCountry = tally((d) => (typeof d.country_code === 'string' && d.country_code ? d.country_code : 'UNKNOWN')).slice(0, 6).map(([k, n]) => ({
      key: k,
      label: k === 'UNKNOWN' ? 'Unknown' : (countryName(k) ?? k),
      count: n,
      href: `/crm/rfqs/?received=week&country=${k}`,
    }))
    return { total: docs.length, byType, byCountry }
  })
  const openFollowUps = safe(async () => {
    const people = await crmUsers(s).catch(() => [] as Person[])
    const base: Where[] = [{ status: { in: ['OPEN', 'IN_PROGRESS'] } }, { kind: { not_equals: 'MISSING_INFORMATION' } }, ...(mine ? [{ assignee: { equals: s.userId } }] : [])]
    const [res, overdue] = await Promise.all([
      s.payload.find({ collection: 'crm-tasks', where: { and: base }, sort: 'due_at', depth: 0, limit: 8, ...asUser(s) }),
      s.payload.count({ collection: 'crm-tasks', where: { and: [...base, { due_at: { less_than: now.toISOString() } }] }, ...asUser(s) }),
    ])
    return { count: res.totalDocs, overdue: overdue.totalDocs, rows: await hydrateTasks(s, res.docs as unknown as Doc[], people, now) }
  })
  const [w, f] = await Promise.all([week, openFollowUps])
  return { tiles, week: w, openFollowUps: f }
}
