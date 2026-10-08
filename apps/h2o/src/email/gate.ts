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

/**
 * SEND-FIX-1a (review R2-03; RFC 5321 §4.5.3.2.6): did the mail server possibly accept the message?
 *   NOT_ACCEPTED  the server answered with a refusal (any SMTP reply code), or the failure came before the message
 *                 was handed over (connection, DNS, TLS, authentication, MAIL FROM / RCPT TO, building the message):
 *                 safe to retry.
 *   UNCERTAIN     no reply after the DATA phase began (a timeout or a dropped connection around final acceptance),
 *                 or a failure we cannot place: the message may have been accepted. Never retried automatically.
 */
export type SubmissionOutcome = 'NOT_ACCEPTED' | 'UNCERTAIN'
const BEFORE_DATA = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH( [A-Z0-9-]+)?|MAIL FROM|RCPT TO)$/
const BEFORE_HANDOVER = new Set(['ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS', 'EHOSTUNREACH', 'ETLS', 'EAUTH', 'ENOAUTH', 'EENVELOPE', 'EMESSAGE', 'EPROTOCOL'])
export function submissionOutcome(err: unknown): SubmissionOutcome {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; command?: unknown }
  if (typeof e.responseCode === 'number') return 'NOT_ACCEPTED'
  const cmd = typeof e.command === 'string' ? e.command.trim().toUpperCase() : ''
  if (cmd === 'DATA' || cmd.startsWith('DATA')) return 'UNCERTAIN'
  if (BEFORE_DATA.test(cmd)) return 'NOT_ACCEPTED'
  if (!cmd && typeof e.code === 'string' && BEFORE_HANDOVER.has(e.code)) return 'NOT_ACCEPTED'
  return 'UNCERTAIN'
}

/**
 * SEND-FIX-1a (review R4-03; RFC 3463): why a server refused, from the SMTP stage and the enhanced status code. Only a
 * confirmed invalid destination justifies suppressing the address; every other permanent refusal is held for review.
 *   INVALID_MAILBOX  5.1.x at RCPT TO (or with no stage given), except the sender-side 5.1.7/5.1.8; or 551 at RCPT TO
 *   POLICY           5.7.x (policy, authorization, reputation), 5.6.x (content), 5.2.x other than size (mailbox state)
 *   SIZE             5.3.4 or 5.2.3 (message too big)
 *   AUTH             our login failed (EAUTH, the AUTH stage, 530/534/535): an operator fixes it; nothing reached anyone
 *   TRANSIENT        4xx, or no reply code at all
 *   UNKNOWN          any other 5xx: reviewed, never an address suppression
 */
export type RefusalClass = 'INVALID_MAILBOX' | 'POLICY' | 'SIZE' | 'AUTH' | 'TRANSIENT' | 'UNKNOWN'
export function classifyRefusal(err: unknown): RefusalClass {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; command?: unknown; response?: unknown; message?: unknown }
  const rc = typeof e.responseCode === 'number' ? e.responseCode : null
  const cmd = typeof e.command === 'string' ? e.command.trim().toUpperCase() : ''
  const text = `${typeof e.response === 'string' ? e.response : ''} ${typeof e.message === 'string' ? e.message : ''}`
  if (e.code === 'EAUTH' || cmd.startsWith('AUTH') || rc === 530 || rc === 534 || rc === 535) return 'AUTH'
  if (rc === null || (rc >= 400 && rc < 500)) return 'TRANSIENT'
  const enh = /\b5\.(\d{1,3})\.(\d{1,3})\b/.exec(text)
  const atRcpt = cmd === '' || cmd.startsWith('RCPT')
  if (enh) {
    const [cls, sub] = [Number(enh[1]), Number(enh[2])]
    if (cls === 1 && sub !== 7 && sub !== 8 && atRcpt) return 'INVALID_MAILBOX'
    if ((cls === 3 && sub === 4) || (cls === 2 && sub === 3)) return 'SIZE'
    if (cls === 7 || cls === 6 || cls === 2) return 'POLICY'
    return 'UNKNOWN'
  }
  if (rc === 551 && atRcpt) return 'INVALID_MAILBOX'
  if (rc === 552) return 'SIZE'
  return 'UNKNOWN'
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
