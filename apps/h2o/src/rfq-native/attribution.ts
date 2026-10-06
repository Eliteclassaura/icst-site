/**
 * Native RFQ: attribution, captured natively (contract §4 "client capture rules"): utm_*, gclid, gbraid and wbraid from the
 * session's first page, with that page as landing_page; the referrer reduced to origin + path. Never a query string, never
 * a search term. The GA4 client id is read only when analytics consent is granted — the site has no analytics today, so the
 * signal (`<html data-analytics-consent="granted">`) is never set and the id is never sent.
 */
import type { Attribution } from './submission'

const KEY = 'h2o.rfq.attribution.v1'
const TAGS: Array<[keyof Attribution, number]> = [['utm_source', 64], ['utm_medium', 64], ['utm_campaign', 128], ['utm_term', 128], ['utm_content', 128], ['gclid', 256], ['gbraid', 256], ['wbraid', 256]]
const clean = (v: string | null | undefined, max: number): string | undefined => {
  const s = (v ?? '').trim()
  return s && s.length <= max && !s.includes('@') && /^[\p{L}\p{N} ._:/+~-]*$/u.test(s) ? s : undefined
}

/** What one page view says (pure: the caller passes the location, the referrer and the cookie string). */
export function readAttribution(href: string, referrer: string, cookie: string, consent: boolean): Attribution {
  const out: Attribution = {}
  try {
    const u = new URL(href)
    for (const [tag, max] of TAGS) {
      const v = clean(u.searchParams.get(tag), max)
      if (v) out[tag] = v
    }
    const landing = clean(u.pathname, 512)
    if (landing) out.landing_page = landing
  } catch {
    /* no location */
  }
  try {
    if (referrer) {
      const r = new URL(referrer)
      const v = clean(`${r.origin}${r.pathname}`, 512)
      if (v) out.referrer = v
    }
  } catch {
    /* not a URL */
  }
  if (consent) {
    const ga = /(?:^|;\s*)_ga=GA\d\.\d\.(\d+\.\d+)/.exec(cookie)?.[1]
    if (ga && ga.length <= 64) out.ga_client_id = ga
  }
  return out
}

/** The session's attribution: first touch wins (the landing page's tags), kept in sessionStorage. */
export function sessionAttribution(win: { location: { href: string }; sessionStorage?: Storage; document: { referrer: string; cookie: string; documentElement?: { dataset?: DOMStringMap } } }): Attribution {
  const consent = win.document.documentElement?.dataset?.analyticsConsent === 'granted'
  const now = readAttribution(win.location.href, win.document.referrer, win.document.cookie, consent)
  try {
    const held = win.sessionStorage?.getItem(KEY)
    if (held) {
      const first = JSON.parse(held) as Attribution
      // the client id follows the current consent, never the stored one
      delete first.ga_client_id
      return { ...first, ...(now.ga_client_id ? { ga_client_id: now.ga_client_id } : {}) }
    }
    const { ga_client_id: _omit, ...stored } = now
    void _omit
    win.sessionStorage?.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* storage unavailable: this page view only */
  }
  return now
}
