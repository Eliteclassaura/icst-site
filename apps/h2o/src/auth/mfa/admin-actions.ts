import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { stepUp } from '../../email/sending-settings'
import type { Outcome } from '../../crm/workspace/mutations'
import type { CrmSession } from '../../crm/workspace/session'
import { writeSecurityAudit, type MfaAuditAction } from './audit'
import { isAdminUser, isExempt, mayBeExempt, rolesOf } from './eligibility'

/**
 * MFA-ADMIN-1 (owner decision "Reset + turn off"). An admin can
 *   - RESET anyone's two-factor (enrolment, recovery codes, remembered devices, sessions): the person enrols again at their
 *     next sign-in; an admin target must enrol with the authenticator app again (that is the only way an admin gets in);
 *   - TURN OFF two-factor for a non-admin (never an admin, never a person who holds any admin role): the person then
 *     signs in with their password alone; and turn it back ON (they enrol again at their next sign-in).
 *
 * Every action needs: an admin session, a FRESH step-up (the admin's own authenticator code, never a remembered device),
 * a required reason, and a different target (no one resets or exempts themselves). The reason is stored in
 * `mfa_admin_actions` (not in the audit entry); the audit entry has the actor and the from → to states. The affected
 * person gets a short system email (no addresses or codes in it); a failed notice never fails the action and its outcome is
 * audited. Sessions and remembered devices are revoked and `security_epoch` goes up.
 */
type Doc = Record<string, unknown>
type Exec = { execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle
const sys = { overrideAccess: true as const, depth: 0 }
// Only what the checks and the list need: no secret, recovery code or session ever loads (MFA-ADMIN-1.1, Auditor N-4).
const STATE_FIELDS = { email: true, name: true, roles: true, mfa_enabled: true, mfa_exempt: true } as const
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

export type AdminMfaAction = 'reset' | 'turn-off' | 'turn-on'
export type AdminMfaDeps = {
  now?: Date
  /** The notice to the affected person (default: Payload's mail adapter, the system mail path). */
  notify?: (to: string, subject: string, text: string) => Promise<void>
}

export const REASON_MIN = 5
export const REASON_MAX = 300
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/

const AUDIT: Record<AdminMfaAction, MfaAuditAction> = { reset: 'mfa-admin-reset', 'turn-off': 'mfa-admin-turned-off', 'turn-on': 'mfa-admin-turned-on' }

/** The EFFECTIVE state: the same role-aware rule the session guard uses (isExempt), never the raw flag, so a stale flag on an admin shows as what it is. */
const stateOf = (u: Doc): { mfa: 'on' | 'off' | 'not-set-up'; exempt: boolean } =>
  isExempt(u) ? { mfa: 'off', exempt: true } : u.mfa_enabled === true ? { mfa: 'on', exempt: false } : { mfa: 'not-set-up', exempt: false }

/** The notice body: plain, no addresses, no codes, no phone number. */
export function noticeText(action: AdminMfaAction, now: Date): { subject: string; text: string } {
  const date = now.toISOString().slice(0, 10)
  const what = action === 'reset' ? 'was reset' : action === 'turn-off' ? 'was turned off' : 'was turned back on'
  const next = action === 'turn-off' ? 'You now sign in with your password.' : 'You will be asked to set up two-step sign-in at your next sign-in.'
  return {
    subject: `Your two-step sign-in ${what} by an administrator`,
    text: `Your two-step sign-in ${what} by an administrator on ${date}. ${next}\n\nIf this wasn’t expected, contact your administrator.\n\nICS Sales Team\n`,
  }
}

async function recordReason(payload: Payload, e: { userId: string; actorId: string; action: AdminMfaAction; reason: string }): Promise<boolean> {
  try {
    await db(payload).execute(sql`INSERT INTO mfa_admin_actions (user_id, actor_id, action, reason, applied) VALUES (${e.userId}, ${e.actorId}, ${e.action}, ${e.reason}, false) RETURNING id`)
    return true
  } catch (err) {
    payload.logger.error({ code: 'MFA_ADMIN_REASON_WRITE_FAILED', errName: (err as Error)?.name })
    return false
  }
}

type Tx = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
async function applyChange(payload: Payload, userId: string, exempt: boolean, now: Date): Promise<{ devices: number; sessions: number }> {
  const drizzle = (payload.db as unknown as { drizzle: { transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> } }).drizzle
  const iso = now.toISOString()
  return drizzle.transaction(async (tx) => {
    // the MFA_CLEARED values (fields.ts) plus the exemption and the credential counter
    await tx.execute(sql`UPDATE users SET mfa_enabled = false, mfa_enrolled_at = NULL, mfa_secret = NULL, mfa_pending_secret = NULL, mfa_pending_at = NULL,
      mfa_recovery = NULL, mfa_last_step = NULL, mfa_sessions = '[]'::jsonb, mfa_failures = 0, mfa_locked_until = NULL, mfa_stepup = NULL,
      mfa_exempt = ${exempt}, mfa_exempt_at = ${exempt ? iso : null}::timestamptz, security_epoch = COALESCE(security_epoch, 0) + 1, updated_at = ${iso}::timestamptz WHERE id = ${userId}`)
    const devices = await tx.execute(sql`UPDATE mfa_trusted_devices SET revoked_at = ${iso}::timestamptz WHERE user_id = ${userId} AND revoked_at IS NULL RETURNING id`)
    await tx.execute(sql`DELETE FROM mfa_email_codes WHERE user_id = ${userId}`)
    const sessions = await tx.execute(sql`DELETE FROM users_sessions WHERE _parent_id = ${userId} RETURNING id`)
    return { devices: (devices.rows ?? []).length, sessions: (sessions.rows ?? []).length }
  })
}

export async function adminMfaAction(
  s: CrmSession,
  sid: string | null,
  input: { userId?: string; action?: string; reason?: string },
  deps: AdminMfaDeps = {},
): Promise<Outcome> {
  const now = deps.now ?? new Date()
  if (!s.isAdmin) return fail('FORBIDDEN', 'Two-step sign-in settings are for admins.')
  const denied = await stepUp(s, sid, undefined, now)
  if (denied) return denied
  const action = input.action
  if (action !== 'reset' && action !== 'turn-off' && action !== 'turn-on') return fail('BAD_ACTION', 'Choose what to do.')
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN || reason.length > REASON_MAX || CONTROL.test(reason)) return { ok: false, code: 'REASON_REQUIRED', message: `Say why (at least ${REASON_MIN} characters).`, fields: { reason: `Write a reason of ${REASON_MIN}–${REASON_MAX} characters.` } }
  const userId = String(input.userId ?? '')
  if (!userId) return fail('NOT_FOUND', 'That person was not found.')
  // An admin cannot do this to themselves: it has to go through another admin.
  if (userId === s.userId) return fail('SELF_REFUSED', 'You can’t change your own two-step sign-in here. Ask another admin.')
  let target: Doc | null
  try {
    target = (await s.payload.findByID({ collection: 'users', id: userId, select: STATE_FIELDS as never, ...sys })) as unknown as Doc
  } catch {
    target = null
  }
  if (!target) return fail('NOT_FOUND', 'That person was not found.')
  // A platform administrator's two-factor can only be reset by a platform administrator (SEC-MAIN-1).
  if (rolesOf(target).includes('platform-admin') && !rolesOf(s.user).includes('platform-admin')) return fail('FORBIDDEN', 'Only a platform administrator can change a platform administrator’s two-step sign-in.')
  const before = stateOf(target)
  if (action === 'turn-off') {
    // THE ADMIN GUARD: no admin, no person holding an admin role, no one without a role, can be exempted.
    if (isAdminUser(target) || !mayBeExempt(target)) return fail('ADMIN_NOT_EXEMPTABLE', 'Two-step sign-in can’t be turned off for an admin.')
    if (isExempt(target)) return fail('ALREADY_OFF', 'Two-step sign-in is already off for this person.')
  } else if (action === 'turn-on') {
    if (!isExempt(target)) return fail('NOT_OFF', 'Two-step sign-in is not turned off for this person.')
  } else if (isExempt(target)) {
    return fail('USE_TURN_ON', 'Two-step sign-in is turned off for this person. Turn it back on instead.')
  }
  // The reason row and the audit entry come FIRST: if either cannot be written, NOTHING changes (Auditor N-1).
  if (!(await recordReason(s.payload, { userId, actorId: s.userId, action, reason }))) return fail('AUDIT_FAILED', 'Not changed: the change could not be recorded. Try again in a moment.')
  const toState = action === 'turn-off' ? { mfa: 'off', exempt: true } : { mfa: 'not-set-up', exempt: false }
  if (!(await writeSecurityAudit(s.payload, { action: AUDIT[action], userId, actorId: s.userId, detail: { from: before, to: toState, ...(action === 'reset' ? { adminTarget: isAdminUser(target) } : {}) } })))
    return fail('AUDIT_FAILED', 'Not changed: the change could not be recorded. Try again in a moment.')
  // The change itself is ONE transaction (Auditor N-2): the enrolment and exemption columns, the credential counter, the
  // sessions, the remembered devices and the emailed codes all change together or not at all.
  let counts: { devices: number; sessions: number }
  try {
    counts = await applyChange(s.payload, userId, action === 'turn-off', now)
  } catch {
    s.payload.logger.error({ code: 'MFA_ADMIN_CHANGE_FAILED', action })
    await writeSecurityAudit(s.payload, { action: 'mfa-admin-aborted', userId, actorId: s.userId, detail: { for: action } })
    return fail('CHANGE_FAILED', 'Not changed: something went wrong. Try again in a moment.')
  }
  await db(s.payload).execute(sql`UPDATE mfa_admin_actions SET applied = true WHERE id = (SELECT max(id) FROM mfa_admin_actions WHERE user_id = ${userId} AND actor_id = ${s.userId} AND action = ${action} AND applied = false)`)
  await writeSecurityAudit(s.payload, { action: 'mfa-devices-revoked', userId, actorId: s.userId, detail: { why: action, count: counts.devices, sessions: counts.sessions } })
  // The notice (best effort; the outcome is audited, the person's address is not).
  const to = typeof target.email === 'string' ? target.email : ''
  const n = noticeText(action, now)
  const send = deps.notify ?? ((addr: string, sub: string, text: string) => s.payload.sendEmail({ to: addr, subject: sub, text }).then(() => undefined))
  let sent = false
  if (to)
    try {
      await send(to, n.subject, n.text)
      sent = true
    } catch {
      sent = false
    }
  await writeSecurityAudit(s.payload, { action: 'mfa-admin-notice', userId, actorId: s.userId, detail: { for: action, sent } })
  // PEOPLE-FIX-1 (L04): the result names the person (it stays on screen after the dialog closes) and a failed notice is a warning.
  const who = typeof target.name === 'string' && target.name.trim() ? target.name.trim().slice(0, 80) : 'this person'
  const done = action === 'reset' ? `Two-step sign-in reset for ${who}. They set it up again at their next sign-in.` : action === 'turn-off' ? `Two-step sign-in turned off for ${who}.` : `Two-step sign-in turned back on for ${who}. They set it up at their next sign-in.`
  return sent ? { ok: true, message: done } : { ok: true, message: `${done} We could not email them. Tell them directly.`, warn: true }
}

export type PersonRow = { id: string; name: string; email: string; roles: string[]; mfa: 'on' | 'off' | 'not-set-up'; exempt: boolean; admin: boolean; canTurnOff: boolean; isSelf: boolean }

/** The people list for the admin screen: staff accounts with their two-step state. Admin only (the caller checks). */
export async function listPeople(s: CrmSession): Promise<PersonRow[]> {
  const res = await s.payload.find({ collection: 'users', limit: 200, depth: 0, sort: 'email', select: STATE_FIELDS as never, overrideAccess: true })
  return (res.docs as unknown as Doc[]).map((u) => {
    const st = stateOf(u)
    return {
      id: String(u.id),
      name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : `User ${String(u.id).slice(0, 4)}`,
      email: typeof u.email === 'string' ? u.email : '',
      roles: rolesOf(u),
      mfa: st.mfa,
      exempt: st.exempt,
      admin: isAdminUser(u),
      canTurnOff: mayBeExempt(u) && !st.exempt,
      isSelf: String(u.id) === s.userId,
    }
  })
}
