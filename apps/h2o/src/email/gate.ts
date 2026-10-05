import { createHmac } from 'node:crypto'
import { recipientKey, type EmailConfig } from './config'

/**
 * The send gate and the PII-safe vocabulary every mail path shares. Pure functions only.
 *
 * Gate (H2O_EMAIL_MODE):
 *   off        nothing is sent; every attempt is recorded as SUPPRESSED_BY_MODE
 *   allowlist  only H2O_EMAIL_ALLOWLIST recipients receive mail; every other recipient is SUPPRESSED_BY_MODE
 *   live       every recipient that passes suppression receives mail
 * Suppression / do-not-contact is a separate check, applied in every mode (see ../crm/suppression.ts).
 */

export type GateDecision = 'SEND' | 'SUPPRESSED_BY_MODE' | 'INVALID_RECIPIENT'

export function gateRecipient(cfg: Pick<EmailConfig, 'mode' | 'allowlist'>, to: string): GateDecision {
  const key = recipientKey(to)
  if (!key) return 'INVALID_RECIPIENT'
  if (cfg.mode === 'live') return 'SEND'
  if (cfg.mode === 'allowlist') return cfg.allowlist.has(key) ? 'SEND' : 'SUPPRESSED_BY_MODE'
  return 'SUPPRESSED_BY_MODE'
}

/**
 * Stable, keyed, non-reversible recipient reference for audit rows and logs. Two rows for the same address
 * share a reference (so an operator can see "same recipient"), but the address cannot be recovered from it
 * without the server secret.
 */
export function recipientRef(to: string, secret: string = process.env.PAYLOAD_SECRET ?? ''): string {
  const key = recipientKey(to) ?? to.trim().toLowerCase()
  return `r_${createHmac('sha256', `h2o-email-recipient:${secret}`).update(key).digest('hex').slice(0, 20)}`
}

/** Recipient domain only (e.g. for "is this internal?"), never the local part. */
export const recipientDomain = (to: string): string | null => {
  const k = recipientKey(to)
  return k ? k.slice(k.lastIndexOf('@') + 1) : null
}

export type FailureClass = 'TRANSIENT' | 'PERMANENT'

/**
 * Reduce a transport error to a code. The message of an SMTP error can carry the recipient address or
 * server banner text, so it is never kept: only `code`, `responseCode` and the SMTP command name survive.
 */
export function failureCode(err: unknown): { code: string; klass: FailureClass } {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; command?: unknown }
  const rc = typeof e.responseCode === 'number' ? e.responseCode : null
  const code = typeof e.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(e.code) ? e.code : 'UNKNOWN'
  const cmd =
    typeof e.command === 'string' && /^[A-Z ]{2,20}$/.test(e.command) ? e.command.replace(/ /g, '_') : null
  if (rc !== null) {
    const label = `SMTP_${rc}${cmd ? `_${cmd}` : ''}`
    return { code: label, klass: rc >= 500 && rc < 600 ? 'PERMANENT' : 'TRANSIENT' }
  }
  if (code === 'EENVELOPE' || code === 'EMESSAGE') return { code, klass: 'PERMANENT' }
  // Connection, DNS, TLS, timeout and authentication problems are operational: retry with backoff, then
  // dead-letter. (A wrong password is fixed by an operator, not by giving up on the first attempt.)
  return { code, klass: 'TRANSIENT' }
}

/** Retry schedule: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, then dead-letter (7 attempts in total). */
export const RETRY_DELAYS_MS: readonly number[] = [
  60_000, 300_000, 900_000, 3_600_000, 10_800_000, 21_600_000,
]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

export function nextAttemptAt(attemptsSoFar: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_MS[attemptsSoFar - 1]
  return delay === undefined ? null : new Date(now.getTime() + delay)
}
