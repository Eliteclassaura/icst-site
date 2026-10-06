import type { Payload } from 'payload'
import { writeSecurityAudit } from './audit'
import { MFA_CLEARED } from './fields'
import { decryptSecret, encryptSecret, hashRecoveryCode } from './keys'
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
  | { ok: false; code: 'FORMAT' | 'MISMATCH' | 'REPLAY' | 'LOCKED' | 'NOT_ENROLLED' | 'ALREADY_ENROLLED' | 'NO_PENDING'; message: string; retryAfterSeconds?: number }

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
  if (!sid || u.mfa_enabled !== true) return false
  return verifiedSids(u).includes(sid) && liveSessionIds(u).has(sid)
}

async function save(payload: Payload, id: string | number, data: Doc) {
  await payload.update({ collection: 'users', id, data: data as never, ...sys, context: { mfaService: true } })
}

/** The verified-session list with this sid added; dead sessions dropped, so the list never grows without bound. */
const withSession = (u: Doc, sid: string) => {
  const live = liveSessionIds(u)
  const kept = ((Array.isArray(u.mfa_sessions) ? u.mfa_sessions : []) as Doc[]).filter((s) => live.has(String(s.sid)) && String(s.sid) !== sid)
  return [...kept, { sid, at: new Date().toISOString() }]
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
  const failures = Number(u.mfa_failures ?? 0) + 1
  const lock = failures >= MAX_FAILURES
  await save(payload, u.id, { mfa_failures: lock ? 0 : failures, mfa_locked_until: lock ? new Date(now.getTime() + LOCK_MS).toISOString() : null })
  await writeSecurityAudit(payload, { action: lock ? 'mfa-locked' : 'mfa-failed', userId: String(u.id), actorId: String(u.id), detail: { reason: code, failures } })
  if (lock) return { ok: false, code: 'LOCKED', message: 'Too many wrong codes. Try again in 15 minutes.', retryAfterSeconds: LOCK_MS / 1000 }
  return { ok: false, code, message: code === 'REPLAY' ? 'That code was already used. Wait for the next one.' : 'That code is not right. Check the time on your phone and try again.' }
}

/** Enrolment step 2: the first code from the app proves the setup; returns the recovery codes (shown once). */
export async function confirmEnrolment(payload: Payload, u: MfaUser, sid: string, code: string, now = new Date()): Promise<MfaOutcome> {
  if (u.mfa_enabled === true) return { ok: false, code: 'ALREADY_ENROLLED', message: 'Two-factor is already set up.' }
  const wait = locked(u, now)
  if (wait) return { ok: false, code: 'LOCKED', message: 'Too many wrong codes. Try again later.', retryAfterSeconds: wait }
  const secret = decryptSecret(u.mfa_pending_secret)
  if (!secret) return { ok: false, code: 'NO_PENDING', message: 'The setup expired. Start again.' }
  const check = verifyTotp(secret, code, now, null)
  if (!check.ok) return failure(payload, u, now, check.reason)
  const codes = generateRecoveryCodes()
  await save(payload, u.id, {
    mfa_enabled: true,
    mfa_enrolled_at: now.toISOString(),
    mfa_secret: encryptSecret(secret),
    mfa_pending_secret: null,
    mfa_pending_at: null,
    mfa_recovery: { hashes: codes.map(hashRecoveryCode) },
    mfa_last_step: check.step,
    mfa_sessions: withSession(u, sid),
    mfa_failures: 0,
    mfa_locked_until: null,
  })
  await writeSecurityAudit(payload, { action: 'mfa-enrolled', userId: String(u.id), actorId: String(u.id), detail: { recoveryCodes: codes.length } })
  return { ok: true, recoveryCodes: codes }
}

/** Sign-in second factor: a 6-digit code from the app, or one recovery code (used up). */
export async function verifySecondFactor(payload: Payload, u: MfaUser, sid: string, code: string, now = new Date()): Promise<MfaOutcome> {
  if (u.mfa_enabled !== true) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor is not set up yet.' }
  const wait = locked(u, now)
  if (wait) return { ok: false, code: 'LOCKED', message: 'Too many wrong codes. Try again later.', retryAfterSeconds: wait }
  // Six digits is an app code; anything else is tried as a recovery code.
  const recovery = /^\d{6}$/.test(code.replace(/\s/g, '')) ? null : normaliseRecoveryCode(code)
  if (recovery) {
    const hashes = (((u.mfa_recovery as Doc | null)?.hashes ?? []) as string[]).slice()
    const i = hashes.indexOf(hashRecoveryCode(recovery))
    if (i < 0) return failure(payload, u, now, 'MISMATCH')
    hashes.splice(i, 1)
    await save(payload, u.id, { mfa_recovery: { hashes }, mfa_sessions: withSession(u, sid), mfa_failures: 0, mfa_locked_until: null })
    await writeSecurityAudit(payload, { action: 'mfa-recovery-used', userId: String(u.id), actorId: String(u.id), detail: { recoveryRemaining: hashes.length } })
    return { ok: true, recoveryRemaining: hashes.length }
  }
  const secret = decryptSecret(u.mfa_secret)
  if (!secret) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor needs to be set up again. Ask an admin to reset it.' }
  const lastStep = typeof u.mfa_last_step === 'number' ? u.mfa_last_step : null
  const check = verifyTotp(secret, code, now, lastStep)
  if (!check.ok) return failure(payload, u, now, check.reason)
  await save(payload, u.id, { mfa_last_step: check.step, mfa_sessions: withSession(u, sid), mfa_failures: 0, mfa_locked_until: null })
  await writeSecurityAudit(payload, { action: 'mfa-verified', userId: String(u.id), actorId: String(u.id) })
  return { ok: true }
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
  if (wait) return { ok: false, code: 'LOCKED', message: 'Too many wrong codes. Try again later.', retryAfterSeconds: wait }
  if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return { ok: false, code: 'FORMAT', message: 'Enter the 6-digit code from your authenticator app.' }
  const secret = decryptSecret(u.mfa_secret)
  if (!secret) return { ok: false, code: 'NOT_ENROLLED', message: 'Two-factor needs to be set up again. Ask an admin to reset it.' }
  const lastStep = typeof u.mfa_last_step === 'number' ? u.mfa_last_step : null
  const check = verifyTotp(secret, code, now, lastStep)
  if (!check.ok) return failure(payload, u, now, check.reason)
  await save(payload, u.id, { mfa_last_step: check.step, mfa_stepup: { sid, at: now.toISOString() }, mfa_failures: 0, mfa_locked_until: null })
  await writeSecurityAudit(payload, { action: 'mfa-stepup', userId: String(u.id), actorId: String(u.id) })
  return { ok: true }
}

/** Break-glass and admin reset share this: clear the enrolment (the user enrols again at next sign-in). */
export async function clearMfa(payload: Payload, userId: string | number, by: 'admin' | 'break-glass', actorId: string | null): Promise<void> {
  await save(payload, userId, { ...MFA_CLEARED })
  await writeSecurityAudit(payload, { action: 'mfa-reset', userId: String(userId), actorId, detail: { by } })
}

/** Rehearsal seeding only (see ops/mfa): enrol with a given secret, no session verified, no recovery codes. */
export async function enrolWithSecret(payload: Payload, userId: string | number, secret: string, now = new Date()): Promise<void> {
  await save(payload, userId, { ...MFA_CLEARED, mfa_enabled: true, mfa_enrolled_at: now.toISOString(), mfa_secret: encryptSecret(secret), mfa_recovery: { hashes: [] }, mfa_last_step: stepAt(now) - 2 })
  await writeSecurityAudit(payload, { action: 'mfa-enrolled', userId: String(userId), actorId: null, detail: { by: 'rehearsal-seed' } })
}
