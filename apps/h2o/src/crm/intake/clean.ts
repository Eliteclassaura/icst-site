import { stripControls } from '../../rfq-native/flow'

/**
 * 1.3c-8 input hardening: text that reaches the database must be storable. Postgres refuses U+0000 in `text` and in `jsonb`, and a lone
 * surrogate (an emoji cut in the middle by a length limit) is not valid text, so one such character in one field made the whole quote
 * submission fail with a 500 and the lead was lost. `cleanText` removes control characters (U+0000 included, see `stripControls`) and any
 * unpaired surrogate; `cleanDeep` does the same for every string, and every object key, of a JSON-like value (and refuses one that is
 * nested too deeply). Dates, numbers, booleans and null pass through unchanged; a class instance (anything that is not a plain object
 * or an array) is returned as it is.
 */
export const cleanText = (v: string): string => stripControls(v)

/** The deepest nesting `cleanDeep` accepts. A value nested deeper is REFUSED, never passed on unchanged (it could carry text the database refuses). */
export const MAX_DEPTH = 8
export class PayloadTooDeepError extends Error {
  constructor() {
    super('payload nested too deeply')
    this.name = 'PayloadTooDeepError'
  }
}
const plain = (v: object): boolean => {
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}

/**
 * Cleans every string and key of a JSON-like value. Throws `PayloadTooDeepError` when it is nested deeper than MAX_DEPTH, so no part of a
 * too-deep value is ever returned uncleaned; callers refuse the request (`parseEnvelope` returns null, `ingestParsed` answers 422).
 */
export function cleanDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return cleanText(value) as unknown as T
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) throw new PayloadTooDeepError()
  if (Array.isArray(value)) return value.map((x) => cleanDeep(x, depth + 1)) as unknown as T
  if (!plain(value)) return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [cleanText(k), cleanDeep(v, depth + 1)])) as T
}

/** The first `n` UTF-16 units of `s`, without ever leaving half of a surrogate pair at the cut. */
export const safeSlice = (s: string, n: number): string => cleanText(s.slice(0, n))
