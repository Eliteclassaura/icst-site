import { emailKey } from '../normalize'

/**
 * Input validation for workspace actions. Every value from a form is untrusted: ids are checked for shape
 * before any query (a malformed id never reaches Postgres), text is trimmed and bounded, enums are
 * checked against the accepted vocabulary.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** A relationship id from a form: a UUID, or `null` when absent/empty. Anything else is invalid. */
export function relationshipId(v: unknown): { ok: true; id: string | null } | { ok: false } {
  if (v === null || v === undefined || v === '') return { ok: true, id: null }
  return isUuid(v) ? { ok: true, id: String(v).toLowerCase() } : { ok: false }
}

export function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, (m) => (m.includes('\n') ? m : ' ')).trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

/** Single-line text (names, company). */
export const line = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? text(v.replace(/[\r\n]+/g, ' '), max) : null

export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

/**
 * A phone number as typed. Accepted characters: digits, space, + ( ) - . and "ext"/"x" extensions.
 * It must carry 7–15 digits before any extension (E.164 allows at most 15).
 */
export function phone(v: unknown): { ok: true; value: string | null } | { ok: false } {
  const raw = line(v, 40)
  if (!raw) return { ok: true, value: null }
  if (!/^[+\d\s().-]+((\s*(ext\.?|x)\s*)\d{1,6})?$/i.test(raw)) return { ok: false }
  const main = raw.replace(/(\s*(ext\.?|x)\s*)\d{1,6}$/i, '')
  const digits = main.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return { ok: false }
  return { ok: true, value: raw }
}

export function email(v: unknown): { ok: true; value: string | null } | { ok: false } {
  const raw = line(v, 254)
  if (!raw) return { ok: true, value: null }
  return emailKey(raw) ? { ok: true, value: raw } : { ok: false }
}

/** A date-time from a `datetime-local` or ISO input. */
export function dateTime(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A calendar date (yyyy-mm-dd) → the end of that day in the business zone is applied by the caller. */
export function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : v
}

export type FieldErrors = Record<string, string>
