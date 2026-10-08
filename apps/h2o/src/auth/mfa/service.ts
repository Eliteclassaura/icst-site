import type { Payload } from 'payload'
import { addVerifiedSession, claimRecoveryCode, claimStep, countFailure } from './atomic'
import { writeSecurityAudit } from './audit'
import { revokeAllDevices } from './devices'
import { MFA_CLEARED } from './fields'
import { isExempt } from './eligibility'
import { decryptSecret, encryptSecret, hashRecoveryCode } from './keys'
import { verifyEmailCode } from './email-code'
import { attemptsLeft, lockMessage, wrongCodeMessage } from './ux'
import { generateRecoveryCodes, generateSecret, normaliseRecoveryCode, otpauthUri, stepAt, verifyTotp } from './totp'

/**
 * Patch L2 two-factor service. All state lives on the user (hidden fields) and is written here only, as trusted
 * server code. A session (Payload `sid`) is "verified" once its owner passed the second factor in it; the guard
 * (`guard.ts`) lets only verified sessions authenticate.
 */
export const MAX_FAILURES = 5
export const LOCK_MS = 15 * 60 * 1000
const PENDING_TTL_MS = 30 * 60 * 1000

type Doc = Record<string, unknown>
export type MfaUser = Doc & { id: string | number }
export type MfaOutcome =
  | { ok: true; recoveryCodes?: string[]; recoveryRemaining?: number }
  | { ok: false; code: 'FORMAT' | 'MISMATCH' | 'REPLAY' | 'LOCKED' | 'NOT_ENROLLED' | 'ALREADY_ENROLLED' | 'NO_PENDING'; message: string; retryAfterSeconds?: number; attemptsLeft?: number }

const sys = { overrideAccess: true as const, depth: 0, showHiddenFields: true }

export async function loadMfaUser(payload: Payload, id: string | number): Promise<MfaUser | null> {
  try {
    return (await payload.findByID({ collection: 'users', id, ...sys })) as unknown as MfaUser
  } catch {
    return null
  }
}

const liveSessionIds = (u: Doc): Set<string> => {
  const now = Date.now()
  return new Set(
    ((u.sessions ?? []) as Doc[])
      .filter((s) => !s.expiresAt || new Date(String(s.expiresAt)).getTime() > now)
      .map((s) => String(s.id)),
  )
}
const verifiedSids = (u: Doc): string[] => (Array.isArray(u.mfa_sessions) ? (u.mfa_sessions as Doc[]).map((s) => String(s.sid)) : [])

/** True when the user has two-factor on AND passed it in this session (which must still be live). */
export function isSessionVerified(u: Doc, sid: string | undefined | null): boolean {
  if (!sid) return false
  // MFA-ADMIN-1: an admin-exempted non-admin passes with a live session (isExempt re-checks the roles: never an admin).
  if (isExempt(u)) return liveSessionIds(u).has(sid)
  if (u.mfa_enabled !== true) return false
  return verifiedSids(u).includes(sid) && liveSessionIds(u).has(sid)
}

async function save(payload: Payload, id: string | number, data: Doc) {
  await payload.update({ collection: 'users', id, data: data as never, ...sys, context: { mfaService: true } })
}

function locked(u: Doc, now: Date): number | null {
  const until = u.mfa_locked_until ? new Date(String(u.mfa_locked_until)).getTime() : 0
  return until > now.getTime() ? Math.ceil((until - now.getTime()) / 1000) : null
}

/** Enrolment step 1: a pending secret (reused for 30 minutes so a reload shows the same key). */
export async function beginEnrolment(payload: Payload, u: MfaUser, now = new Date()): Promise<{ secret: string; uri: string } | { error: 'ALREADY_ENROLLED' }> {
  if (u.mfa_enabled === true) return { error: 'ALREADY_ENROLLED' }
  const pendingAt = u.mfa_pending_at ? new Date(String(u.mfa_pending_at)).getTime() : 0
  let secret = now.getTime() - pendingAt < PENDING_TTL_MS ? decryptSecret(u.mfa_pending_secret) : null
  if (!secret) {
    secret = generateSecret()
    await save(payload, u.id, { mfa_pending_secret: encryptSecret(secret), mfa_pending_at: now.toISOString() })
  }
  return { secret, uri: otpauthUri(secret, String(u.email ?? `user-${String(u.id).slice(0, 8)}`)) }
}

async function failure(payload: Payload, u: MfaUser, now: Date, code: 'FORMAT' | 'MISMATCH' | 'REPLAY'): Promise<MfaOutcome> {
  // SEC-CRM-1: counted in the database (atomic), so parallel wrong guesses each count.
  const { failures, locked: lock } = await countFailure(payload, u.id, MAX_FAILURES, new Date(now.getTime() + LOCK_MS))
  await writeSecurityAudit(payload, { action: lock ? 'mfa-locked' : 'mfa-failed', userId: String(u.id), actorId: String(u.id), detail: { reason: code, failures } })
  if (lock) return { ok: false, code: 'LOCKED', message: lockMessage(LOCK_MS / 1000), retryAfterSeconds: LOCK_MS / 1000 }
  // MFA-UX-1: say how many tries are left once the lock is close.
  const left = attemptsLeft(failures, MAX_FAILURES)
  return { ok: false, code, message: wrongCodeMessage(code, left, LOCK_MS / 60_000), attemptsLeft: left }
}

/** SEC-CRM-1: a code that passed the check but lost the atomic claim — the user got locked meanwhile, or another
 * request used the same code first (a replay). */
async function lostClaim(payload: Payload, u: MfaUser, now: Date): Promise<MfaOutcome> {
  const fresh = await loadMfaUser(payload, u.id)
  const wait = fresh ? locked(fresh, now) : null
  if (wait) return { ok: false, code: 'LOCKED', message: lockMessage(wait), retryAfterSeconds: wait }
  return failure(payload, u, now, 'REPLAY')
}

/** Enrolment step 2: the first code from the app proves the setup; returns the recovery codes (shown once). */
export async function confirmEnrolment(payload: Payload, u: MfaUser, sid: string, code: string, now = new Date()): Promise<MfaOutcome> {
  if (u.mfa_enabled === true) return { ok: false, code: 'ALREADY_ENROLLED', message: 'Two-factor is already set up.' }
  const wait = locked(u, now)
  if (wait) return { ok: false, code: 'LOCKED', message: lockMessage(wait), retryAfterSeconds: wait }
  const secret = decryptSecret(u.mfa_pending_secret)
  if (!secret) return { ok: false, code: 'NO_PENDING', message: 'The setup expired. Start again.' }
  const check = verifyTotp(secret, code, now, null)
  if (!check.ok) return failure(payload, u, now, check.reason)
  if (!(await claimStep(payload, u.id, check.step, now))) return lostClaim(payload, u, now)
  const codes = generateRecoveryCodes()
  await save(payload, u.id, {
    mfa_enabled: true,
    mfa_enrolled_at: now.toISOString(),
    mfa_secret: encryptSecret(secret),
    mfa_pending_secret: null,
    mfa_pending_at: null,
    mfa_recovery: { hashes: codes.map(hashRecoveryCode) },
  })
  await addVerifiedSession(payload, u.id, sid, now)
  await writeSecurityAudit(payload, { action: 'mfa-enrolled', userId: String(u.id), actorId: String(u.id), detail: { recoveryCodes: codes.length } })
  return { ok: true, recoveryCodes: codes }
}

/** Sign-in second factor: a 6-digit code from the app, or one recovery code (used up). */
export async function verifySecondFactor(payload: Payload, u: MfaUser, sid: string, code: string, now = new Date()): Promise<MfaOutcome> {
  if (u.mfa_enabled !== true) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor is not set up yet.' }
  const wait = locked(u, now)
  if (wait) return { ok: false, code: 'LOCKED', message: lockMessage(wait), retryAfterSeconds: wait }
  // Six digits is an app code; anything else is tried as a recovery code.
  const recovery = /^\d{6}$/.test(code.replace(/\s/g, '')) ? null : normaliseRecoveryCode(code)
  if (recovery) {
    // SEC-CRM-1: removed atomically; only the request that removed it signs in (a code works exactly once).
    const remaining = await claimRecoveryCode(payload, u.id, hashRecoveryCode(recovery), now)
    if (remaining === null) {
      const fresh = await loadMfaUser(payload, u.id)
      const lockWait = fresh ? locked(fresh, now) : null
      if (lockWait) return { ok: false, code: 'LOCKED', message: lockMessage(lockWait), retryAfterSeconds: lockWait }
      return failure(payload, u, now, 'MISMATCH')
    }
    await addVerifiedSession(payload, u.id, sid, now)
    await writeSecurityAudit(payload, { action: 'mfa-recovery-used', userId: String(u.id), actorId: String(u.id), detail: { recoveryRemaining: remaining } })
    return { ok: true, recoveryRemaining: remaining }
  }
  const secret = decryptSecret(u.mfa_secret)
  if (!secret) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor needs to be set up again. Ask an admin to reset it.' }
  const lastStep = typeof u.mfa_last_step === 'number' ? u.mfa_last_step : null
  const check = verifyTotp(secret, code, now, lastStep)
  if (!check.ok) return failure(payload, u, now, check.reason)
  if (!(await claimStep(payload, u.id, check.step, now))) return lostClaim(payload, u, now)
  await addVerifiedSession(payload, u.id, sid, now)
  await writeSecurityAudit(payload, { action: 'mfa-verified', userId: String(u.id), actorId: String(u.id) })
  return { ok: true }
}

/**
 * MFA-2: sign-in with a code sent by email (non-admin users who already have two-factor set up; admins are refused in
 * `verifyEmailCode`). Shares the sign-in lock and the 5-try counter with the app code. A passed code verifies the
 * session exactly as an app code does; it never counts as step-up (`confirmStepUp` takes only a fresh app code).
 */
export async function verifySecondFactorByEmail(payload: Payload, u: MfaUser, sid: string, code: string, now = new Date()): Promise<MfaOutcome> {
  if (u.mfa_enabled !== true) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor is not set up yet.' }
  const wait = locked(u, now)
  if (wait) return { ok: false, code: 'LOCKED', message: lockMessage(wait), retryAfterSeconds: wait }
  const r = await verifyEmailCode(payload, u as never, code, { sid, now })
  if (!r.ok) {
    if (r.reason === 'INELIGIBLE') return { ok: false, code: 'MISMATCH', message: 'Email codes are not available for this account. Use your authenticator app.' }
    if (r.reason === 'LOCKED') return { ok: false, code: 'LOCKED', message: lockMessage(r.retryAfterSeconds ?? LOCK_MS / 1000), retryAfterSeconds: r.retryAfterSeconds }
    await writeSecurityAudit(payload, { action: 'mfa-failed', userId: String(u.id), actorId: String(u.id), detail: { reason: 'EMAIL_CODE', failures: MAX_FAILURES - (r.attemptsLeft ?? 0) } })
    const left = r.attemptsLeft ?? MAX_FAILURES
    return { ok: false, code: 'MISMATCH', message: `That code is not right, or it has expired. Check the latest email, or send a new code.${left <= 3 ? ` ${left} ${left === 1 ? 'try' : 'tries'} left before a ${LOCK_MS / 60_000}-minute pause.` : ''}`, attemptsLeft: left }
  }
  await addVerifiedSession(payload, u.id, sid, now)
  await writeSecurityAudit(payload, { action: 'mfa-email-verified', userId: String(u.id), actorId: String(u.id) })
  return { ok: true }
}

/** MFA-2: a remembered device (checked by the caller with `isRememberedDevice`) verifies this session. Sign-in only. */
export async function verifySessionByDevice(payload: Payload, u: MfaUser, sid: string, now = new Date()): Promise<void> {
  await addVerifiedSession(payload, u.id, sid, now)
  await writeSecurityAudit(payload, { action: 'mfa-device-used', userId: String(u.id), actorId: String(u.id) })
}

/**
 * Patch C step-up: sensitive settings (sending profiles) need a fresh app code, entered in this session within the
 * last 5 minutes. App codes only — a recovery code is for a lost phone, not for confirming a change. Wrong codes count
 * towards the same lock-out as sign-in; a code is never accepted twice (`mfa_last_step`).
 */
export const STEP_UP_MS = 5 * 60 * 1000

export function stepUpSecondsLeft(u: Doc, sid: string | null | undefined, now = new Date()): number {
  const s = u.mfa_stepup as { sid?: unknown; at?: unknown } | null | undefined
  if (!sid || !s || s.sid !== sid || typeof s.at !== 'string') return 0
  const left = new Date(s.at).getTime() + STEP_UP_MS - now.getTime()
  return left > 0 && left <= STEP_UP_MS ? Math.ceil(left / 1000) : 0
}

export async function confirmStepUp(payload: Payload, u: MfaUser, sid: string, code: string, now = new Date()): Promise<MfaOutcome> {
  if (u.mfa_enabled !== true) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor is not set up yet.' }
  const wait = locked(u, now)
  if (wait) return { ok: false, code: 'LOCKED', message: lockMessage(wait), retryAfterSeconds: wait }
  if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return { ok: false, code: 'FORMAT', message: 'Enter the 6-digit code from your authenticator app.' }
  const secret = decryptSecret(u.mfa_secret)
  if (!secret) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor needs to be set up again. Ask an admin to reset it.' }
  const lastStep = typeof u.mfa_last_step === 'number' ? u.mfa_last_step : null
  const check = verifyTotp(secret, code, now, lastStep)
  if (!check.ok) return failure(payload, u, now, check.reason)
  if (!(await claimStep(payload, u.id, check.step, now))) return lostClaim(payload, u, now)
  await save(payload, u.id, { mfa_stepup: { sid, at: now.toISOString() } })
  await writeSecurityAudit(payload, { action: 'mfa-stepup', userId: String(u.id), actorId: String(u.id) })
  return { ok: true }
}

/** Break-glass and admin reset share this: clear the enrolment (the user enrols again at next sign-in). */
export async function clearMfa(payload: Payload, userId: string | number, by: 'admin' | 'break-glass', actorId: string | null): Promise<void> {
  await save(payload, userId, { ...MFA_CLEARED })
  await revokeAllDevices(payload, userId)
  await writeSecurityAudit(payload, { action: 'mfa-reset', userId: String(userId), actorId, detail: { by } })
}

/** Rehearsal seeding only (see ops/mfa): enrol with a given secret, no session verified, no recovery codes. */
export async function enrolWithSecret(payload: Payload, userId: string | number, secret: string, now = new Date()): Promise<void> {
  await save(payload, userId, { ...MFA_CLEARED, mfa_enabled: true, mfa_enrolled_at: now.toISOString(), mfa_secret: encryptSecret(secret), mfa_recovery: { hashes: [] }, mfa_last_step: stepAt(now) - 2 })
  await writeSecurityAudit(payload, { action: 'mfa-enrolled', userId: String(userId), actorId: null, detail: { by: 'rehearsal-seed' } })
}
