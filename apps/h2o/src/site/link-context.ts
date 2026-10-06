/**
 * R2.4 (Control Tower 2026-10-05; SEO Checker item l, Lighthouse "link-text"): a link whose visible text says nothing on its
 * own ("Learn more", "View more" …) gets an accessible name from the card it sits in — its own words plus that card's
 * heading ("Learn more: Cooling Tower Repair"). Nothing new is worded: both parts are the page's own text; the visible text
 * is unchanged. Keys are the source node paths (`body.i.j…`) every renderer already uses.
 */
import { salmonNodeText, type SalmonDocument, type SalmonNode } from './salmon'

/** Lighthouse's non-descriptive link texts (en), plus the site's own card labels of the same kind. */
export const NON_DESCRIPTIVE = /^(?:click here|click this|go|here|information|learn more|more|more info|more information|right here|read more|see more|start|this|continue|details|link|view|view more|explore|discover more)$/i
const HEADING = /^h[1-4]$/
type El = Exclude<SalmonNode, string>
const text = (n: SalmonNode) => salmonNodeText(n).replace(/\s+/g, ' ').trim()

const cache = new WeakMap<object, Map<string, string>>()
/** Source key → accessible name, for every non-descriptive link in the document that sits under a heading. */
export function linkContextLabels(doc: Pick<SalmonDocument, 'children'>): Map<string, string> {
  const hit = cache.get(doc.children)
  if (hit) return hit
  const out = new Map<string, string>()
  // document-order list of headings and links, each with its ancestor keys
  const items: Array<{ key: string; kind: 'h' | 'a'; text: string; ancestors: string[] }> = []
  const walk = (n: SalmonNode, key: string, ancestors: string[]) => {
    if (typeof n === 'string') return
    if (HEADING.test(n.tag)) items.push({ key, kind: 'h', text: text(n), ancestors })
    if (n.tag === 'a') items.push({ key, kind: 'a', text: text(n), ancestors })
    n.children.forEach((c, i) => walk(c, `${key}.${i}`, [...ancestors, key]))
  }
  ;(doc.children as SalmonNode[]).forEach((c, i) => walk(c, `body.${i}`, []))
  items.forEach((link, index) => {
    if (link.kind !== 'a' || !NON_DESCRIPTIVE.test(link.text)) return
    // the nearest ancestor that holds a heading; within it, the last heading before the link (else the first after it)
    for (const anc of [...link.ancestors].reverse()) {
      const inside = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === 'h' && it.text && it.ancestors.includes(anc))
      if (!inside.length) continue
      const before = inside.filter(({ i }) => i < index).at(-1) ?? inside[0]!
      out.set(link.key, `${link.text}: ${before.it.text}`)
      break
    }
  })
  cache.set(doc.children, out)
  return out
}

/** The accessible name for the link at `key`, if its text is non-descriptive and a heading names its card. */
export const linkLabel = (doc: Pick<SalmonDocument, 'children'>, key: string): string | undefined => linkContextLabels(doc).get(key)
export type { El }
