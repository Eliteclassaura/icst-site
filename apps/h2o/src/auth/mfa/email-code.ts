import { createHmac, randomInt } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { countFailure } from './atomic'
import { emailCodeEligible } from './eligibility'
import { mfaKey } from './keys'

/**
 * MFA-2: email one-time codes (non-admin users who already have two-factor on).
 *
 *   - 6 digits, single use, 10-minute expiry, stored as an HMAC digest.
 *   - The challenge is bound to the user, the login attempt (the password-only session id) and the purpose: the
 *     digest covers all three and the row stores the session id and purpose, so a code can only be used by the
 *     session it was sent to, and only to sign in.
 *   - A resend retires the older code and does NOT touch the failure count (the lock follows the person, not the code).
 *   - Wrong codes count on the same 5-try / 15-minute counter as the app code (`countFailure`).
 *   - Sends: at most 3 per 15 minutes and one per 30 seconds per user, decided in one SQL statement on the user row.
 */
export const CODE_TTL_MS = 10 * 60_000
export const SEND_LIMIT = 3
export const SEND_WINDOW_MS = 15 * 60_000
export const RESEND_COOLDOWN_MS = 30_000
export const MAX_FAILURES = 5
export const LOCK_MS = 15 * 60_000
export type Purpose = 'signin'

type Exec = { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle
type U = { id: string | number; roles?: unknown; role?: unknown }

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Bound to the user, the login attempt and the purpose, so a digest can never match anywhere else. */
export function hashCode(userId: string | number, sid: string, purpose: Purpose, code: string): string {
  return createHmac('sha256', mfaKey('email-code')).update(`${String(userId)}:${sid}:${purpose}:${code.replace(/\s/g, '')}`).digest('hex')
}

export type SendOutcome =
  | { ok: true; code: string; expiresAt: Date; cooldownSeconds: number }
  | { ok: false; reason: 'INELIGIBLE' | 'RATE_LIMITED' | 'COOLDOWN' | 'LOCKED'; retryAfterSeconds?: number }

const secondsUntil = (to: unknown, now: Date) => Math.max(1, Math.ceil((new Date(String(to)).getTime() - now.getTime()) / 1000))

/**
 * Takes one send from the user's budget (one atomic UPDATE: the row lock makes parallel requests count one by one),
 * retires older unused codes, stores the new digest for this login attempt. Returns the plain code for the caller to
 * email; never logs it.
 */
export async function issueEmailCode(payload: Payload, u: U, ctx: { sid: string; purpose?: Purpose; now?: Date }): Promise<SendOutcome> {
  if (!emailCodeEligible(u)) return { ok: false, reason: 'INELIGIBLE' }
  const now = ctx.now ?? new Date()
  const purpose: Purpose = ctx.purpose ?? 'signin'
  const id = String(u.id)
  const nowIso = now.toISOString()
  const row = (await db(payload).execute(sql`SELECT mfa_locked_until FROM users WHERE id = ${id}`)).rows[0]
  if (row?.mfa_locked_until && new Date(String(row.mfa_locked_until)) > now) return { ok: false, reason: 'LOCKED', retryAfterSeconds: secondsUntil(row.mfa_locked_until, now) }
  const windowStart = new Date(now.getTime() - SEND_WINDOW_MS).toISOString()
  const coolStart = new Date(now.getTime() - RESEND_COOLDOWN_MS).toISOString()
  const code = generateCode()
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS)
  // ONE statement: take a send from the budget (user row lock), retire the older codes, store the new digest. The
  // two inserts/updates run only if the budget update took a row, so a refused request changes nothing.
  const r = await db(payload).execute(sql`
    WITH bud AS (
      UPDATE users
         SET mfa_email_sends = CASE WHEN mfa_email_window_start IS NULL OR mfa_email_window_start <= ${windowStart}::timestamptz THEN 1 ELSE COALESCE(mfa_email_sends, 0) + 1 END,
             mfa_email_window_start = CASE WHEN mfa_email_window_start IS NULL OR mfa_email_window_start <= ${windowStart}::timestamptz THEN ${nowIso}::timestamptz ELSE mfa_email_window_start END,
             mfa_email_last_sent = ${nowIso}::timestamptz
       WHERE id = ${id}
         AND (mfa_locked_until IS NULL OR mfa_locked_until <= ${nowIso}::timestamptz)
         AND (mfa_email_last_sent IS NULL OR mfa_email_last_sent <= ${coolStart}::timestamptz)
         AND (mfa_email_window_start IS NULL OR mfa_email_window_start <= ${windowStart}::timestamptz OR COALESCE(mfa_email_sends, 0) < ${SEND_LIMIT})
   RETURNING id),
    ret AS (
      UPDATE mfa_email_codes SET used_at = ${nowIso}::timestamptz
       WHERE user_id = ${id} AND used_at IS NULL AND EXISTS (SELECT 1 FROM bud)
   RETURNING id),
    ins AS (
      INSERT INTO mfa_email_codes (user_id, sid, purpose, code_hash, expires_at, created_at)
      SELECT ${id}, ${ctx.sid}, ${purpose}, ${hashCode(id, ctx.sid, purpose, code)}, ${expiresAt.toISOString()}::timestamptz, ${nowIso}::timestamptz
       WHERE EXISTS (SELECT 1 FROM bud)
   RETURNING id)
    SELECT (SELECT count(*) FROM bud)::int AS took, (SELECT count(*) FROM ins)::int AS stored`)
  if (Number(r.rows[0]?.took ?? 0) !== 1 || Number(r.rows[0]?.stored ?? 0) !== 1) {
    // Which rule said no (read after the fact; the decision itself was atomic).
    const cur = (await db(payload).execute(sql`SELECT mfa_locked_until, mfa_email_last_sent, mfa_email_window_start, COALESCE(mfa_email_sends, 0) AS sends FROM users WHERE id = ${id}`)).rows[0]
    if (cur?.mfa_locked_until && new Date(String(cur.mfa_locked_until)) > now) return { ok: false, reason: 'LOCKED', retryAfterSeconds: secondsUntil(cur.mfa_locked_until, now) }
    const lastSent = cur?.mfa_email_last_sent ? new Date(String(cur.mfa_email_last_sent)) : null
    const winStart = cur?.mfa_email_window_start ? new Date(String(cur.mfa_email_window_start)) : null
    if (winStart && winStart > new Date(windowStart) && Number(cur?.sends ?? 0) >= SEND_LIMIT)
      return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: secondsUntil(new Date(winStart.getTime() + SEND_WINDOW_MS), now) }
    return { ok: false, reason: 'COOLDOWN', retryAfterSeconds: lastSent ? secondsUntil(new Date(lastSent.getTime() + RESEND_COOLDOWN_MS), now) : Math.ceil(RESEND_COOLDOWN_MS / 1000) }
  }
  void purgeMfaRows(payload, now).catch(() => undefined) // housekeeping, never in the way of a sign-in
  return { ok: true, code, expiresAt, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 }
}

/**
 * Housekeeping: expired or used code rows older than a day, devices that expired a week ago or were revoked a month
 * ago, and rows whose user no longer exists (the tables key users by text, with no foreign key). Cheap and idempotent;
 * also run when a user is deleted (fields.ts) and opportunistically after a send.
 */
export async function purgeMfaRows(payload: Payload, now = new Date()): Promise<{ codes: number; devices: number }> {
  const day = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const week = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()
  const month = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString()
  const c = await db(payload).execute(sql`DELETE FROM mfa_email_codes WHERE expires_at < ${day}::timestamptz OR used_at < ${day}::timestamptz OR user_id NOT IN (SELECT id::text FROM users) RETURNING id`)
  const d = await db(payload).execute(sql`DELETE FROM mfa_trusted_devices WHERE expires_at < ${week}::timestamptz OR revoked_at < ${month}::timestamptz OR user_id NOT IN (SELECT id::text FROM users) RETURNING id`)
  return { codes: c.rows.length, devices: d.rows.length }
}

/** All rows of one user (called when the user is deleted). */
export async function purgeUserMfaRows(payload: Payload, userId: string | number): Promise<void> {
  await db(payload).execute(sql`DELETE FROM mfa_email_codes WHERE user_id = ${String(userId)}`)
  await db(payload).execute(sql`DELETE FROM mfa_trusted_devices WHERE user_id = ${String(userId)}`)
}

export type VerifyOutcome = { ok: true } | { ok: false; reason: 'INELIGIBLE' | 'LOCKED' | 'MISMATCH'; attemptsLeft?: number; retryAfterSeconds?: number }

/**
 * One atomic statement claims the code: it must match this user, this login attempt and this purpose, be unused and
 * unexpired, and the user must not be locked; the same statement clears the failure count. A wrong or stale code counts
 * against the same 5-try / 15-minute counter as the app code (`countFailure`).
 */
export async function verifyEmailCode(payload: Payload, u: U, code: string, ctx: { sid: string; purpose?: Purpose; now?: Date }): Promise<VerifyOutcome> {
  if (!emailCodeEligible(u)) return { ok: false, reason: 'INELIGIBLE' }
  const now = ctx.now ?? new Date()
  const purpose: Purpose = ctx.purpose ?? 'signin'
  const id = String(u.id)
  const clean = code.replace(/\s/g, '')
  const nowIso = now.toISOString()
  // ONE statement: lock the user row (not locked), claim the code for this user + login attempt + purpose, and reset the
  // failure count only if the claim took a row. A wrong code changes nothing here (it is counted below).
  const claimed = /^\d{6}$/.test(clean)
    ? (
        await db(payload).execute(sql`
          WITH u AS (
            SELECT id FROM users WHERE id = ${id} AND (mfa_locked_until IS NULL OR mfa_locked_until <= ${nowIso}::timestamptz) FOR UPDATE),
          ok AS (
            UPDATE mfa_email_codes c SET used_at = ${nowIso}::timestamptz
              FROM u
             WHERE c.user_id = u.id::text AND c.sid = ${ctx.sid} AND c.purpose = ${purpose} AND c.code_hash = ${hashCode(id, ctx.sid, purpose, clean)}
               AND c.used_at IS NULL AND c.expires_at > ${nowIso}::timestamptz
         RETURNING c.id)
          UPDATE users SET mfa_failures = 0, mfa_locked_until = NULL WHERE id IN (SELECT id FROM u) AND EXISTS (SELECT 1 FROM ok)
      RETURNING id`)
      ).rows.length === 1
    : false
  if (claimed) return { ok: true }
  const lock = await db(payload).execute(sql`SELECT mfa_locked_until FROM users WHERE id = ${id}`)
  const until = lock.rows[0]?.mfa_locked_until
  if (until && new Date(String(until)) > now) return { ok: false, reason: 'LOCKED', retryAfterSeconds: secondsUntil(until, now) }
  const f = await countFailure(payload, id, MAX_FAILURES, new Date(now.getTime() + LOCK_MS))
  if (f.locked) return { ok: false, reason: 'LOCKED', retryAfterSeconds: LOCK_MS / 1000 }
  return { ok: false, reason: 'MISMATCH', attemptsLeft: MAX_FAILURES - f.failures }
}
