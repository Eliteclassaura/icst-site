import type { Payload } from 'payload'
import { writeSecurityAudit } from './audit'

/**
 * STEP-UP-1.1 (Auditor C3): five wrong passwords on a step-up lock the account, and that is what a stolen session cookie
 * guessing a password looks like. The existing mechanism for a security notice is a short system email through Payload's
 * mail adapter (the same path as the alert-list and two-step notices), so every admin is told that way, once per lock. No
 * new infrastructure: best effort, under one deadline, a failed send never changes the outcome, and the result is audited
 * with counts only (never an address). The mail mode still governs delivery (off = nothing leaves).
 */
export type LockNoticeDeps = { notify?: (to: string, subject: string, text: string) => Promise<void>; deadlineMs?: number }
const DEADLINE_MS = 8000

export const LOCK_NOTICE_SUBJECT = 'Repeated wrong passwords on a CRM confirmation'
export const lockNoticeText = (date: string): string =>
  `On ${date}, a CRM account was locked for 15 minutes after five wrong passwords were entered on the “Confirm it’s you” step. This can mean someone is using a signed-in session that is not theirs.\n\nIf this was not expected, sign out everywhere, change the password, and check Settings → People and sign-in.\n\nICS Sales Team\n`

async function adminAddresses(payload: Payload): Promise<string[]> {
  try {
    const res = await payload.find({ collection: 'users', where: { roles: { in: ['platform-admin', 'client-admin'] } } as never, limit: 100, depth: 0, overrideAccess: true })
    return [...new Set((res.docs as unknown as Array<{ email?: unknown }>).map((u) => (typeof u.email === 'string' ? u.email.trim().toLowerCase() : '')).filter(Boolean))]
  } catch {
    return []
  }
}

export async function notifyStepUpLock(payload: Payload, userId: string | number, now: Date, deps: LockNoticeDeps = {}): Promise<void> {
  try {
    const recipients = await adminAddresses(payload)
    const send = deps.notify ?? ((to: string, subject: string, text: string) => payload.sendEmail({ to, subject, text }).then(() => undefined))
    let sent = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const text = lockNoticeText(now.toISOString().slice(0, 10))
    const jobs = recipients.map((to) => send(to, LOCK_NOTICE_SUBJECT, text).then(() => void sent++, () => undefined))
    await Promise.race([Promise.all(jobs), new Promise<void>((r) => (timer = setTimeout(r, deps.deadlineMs ?? DEADLINE_MS)))])
    clearTimeout(timer)
    await writeSecurityAudit(payload, { action: 'mfa-admin-notice', userId: String(userId), actorId: null, detail: { for: 'stepup-lock', recipients: recipients.length, sent, failed: recipients.length - sent } })
  } catch {
    payload.logger.error({ code: 'STEPUP_LOCK_NOTICE_FAILED' })
  }
}
