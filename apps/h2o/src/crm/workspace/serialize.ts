import { commitTransaction, createLocalReq, initTransaction, killTransaction, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import type { CrmSession } from './session'

/**
 * Row-serialized workspace transitions (UI-1 concurrency).
 *
 * Some transitions must happen at most once even when a user double-clicks or two people act together —
 * completing or reopening a follow-up is the case UI-1 has. The transition runs inside one Payload
 * transaction that first takes `SELECT … FOR UPDATE` on the target row, so a second caller waits, then
 * re-reads the committed state and sees the transition already made. Everything after the lock goes
 * through the Payload Local API **as the user** (`overrideAccess: false`) with the same `req`, so access
 * control and every CRM-1 hook still run, inside the same transaction.
 *
 * The only raw SQL is the lock itself, on a table name from the fixed allowlist below (never user input).
 */
const LOCKABLE = { 'crm-tasks': 'crm_tasks', 'crm-rfqs': 'crm_rfqs' } as const
type Lockable = keyof typeof LOCKABLE

type Exec = { execute: (q: unknown) => Promise<unknown> }

export async function withRowLock<T>(
  s: CrmSession,
  collection: Lockable,
  id: string,
  fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const req = await createLocalReq({ user: s.user as never }, s.payload)
  const owns = await initTransaction(req)
  try {
    const txId = await req.transactionID
    const sessions = (s.payload.db as unknown as { sessions?: Record<string, { db: Exec }> }).sessions
    const tx = txId !== undefined ? sessions?.[String(txId)]?.db : undefined
    if (!tx) throw new Error('Row lock requires a database transaction.')
    const table = LOCKABLE[collection]
    await tx.execute(sql`SELECT "id" FROM ${sql.identifier(table)} WHERE "id" = ${id} FOR UPDATE`)
    const out = await fn(req)
    if (owns) await commitTransaction(req)
    return out
  } catch (err) {
    if (owns) await killTransaction(req)
    throw err
  }
}
