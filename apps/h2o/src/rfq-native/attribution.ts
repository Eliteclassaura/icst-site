/**
 * Native RFQ: first-touch attribution (contract §4 "client capture rules"; CT R5.1). On the session's FIRST page load the
 * launcher (mounted on every public page) records utm_*, gclid, gbraid, wbraid, the landing path and the referrer
 * (origin + path) in sessionStorage under `h2o.rfq.attr.v1`; "Send request" uses that record, so moving around the site
 * never loses the landing tags. Nothing is sent before submit; no localStorage, no cookie is written, no query string or
 * search term is kept. Values are trimmed and length-limited here; the server sanitises them to the contract limits.
 * The GA4 client id stays dormant (owner: no GA for now): it is read only under `<html data-analytics-consent="granted">`,
 * which nothing sets.
 */
import type { Attribution } from './submission'

export const ATTR_KEY = 'h2o.rfq.attr.v1'
const TAGS: Array<[keyof Attribution, number]> = [['utm_source', 64], ['utm_medium', 64], ['utm_campaign', 128], ['utm_term', 128], ['utm_content', 128], ['gclid', 256], ['gbraid', 256], ['wbraid', 256]]
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const clean = (v: string | null | undefined, max: number): string | undefined => {
  const s = (v ?? '').trim()
  return s && s.length <= max && !s.includes('@') && !CONTROL.test(s) ? s : undefined
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

type Win = { location: { href: string }; sessionStorage?: Storage; document: { referrer: string; cookie: string; documentElement?: { dataset?: DOMStringMap } } }
const consentOf = (win: Win) => win.document.documentElement?.dataset?.analyticsConsent === 'granted'
const held = (win: Win): Attribution | null => {
  try {
    const raw = win.sessionStorage?.getItem(ATTR_KEY)
    return raw ? (JSON.parse(raw) as Attribution) : null
  } catch {
    return null
  }
}

/** First page load of the session: record this page's attribution once (later pages never overwrite it). */
export function captureFirstTouch(win: Win): void {
  if (held(win)) return
  const { ga_client_id: _consentBound, ...first } = readAttribution(win.location.href, win.document.referrer, '', false)
  void _consentBound
  try {
    win.sessionStorage?.setItem(ATTR_KEY, JSON.stringify(first))
  } catch {
    /* storage unavailable: the send falls back to the current page */
  }
}

/** At "Send request": the session's first touch, else (nothing stored) the current page; the GA id only under consent. */
export function sessionAttribution(win: Win): Attribution {
  const first = held(win) ?? readAttribution(win.location.href, win.document.referrer, '', false)
  const { ga_client_id: _stale, ...rest } = first
  void _stale
  const ga = consentOf(win) ? readAttribution(win.location.href, '', win.document.cookie, true).ga_client_id : undefined
  return ga ? { ...rest, ga_client_id: ga } : rest
}
