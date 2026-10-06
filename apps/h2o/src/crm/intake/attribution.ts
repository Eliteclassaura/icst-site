/**
 * Patch L4: attribution captured natively (contract H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1 §4) → the RFQ `attribution`
 * group. Pure: validates and caps every value; anything malformed is dropped and named in `rejected` (by key, never by
 * value). The browser sends first-touch values from sessionStorage; the server never trusts them beyond this shape.
 *
 *   utm_source / utm_medium ≤ 64 · utm_campaign / utm_term / utm_content ≤ 128 — letters, digits and . _ ~ % + - : / space
 *   gclid / gbraid / wbraid ≤ 256 — the URL-safe token alphabet Google uses
 *   ga_client_id ≤ 64 — "<digits>.<digits>" (GA4 cookie format), and only when the client had analytics consent
 *   landing_page / page_path ≤ 512 — a site-relative path, no query string or fragment
 *   referrer ≤ 512 — origin + path only (http/https), no query string, fragment or credentials
 */
export const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'ga_client_id', 'landing_page', 'referrer',
] as const
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]

const MAX: Record<AttributionKey, number> = {
  utm_source: 64, utm_medium: 64, utm_campaign: 128, utm_term: 128, utm_content: 128,
  gclid: 256, gbraid: 256, wbraid: 256, ga_client_id: 64, landing_page: 512, referrer: 512,
}
const hasControl = (v: string) => [...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)
const UTM = /^[\p{L}\p{N} ._~%+:/-]+$/u
const CLICK_ID = /^[A-Za-z0-9_-]+$/
const GA = /^\d{1,20}\.\d{1,20}$/
const PATH = /^\/(?:[A-Za-z0-9\-._~/]|%[0-9A-Fa-f]{2})*$/

function sitePath(v: string): string | null {
  if (!PATH.test(v) || v.includes('//') || /(^|\/)\.\.(\/|$)/.test(v)) return null
  return v
}
function referrer(v: string): string | null {
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.username || u.password) return null
    const out = `${u.origin}${u.pathname}`
    return out.length <= MAX.referrer ? out : null
  } catch {
    return null
  }
}

export function validateAttribution(raw: unknown): { attribution: Partial<Record<AttributionKey, string>>; rejected: string[] } {
  const attribution: Partial<Record<AttributionKey, string>> = {}
  const rejected: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { attribution, rejected }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(ATTRIBUTION_KEYS as readonly string[]).includes(k)) {
      rejected.push(`${k.slice(0, 32)}:NOT_ALLOWLISTED`)
      continue
    }
    const key = k as AttributionKey
    if (v === undefined || v === null || v === '') continue
    if (typeof v !== 'string' || v.length > MAX[key] || hasControl(v) || v.includes('@')) {
      rejected.push(`${key}:INVALID`)
      continue
    }
    const value = v.trim()
    let ok: string | null = null
    if (key.startsWith('utm_')) ok = UTM.test(value) ? value : null
    else if (key === 'gclid' || key === 'gbraid' || key === 'wbraid') ok = CLICK_ID.test(value) ? value : null
    else if (key === 'ga_client_id') ok = GA.test(value) ? value : null
    else if (key === 'landing_page') ok = sitePath(value)
    else if (key === 'referrer') ok = referrer(value)
    if (ok) attribution[key] = ok
    else rejected.push(`${key}:INVALID`)
  }
  return { attribution, rejected }
}
