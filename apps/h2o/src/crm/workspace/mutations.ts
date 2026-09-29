import { crmUsers } from './queries'
import { LOGGABLE_ACTIVITY_TYPES } from './labels'
import { asUser, type CrmSession } from './session'
import { withRowLock } from './serialize'
import { endOfBusinessDay } from './time'
import { dateTime, isoDate, line, oneOf, relationshipId, text, type FieldErrors } from './validate'
import { normalizeWebDomain } from '../normalize'

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
  | { ok: true; message: string; id?: string }
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

type Collection = 'crm-rfqs' | 'crm-tasks'

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
    return { error: fail('STALE', STALE_MESSAGE, { conflict }) }
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
    return fail('STALE', STALE_MESSAGE, { conflict })
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

const MOTIONS = ['NEW_TOWER', 'REBUILD_REPLACEMENT', 'REPAIR', 'UPGRADE_RETROFIT', 'MAINTENANCE_INSPECTION', 'PARTS', 'OTHER_APPROVED'] as const

/** Qualify: a person records the commercial motion. Creates no opportunity (Convert is deferred). */
export async function qualifyRfq(s: CrmSession, input: { rfqId: unknown; motion: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const motion = oneOf(input.motion, MOTIONS)
  if (!motion) return fail('VALIDATION', 'Choose the commercial motion.', { fields: { motion: 'Required' } })
  const target = await fresh(s, 'crm-rfqs', input.rfqId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (String(target.doc.status) !== 'IN_REVIEW') return fail('INVALID_TRANSITION', 'Start the review before qualifying.')
  try {
    await update(s, 'crm-rfqs', target.id, { status: 'QUALIFIED', motion, qualification_state: 'COMPLETE' }, input.expectedUpdatedAt)
    return { ok: true, message: 'Qualified. No opportunity was created.' }
  } catch (err) {
    return failure(s, err)
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

/** Due date input (yyyy-mm-dd) → end of that business day (America/Denver). */
function dueFrom(v: unknown): string | null {
  const d = isoDate(v)
  if (!d) return null
  return endOfBusinessDay(new Date(`${d}T18:00:00Z`)).toISOString()
}

export async function createFollowUp(
  s: CrmSession,
  input: { rfqId?: unknown; accountId?: unknown; title: unknown; due: unknown; assigneeId?: unknown; priority?: unknown; kind?: unknown },
): Promise<Outcome> {
  const rfq = relationshipId(input.rfqId)
  const acc = relationshipId(input.accountId)
  const assignee = input.assigneeId === undefined || input.assigneeId === '' ? { ok: true as const, id: s.userId } : relationshipId(input.assigneeId)
  const title = line(input.title, 160)
  const due = dueFrom(input.due)
  const priority = oneOf(input.priority ?? 'NORMAL', ['HIGH', 'NORMAL', 'LOW'] as const)
  const kind = oneOf(input.kind ?? 'FOLLOW_UP', ['FOLLOW_UP', 'MISSING_INFORMATION'] as const)
  const fields: FieldErrors = {}
  if (!title) fields.title = 'Add a title.'
  if (!due) fields.due = 'Choose a due date.'
  if (!assignee.ok) fields.assigneeId = 'Choose a valid owner.'
  if (!priority) fields.priority = 'Choose a priority.'
  if (!rfq.ok || !acc.ok || !kind) return fail('INVALID_ID', 'That record reference is not valid.')
  if (!rfq.id && !acc.id) return fail('VALIDATION', 'A follow-up must relate to an inquiry or an account.')
  if (Object.keys(fields).length) return fail('VALIDATION', 'Some values need attention.', { fields })
  let account = acc.id
  let contact: unknown = null
  if (rfq.id) {
    const doc = await current(s, 'crm-rfqs', rfq.id)
    if (!doc) return fail('NOT_FOUND', 'That record no longer exists or you don’t have access to it.')
    account = account ?? (doc.account ? String(doc.account) : null)
    contact = doc.contact ?? null
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
  if (target.doc.status === 'CANCELLED') return fail('INVALID_TRANSITION', 'This follow-up was cancelled.')
  try {
    return await withRowLock(s, 'crm-tasks', target.id, async (req) => {
      const now = (await s.payload.findByID({ collection: 'crm-tasks', id: target.id, depth: 0, req, ...asUser(s) })) as unknown as Doc
      if (now.status === 'DONE') return { ok: true, message: ALREADY_DONE } as Outcome
      if (now.status === 'CANCELLED') return fail('INVALID_TRANSITION', 'This follow-up was cancelled.')
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

/** "Change due date" (there is no snooze state). */
export async function changeDueDate(s: CrmSession, input: { taskId: unknown; due: unknown; expectedUpdatedAt?: unknown }): Promise<Outcome> {
  const due = dueFrom(input.due)
  if (!due) return fail('VALIDATION', 'Choose a due date.', { fields: { due: 'Required' } })
  const target = await fresh(s, 'crm-tasks', input.taskId, input.expectedUpdatedAt)
  if ('error' in target) return target.error!
  if (['DONE', 'CANCELLED'].includes(String(target.doc.status))) return fail('INVALID_TRANSITION', 'This follow-up is finished.')
  try {
    await update(s, 'crm-tasks', target.id, { due_at: due }, input.expectedUpdatedAt)
    return { ok: true, message: 'Due date changed.' }
  } catch (err) {
    return failure(s, err)
  }
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
