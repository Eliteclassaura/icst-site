'use server'
import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { pendingSession } from '../../../../auth/mfa/guard'
import { MFA_COOKIE, mfaCookieValue } from '../../../../auth/mfa/keys'
import { safeNext } from '../../../../auth/mfa/next'
import { confirmEnrolment, verifySecondFactor } from '../../../../auth/mfa/service'
import type { MfaState } from './state'

/**
 * Patch L2 two-factor actions. Each resolves the password-only session again from the request (never from the form),
 * so a forged form field can neither pick a user nor a session. The code is never logged or echoed.
 */

async function routingCookie(sid: string) {
  ;(await cookies()).set(MFA_COOKIE, mfaCookieValue(sid), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
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
  await routingCookie(pending.sid)
  redirect(safeNext(fd.get('next')))
}
