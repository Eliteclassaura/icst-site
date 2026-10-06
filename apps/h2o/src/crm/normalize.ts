import { domainToASCII } from 'node:url'

/**
 * Identity normalisation — deliberately conservative.
 *
 * E0.1 `contact.schema.json`: `email_match_key` is the "lowercase matching key; provider-specific alias
 * collapsing is forbidden." So `J.Doe+rfq@Example.COM` keys as `j.doe+rfq@example.com` — the dots and the
 * `+tag` are kept, because `jdoe@` and `j.doe@` can be two different people on a non-Google mailbox, and a
 * `+tag` may route to a different team. (agency-core's `emailNormalized` folds both; that is exactly why
 * CRM-1 does not reuse it.)
 */

/** Syntactic plausibility only. This is not deliverability and not proof the mailbox exists. */
const EMAIL_SHAPE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

export type EmailKey = { original: string; canonical: string; matchKey: string; domain: string }

export function emailKey(raw: unknown): EmailKey | null {
  if (typeof raw !== 'string') return null
  const original = raw
  const canonical = raw.trim()
  if (canonical.length < 3 || canonical.length > 254) return null
  if (!EMAIL_SHAPE.test(canonical)) return null
  const at = canonical.lastIndexOf('@')
  const domain = normalizeDomain(canonical.slice(at + 1))
  if (!domain) return null
  return { original, canonical, matchKey: `${canonical.slice(0, at).toLowerCase()}@${domain}`, domain }
}

/** Lowercase + IDNA; strips a trailing dot. Returns null for anything that is not a hostname. */
export function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase().replace(/\.$/, '')
  if (value === '' || value.length > 253 || /[\s/@:]/.test(value)) return null
  const ascii = domainToASCII(value)
  if (!ascii || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(ascii)) return null
  return ascii
}

/**
 * Web-domain normalisation for an account's website: `www.` is removed **only** here, never from an email
 * domain (E0.1 §Domain normalization).
 */
export function normalizeWebDomain(raw: unknown): string | null {
  const d = normalizeDomain(raw)
  return d && d.startsWith('www.') ? d.slice(4) : d
}

/** The free-mail / personal-mailbox rule lives in one data module, shared by intake and import. */
export { CONSUMER_EMAIL_DOMAINS, isConsumerDomain, isProviderDomain, registrableLabel } from './free-mail'


/** Name comparison key: case/whitespace/diacritic-insensitive. Used to *flag*, never to merge. */
export function nameKey(first: unknown, last: unknown): string | null {
  const part = (v: unknown) =>
    typeof v === 'string'
      ? v
          .normalize('NFKD')
          .replace(/\p{M}/gu, '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()
      : ''
  const key = [part(first), part(last)].filter(Boolean).join(' ')
  return key === '' ? null : key
}

/** Company-string comparison key — for review flags only. Similar strings never link an account. */
export function companyKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const key = raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return key === '' ? null : key
}

/**
 * Trimmed non-empty string, else null. Empty input is UNKNOWN (null), never `""`. Never truncates: a cut
 * value still looks valid and is corrupted, so length limits are validated (and refused) by the field.
 */
export const textOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}
