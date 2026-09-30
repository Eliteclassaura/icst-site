/**
 * Quote-intent migration by source identity (R1B, Control Tower D1–D6 / F7).
 *
 * Runs at import over the provenance tree of one accepted source document. It stamps `data-rfq-intent="quote"`
 * (and, for D1, `data-rfq-product=<route id>`) on the exact source action elements, and applies the two D5 href
 * corrections. The stamped intent is then carried by the editable action slot, so later label edits keep the
 * action a quote action. A deliberate intent change is an explicit slot field change (validated, versioned,
 * audited by Payload versions). Every decision is returned as a ledger row with route, element id and key.
 *
 *   D1  a category/family card "Buy/Order/Purchase Now" link whose destination is a PUBLIC product route →
 *       quote intent + that product relation (category_and_family placement at render, gate-checked).
 *   D2  the duplicate standalone "Get A Quote" widget (ee68c85) on a matched Wave 4 article → no intent; it is
 *       conditionally suppressed at render when the canonical in-body quote control renders.
 *   D3  "Contact for pricing" buttons → quote intent (generic editorial_inline).
 *   D4  project-detail navigation quote link → template control (./rfq-controls, editorial_inline); no data.
 *   D5  the two documented prose links to /contact/ → /contact-us/ (wording, route and state unchanged).
 *   D6  "Get a Custom Quote" on /new-cooling-tower-page/ → quote intent (generic editorial_inline).
 *   Contract import rule (SALMON_FAMILY_PAGE_V1 1.1.0 §10): a Contact-bound button whose label is an explicit
 *   quote request (`Request/Get … Quote`) or exactly "Contact Us for a Quote" → quote intent. No other
 *   "Contact …" label, no prose, no word-based rewrite.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type El = Exclude<Node, string>
type Doc = Record<string, unknown>

export type IntentDecision = { routeId: string; key: string; elementId: string | null; rule: 'D1' | 'D2' | 'D3' | 'D5' | 'D6' | 'CONTRACT_QUOTE_LABEL' | 'MAIN_OWNED_PARTS_HERO' | 'D1_UNRESOLVED'; label: string; sourceHref: string; product?: string | null; action: 'QUOTE_INTENT' | 'SUPPRESS_IF_CANONICAL_INLINE' | 'HREF_CORRECTED' | 'UNCHANGED_MAIN_OWNED' | 'UNCHANGED_NO_PUBLIC_PRODUCT' }

const HOSTS = new Set(['h2ocooling.com', 'www.h2ocooling.com', 'salmon-rhinoceros-754457.hostingersite.com'])
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (n: Node): string => (typeof n === 'string' ? n : n.children.map(textOf).join(''))
const pathOf = (href: string, base: string): string | null => {
  try {
    const u = new URL(href, base || 'https://h2ocooling.com/')
    return HOSTS.has(u.hostname) ? u.pathname : null
  } catch {
    return null
  }
}
const QUOTE_REQUEST = /^(?:request|get)\b.*\bquote\b/i
const BUY = /^(?:Buy|Order|Purchase) Now$/i

export const D2_WIDGET = 'ee68c85'
export const D5_CORRECTIONS: ReadonlyArray<{ routeId: string; key: string; from: string; to: string }> = [
  { routeId: 'LIVE-posts-2375', key: 'body.26.5', from: 'https://h2ocooling.com/contact/', to: '/contact-us/' },
  { routeId: 'LIVE-posts-2384', key: 'body.191.5', from: 'https://h2ocooling.com/contact/', to: '/contact-us/' },
]
/**
 * The ten Parts hero "Contact Us for a Quote" actions (nine parts landings + the Parts index) are Main Factory
 * presentation authority (Control Tower 2026-09-30). The runtime import leaves them exactly as imported and
 * records them; Main's integration patch owns their treatment (the tenth, Parts-index CTA, is not removed).
 */
export const MAIN_OWNED_PARTS_HERO_PATHS = new Set(['/cooling-tower-fan-stacks/', '/drive-shafts-assembles/', '/fans/', '/fill-media/', '/frp-members/', '/gear-box/', '/motors/', '/nozzles/', '/tower-hardware/', '/cooling-tower-parts-online/'])
export const D6_ACTION = { routeId: 'LIVE-pages-19498', key: 'body.1.1.1.1.1.5.1.1.1', label: 'Get a Custom Quote' }

export type IntentContext = {
  routeId: string
  /** Public product route id by product page path (D1 relation target). */
  publicProducts: Map<string, string>
  /** Matched Wave 4 article (D2 applies only there). */
  matchedArticle: boolean
}

/** Stamp intents in place on `doc.children` (a clone owned by the importer) and return the decisions. */
export function migrateQuoteIntent(doc: Doc, ctx: IntentContext): IntentDecision[] {
  const decisions: IntentDecision[] = []
  const base = String(doc.sourceUrl ?? '')
  const walk = (n: Node, key: string, widget: string | null, elementId: string | null) => {
    if (typeof n === 'string') return
    const id = n.attrs?.['data-id'] ?? elementId
    const w = /(?:^|\s)elementor-widget-button(?:\s|$)/.test(n.attrs?.class ?? '') ? (n.attrs['data-id'] ?? null) : widget
    if (n.tag === 'a') decide(n as El, key, w, id)
    n.children?.forEach((c, i) => walk(c, `${key}.${i}`, w, id))
  }
  const decide = (a: El, key: string, widget: string | null, elementId: string | null) => {
    const href = a.attrs.href ?? ''
    const label = norm(textOf(a))
    const path = pathOf(href, base)
    const button = /(?:^|\s)elementor-button(?:\s|$)/.test(a.attrs.class ?? '') && Boolean(widget)
    const row = (rule: IntentDecision['rule'], action: IntentDecision['action'], product?: string | null) => decisions.push({ routeId: ctx.routeId, key, elementId: widget ?? elementId, rule, label, sourceHref: href, product: product ?? null, action })
    const d5 = D5_CORRECTIONS.find((c) => c.routeId === ctx.routeId && c.key === key && c.from === href)
    if (d5) {
      a.attrs.href = d5.to
      row('D5', 'HREF_CORRECTED')
      return
    }
    if (ctx.routeId === D6_ACTION.routeId && key === D6_ACTION.key && label === D6_ACTION.label) {
      a.attrs['data-rfq-intent'] = 'quote'
      row('D6', 'QUOTE_INTENT')
      return
    }
    if (BUY.test(label) && path && /^\/product\/[^/]+\/$/.test(path)) {
      const product = ctx.publicProducts.get(path) ?? null
      if (product) {
        a.attrs['data-rfq-intent'] = 'quote'
        a.attrs['data-rfq-product'] = product
        row('D1', 'QUOTE_INTENT', product)
      } else row('D1_UNRESOLVED', 'UNCHANGED_NO_PUBLIC_PRODUCT') // held/private/missing target: no product context
      return
    }
    if (!button || path?.replace(/\/$/, '') !== '/contact-us') return
    if (ctx.matchedArticle && widget === D2_WIDGET) {
      row('D2', 'SUPPRESS_IF_CANONICAL_INLINE')
      return
    }
    if (/^contact for pricing$/i.test(label)) {
      a.attrs['data-rfq-intent'] = 'quote'
      row('D3', 'QUOTE_INTENT')
      return
    }
    if (label === 'Contact Us for a Quote' && MAIN_OWNED_PARTS_HERO_PATHS.has(String(doc.targetPath ?? ''))) {
      row('MAIN_OWNED_PARTS_HERO', 'UNCHANGED_MAIN_OWNED')
      return
    }
    if (QUOTE_REQUEST.test(label) || label === 'Contact Us for a Quote') {
      a.attrs['data-rfq-intent'] = 'quote'
      row('CONTRACT_QUOTE_LABEL', 'QUOTE_INTENT')
    }
  }
  ;((doc.children as Node[]) ?? []).forEach((c, i) => walk(c, `body.${i}`, null, null))
  return decisions
}
