import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { coalesceKey, identityBase, purposeNeedsRfq, type Identity } from './identity'
import { LIVE } from './transition'

/**
 * ENGINE-SCOPE-1b — the one way an enrollment is created. Idempotent under concurrent workers: the whole decision runs in
 * one transaction behind a Postgres advisory lock on the identity (`pg_advisory_xact_lock` of the identity base), the same
 * kind of lock-then-decide discipline as the status transitions (ers/transition.ts).
 *
 *   REPLAY        an enrollment with this identity and the SAME event reference exists: nothing is created (a retry, a
 *                 double click, a second worker). The existing row is returned.
 *   ACTIVE_EXISTS an enrollment with this identity is still live (running, held, failed): a new cycle cannot start yet.
 *   created       the first enrollment (cycle 1), or the next cycle: every earlier one has ended AND this is a different
 *                 event (a new quote revision, a new publication slot's event) than any earlier one.
 *   RFQ_REQUIRED  a purpose that needs an inquiry (response, quote follow-up) without one.
 * The unique `coalesce_key` (identity + cycle) is the last line of defence if two writers ever got past the lock.
 */
type Doc = Record<string, unknown>
export type CreateResult =
  | { ok: true; created: true; doc: Doc; cycle: number }
  | { ok: false; code: 'REPLAY' | 'ACTIVE_EXISTS'; existing: Doc }
  | { ok: false; code: 'RFQ_REQUIRED' }

export async function createEnrollment(
  payload: Payload,
  input: { identity: Identity; eventRef: string; data: Doc; user?: unknown },
): Promise<CreateResult> {
  const { identity: id } = input
  if (purposeNeedsRfq(id.purpose) && !input.data.rfq) return { ok: false, code: 'RFQ_REQUIRED' }
  const base = identityBase(id)
  const req = await createLocalReq({}, payload)
  if (input.user) (req as { user?: unknown }).user = input.user
  if (!(await initTransaction(req))) throw new Error('Could not start a transaction')
  try {
    const session = (payload.db as unknown as { sessions: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions[String(req.transactionID)]!
    await session.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${base}, 0))`)
    const earlier = (await payload.find({ collection: 'crm-enrollments', where: { identity_base: { equals: base } } as never, limit: 200, depth: 0, overrideAccess: true, req })).docs as unknown as Doc[]
    const same = earlier.find((e) => e.scope_event_ref === input.eventRef)
    if (same) {
      await killTransaction(req)
      return { ok: false, code: 'REPLAY', existing: same }
    }
    const live = earlier.find((e) => (LIVE as readonly string[]).includes(String(e.status)) || e.status === 'DEAD_LETTER')
    if (live) {
      await killTransaction(req)
      return { ok: false, code: 'ACTIVE_EXISTS', existing: live }
    }
    const cycle = earlier.reduce((m, e) => Math.max(m, Number(e.cycle ?? 1)), 0) + 1
    const doc = (await payload.create({
      collection: 'crm-enrollments',
      data: {
        ...input.data,
        coalesce_key: coalesceKey(id, cycle),
        identity_base: base,
        purpose: id.purpose,
        scope_kind: id.scopeKind,
        scope_ref: id.scopeRef,
        scope_event_ref: input.eventRef,
        cycle,
      } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
      ...(input.user ? { user: input.user as never } : {}),
    })) as unknown as Doc
    await commitTransaction(req)
    return { ok: true, created: true, doc, cycle }
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}
