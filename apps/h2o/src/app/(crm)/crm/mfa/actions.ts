'use server'
import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { cookieOptions, DEVICE_COOKIE, rememberDevice, revokeDevice, revokeOtherDevices } from '../../../../auth/mfa/devices'
import { emailCodeEligible } from '../../../../auth/mfa/eligibility'
import { deliverSignInCode, maskEmail } from '../../../../auth/mfa/email-code-mail'
import { issueEmailCode } from '../../../../auth/mfa/email-code'
import { writeSecurityAudit } from '../../../../auth/mfa/audit'
import { pendingSession } from '../../../../auth/mfa/guard'
import { MFA_COOKIE, mfaCookieValue } from '../../../../auth/mfa/keys'
import { safeNext } from '../../../../auth/mfa/next'
import { confirmEnrolment, verifySecondFactor, verifySecondFactorByEmail } from '../../../../auth/mfa/service'
import type { MfaState } from './state'

/**
 * Patch L2 two-factor actions. Each resolves the password-only session again from the request (never from the form),
 * so a forged form field can neither pick a user nor a session. The code is never logged or echoed.
 */

async function routingCookie(sid: string) {
  ;(await cookies()).set(MFA_COOKIE, mfaCookieValue(sid), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
}
const wantsRemember = (fd: FormData) => fd.get('remember') === 'on'

/** MFA-2: after a passed code, remember this device when asked (eligible users only; the checkbox is ignored for admins). */
async function maybeRemember(payload: Awaited<ReturnType<typeof getPayload>>, user: Parameters<typeof rememberDevice>[1], fd: FormData) {
  if (!wantsRemember(fd)) return
  const value = await rememberDevice(payload, user, { userAgent: (await headers()).get('user-agent') })
  if (!value) return
  ;(await cookies()).set(DEVICE_COOKIE, value, cookieOptions())
  await writeSecurityAudit(payload, { action: 'mfa-device-remembered', userId: String(user.id), actorId: String(user.id) })
}

const codeOf = (fd: FormData) => String(fd.get('code') ?? '').slice(0, 32)

export async function confirmEnrolAction(_: MfaState, fd: FormData): Promise<MfaState> {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending) return { ok: false, message: 'Your sign-in has expired. Sign in again.' }
  const out = await confirmEnrolment(payload, pending.user, pending.sid, codeOf(fd))
  if (!out.ok) return { ok: false, message: out.message, nonce: Date.now() }
  // No cookie here: setting one re-renders the page and would replace the recovery codes before they are saved. The
  // "I saved them. Continue" link goes through /crm/mfa/done/, which sets the routing cookie.
  return { ok: true, message: 'Two-factor is on.', recoveryCodes: out.recoveryCodes, next: safeNext(fd.get('next')), nonce: Date.now() }
}

export async function verifyAction(_: MfaState, fd: FormData): Promise<MfaState> {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending) return { ok: false, message: 'Your sign-in has expired. Sign in again.' }
  const out = await verifySecondFactor(payload, pending.user, pending.sid, codeOf(fd))
  if (!out.ok) return { ok: false, message: out.message, nonce: Date.now() }
  // MFA-UX-1: a recovery code was used up; say how many are left before going on. No cookie here (it would re-render
  // the page over this message); the page's "Continue" link goes through /crm/mfa/done/, which sets it.
  if (typeof out.recoveryRemaining === 'number')
    return { ok: true, message: 'Signed in with a recovery code.', recoveryRemaining: out.recoveryRemaining, next: safeNext(fd.get('next')), nonce: Date.now() }
  await maybeRemember(payload, pending.user, fd)
  await routingCookie(pending.sid)
  redirect(safeNext(fd.get('next')))
}

/** MFA-2: "Send me a code by email". Eligible (non-admin, two-factor on) users only; 3 sends per 15 minutes. */
export async function requestCodeAction(_: MfaState, _fd: FormData): Promise<MfaState> {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending) return { ok: false, message: 'Your sign-in has expired. Sign in again.' }
  const u = pending.user
  const email = String(u.email ?? '')
  if (u.mfa_enabled !== true || !emailCodeEligible(u) || !email) return { ok: false, message: 'Email codes are not available for this account. Use your authenticator app.', nonce: Date.now() }
  const out = await issueEmailCode(payload, u as never, { sid: pending.sid })
  if (!out.ok) {
    if (out.reason === 'COOLDOWN') return { ok: false, message: `A code was just sent. You can ask for another in ${out.retryAfterSeconds ?? 30} seconds.`, cooldownSeconds: out.retryAfterSeconds ?? 30, nonce: Date.now() }
    if (out.reason === 'RATE_LIMITED') return { ok: false, message: 'A code was sent a few times already. Wait a few minutes, or use your authenticator app.', nonce: Date.now() }
    if (out.reason === 'LOCKED') return { ok: false, message: 'Too many wrong codes. Try again in a little while.', nonce: Date.now() }
    return { ok: false, message: 'Email codes are not available for this account. Use your authenticator app.', nonce: Date.now() }
  }
  try {
    await deliverSignInCode(payload, email, out.code)
  } catch {
    return { ok: false, message: 'We could not send the code just now. Use your authenticator app, or try again in a few minutes.', nonce: Date.now() }
  }
  await writeSecurityAudit(payload, { action: 'mfa-email-sent', userId: String(u.id), actorId: String(u.id) })
  return { ok: true, emailSent: true, maskedEmail: maskEmail(email), expiresAt: out.expiresAt.toISOString(), cooldownSeconds: out.cooldownSeconds, message: `We sent a 6-digit code to ${maskEmail(email)}.`, nonce: Date.now() }
}

export async function verifyEmailAction(_: MfaState, fd: FormData): Promise<MfaState> {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending) return { ok: false, message: 'Your sign-in has expired. Sign in again.' }
  const out = await verifySecondFactorByEmail(payload, pending.user, pending.sid, codeOf(fd))
  if (!out.ok) return { ok: false, message: out.message, nonce: Date.now() }
  await maybeRemember(payload, pending.user, fd)
  await routingCookie(pending.sid)
  redirect(safeNext(fd.get('next')))
}

/** MFA-2: "Sign out other devices" — forget every remembered device except this one. */
export async function signOutOtherDevicesAction(): Promise<void> {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending?.verified) return
  const n = await revokeOtherDevices(payload, pending.user.id, (await cookies()).get(DEVICE_COOKIE)?.value)
  if (n > 0) await writeSecurityAudit(payload, { action: 'mfa-devices-revoked', userId: String(pending.user.id), actorId: String(pending.user.id), detail: { why: 'user', count: n } })
  redirect('/crm/mfa/devices/')
}

/** MFA-2: forget one remembered device (the device list's "Forget" button). Only the signed-in user's own devices. */
export async function forgetDeviceAction(fd: FormData): Promise<void> {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending?.verified) return
  const id = String(fd.get('id') ?? '')
  if (await revokeDevice(payload, pending.user.id, id)) await writeSecurityAudit(payload, { action: 'mfa-devices-revoked', userId: String(pending.user.id), actorId: String(pending.user.id), detail: { why: 'user', count: 1 } })
  redirect('/crm/mfa/devices/')
}
