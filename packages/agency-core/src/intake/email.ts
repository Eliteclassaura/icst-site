/**
 * Email hygiene for intake (C6, master prompt §Anti-abuse; legacy send.php / email-check.php rules preserved).
 * Nothing here is a spam verdict on its own — it feeds `scoreSpam` and the 422 typo/disposable layers.
 */

/** Small, deliberately conservative list — false positives cost a real lead. Extend via form-config later. */
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'throwawaymail.com',
  'fakeinbox.com',
  'mohmal.com',
])

/** Common providers and the misspellings the legacy checker corrected. */
const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'iclod.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'protonmai.com': 'protonmail.com',
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(raw: string): string {
  const e = raw.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  let local = e.slice(0, at)
  const domain = e.slice(at + 1)
  // Gmail ignores dots and +tags in the local part; dedupe on the canonical form.
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+')[0]!.replace(/\./g, '')
    return `${local}@gmail.com`
  }
  local = local.split('+')[0]!
  return `${local}@${domain}`
}

export function emailDomain(e: string): string {
  return e.trim().toLowerCase().split('@').pop() ?? ''
}

export function isDisposable(e: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomain(e))
}

/** Returns the corrected address when the domain is a known misspelling, else null. */
export function typoSuggestion(e: string): string | null {
  const domain = emailDomain(e)
  const fix = TYPOS[domain]
  if (!fix) return null
  const local = e.trim().split('@')[0]
  return `${local}@${fix}`
}

/** `s***@example.com` — for confirmation pages and logs (ADR-028 §10). */
export function maskEmail(e: string): string {
  const [local = '', domain = ''] = e.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}
