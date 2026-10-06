import { CONSUMER_EMAIL_DOMAINS, isConsumerDomain, registrableLabel } from './free-mail'

/**
 * Address quality (CT legacy spot-check ruling 2026-10-05). A flag on the contact, never a correction: a Gmail typo is
 * undeliverable as written and is kept exactly as written.
 *
 *   - SUSPECT_TYPO  — the domain is a typo of a major mailbox provider ("gmai.com", "gmail.con").
 *   - DISPOSABLE    — a throwaway-inbox service ("yopmail.com").
 *   - SPAM_PATTERN  — set by the import only: a domain with no company name on any row whose shape matches spam
 *                     sign-ups (unusual TLD, a "mail" service-like name, or a subdomain on a generic TLD).
 *   - INTERNAL      — one of ICS's own domains (`H2O_OWN_EMAIL_DOMAINS`, comma-separated; config only — the CRM source
 *                     never names a production host).
 *
 * Any non-null value means: never create or match an account, never marketing-eligible, and the Revenue Engine
 * excludes the address from every sequence.
 */
export const ADDRESS_QUALITY = ['SUSPECT_TYPO', 'DISPOSABLE', 'SPAM_PATTERN', 'INTERNAL'] as const
export type AddressQuality = (typeof ADDRESS_QUALITY)[number]

/**
 * ICS-owned email domains, from `H2O_OWN_EMAIL_DOMAINS`. Empty when unset: the import then refuses to create accounts
 * (fail closed), because an own domain must never become a customer account.
 */
export function ownEmailDomains(): ReadonlySet<string> {
  const raw = process.env.H2O_OWN_EMAIL_DOMAINS ?? ''
  return new Set(raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean))
}

/**
 * Disposable-inbox services. Maintained data: add a domain when one is seen (an import's reasons list or an intake
 * review names it); keep it sorted. Exact registrable domains only — no wildcards.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', '33mail.com', 'anonaddy.me', 'burnermail.io', 'byom.de',
  'mail-temp.com', 'deadaddress.com', 'discard.email', 'dispostable.com', 'dropmail.me', 'emailondeck.com',
  'fakeinbox.com', 'fakemail.net', 'getairmail.com', 'getnada.com', 'grr.la', 'guerrillamail.biz', 'guerrillamail.com',
  'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'harakirimail.com', 'inboxbear.com', 'incognitomail.org', 'jetable.org', 'mailcatch.com', 'maildrop.cc',
  'mailexpire.com', 'mailinator.com', 'mailinator.net', 'mailnesia.com', 'mailnull.com', 'mailpoof.com', 'mailsac.com',
  'mintemail.com', 'mohmal.com', 'moakt.com', 'mytemp.email', 'nada.email', 'spam4.me', 'spamgourmet.com',
  'spambox.us', 'spamex.com', 'sharklasers.com', 'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempinbox.com',
  'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'tmail.ws', 'tmpmail.net',
  'tmpmail.org', 'trash-mail.com', 'trashmail.com', 'trashmail.de', 'trashmail.net', 'wegwerfmail.de', 'yopmail.com',
  'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj',
  'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'emailfake.com',
  'fakemailgenerator.com', 'mailtemp.net', 'minuteinbox.com', 'luxusmail.org', 'kurzepost.de', 'einrot.com',
])

/** Major mailbox labels whose near-misses are typos. AOL is matched only by TLD typos ("aol" is too short: aon, bol). */
const TYPO_TARGETS = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud'] as const
const TLD_TYPO_LABELS = new Set(['gmail', 'googlemail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'aol'])
const TLD_TYPOS = new Set(['con', 'cm', 'om', 'cmo', 'ocm', 'comm', 'coom', 'c0m', 'vom', 'xom', 'co'])
/** Real names one edit from a target that are not typos of it. */
const NOT_TYPOS = new Set(['cloud', 'email', 'mail'])

/** Optimal-string-alignment distance (insert, delete, substitute, adjacent transposition), capped at `max + 1`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1)
      d[i]![j] = v
    }
  return d[a.length]![b.length]!
}

/** The provider a domain looks like a typo of, or null. A real mailbox domain is never a typo. */
export function providerTypoOf(domain: string): string | null {
  const dom = domain.toLowerCase()
  if (CONSUMER_EMAIL_DOMAINS.has(dom)) return null
  const parts = dom.split('.')
  const label = registrableLabel(dom)
  const tld = parts[parts.length - 1] ?? ''
  // "gmail.con", "hotmail.cm", "aol.co": the provider's own label on a mistyped TLD (two-part suffixes never reach here).
  if (TLD_TYPO_LABELS.has(label) && parts.length === 2 && TLD_TYPOS.has(tld)) return label
  if (isConsumerDomain(dom) || NOT_TYPOS.has(label)) return null
  for (const t of TYPO_TARGETS) {
    const max = t.length >= 7 ? 2 : 1
    if (label !== t && editDistance(label, t, max) <= max) return t
  }
  return null
}

/** Per-address quality (no file context): INTERNAL, DISPOSABLE or SUSPECT_TYPO; null when none applies. */
export function addressQualityOf(domain: string | null | undefined): Exclude<AddressQuality, 'SPAM_PATTERN'> | null {
  if (!domain) return null
  const d = domain.toLowerCase()
  if (ownEmailDomains().has(d)) return 'INTERNAL'
  if (DISPOSABLE_EMAIL_DOMAINS.has(d)) return 'DISPOSABLE'
  if (providerTypoOf(d)) return 'SUSPECT_TYPO'
  return null
}

/** TLDs over-represented in spam sign-ups. A hint only: used together with "no company name on any row". */
export const UNUSUAL_TLDS: ReadonlySet<string> = new Set([
  'site', 'online', 'xyz', 'top', 'club', 'icu', 'buzz', 'shop', 'store', 'fun', 'space', 'website', 'cyou', 'rest',
  'monster', 'quest', 'sbs', 'bond', 'lol', 'click', 'link', 'work', 'tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'ru', 'su',
  'lv', 'pl',
])
const GENERIC_TLDS = new Set(['com', 'net', 'org', 'info', 'biz'])
/** Corporate region/unit prefixes ("us.acme.com") are not a throwaway subdomain. */
const CORPORATE_PREFIXES = new Set(['us', 'uk', 'eu', 'na', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'in', 'mx', 'br', 'emea', 'apac', 'ap', 'corp', 'hq'])

/**
 * The import's SPAM_PATTERN rule, applied only to a corporate domain with **no company name on any of its rows** (an
 * account would otherwise be named from the domain). Returns which shape matched, or null.
 */
export function spamPatternOf(domain: string): 'UNUSUAL_TLD' | 'MAIL_SERVICE_NAME' | 'SUBDOMAIN_GENERIC_TLD' | null {
  const d = domain.toLowerCase()
  const parts = d.split('.')
  const tld = parts[parts.length - 1] ?? ''
  if (UNUSUAL_TLDS.has(tld)) return 'UNUSUAL_TLD'
  if (/mail/.test(registrableLabel(d))) return 'MAIL_SERVICE_NAME'
  // A short throwaway subdomain on a generic TLD ("si.<random>.com"); a long one ("plant-ops.acme.com") is not a pattern.
  const first = parts[0] ?? ''
  if (GENERIC_TLDS.has(tld) && parts.length > 2 && first.length <= 3 && !CORPORATE_PREFIXES.has(first)) return 'SUBDOMAIN_GENERIC_TLD'
  return null
}

/** A domain whose address can never create or match a customer account. */
export const neverMatchesAccount = (domain: string): boolean => isConsumerDomain(domain) || addressQualityOf(domain) !== null
