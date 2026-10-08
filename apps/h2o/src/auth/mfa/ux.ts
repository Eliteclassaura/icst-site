/**
 * MFA-UX-1: the words and the recovery-code file of the two-factor pages. Pure functions (no I/O), shared by the
 * service (messages) and the client (the download). Never given a secret or a code to log; the recovery-code file is
 * built in the browser and never sent anywhere.
 */

/** How many wrong codes are left before the lock, after `failures` wrong codes in a row (never below 0). */
export function attemptsLeft(failures: number, max: number): number {
  return Math.max(0, max - failures)
}

/** "Try again in 15 minutes." for a lock with this many seconds to run (rounded up to whole minutes, at least 1). */
export function lockMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Too many wrong codes. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}

/** The message for a refused code: what to do, and how many tries are left before the lock. */
export function wrongCodeMessage(reason: 'FORMAT' | 'MISMATCH' | 'REPLAY', left: number, lockMinutes: number): string {
  const head =
    reason === 'REPLAY'
      ? 'That code was already used. Wait for the next one.'
      : reason === 'FORMAT'
        ? 'Enter the 6-digit code from your authenticator app.'
        : 'That code is not right. Check the time on your phone and try again.'
  const tail = left === 1 ? ` 1 try left before a ${lockMinutes}-minute pause.` : left <= 3 ? ` ${left} tries left before a ${lockMinutes}-minute pause.` : ''
  return head + tail
}

/** A base32 setup key in groups of four, as authenticator apps show it. */
export function groupKey(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(' ')
}

/** After a recovery-code sign-in: the warning when few codes are left (null when there are plenty). */
export function recoveryLowWarning(remaining: number): string | null {
  if (remaining === 0) return 'That was your last recovery code. Ask an admin to reset your two-factor so you get new codes.'
  if (remaining <= 3) return `Only ${remaining} recovery ${remaining === 1 ? 'code is' : 'codes are'} left. Ask an admin to reset your two-factor soon so you get new codes.`
  return null
}

/** The file name of the recovery-code download for this date (UTC day). */
export function recoveryCodesFilename(at: Date): string {
  return `h2o-crm-recovery-codes-${at.toISOString().slice(0, 10)}.txt`
}

/** The recovery-code download: plain text, CRLF line ends (opens cleanly everywhere), one code per line. */
export function recoveryCodesText(codes: string[], account: string, at: Date): string {
  return [
    'H2O CRM two-factor recovery codes',
    `Account: ${account}`,
    `Created: ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    'Each code works once, if you cannot use your authenticator app.',
    'Keep this file somewhere safe, such as your password manager. Anyone with a code and your password can sign in.',
    '',
    ...codes,
    '',
  ].join('\r\n')
}
