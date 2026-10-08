import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { stepUp } from '../../email/sending-settings'
import type { Outcome } from '../../crm/workspace/mutations'
import type { CrmSession } from '../../crm/workspace/session'
import { writeSecurityAudit, type MfaAuditAction } from './audit'
import { revokeAllDevices } from './devices'
import { purgeUserMfaRows } from './email-code'
import { isAdminUser, isExempt, mayBeExempt, rolesOf } from './eligibility'
import { MFA_CLEARED } from './fields'

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
const sys = { overrideAccess: true as const, depth: 0, showHiddenFields: true }
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

const stateOf = (u: Doc): { mfa: 'on' | 'off' | 'not-set-up'; exempt: boolean } =>
  u.mfa_exempt === true ? { mfa: 'off', exempt: true } : u.mfa_enabled === true ? { mfa: 'on', exempt: false } : { mfa: 'not-set-up', exempt: false }

/** The notice body: plain, no addresses, no codes, no phone number. */
export function noticeText(action: AdminMfaAction, now: Date): { subject: string; text: string } {
  const date = now.toISOString().slice(0, 10)
  const what = action === 'reset' ? 'was reset' : action === 'turn-off' ? 'was turned off' : 'was turned back on'
  const next = action === 'turn-off' ? 'You now sign in with your password.' : 'You will be asked to set up two-step sign-in at your next sign-in.'
  return {
    subject: `Your two-step sign-in ${what} by an administrator`,
    text: `Your two-step sign-in ${what} by an administrator on ${date}. ${next}\n\nIf this wasn’t expected, contact your administrator.\n`,
  }
}

async function recordReason(payload: Payload, e: { userId: string; actorId: string; action: AdminMfaAction; reason: string }): Promise<boolean> {
  try {
    await db(payload).execute(sql`INSERT INTO mfa_admin_actions (user_id, actor_id, action, reason) VALUES (${e.userId}, ${e.actorId}, ${e.action}, ${e.reason})`)
    return true
  } catch (err) {
    payload.logger.error({ code: 'MFA_ADMIN_REASON_WRITE_FAILED', errName: (err as Error)?.name })
    return false
  }
}

/** Sessions: delete the user's rows in one statement; the epoch goes up in the same statement chain. */
async function revokeSessions(payload: Payload, userId: string): Promise<number> {
  const r = await db(payload).execute(sql`DELETE FROM users_sessions WHERE _parent_id = ${userId} RETURNING id`)
  await db(payload).execute(sql`UPDATE users SET security_epoch = COALESCE(security_epoch, 0) + 1 WHERE id = ${userId}`)
  return r.rows.length
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
    target = (await s.payload.findByID({ collection: 'users', id: userId, ...sys })) as unknown as Doc
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
    if (target.mfa_exempt !== true) return fail('NOT_OFF', 'Two-step sign-in is not turned off for this person.')
  } else if (target.mfa_exempt === true) {
    return fail('USE_TURN_ON', 'Two-step sign-in is turned off for this person. Turn it back on instead.')
  }
  // The reason row and the audit entry come FIRST: if either cannot be written, nothing changes.
  if (!(await recordReason(s.payload, { userId, actorId: s.userId, action, reason }))) return fail('AUDIT_FAILED', 'Not changed: the change could not be recorded. Try again in a moment.')
  const toState = action === 'turn-off' ? { mfa: 'off', exempt: true } : { mfa: 'not-set-up', exempt: false }
  const sessions = { n: 0 }
  await writeSecurityAudit(s.payload, { action: AUDIT[action], userId, actorId: s.userId, detail: { from: before, to: toState, ...(action === 'reset' ? { adminTarget: isAdminUser(target) } : {}) } })
  const exempt = action === 'turn-off' ? { mfa_exempt: true, mfa_exempt_at: now.toISOString() } : { mfa_exempt: false, mfa_exempt_at: null }
  await s.payload.update({ collection: 'users', id: userId, data: { ...MFA_CLEARED, ...exempt } as never, ...sys, context: { mfaService: true } })
  const devices = await revokeAllDevices(s.payload, userId, now)
  await purgeUserMfaRows(s.payload, userId).catch(() => undefined)
  sessions.n = await revokeSessions(s.payload, userId)
  await writeSecurityAudit(s.payload, { action: 'mfa-devices-revoked', userId, actorId: s.userId, detail: { why: action, count: devices, sessions: sessions.n } })
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
  const done = action === 'reset' ? 'Two-step sign-in was reset. They set it up again at their next sign-in.' : action === 'turn-off' ? 'Two-step sign-in is turned off for this person.' : 'Two-step sign-in is turned back on. They set it up at their next sign-in.'
  return { ok: true, message: `${done}${sent ? '' : ' (We could not email them; tell them yourself.)'}` }
}

export type PersonRow = { id: string; name: string; email: string; roles: string[]; mfa: 'on' | 'off' | 'not-set-up'; exempt: boolean; admin: boolean; canTurnOff: boolean; isSelf: boolean }

/** The people list for the admin screen: staff accounts with their two-step state. Admin only (the caller checks). */
export async function listPeople(s: CrmSession): Promise<PersonRow[]> {
  const res = await s.payload.find({ collection: 'users', limit: 200, depth: 0, sort: 'email', overrideAccess: true, showHiddenFields: true })
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
