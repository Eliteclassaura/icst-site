/**
 * RFQ-EMAIL-CHECK-1: the "Did you mean …?" hint for a mistyped mailbox provider (gmial.com, gmail.co, yaho.com, hotmial.com,
 * outlok.com). Pure, client-safe, no network. It only SUGGESTS: the form never changes what the visitor typed.
 */
const PROVIDERS = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud'] as const
// The provider's own label on a mistyped ending ("gmail.co", "outlook.con"): exactly two parts, so yahoo.co.jp is untouched.
const ENDING_TYPOS = new Set(['con', 'cm', 'co', 'om', 'cmo', 'ocm', 'comm', 'coom', 'vom', 'xom'])
// Labels that are real words or other providers, one edit from a target.
const NOT_TYPOS = new Set(['gmx', 'mail', 'email', 'cloud', 'aol', 'live', 'msn', 'me', 'proton'])

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2
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

/** A corrected address, or null when the domain looks right (or is not a near-miss of a major provider). */
export function suggestEmail(value: string): string | null {
  const v = value.trim()
  const at = v.lastIndexOf('@')
  if (at < 1 || at !== v.indexOf('@') || /\s/.test(v)) return null
  const local = v.slice(0, at)
  const domain = v.slice(at + 1).toLowerCase()
  const parts = domain.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [label, tld] = parts as [string, string]
  if ((PROVIDERS as readonly string[]).includes(label) && tld === 'com') return null
  if (NOT_TYPOS.has(label)) return null
  // the provider's own name on a mistyped ending
  if ((PROVIDERS as readonly string[]).includes(label) && ENDING_TYPOS.has(tld)) return `${local}@${label}.com`
  // a near-miss of the provider's name on .com (or a mistyped ending as well)
  if (tld === 'com' || ENDING_TYPOS.has(tld))
    for (const p of PROVIDERS) if (label !== p && distance(label, p) <= 1 && label.length >= 4) return `${local}@${p}.com`
  return null
}
