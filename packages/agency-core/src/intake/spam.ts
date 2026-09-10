/** Heuristic spam score for brief submissions (legacy send.php rules, made explicit and testable). ≥ 5 → silent accept, no records. */
export type SpamVerdict = { score: number; reasons: string[] }

const SPAM_WORDS = [
  'viagra',
  'casino',
  'crypto signals',
  'forex signals',
  'seo services for your website',
  'backlinks package',
  'guest post price',
  'increase your ranking',
  'buy followers',
  'loan approval',
  'bitcoin investment',
]

export function scoreSpam(input: {
  brief: string
  name?: string
  company?: string
  site?: string
  email: string
  dwellSeconds?: number | null
}): SpamVerdict {
  const reasons: string[] = []
  let score = 0
  const text = `${input.brief} ${input.company ?? ''} ${input.name ?? ''}`.toLowerCase()
  const links = (input.brief.match(/https?:\/\//gi) ?? []).length
  if (links >= 3) {
    score += 3
    reasons.push(`links:${links}`)
  } else if (links >= 1) {
    score += 1
    reasons.push(`links:${links}`)
  }
  const hits = SPAM_WORDS.filter((w) => text.includes(w))
  if (hits.length) {
    score += Math.min(4, hits.length * 2)
    reasons.push(`words:${hits.join('|')}`)
  }
  const letters = input.brief.replace(/[^a-z]/gi, '')
  if (letters.length > 40 && letters === letters.toUpperCase()) {
    score += 2
    reasons.push('all-caps')
  }
  if (input.brief.trim().length < 12) {
    score += 1
    reasons.push('too-short')
  }
  if (/(.)\1{7,}/.test(input.brief)) {
    score += 2
    reasons.push('repeated-chars')
  }
  if (input.name && /https?:\/\//i.test(input.name)) {
    score += 3
    reasons.push('url-in-name')
  }
  if (input.dwellSeconds != null && input.dwellSeconds < 3) {
    score += 2
    reasons.push('fast-dwell')
  }
  if (input.dwellSeconds == null) {
    score += 1
    reasons.push('no-dwell') // native no-JS submits have no timer; not a rejection on its own
  }
  const local = input.email.split('@')[0] ?? ''
  if (/^[a-z0-9]{16,}$/i.test(local) && !/[aeiou]/i.test(local)) {
    score += 1
    reasons.push('random-local-part')
  }
  return { score, reasons }
}

export const SPAM_THRESHOLD = 5
