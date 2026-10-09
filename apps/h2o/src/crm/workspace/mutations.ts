import { qualifyWithDeal } from './deals'
import { crmUsers } from './queries'
import { LOGGABLE_ACTIVITY_TYPES } from './labels'
import { asUser, viewerCalendar, type CrmSession } from './session'
import { OFFICES, OFFICE_LABEL } from '../offices'
import { withRowLock, type Lockable } from './serialize'
import { endOfLocalDate, quickDueDates, QUICK_DUE, type QuickDue } from './time'
import { dateTime, email, isoDate, line, oneOf, phone, relationshipId, text, type FieldErrors } from './validate'
import { emailKey, normalizeWebDomain } from '../normalize'

/**
 * Sales Workspace mutations. Each one:
 *
 *   1. validates its input shape (ids, enums, lengths) before touching the database;
 *   2. re-reads the target **as the user** and refuses a stale write (`expectedUpdatedAt`);
 *   3. writes through the Local API **as the user** (`overrideAccess: false`), so Payload access control
 *      and the CRM-1 + UI-1 collection hooks decide — the workspace never re-implements a rule it could
 *      bypass by accident.
 *
 * Nothing here sends email, calls a network service or deletes a record.
 */

type Doc = Record<string, unknown>
export type Outcome =
  | { ok: true; message: string; id?: string; warn?: boolean }
  | { ok: false; code: string; message: string; fields?: FieldErrors; conflict?: Conflict }
export type Conflict = { byName: string | null; at: string | null; what: string | null }

const fail = (code: string, message: string, extra: { fields?: FieldErrors; conflict?: Conflict } = {}) =>
  ({ ok: false as const, code, message, ...extra })

/** Map a Payload/CRM error to a person-readable outcome. Never echoes input values. */
export function fromError(err: unknown) {
  const e = err as { status?: number; message?: string; data?: { code?: string; errors?: Array<{ path?: string; message?: string }> } }
  const code = e?.data?.code
  if (code) return fail(code, String(e.message ?? '').replace(/^\[[A-Z_]+\]\s*/, '') || 'The change was refused.')
  if (e?.status === 403) return fail('FORBIDDEN', 'You don’t have permission to make this change.')
  if (e?.status === 404) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
  if (Array.isArray(e?.data?.errors) && e.data.errors.length) {
    const fields: FieldErrors = {}
    for (const x of e.data.errors) if (x.path) fields[x.path] = x.message ?? 'Invalid value'
    return fail('VALIDATION', 'Some values need attention.', { fields })
  }
  return fail('ERROR', 'The change could not be saved. Nothing was changed.')
}

type Collection = Lockable

async function current(s: CrmSession, collection: Collection, docId: string): Promise<Doc | null> {
  try {
    return (await s.payload.findByID({ collection, id: docId, depth: 0, ...asUser(s) })) as unknown as Doc
  } catch {
    return null
  }
}

/** Who changed an RFQ since `since`: the newest timeline entry after that instant (no audit-log access needed). */
async function conflictOn(s: CrmSession, rfqId: string, since: string): Promise<Conflict> {
  try {
    const people = await crmUsers(s)
    const res = await s.payload.find({
      collection: 'crm-activities',
      where: { and: [{ rfq: { equals: rfqId } }, { recorded_at: { greater_than: since } }] },
      sort: '-recorded_at',
      depth: 0,
      limit: 1,
      ...asUser(s),
    })
    const a = res.docs[0] as unknown as Doc | undefined
    if (!a) return { byName: null, at: null, what: null }
    const actor = a.actor ? String(typeof a.actor === 'object' ? (a.actor as Doc).id : a.actor) : null
    return {
      byName: actor ? (people.find((p) => p.id === actor)?.name ?? 'Another CRM user') : 'The system',
      at: String(a.recorded_at ?? ''),
      what: String(a.summary ?? ''),
    }
  } catch {
    return { byName: null, at: null, what: null }
  }
}

const ALREADY_DONE = 'Already done.'
const STALE_MESSAGE = 'This inquiry changed while you were working. Review the latest version before applying your change.'
const STALE_RECORD = 'This record changed while you were working. Review the latest version before applying your change.'
const staleMessage = (collection: Collection) => (collection === 'crm-rfqs' ? STALE_MESSAGE : STALE_RECORD)

/** Load a target and refuse the write if it changed since the user loaded it. */
async function fresh(s: CrmSession, collection: Collection, docId: unknown, expectedUpdatedAt: unknown) {
  const rid = relationshipId(docId)
  if (!rid.ok || !rid.id) return { error: fail('INVALID_ID', 'That record reference is not valid.') }
  const doc = await current(s, collection, rid.id)
  if (!doc) return { error: fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.') }
  if (typeof expectedUpdatedAt === 'string' && expectedUpdatedAt && String(doc.updatedAt) !== expectedUpdatedAt) {
    const conflict =
      collection === 'crm-rfqs'
        ? await conflictOn(s, rid.id, expectedUpdatedAt)
        : { byName: null, at: String(doc.updatedAt ?? ''), what: null }
    return { error: fail('STALE', staleMessage(collection), { conflict }) }
  }
  return { id: rid.id, doc }
}

/** Raised inside the row lock when the record changed after the user loaded it. */
class StaleWrite extends Error {
  constructor(
    readonly collection: Collection,
    readonly docId: string,
    readonly expected: string,
  ) {
    super('STALE')
  }
}

/**
 * Write a CRM record as the user, row-serialized. When the caller supplies the `updatedAt` it loaded, the
 * comparison happens under the row lock, so two people acting on the same inquiry at the same moment cannot
 * both pass the stale check (the loser gets STALE instead of silently overwriting).
 */
async function update(s: CrmSession, collection: Collection, docId: string, data: Doc, expectedUpdatedAt?: unknown) {
  return withRowLock(s, collection, docId, async (req) => {
    if (typeof expectedUpdatedAt === 'string' && expectedUpdatedAt) {
      const now = (await s.payload.findByID({ collection, id: docId, depth: 0, req, ...asUser(s) })) as unknown as Doc
      if (String(now.updatedAt) !== expectedUpdatedAt) throw new StaleWrite(collection, docId, expectedUpdatedAt)
    }
    return s.payload.update({ collection, id: docId, data: data as never, depth: 0, req, ...asUser(s) })
  })
}

/** Map a failed write to an Outcome; a stale write carries who changed the record, when known. */
async function failure(s: CrmSession, err: unknown): Promise<Outcome> {
  if (err instanceof StaleWrite) {
    const doc = await current(s, err.collection, err.docId)
    const conflict =
      err.collection === 'crm-rfqs'
        ? await conflictOn(s, err.docId, err.expected)
        : { byName: null, at: String(doc?.updatedAt ?? ''), what: null }
    return fail('STALE', staleMessage(err.collection), { conflict })
  }
  return fromError(err)
}

// ────────────────────────────────────────────── RFQ ──

/** Assign / reassign. Sales may assign themselves or another CRM user; the hook validates the assignee. */
export async function assignRfq(s: CrmSession, input: { rfqId: unknown; assigneeId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  const who = input.assigneeId === 'me' ? { ok: true as const, id: s.userId } : relationshipId(input.assigneeId)
  if (!who.ok) return fail('INVALID_ID', 'Choose a valid owner.')
  try {
    await update(s, 'crm-rfqs', target.id, { assignee: who.id }, input.expectedUpdatedAt)
    return { ok: true, message: who.id ? (who.id === s.userId ? 'Assigned to you.' : 'Owner updated.') : 'Owner removed.' }
  } catch (err) {
    return failure(s, err)
  }
}

export async function startReview(s: CrmSession, input: { rfqId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (!['RECEIVED', 'NEEDS_REVIEW'].includes(String(target.doc.status)))
    return fail('INVALID_TRANSITION', 'Review can only start on a received or needs-review inquiry.')
  try {
    await update(s, 'crm-rfqs', target.id, { status: 'IN_REVIEW' }, input.expectedUpdatedAt)
    return { ok: true, message: 'Review started.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** Patch L1: move an inquiry to the other office queue. It then stays there (office_source MANUAL); audited. */
export async function moveRfqOffice(s: CrmSession, input: { rfqId: unknown; office: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const office = oneOf(input.office, OFFICES)
  if (!office) return fail('VALIDATION', 'Choose the office queue.', { fields: { office: 'Required' } })
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (target.doc.office === office) return { ok: true, message: 'Already in that queue.' }
  try {
    await update(s, 'crm-rfqs', target.id, { office }, input.expectedUpdatedAt)
    return { ok: true, message: `Moved to the ${OFFICE_LABEL[office]} queue.` }
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * OPP-1 qualify: the person records the commercial motion and the inquiry gets its one deal (owner, stage, value,
 * expected close, next action). Idempotent: qualifying again returns the existing deal. Sends nothing.
 */
export async function qualifyRfq(
  s: CrmSession,
  input: {
    rfqId: unknown
    motion: unknown
    expectedUpdatedAt?: unknown
    ownerId?: unknown
    stage?: unknown
    amount?: unknown
    currency?: unknown
    expectedClose?: unknown
    nextStep?: unknown
    nextDue?: unknown
    amountIsZero?: unknown
  },
): Promise<Outcome> {
  try {
    return await qualifyWithDeal(s, input)
  } catch (err) {
    return fromError(err)
  }
}

const CLOSE_OUTCOMES = ['CLOSED', 'REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING'] as const

/** Close with a required free-text reason. A duplicate names the RFQ it duplicates (by RFQ number). */
export async function closeRfq(
  s: CrmSession,
  input: { rfqId: unknown; outcome: unknown; reason: unknown; duplicateOfNumber?: unknown; expectedUpdatedAt?: unknown },
): Promise<Outcome> {
  const outcome = oneOf(input.outcome, CLOSE_OUTCOMES)
  const reason = line(input.reason, 240)
  const fields: FieldErrors = {}
  if (!outcome) fields.outcome = 'Choose an outcome.'
  if (!reason) fields.reason = 'A reason is required.'
  let duplicateOf: string | null = null
  if (outcome === 'DUPLICATE_OF_EXISTING') {
    const num = line(input.duplicateOfNumber, 32)?.toUpperCase() ?? null
    if (!num || !/^RFQ-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/.test(num)) fields.duplicateOfNumber = 'Enter the RFQ number this duplicates.'
    else {
      const hit = await s.payload.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: num } }, depth: 0, limit: 1, ...asUser(s) })
      if (!hit.docs[0]) fields.duplicateOfNumber = 'No RFQ with that number.'
      else duplicateOf = String(hit.docs[0].id)
    }
  }
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (duplicateOf === target.id) return fail('VALIDATION', 'An RFQ cannot duplicate itself.', { fields: { duplicateOfNumber: 'Choose a different RFQ.' } })
  try {
    await update(s, 'crm-rfqs', target.id, { status: outcome, status_reason: reason, duplicate_of: duplicateOf }, input.expectedUpdatedAt)
    return { ok: true, message: 'Closed.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** Reopen a terminal RFQ back into review. Admin-only — enforced by the RFQ hook, checked here too. */
export async function reopenRfq(s: CrmSession, input: { rfqId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    await update(s, 'crm-rfqs', target.id, { status: 'IN_REVIEW', status_reason: null, duplicate_of: null }, input.expectedUpdatedAt)
    return { ok: true, message: 'Reopened.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** Link an existing account (manual). Writes audit evidence via the CRM-1 audit adapter. */
export async function linkAccount(s: CrmSession, input: { rfqId: unknown; accountId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const acc = relationshipId(input.accountId)
  if (!acc.ok || !acc.id) return fail('INVALID_ID', 'Choose an account to link.')
  try {
    await s.payload.findByID({ collection: 'crm-accounts', id: acc.id, depth: 0, ...asUser(s) })
  } catch {
    return fail('NOT_FOUND', 'That account no longer exists or you don’t have access to it.')
  }
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    // A site on another account cannot survive the relink; the RFQ hook would refuse it, so clear it.
    await update(s, 'crm-rfqs', target.id, { account: acc.id, site: null }, input.expectedUpdatedAt)
    return { ok: true, message: 'Account linked. Recorded in the audit history.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** Create a minimal account (name + optional domain as an UNVERIFIED candidate) and link it. */
export async function createAccountAndLink(
  s: CrmSession,
  input: { rfqId: unknown; name: unknown; domain?: unknown; expectedUpdatedAt?: unknown },
): Promise<Outcome> {
  const name = line(input.name, 160)
  const rawDomain = line(input.domain, 253)
  const domain = rawDomain ? normalizeWebDomain(rawDomain) : null
  const fields: FieldErrors = {}
  if (!name) fields.name = 'Enter the company name.'
  if (rawDomain && !domain) fields.domain = 'Enter a domain like example.com, or leave it empty.'
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    const created = await s.payload.create({
      collection: 'crm-accounts',
      data: {
        canonical_name: name,
        domains: domain ? [{ domain, domain_status: 'CANDIDATE' }] : [],
        provenance: { source_system: 'MANUAL_ENTRY' },
      } as never,
      depth: 0,
      ...asUser(s),
    })
    await update(s, 'crm-rfqs', target.id, { account: String(created.id), site: null }, input.expectedUpdatedAt)
    return { ok: true, message: 'Account created and linked. The domain is saved as an unverified candidate.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** Associate one of the linked account's existing plants/sites (the hook refuses another account's site). */
export async function associateSite(s: CrmSession, input: { rfqId: unknown; siteId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const site = relationshipId(input.siteId)
  if (!site.ok) return fail('INVALID_ID', 'Choose a valid plant/site.')
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    await update(s, 'crm-rfqs', target.id, { site: site.id }, input.expectedUpdatedAt)
    return { ok: true, message: site.id ? 'Plant/site associated.' : 'Plant/site removed.' }
  } catch (err) {
    return failure(s, err)
  }
}

// ────────────────────────────────────────────── timeline ──

/** Add a note (the notes collection records NOTE_ADDED on the timeline). Nothing is sent. */
export async function addNote(s: CrmSession, input: { rfqId: unknown; body: unknown }): Promise<Outcome> {
  const rfq = relationshipId(input.rfqId)
  const body = text(input.body, 5000)
  if (!rfq.ok || !rfq.id) return fail('INVALID_ID', 'That record reference is not valid.')
  if (!body) return fail('VALIDATION', 'Write the note first.', { fields: { body: 'Required' } })
  const doc = await current(s, 'crm-rfqs', rfq.id)
  if (!doc) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
  try {
    await s.payload.create({
      collection: 'crm-notes',
      data: { body, rfq: rfq.id, account: doc.account ?? null, contact: doc.contact ?? null } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Note added.' }
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * Log a call, meeting or email reference that happened outside the CRM. Allowed while a contact is on
 * do-not-contact (recording a past event is not contacting). The summary is the person's own words.
 */
export async function logActivity(
  s: CrmSession,
  input: { rfqId: unknown; type: unknown; summary: unknown; occurredAt?: unknown },
  now: Date = new Date(),
): Promise<Outcome> {
  const rfq = relationshipId(input.rfqId)
  const type = oneOf(input.type, LOGGABLE_ACTIVITY_TYPES)
  const summary = line(input.summary, 240)
  const occurred = input.occurredAt ? dateTime(input.occurredAt) : now
  const fields: FieldErrors = {}
  if (!type) fields.type = 'Choose what happened.'
  if (!summary) fields.summary = 'Add a short summary.'
  if (!occurred) fields.occurredAt = 'Enter a valid date and time.'
  else if (occurred.getTime() > now.getTime() + 5 * 60 * 1000) fields.occurredAt = 'This records something that already happened.'
  if (!rfq.ok || !rfq.id) return fail('INVALID_ID', 'That record reference is not valid.')
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  const doc = await current(s, 'crm-rfqs', rfq.id)
  if (!doc) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
  try {
    await s.payload.create({
      collection: 'crm-activities',
      data: {
        type,
        summary,
        occurred_at: occurred!.toISOString(),
        rfq: rfq.id,
        account: doc.account ?? null,
        contact: doc.contact ?? null,
      } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Logged. Nothing is sent.' }
  } catch (err) {
    return failure(s, err)
  }
}

// ────────────────────────────────────────────── tasks ──

/** Due date input (yyyy-mm-dd) → the end of that calendar day in the user's zone (Patch L1). */
function dueFrom(v: unknown, zone: string): string | null {
  const d = isoDate(v)
  if (!d) return null
  return endOfLocalDate(d, zone)?.toISOString() ?? null
}

export async function createFollowUp(
  s: CrmSession,
  input: {
    rfqId?: unknown
    accountId?: unknown
    contactId?: unknown
    title: unknown
    due: unknown
    assigneeId?: unknown
    priority?: unknown
    kind?: unknown
  },
): Promise<Outcome> {
  const rfq = relationshipId(input.rfqId)
  const acc = relationshipId(input.accountId)
  const con = relationshipId(input.contactId)
  const assignee = input.assigneeId === undefined || input.assigneeId === '' ? { ok: true as const, id: s.userId } : relationshipId(input.assigneeId)
  const title = line(input.title, 160)
  const due = dueFrom(input.due, s.timeZone)
  const priority = oneOf(input.priority ?? 'NORMAL', ['HIGH', 'NORMAL', 'LOW'] as const)
  const kind = oneOf(input.kind ?? 'FOLLOW_UP', ['FOLLOW_UP', 'MISSING_INFORMATION'] as const)
  const fields: FieldErrors = {}
  if (!title) fields.title = 'Add a title.'
  if (!due) fields.due = 'Choose a due date.'
  if (!assignee.ok) fields.assigneeId = 'Choose a valid owner.'
  if (!priority) fields.priority = 'Choose a priority.'
  if (!rfq.ok || !acc.ok || !con.ok || !kind) return fail('INVALID_ID', 'That record reference is not valid.')
  if (!rfq.id && !acc.id && !con.id) return fail('VALIDATION', 'A follow-up must relate to an inquiry, an account or a contact.')
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  let account = acc.id
  let contact: unknown = con.id
  if (con.id && !rfq.id) {
    const c = await current(s, 'crm-contacts', con.id)
    if (!c) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
    account = account ?? (c.account ? String(c.account) : null)
  }
  if (rfq.id) {
    const doc = await current(s, 'crm-rfqs', rfq.id)
    if (!doc) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
    account = account ?? (doc.account ? String(doc.account) : null)
    contact = contact ?? doc.contact ?? null
  }
  try {
    await s.payload.create({
      collection: 'crm-tasks',
      data: {
        title,
        kind,
        status: 'OPEN',
        priority,
        due_at: due,
        assignee: assignee.ok ? assignee.id : null,
        rfq: rfq.id,
        account,
        contact,
        source: 'MANUAL',
      } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Follow-up created.' }
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * Complete a task. Completing an already-finished task is a no-op success (double-click safe). The
 * transition is row-serialized, so concurrent completions record exactly one TASK_COMPLETED.
 */
export async function completeTask(s: CrmSession, input: { taskId: unknown }): Promise<Outcome> {
  const target = await fresh(s, 'crm-tasks', input.taskId, undefined)
  if ('error' in target) return target.error!
  if (target.doc.status === 'DONE') return { ok: true, message: ALREADY_DONE }
  if (target.doc.status === 'CANCELLED') return fail('INVALID_TRANSITION', 'This follow-up was canceled.')
  try {
    return await withRowLock(s, 'crm-tasks', target.id, async (req) => {
      const now = (await s.payload.findByID({ collection: 'crm-tasks', id: target.id, depth: 0, req, ...asUser(s) })) as unknown as Doc
      if (now.status === 'DONE') return { ok: true, message: ALREADY_DONE } as Outcome
      if (now.status === 'CANCELLED') return fail('INVALID_TRANSITION', 'This follow-up was canceled.')
      await s.payload.update({ collection: 'crm-tasks', id: target.id, data: { status: 'DONE' } as never, depth: 0, req, ...asUser(s) })
      return { ok: true, message: 'Follow-up done.' } as Outcome
    })
  } catch (err) {
    return failure(s, err)
  }
}

/** Reopen a finished task — admin-only, enforced by the task hook. Row-serialized like completion. */
export async function reopenTask(s: CrmSession, input: { taskId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const target = await fresh(s, 'crm-tasks', input.taskId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    return await withRowLock(s, 'crm-tasks', target.id, async (req) => {
      const now = (await s.payload.findByID({ collection: 'crm-tasks', id: target.id, depth: 0, req, ...asUser(s) })) as unknown as Doc
      if (now.status === 'OPEN' || now.status === 'IN_PROGRESS') return { ok: true, message: 'Already open.' } as Outcome
      await s.payload.update({ collection: 'crm-tasks', id: target.id, data: { status: 'OPEN' } as never, depth: 0, req, ...asUser(s) })
      return { ok: true, message: 'Follow-up reopened.' } as Outcome
    })
  } catch (err) {
    return failure(s, err)
  }
}

const NOTES_MAX = 4000
const NOTES_FULL = 'The notes on this follow-up are full (4,000 characters), so this note can’t be added. Ask an admin to trim the notes first.'

/** Append a dated line to a task's notes, or null when it would pass the cap (old notes are never dropped silently). */
function appendNote(prior: unknown, entry: string): string | null {
  const before = typeof prior === 'string' && prior.trim() ? `${prior.trim()}\n` : ''
  const next = `${before}${entry}`
  return next.length <= NOTES_MAX ? next : null
}

/**
 * Change a follow-up's due date. A rule-set due date (the D-1 first response) is never moved silently: the person
 * must give a reason, which is appended to the task's notes and recorded as a note on the related record so it
 * shows in the timeline. The task hook refuses the same change made without a reason on any other path.
 */
export async function changeDueDate(
  s: CrmSession,
  input: { taskId: unknown; due: unknown; reason?: unknown; expectedUpdatedAt?: unknown },
  now: Date = new Date(),
): Promise<Outcome> {
  const due = dueFrom(input.due, s.timeZone)
  if (!due) return fail('VALIDATION', 'Choose a due date.', { fields: { due: 'Required' } })
  const target = await fresh(s, 'crm-tasks', input.taskId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (['DONE', 'CANCELLED'].includes(String(target.doc.status))) return fail('INVALID_TRANSITION', 'This follow-up is finished.')
  if (String(target.doc.due_at ?? '') && new Date(String(target.doc.due_at)).toISOString() === due) return { ok: true, message: 'Due date unchanged.' }
  const system = target.doc.source === 'SYSTEM_RULE'
  const reason = line(input.reason, 240)
  if (system && !reason)
    return fail('VALIDATION', 'This due date was set by a rule. Say why it is changing.', { fields: { reason: 'A reason is required.' } })
  const data: Doc = { due_at: due }
  if (reason) {
    const notes = appendNote(target.doc.notes, `${now.toISOString().slice(0, 10)} due date changed: ${reason}`)
    if (!notes) return fail('VALIDATION', NOTES_FULL, { fields: { reason: 'The notes are full.' } })
    data.notes = notes
  }
  try {
    await update(s, 'crm-tasks', target.id, data, input.expectedUpdatedAt)
  } catch (err) {
    return failure(s, err)
  }
  if (system && reason) {
    const d = target.doc
    const subject = { rfq: d.rfq ?? null, account: d.account ?? null, contact: d.contact ?? null }
    try {
      await s.payload.create({
        collection: 'crm-notes',
        data: { body: `Due date of “${String(d.title ?? 'follow-up')}” changed to ${String(input.due)}. Reason: ${reason}`, ...subject } as never,
        depth: 0,
        ...asUser(s),
      })
    } catch {
      // The task kept the reason in its notes and the audit row records the date change; the timeline note is a
      // convenience copy, so its failure is reported, not hidden.
      return { ok: true, message: 'Due date changed. The reason is on the follow-up, but the timeline note could not be added.' }
    }
  }
  return { ok: true, message: 'Due date changed.' }
}

/** Snooze: move a follow-up to a quick date (tomorrow, next week). A rule-set due date still needs a reason. */
export async function snoozeTask(
  s: CrmSession,
  input: { taskId: unknown; preset: unknown; reason?: unknown; expectedUpdatedAt?: unknown },
  now: Date = new Date(),
): Promise<Outcome> {
  const preset = oneOf(input.preset, QUICK_DUE) as QuickDue | null
  if (!preset) return fail('VALIDATION', 'Choose when to snooze to.', { fields: { preset: 'Required' } })
  const out = await changeDueDate(s, { taskId: input.taskId, due: quickDueDates(now, await viewerCalendar(s))[preset], reason: input.reason, expectedUpdatedAt: input.expectedUpdatedAt }, now)
  return out.ok && out.message === 'Due date changed.' ? { ...out, message: preset === 'next_week' ? 'Snoozed to next week.' : preset === 'tomorrow' ? 'Snoozed to tomorrow.' : 'Due today.' } : out
}

export async function reassignTask(s: CrmSession, input: { taskId: unknown; assigneeId: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const who = input.assigneeId === 'me' ? { ok: true as const, id: s.userId } : relationshipId(input.assigneeId)
  if (!who.ok) return fail('INVALID_ID', 'Choose a valid owner.')
  const target = await fresh(s, 'crm-tasks', input.taskId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    await update(s, 'crm-tasks', target.id, { assignee: who.id }, input.expectedUpdatedAt)
    return { ok: true, message: 'Follow-up reassigned.' }
  } catch (err) {
    return failure(s, err)
  }
}

const FOLLOW_UP_PRIORITIES = ['HIGH', 'NORMAL', 'LOW'] as const

/**
 * Gate B item 4: edit a follow-up's title and priority in place. A rule-set task (the first response and the like)
 * keeps its wording: only its priority can change. A finished follow-up cannot be edited. The change is written
 * against the version the person was looking at, so a stale edit is refused rather than overwriting.
 */
export async function editFollowUp(
  s: CrmSession,
  input: { taskId: unknown; title?: unknown; priority?: unknown; expectedUpdatedAt?: unknown },
  now: Date = new Date(),
): Promise<Outcome> {
  if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt.trim())
    return fail('EXPECTED_UPDATED_AT_REQUIRED', 'Reload the follow-up and try again.')
  const fields: FieldErrors = {}
  const priority = oneOf(input.priority, FOLLOW_UP_PRIORITIES)
  if (!priority) fields.priority = 'Choose a priority.'
  const target = await fresh(s, 'crm-tasks', input.taskId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  const d = target.doc
  if (['DONE', 'CANCELLED'].includes(String(d.status))) return fail('INVALID_TRANSITION', 'This follow-up is finished.')
  const system = d.source === 'SYSTEM_RULE'
  const title = system ? String(d.title ?? '') : line(input.title, 160)
  if (!title) fields.title = 'Enter a title.'
  if (Object.keys(fields).length) return fail('VALIDATION', 'Check the highlighted fields.', { fields })
  const data: Doc = {}
  const titleChanged = !system && title !== String(d.title ?? '')
  if (titleChanged) data.title = title
  if (priority !== String(d.priority ?? 'NORMAL')) data.priority = priority
  if (!Object.keys(data).length) return { ok: true, message: 'No changes to save.' }
  if (titleChanged) {
    const notes = appendNote(d.notes, `${now.toISOString().slice(0, 10)} title changed from “${String(d.title ?? '')}”`)
    if (!notes) return fail('VALIDATION', NOTES_FULL, { fields: { title: 'The notes are full.' } })
    data.notes = notes
  }
  try {
    await update(s, 'crm-tasks', target.id, data, input.expectedUpdatedAt)
    return { ok: true, message: 'Follow-up updated.' }
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * Cancel a follow-up that is no longer needed (cancel, not delete: the record and its history stay). Cancelling an
 * already-canceled one is a no-op success; a done one cannot be canceled. A rule-set task needs a reason, which is
 * kept in its notes, so a first-response task is never dropped silently. Nothing is sent.
 */
export async function cancelFollowUp(
  s: CrmSession,
  input: { taskId: unknown; reason?: unknown; expectedUpdatedAt?: unknown },
  now: Date = new Date(),
): Promise<Outcome> {
  const target = await fresh(s, 'crm-tasks', input.taskId, undefined)
  if ('error' in target) return target.error!
  if (target.doc.status === 'CANCELLED') return { ok: true, message: 'Follow-up already canceled.' }
  if (target.doc.status === 'DONE') return fail('INVALID_TRANSITION', 'This follow-up is already done.')
  if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt.trim())
    return fail('EXPECTED_UPDATED_AT_REQUIRED', 'Reload the follow-up and try again.')
  const reason = line(input.reason, 240)
  if (target.doc.source === 'SYSTEM_RULE' && !reason)
    return fail('VALIDATION', 'This follow-up was created by a rule. Say why it is being canceled.', { fields: { reason: 'A reason is required.' } })
  const expected = input.expectedUpdatedAt
  try {
    return await withRowLock(s, 'crm-tasks', target.id, async (req) => {
      const cur = (await s.payload.findByID({ collection: 'crm-tasks', id: target.id, depth: 0, req, ...asUser(s) })) as unknown as Doc
      if (cur.status === 'CANCELLED') return { ok: true, message: 'Follow-up already canceled.' } as Outcome
      if (cur.status === 'DONE') return fail('INVALID_TRANSITION', 'This follow-up is already done.')
      if (String(cur.updatedAt) !== expected) throw new StaleWrite('crm-tasks', target.id, expected)
      const data: Doc = { status: 'CANCELLED' }
      if (reason) {
        const notes = appendNote(cur.notes, `${now.toISOString().slice(0, 10)} canceled: ${reason}`)
        if (!notes) return fail('VALIDATION', NOTES_FULL, { fields: { reason: 'The notes are full.' } })
        data.notes = notes
      }
      await s.payload.update({ collection: 'crm-tasks', id: target.id, data: data as never, depth: 0, req, ...asUser(s) })
      return { ok: true, message: 'Follow-up canceled.', rule: cur.source === 'SYSTEM_RULE', subject: { rfq: cur.rfq ?? null, account: cur.account ?? null, contact: cur.contact ?? null }, title: String(cur.title ?? 'follow-up') } as Outcome & { rule: boolean; subject: Doc; title: string }
    }).then(async (out) => {
      // A rule-made follow-up (the first response) is never dropped silently: the inquiry's timeline says so.
      const { rule, subject, title, ...clean } = out as Outcome & { rule?: boolean; subject?: Doc; title?: string }
      if (!clean.ok || !rule || !subject) return clean as Outcome
      try {
        await s.payload.create({
          collection: 'crm-notes',
          data: { body: `Follow-up “${title}” canceled. Reason: ${reason}`, ...subject } as never,
          depth: 0,
          ...asUser(s),
        })
        return { ok: true, message: 'Follow-up canceled.' } as Outcome
      } catch {
        return { ok: true, message: 'Follow-up canceled. The reason is on the follow-up, but the timeline note could not be added.' } as Outcome
      }
    })
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * Request information: records what is missing as a MISSING_INFORMATION task ("waiting for customer") and
 * marks qualification incomplete. The salesperson contacts the customer outside the CRM — nothing is sent.
 */
export async function requestInformation(
  s: CrmSession,
  input: { rfqId: unknown; missing: unknown; due: unknown; expectedUpdatedAt?: unknown },
): Promise<Outcome> {
  const missing = line(input.missing, 160)
  if (!missing) return fail('VALIDATION', 'Say what is missing.', { fields: { missing: 'Required' } })
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  const created = await createFollowUp(s, {
    rfqId: target.id,
    title: `Waiting for customer: ${missing}`,
    due: input.due,
    kind: 'MISSING_INFORMATION',
    assigneeId: target.doc.assignee ? String(target.doc.assignee) : undefined,
  })
  if (!created.ok) return created
  try {
    if (target.doc.qualification_state !== 'INCOMPLETE') await update(s, 'crm-rfqs', target.id, { qualification_state: 'INCOMPLETE' })
    return { ok: true, message: 'Recorded as waiting for customer. Nothing is sent.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** "Customer replied": completes the MISSING_INFORMATION task and logs REPLY_REFERENCE on the RFQ. */
export async function customerReplied(s: CrmSession, input: { taskId: unknown; summary?: unknown }): Promise<Outcome> {
  const target = await fresh(s, 'crm-tasks', input.taskId, undefined)
  if ('error' in target) return target.error!
  if (target.doc.kind !== 'MISSING_INFORMATION') return fail('INVALID_TRANSITION', 'Only a waiting-for-customer follow-up can record a reply.')
  const done = await completeTask(s, { taskId: target.id })
  if (!done.ok) return done
  // A concurrent or repeated "customer replied" lost the completion race: the reply is already recorded.
  if (done.message === ALREADY_DONE) return { ok: true, message: 'Reply already recorded.' }
  const rfqId = target.doc.rfq ? String(typeof target.doc.rfq === 'object' ? (target.doc.rfq as Doc).id : target.doc.rfq) : null
  if (!rfqId) return { ok: true, message: 'Follow-up done.' }
  try {
    await s.payload.create({
      collection: 'crm-activities',
      data: {
        type: 'REPLY_REFERENCE',
        summary: line(input.summary, 240) ?? 'Customer replied',
        occurred_at: new Date().toISOString(),
        rfq: rfqId,
        account: target.doc.account ?? null,
        contact: target.doc.contact ?? null,
      } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Customer reply recorded.' }
  } catch (err) {
    return failure(s, err)
  }
}

// ────────────────────────────────────────────── suppression ──

/**
 * Apply do-not-contact to a contact. Sales may apply (CRM-1 model); clearing is admin-only and enforced by
 * the suppression `clearGate` hook.
 */
export async function applyDoNotContact(s: CrmSession, input: { contactId: unknown; note: unknown }): Promise<Outcome> {
  const c = relationshipId(input.contactId)
  const note = line(input.note, 500)
  if (!c.ok || !c.id) return fail('INVALID_ID', 'That contact reference is not valid.')
  if (!note) return fail('VALIDATION', 'Record why the customer should not be contacted.', { fields: { note: 'Required' } })
  try {
    await s.payload.findByID({ collection: 'crm-contacts', id: c.id, depth: 0, ...asUser(s) })
  } catch {
    return fail('NOT_FOUND', 'That contact no longer exists or you don’t have access to it.')
  }
  try {
    await s.payload.create({
      collection: 'crm-suppressions',
      data: { contact: c.id, action: 'APPLY', reason: 'DO_NOT_CONTACT', scope: 'ALL_OUTREACH', reason_note: note } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Do-not-contact recorded.' }
  } catch (err) {
    return failure(s, err)
  }
}

/** Clear an active suppression (admin-only; the CRM-1 clear rules decide what may be cleared). */
export async function clearSuppression(
  s: CrmSession,
  input: { contactId: unknown; suppressionId: unknown; note: unknown; evidence?: unknown },
): Promise<Outcome> {
  const c = relationshipId(input.contactId)
  const sup = relationshipId(input.suppressionId)
  const note = line(input.note, 500)
  if (!c.ok || !c.id || !sup.ok || !sup.id) return fail('INVALID_ID', 'That reference is not valid.')
  if (!note) return fail('VALIDATION', 'Clearing needs a written reason.', { fields: { note: 'Required' } })
  try {
    await s.payload.create({
      collection: 'crm-suppressions',
      data: { contact: c.id, action: 'CLEAR', clears: sup.id, reason_note: note, evidence_ref: line(input.evidence, 240) } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Do-not-contact cleared.' }
  } catch (err) {
    return failure(s, err)
  }
}

// ────────────────────────────────────────────── identity review ──

/** Resolve an identity review (admin-only by collection access). No merge happens. */
export async function resolveReview(s: CrmSession, input: { reviewId: unknown; state: unknown; note: unknown }): Promise<Outcome> {
  const r = relationshipId(input.reviewId)
  const state = oneOf(input.state, ['CONFIRMED_DISTINCT', 'DISMISSED'] as const)
  const note = line(input.note, 500)
  if (!r.ok || !r.id) return fail('INVALID_ID', 'That review reference is not valid.')
  if (!state) return fail('VALIDATION', 'Choose a resolution.', { fields: { state: 'Required' } })
  if (!note) return fail('VALIDATION', 'Record the reason.', { fields: { note: 'Required' } })
  try {
    await s.payload.update({
      collection: 'crm-identity-reviews',
      id: r.id,
      data: { state, resolution_note: note } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Review resolved. Nothing was merged.' }
  } catch (err) {
    return failure(s, err)
  }
}

// ────────────────────────────────────────────── accounts & contacts (Wave 1 W1-1) ──

const RELATIONSHIPS = ['VERIFIED_CUSTOMER', 'VERIFIED_PAST_CUSTOMER', 'PROSPECT', 'CANDIDATE', 'UNKNOWN'] as const
const VERIFIED_RELATIONSHIPS: readonly string[] = ['VERIFIED_CUSTOMER', 'VERIFIED_PAST_CUSTOMER']
const FUNCTIONS = [
  'ENGINEERING_TECHNICAL',
  'PLANT_OPERATIONS',
  'MAINTENANCE_RELIABILITY',
  'PROCUREMENT_SOURCING',
  'PROJECT_MANAGEMENT',
  'EXECUTIVE_MANAGEMENT',
  'EPC_CONSULTANT_THIRD_PARTY',
  'OTHER',
  'UNKNOWN',
] as const
const LINK_CONFIDENCES = ['VERIFIED', 'HIGH_CONFIDENCE', 'LOW_CONFIDENCE'] as const

/** An owner from a form: "" clears it, "me" is the user, anything else must be a UUID (the hook checks the role). */
function ownerFrom(s: CrmSession, v: unknown): { ok: true; id: string | null } | { ok: false } {
  if (v === 'me') return { ok: true, id: s.userId }
  return relationshipId(v)
}

/** Only keys the form actually sent are written: an absent field is "unchanged", never "cleared". */
const has = (input: object, k: string) => Object.prototype.hasOwnProperty.call(input, k) && (input as Doc)[k] !== undefined

/**
 * Edit an account's safe fields from its profile. Name, legal name, industry, owner and relationship. A verified
 * relationship is an admin act (refused here with a clear message, and by the account hook on every other path).
 * Domains, parent, tier and state stay admin work in Payload admin.
 */
export async function updateAccount(
  s: CrmSession,
  input: { accountId: unknown; expectedUpdatedAt?: unknown; name?: unknown; legalName?: unknown; industry?: unknown; relationship?: unknown; ownerId?: unknown },
): Promise<Outcome> {
  const fields: FieldErrors = {}
  const data: Doc = {}
  if (has(input, 'name')) {
    const name = line(input.name, 160)
    if (!name) fields.name = 'Enter the company name.'
    else data.canonical_name = name
  }
  if (has(input, 'legalName')) data.legal_name = line(input.legalName, 200)
  if (has(input, 'industry')) data.industry = line(input.industry, 120)
  if (has(input, 'relationship')) {
    const r = oneOf(input.relationship, RELATIONSHIPS)
    if (!r) fields.relationship = 'Choose a relationship.'
    else data.relationship_state = r
  }
  if (has(input, 'ownerId')) {
    const o = ownerFrom(s, input.ownerId)
    if (!o.ok) fields.ownerId = 'Choose a valid owner.'
    else data.owner = o.id
  }
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  const target = await fresh(s, 'crm-accounts', input.accountId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (
    !s.isAdmin &&
    'relationship_state' in data &&
    data.relationship_state !== target.doc.relationship_state &&
    (VERIFIED_RELATIONSHIPS.includes(String(data.relationship_state)) || VERIFIED_RELATIONSHIPS.includes(String(target.doc.relationship_state)))
  )
    return fail('VERIFIED_RELATIONSHIP_PRIVILEGED', 'Only an admin can set or change a verified customer relationship.', {
      fields: { relationship: 'Admin only for verified relationships.' },
    })
  for (const k of Object.keys(data)) if (sameish(data[k], target.doc[k])) delete data[k]
  if (Object.keys(data).length === 0) return { ok: true, message: 'No changes.' }
  try {
    await update(s, 'crm-accounts', target.id, data, input.expectedUpdatedAt)
    return { ok: true, message: 'Account saved. Recorded in the audit history.' }
  } catch (err) {
    return failure(s, err)
  }
}

const sameish = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : typeof v === 'object' && v ? String((v as Doc).id ?? JSON.stringify(v)) : v)
  return norm(a) === norm(b)
}

/** Create an account from the directory ("New account"). A domain is saved as an unverified candidate. */
export async function createAccount(
  s: CrmSession,
  input: { name: unknown; domain?: unknown; relationship?: unknown; ownerId?: unknown },
): Promise<Outcome> {
  const name = line(input.name, 160)
  const rawDomain = line(input.domain, 253)
  const domain = rawDomain ? normalizeWebDomain(rawDomain) : null
  const relationship = input.relationship === undefined || input.relationship === '' ? 'UNKNOWN' : oneOf(input.relationship, RELATIONSHIPS)
  const owner = input.ownerId === undefined ? { ok: true as const, id: s.userId } : ownerFrom(s, input.ownerId)
  const fields: FieldErrors = {}
  if (!name) fields.name = 'Enter the company name.'
  if (rawDomain && !domain) fields.domain = 'Enter a domain like example.com, or leave it empty.'
  if (!relationship) fields.relationship = 'Choose a relationship.'
  else if (!s.isAdmin && VERIFIED_RELATIONSHIPS.includes(relationship)) fields.relationship = 'Admin only for verified relationships.'
  if (!owner.ok) fields.ownerId = 'Choose a valid owner.'
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  try {
    const created = await s.payload.create({
      collection: 'crm-accounts',
      data: {
        canonical_name: name,
        domains: domain ? [{ domain, domain_status: 'CANDIDATE' }] : [],
        relationship_state: relationship,
        owner: owner.ok ? owner.id : null,
        provenance: { source_system: 'MANUAL_ENTRY' },
      } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Account created.', id: String(created.id) }
  } catch (err) {
    return failure(s, err)
  }
}

/** The primary phone row of a contact, edited in place; other recorded numbers are kept. */
function withPrimaryPhone(existing: unknown, value: string | null): Doc[] {
  const rows = Array.isArray(existing) ? (existing as Doc[]).map((r) => ({ number_raw: r.number_raw, kind: r.kind ?? 'UNKNOWN' })) : []
  if (value === null) return rows.slice(1)
  if (rows.length === 0) return [{ number_raw: value, kind: 'PRIMARY' }]
  rows[0] = { ...rows[0], number_raw: value }
  return rows
}

/**
 * Edit a contact's safe fields from its profile: names, title, function, primary phone and owner. The email address
 * is the contact's identity and is write-once (a different address is a different contact point).
 */
export async function updateContact(
  s: CrmSession,
  input: {
    contactId: unknown
    expectedUpdatedAt?: unknown
    firstName?: unknown
    lastName?: unknown
    title?: unknown
    contactFunction?: unknown
    phone?: unknown
    ownerId?: unknown
    email?: unknown
  },
): Promise<Outcome> {
  if (has(input, 'email'))
    return fail('WRITE_ONCE_FIELD', 'An email address cannot be changed. Create a new contact for a different address.', {
      fields: { email: 'Write-once.' },
    })
  const fields: FieldErrors = {}
  const data: Doc = {}
  if (has(input, 'firstName')) data.first_name = line(input.firstName, 80)
  if (has(input, 'lastName')) data.last_name = line(input.lastName, 80)
  if (has(input, 'title')) data.title = line(input.title, 120)
  if (has(input, 'contactFunction')) {
    const f = oneOf(input.contactFunction, FUNCTIONS)
    if (!f) fields.contactFunction = 'Choose a function.'
    else data.contact_function = f
  }
  let phoneValue: string | null | undefined
  if (has(input, 'phone')) {
    const p = phone(input.phone)
    if (!p.ok) fields.phone = 'Enter a phone number with 7–15 digits.'
    else phoneValue = p.value
  }
  if (has(input, 'ownerId')) {
    const o = ownerFrom(s, input.ownerId)
    if (!o.ok) fields.ownerId = 'Choose a valid owner.'
    else data.owner = o.id
  }
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  const target = await fresh(s, 'crm-contacts', input.contactId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if ('first_name' in data || 'last_name' in data) {
    const first = 'first_name' in data ? data.first_name : target.doc.first_name
    const last = 'last_name' in data ? data.last_name : target.doc.last_name
    data.display_name = [first, last].filter((x) => typeof x === 'string' && x).join(' ') || null
  }
  if (phoneValue !== undefined) {
    const current = (target.doc.phones as Doc[] | undefined)?.[0]?.number_raw ?? null
    if ((current ?? null) !== phoneValue) data.phones = withPrimaryPhone(target.doc.phones, phoneValue)
  }
  for (const k of Object.keys(data)) if (k !== 'phones' && sameish(data[k], target.doc[k])) delete data[k]
  if (Object.keys(data).length === 0) return { ok: true, message: 'No changes.' }
  try {
    await update(s, 'crm-contacts', target.id, data, input.expectedUpdatedAt)
    return { ok: true, message: 'Contact saved. Recorded in the audit history.' }
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * Link a contact to an account, or remove the link, stating how it is known. A VERIFIED link is admin-only and, once
 * set, only an admin can change it (the contact hook enforces both on every path).
 */
export async function linkContactAccount(
  s: CrmSession,
  input: { contactId: unknown; accountId: unknown; confidence?: unknown; expectedUpdatedAt?: unknown },
): Promise<Outcome> {
  const acc = relationshipId(input.accountId)
  if (!acc.ok) return fail('INVALID_ID', 'Choose an account to link.')
  const confidence = acc.id ? oneOf(input.confidence, LINK_CONFIDENCES) : 'UNKNOWN'
  if (!confidence) return fail('VALIDATION', 'Say how you know this contact belongs to the account.', { fields: { confidence: 'Required' } })
  if (confidence === 'VERIFIED' && !s.isAdmin)
    return fail('VERIFIED_LINK_PROTECTED', 'Only an admin can record a verified link.', { fields: { confidence: 'Admin only.' } })
  if (acc.id) {
    try {
      await s.payload.findByID({ collection: 'crm-accounts', id: acc.id, depth: 0, ...asUser(s) })
    } catch {
      return fail('NOT_FOUND', 'That account no longer exists or you don’t have access to it.')
    }
  }
  const target = await fresh(s, 'crm-contacts', input.contactId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  try {
    await update(s, 'crm-contacts', target.id, { account: acc.id, account_link_confidence: confidence }, input.expectedUpdatedAt)
    return { ok: true, message: acc.id ? 'Account linked. Recorded in the audit history.' : 'Account link removed.' }
  } catch (err) {
    return failure(s, err)
  }
}

/**
 * Create a contact by hand ("New contact"). The address is checked before writing: an existing contact with the same
 * identity is returned as a conflict with its id (never a second record), and an active do-not-contact on that
 * address applies to the new record automatically, because suppressions are keyed by the address.
 */
export async function createContact(
  s: CrmSession,
  input: {
    email: unknown
    firstName?: unknown
    lastName?: unknown
    title?: unknown
    contactFunction?: unknown
    phone?: unknown
    accountId?: unknown
    confidence?: unknown
    ownerId?: unknown
  },
): Promise<Outcome & { existingId?: string }> {
  const fields: FieldErrors = {}
  const mail = email(input.email)
  if (!mail.ok || !mail.value) fields.email = 'Enter a valid email address.'
  const p = phone(input.phone)
  if (!p.ok) fields.phone = 'Enter a phone number with 7–15 digits.'
  const fn = input.contactFunction === undefined || input.contactFunction === '' ? 'UNKNOWN' : oneOf(input.contactFunction, FUNCTIONS)
  if (!fn) fields.contactFunction = 'Choose a function.'
  const acc = relationshipId(input.accountId)
  if (!acc.ok) fields.accountId = 'Choose a valid account.'
  const confidence = acc.ok && acc.id ? oneOf(input.confidence, LINK_CONFIDENCES) : 'UNKNOWN'
  if (acc.ok && acc.id && !confidence) fields.confidence = 'Say how you know this contact belongs to the account.'
  if (confidence === 'VERIFIED' && !s.isAdmin) fields.confidence = 'Admin only.'
  const owner = input.ownerId === undefined ? { ok: true as const, id: s.userId } : ownerFrom(s, input.ownerId)
  if (!owner.ok) fields.ownerId = 'Choose a valid owner.'
  const firstName = line(input.firstName, 80)
  const lastName = line(input.lastName, 80)
  if (!firstName && !lastName) fields.lastName = 'Enter at least a first or last name.'
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  const key = emailKey(mail.ok ? mail.value : null)!
  const dupe = await s.payload.find({ collection: 'crm-contacts', where: { email_match_key: { equals: key.matchKey } }, depth: 0, limit: 1, ...asUser(s) })
  if (dupe.docs[0])
    return { ...fail('CONTACT_EXISTS', 'A contact with this email address already exists.', { fields: { email: 'Already a contact.' } }), existingId: String(dupe.docs[0].id) }
  try {
    const created = await s.payload.create({
      collection: 'crm-contacts',
      data: {
        email: mail.ok ? mail.value : null,
        first_name: firstName,
        last_name: lastName,
        title: line(input.title, 120),
        contact_function: fn,
        phones: p.ok && p.value ? [{ number_raw: p.value, kind: 'PRIMARY' }] : [],
        account: acc.ok ? acc.id : null,
        account_link_confidence: confidence,
        owner: owner.ok ? owner.id : null,
        provenance: { source_system: 'MANUAL_ENTRY' },
      } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: 'Contact created.', id: String(created.id) }
  } catch (err) {
    return failure(s, err)
  }
}
