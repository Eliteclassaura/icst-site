/**
 * SIGNATURES-1: the pure part of the signature rules (no server imports), so the settings form can use the same
 * sanitiser and the same advisory as the server. Plain text only; never rewrites the words.
 */
export const SIGNATURE_MAX_LINES = 6
export const SIGNATURE_MAX_LINE = 120
export const SIGNATURE_MAX_CHARS = 600

export type Sanitized = { text: string; warnings: string[] }

const PHONE = /(?:\+?\d[\d\s().-]{5,}\d)/g
const STREET = /\b\d{1,5}\s+(?:[A-Za-z0-9.'-]+\s+){0,3}(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|court|ct|suite|ste|floor|fl)\b\.?/i
const POBOX = /\bP\.?\s?O\.?\s+Box\b/i

/** Advisory only: does this look like a phone number or a street address? */
export function addressPhoneWarnings(text: string): string[] {
  const out: string[] = []
  const phone = [...text.matchAll(PHONE)].some((m) => m[0].replace(/\D/g, '').length >= 7)
  if (phone) out.push('This looks like a phone number. Signatures leave phone numbers out (an owner rule for email), but you can keep it.')
  if (STREET.test(text) || POBOX.test(text)) out.push('This looks like a street address. Signatures leave addresses out (an owner rule for email), but you can keep it.')
  return out
}

/** Clean a typed signature: no markup, no control characters, trimmed lines, at most 6 lines of 120 characters. Never rewrites the words. */
export function sanitizeSignature(raw: unknown): { ok: true; value: Sanitized } | { ok: false; code: string; message: string } {
  if (raw === undefined || raw === null) return { ok: true, value: { text: '', warnings: [] } }
  if (typeof raw !== 'string') return { ok: false, code: 'SIGNATURE_INVALID', message: 'Type the signature as plain text.' }
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  let t = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
  t = t.replace(/<[^>]*>/g, '') // no markup: tags are dropped, the words stay
  const lines = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  const squeezed: string[] = []
  for (const l of lines) if (l !== '' || squeezed[squeezed.length - 1] !== '') squeezed.push(l)
  if (squeezed.filter(Boolean).length > SIGNATURE_MAX_LINES) return { ok: false, code: 'SIGNATURE_TOO_LONG', message: `Keep the signature to ${SIGNATURE_MAX_LINES} lines or fewer.` }
  if (squeezed.some((l) => l.length > SIGNATURE_MAX_LINE)) return { ok: false, code: 'SIGNATURE_LINE_TOO_LONG', message: `Keep each line under ${SIGNATURE_MAX_LINE} characters.` }
  const text = squeezed.join('\n')
  if (text.length > SIGNATURE_MAX_CHARS) return { ok: false, code: 'SIGNATURE_TOO_LONG', message: 'That signature is too long.' }
  return { ok: true, value: { text, warnings: addressPhoneWarnings(text) } }
}

