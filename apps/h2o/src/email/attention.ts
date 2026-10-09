import type { Where } from 'payload'

/**
 * OVERVIEW-FIX-1 (CRM review L03): ONE definition of "an email a person must look at", used for both the overview's
 * count and the outbox list the card opens, so the number always matches the list behind it.
 *
 * UNCERTAIN = delivery unconfirmed. An internal alert gets one automatic resend (SEND-FIX-1a.1); when the mail server
 * accepts that resend, the original is stamped `resend_accepted_at` and is HANDLED. Its status stays UNCERTAIN (the
 * history is kept). Customer mail is never resent, so it stays in NEEDS_ATTENTION until a person deals with it.
 * Accepted by the mail server is not the same as seen in an inbox; the wording says "accepted".
 */
export const NEEDS_ATTENTION: Where = { and: [{ status: { equals: 'UNCERTAIN' } }, { resend_accepted_at: { exists: false } }] }
export const HANDLED_BY_RESEND: Where = { and: [{ status: { equals: 'UNCERTAIN' } }, { resend_accepted_at: { exists: true } }] }

/** A Where as admin list query parameters (`where[and][0][status][equals]=UNCERTAIN&…`), the form the list parses. */
export function whereQuery(where: Where): string {
  const out: string[] = []
  const walk = (v: unknown, key: string) => {
    if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${key}[${k}]`)
    } else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  walk(where, 'where')
  return out.join('&')
}
