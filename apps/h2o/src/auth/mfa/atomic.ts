import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * SEC-CRM-1: the two-factor counters as single atomic SQL statements, so parallel requests cannot outrun them.
 *
 *   - `countFailure`: one wrong code adds 1 in the database (never "snapshot + 1"); the request that reaches the
 *     limit sets the lock and resets the count. N parallel wrong guesses add N.
 *   - `claimStep`: a code's 30-second step is taken only if it is newer than the last one used AND the user is not
 *     locked — a compare-and-set, so the same valid code succeeds once even when sent twice at the same moment.
 *   - `claimRecoveryCode`: a recovery code's hash is removed only if it is still there (and the user is not locked);
 *     the request that removed it is the one that may sign in.
 *
 * Only fixed SQL with bound values; the user id is the session's own (never request input). Payload hooks do not run
 * for these counter writes (they are hidden fields no hook reads); every other two-factor write still goes through
 * Payload in service.ts.
 */
type Exec = { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle

export async function countFailure(payload: Payload, id: string | number, max: number, lockUntil: Date): Promise<{ failures: number; locked: boolean }> {
  const r = await db(payload).execute(sql`UPDATE users SET mfa_failures = COALESCE(mfa_failures, 0) + 1 WHERE id = ${String(id)} RETURNING mfa_failures`)
  const failures = Number(r.rows[0]?.mfa_failures ?? 0)
  if (failures < max) return { failures, locked: false }
  await db(payload).execute(
    sql`UPDATE users SET mfa_failures = 0, mfa_locked_until = ${lockUntil.toISOString()}::timestamptz WHERE id = ${String(id)}`,
  )
  return { failures, locked: true }
}

const notLocked = (now: Date) => sql`(mfa_locked_until IS NULL OR mfa_locked_until <= ${now.toISOString()}::timestamptz)`

/** True when this request took the step (it was newer than the last used one, and the user is not locked). */
export async function claimStep(payload: Payload, id: string | number, step: number, now: Date): Promise<boolean> {
  const r = await db(payload).execute(
    sql`UPDATE users SET mfa_last_step = ${step} WHERE id = ${String(id)} AND (mfa_last_step IS NULL OR mfa_last_step < ${step}) AND ${notLocked(now)} RETURNING id`,
  )
  return r.rows.length === 1
}

/** The number of recovery codes left when this request used up `hash`, or null when it was not there (or locked). */
export async function claimRecoveryCode(payload: Payload, id: string | number, hash: string, now: Date): Promise<number | null> {
  const r = await db(payload).execute(sql`
    UPDATE users
       SET mfa_recovery = jsonb_build_object('hashes', COALESCE(
             (SELECT jsonb_agg(h) FROM jsonb_array_elements(mfa_recovery -> 'hashes') AS h WHERE h <> to_jsonb(${hash}::text)),
             '[]'::jsonb))
     WHERE id = ${String(id)}
       AND (mfa_recovery -> 'hashes') @> jsonb_build_array(${hash}::text)
       AND ${notLocked(now)}
 RETURNING jsonb_array_length(mfa_recovery -> 'hashes') AS remaining`)
  return r.rows.length === 1 ? Number(r.rows[0]!.remaining) : null
}
