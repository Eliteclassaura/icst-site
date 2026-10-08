import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * SEC-CRM-1 / SEC-CRM-1.1: every two-factor outcome is ONE conditional SQL statement, so parallel requests can neither
 * outrun the limit nor move the state backwards.
 *
 *   - `countFailure`: one wrong code. A CTE takes the row lock, computes n = failures + 1 from the CURRENT row, and in
 *     the same statement either stores n or (n >= max) resets the count and sets the lock. Nothing is read first and
 *     written later, so N parallel wrong guesses add N and the request that reaches the limit sets the lock.
 *   - `claimStep`: a code's 30-second step is taken only if it is newer than the last one used AND the user is not
 *     locked. The same statement clears the failure count and the lock (which is expired or absent by the WHERE), so a
 *     success can never wipe a lock that a concurrent 5th failure set, and the stored step never goes down.
 *   - `claimRecoveryCode`: a recovery code's hash is removed only if it is still there and the user is not locked; the
 *     same statement clears the failure count and the (expired) lock.
 *   - `addVerifiedSession`: appends this session to the verified list inside the database (no read-modify-write), and
 *     drops entries whose session is gone.
 *
 * Callers must NOT write mfa_last_step, mfa_failures or mfa_locked_until afterwards (service.ts does not): a later
 * unconditional write from a stale copy of the user is exactly what moved the state backwards.
 * Only fixed SQL with bound values; the user id is the session's own (never request input). Payload hooks do not run for
 * these counter writes (hidden fields no hook reads); every other two-factor write still goes through Payload.
 */
type Exec = { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle

export async function countFailure(payload: Payload, id: string | number, max: number, lockUntil: Date): Promise<{ failures: number; locked: boolean }> {
  const r = await db(payload).execute(sql`
    WITH cur AS (SELECT id, COALESCE(mfa_failures, 0) + 1 AS n FROM users WHERE id = ${String(id)} FOR UPDATE)
    UPDATE users u
       SET mfa_failures = CASE WHEN cur.n >= ${max} THEN 0 ELSE cur.n END,
           mfa_locked_until = CASE WHEN cur.n >= ${max} THEN ${lockUntil.toISOString()}::timestamptz ELSE u.mfa_locked_until END
      FROM cur
     WHERE u.id = cur.id
 RETURNING cur.n AS n, (cur.n >= ${max}) AS locked`)
  const row = r.rows[0]
  return { failures: Number(row?.n ?? 0), locked: row?.locked === true }
}

const notLocked = (now: Date) => sql`(mfa_locked_until IS NULL OR mfa_locked_until <= ${now.toISOString()}::timestamptz)`

/** True when this request took the step (it was newer than the last used one, and the user is not locked). */
export async function claimStep(payload: Payload, id: string | number, step: number, now: Date): Promise<boolean> {
  const r = await db(payload).execute(
    sql`UPDATE users SET mfa_last_step = ${step}, mfa_failures = 0, mfa_locked_until = NULL WHERE id = ${String(id)} AND (mfa_last_step IS NULL OR mfa_last_step < ${step}) AND ${notLocked(now)} RETURNING id`,
  )
  return r.rows.length === 1
}

/** The number of recovery codes left when this request used up `hash`, or null when it was not there (or locked). */
export async function claimRecoveryCode(payload: Payload, id: string | number, hash: string, now: Date): Promise<number | null> {
  const r = await db(payload).execute(sql`
    UPDATE users
       SET mfa_recovery = jsonb_build_object('hashes', COALESCE(
             (SELECT jsonb_agg(h) FROM jsonb_array_elements(mfa_recovery -> 'hashes') AS h WHERE h <> to_jsonb(${hash}::text)),
             '[]'::jsonb)),
           mfa_failures = 0,
           mfa_locked_until = NULL
     WHERE id = ${String(id)}
       AND (mfa_recovery -> 'hashes') @> jsonb_build_array(${hash}::text)
       AND ${notLocked(now)}
 RETURNING jsonb_array_length(mfa_recovery -> 'hashes') AS remaining`)
  return r.rows.length === 1 ? Number(r.rows[0]!.remaining) : null
}

/** Adds `sid` to the verified-session list in one statement; entries whose session no longer exists are dropped. */
export async function addVerifiedSession(payload: Payload, id: string | number, sid: string, now: Date): Promise<void> {
  await db(payload).execute(sql`
    UPDATE users
       SET mfa_sessions = COALESCE(
             (SELECT jsonb_agg(e) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(mfa_sessions) = 'array' THEN mfa_sessions ELSE '[]'::jsonb END) AS e
               WHERE e ->> 'sid' <> ${sid}
                 AND e ->> 'sid' IN (SELECT s.id FROM users_sessions s WHERE s._parent_id = users.id AND s.expires_at > ${now.toISOString()}::timestamptz)),
             '[]'::jsonb) || jsonb_build_array(jsonb_build_object('sid', ${sid}::text, 'at', ${now.toISOString()}::text))
     WHERE id = ${String(id)}`)
}
