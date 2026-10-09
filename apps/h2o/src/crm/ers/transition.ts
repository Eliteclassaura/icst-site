import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'

/**
 * ENGINE-SCOPE-1a (Auditor F1, conditions R1–R5) — the ONLY way an enrollment's status changes.
 *
 * The race: the engine reads due enrollments, then writes from that snapshot. A person's Pause or Stop in between was
 * overwritten and the email was queued. Here every writer runs in ONE transaction that first takes the row lock
 * (`SELECT … FOR UPDATE`), reads the status FROM THAT LOCKED READ (never the caller's snapshot), checks the transition is
 * legal and expected, does its side effects (the outbox row, the task, the reply token) with the same request so they
 * commit or roll back together with the status, and then writes the status with the same request (hooks and the audit
 * row still run, naming the actor). A loser of a race gets `LOST_RACE` and writes nothing.
 *
 * Guarantee (R5): no step STARTS after a Pause or Stop has committed. A Pause cannot act on an AWAITING_SEND enrollment at
 * all (it says the email is being sent); the residual window is a STOP (or a suppression) that commits in the
 * milliseconds between the outbox's send-time admission and the mail hand-off, which may still let that one email go.
 * The admission check (Layer C, CRM's `ers-admission.ts`) stays and refuses a queued row whose enrollment is no longer AWAITING_SEND.
 *
 * Lock order (R3): only the one enrollment row is locked, one enrollment per transaction. Bulk callers
 * (`exitForAddress`) loop and take one lock per transaction, in ascending id order. Nothing else is held while waiting.
 * The reply token is NOT made inside this transaction (Auditor N1): the staff reply path locks RFQ then token, so the
 * engine does the same in its own earlier transaction (`withRfqLock`) and never takes RFQ/token while holding an enrollment.
 * The lock is FOR NO KEY UPDATE (N4): it serializes status writers but does not block the key-share that child rows
 * (outbox rows that reference the enrollment) take.
 * Isolation (R4): the adapter default, READ COMMITTED; `isolationLevel()` reports it and a test pins it.
 *
 * Writes to `crm-enrollments` outside this file are forbidden (a source-scan test fails on any).
 */
type Doc = Record<string, unknown>
export type EnrollmentStatus = 'ACTIVE' | 'AWAITING_SEND' | 'PAUSED' | 'COMPLETED' | 'EXITED' | 'DEAD_LETTER'

/** What may follow what. EXITED and COMPLETED are immovable. A DEAD_LETTER enrollment moves only by an admin. */
export const LEGAL: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  ACTIVE: ['ACTIVE', 'AWAITING_SEND', 'PAUSED', 'COMPLETED', 'EXITED', 'DEAD_LETTER'],
  AWAITING_SEND: ['ACTIVE', 'PAUSED', 'EXITED', 'DEAD_LETTER'],
  PAUSED: ['ACTIVE', 'EXITED'],
  DEAD_LETTER: ['ACTIVE', 'EXITED'],
  COMPLETED: [],
  EXITED: [],
}
export const LIVE: readonly EnrollmentStatus[] = ['ACTIVE', 'AWAITING_SEND', 'PAUSED']

export type TxCtx = { req: PayloadRequest; locked: Doc }
export type TransitionSpec = {
  /** The statuses the caller expects to find under the lock. Anything else is LOST_RACE. */
  from: readonly EnrollmentStatus[]
  to: EnrollmentStatus
  data: Doc | ((locked: Doc) => Doc)
  user?: unknown
  /** DEAD_LETTER enrollments move only when an admin asks. */
  byAdmin?: boolean
  /** An extra check on the locked row (for example "still on the step I rendered"). False = LOST_RACE. */
  guard?: (locked: Doc) => boolean
  /** Side effects that must commit or roll back with the status (outbox row, task, token). Uses `tx.req`. */
  work?: (tx: TxCtx) => Promise<void>
}
export type TransitionResult =
  | { ok: true; doc: Doc; from: EnrollmentStatus }
  | { ok: false; code: 'LOST_RACE' | 'ILLEGAL' | 'NOT_ADMIN' | 'NOT_FOUND'; status: string | null }

type Session = { db: { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> } }
const sessionOf = (payload: Payload, req: PayloadRequest): Session['db'] => {
  const sessions = (payload.db as unknown as { sessions: Record<string, Session> }).sessions
  const s = sessions[String(req.transactionID)]
  if (!s) throw new Error('No transaction')
  return s.db
}

export async function transition(payload: Payload, id: unknown, spec: TransitionSpec): Promise<TransitionResult> {
  const req = await createLocalReq({}, payload)
  if (spec.user) (req as { user?: unknown }).user = spec.user
  if (!(await initTransaction(req))) throw new Error('Could not start a transaction')
  try {
    const rows = (await sessionOf(payload, req).execute(sql`SELECT status FROM crm_enrollments WHERE id = ${String(id)} FOR NO KEY UPDATE`)).rows
    if (!rows[0]) {
      await killTransaction(req)
      return { ok: false, code: 'NOT_FOUND', status: null }
    }
    const status = String(rows[0].status) as EnrollmentStatus
    const locked = (await payload.findByID({ collection: 'crm-enrollments', id: String(id), depth: 0, overrideAccess: true, req })) as unknown as Doc
    const refuse = async (code: 'LOST_RACE' | 'ILLEGAL' | 'NOT_ADMIN'): Promise<TransitionResult> => {
      await killTransaction(req)
      return { ok: false, code, status }
    }
    if (!spec.from.includes(status)) return refuse('LOST_RACE')
    if (spec.guard && !spec.guard(locked)) return refuse('LOST_RACE')
    if (!(LEGAL[status] ?? []).includes(spec.to)) return refuse('ILLEGAL')
    if (status === 'DEAD_LETTER' && !spec.byAdmin) return refuse('NOT_ADMIN')
    if (spec.work) await spec.work({ req, locked })
    const data = typeof spec.data === 'function' ? spec.data(locked) : spec.data
    const doc = (await payload.update({
      collection: 'crm-enrollments',
      id: String(id),
      data: data as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
      ...(spec.user ? { user: spec.user as never } : {}),
    })) as unknown as Doc
    await commitTransaction(req)
    return { ok: true, doc, from: status }
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}

/** N1: run `fn` in its own short transaction holding the RFQ row lock (the staff reply path's order: RFQ, then token). */
export async function withRfqLock<T>(payload: Payload, rfqId: string, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  if (!(await initTransaction(req))) throw new Error('Could not start a transaction')
  try {
    await sessionOf(payload, req).execute(sql`SELECT id FROM crm_rfqs WHERE id = ${rfqId} FOR UPDATE`)
    const out = await fn(req)
    await commitTransaction(req)
    return out
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}

/** Hold a transaction-scoped advisory lock on a name (released at commit or rollback). For "check a bound, then insert" decisions. */
export async function advisoryLock(payload: Payload, req: PayloadRequest, name: string): Promise<void> {
  await sessionOf(payload, req).execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))`)
}

/** R4: the isolation level a transaction on this adapter really runs at. The F1 test pins "read committed". */
export async function isolationLevel(payload: Payload): Promise<string> {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    const r = await sessionOf(payload, req).execute(sql`SHOW transaction_isolation`)
    return String(Object.values(r.rows[0] ?? {})[0] ?? '')
  } finally {
    await killTransaction(req)
  }
}
