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

/**
 * LEGAL-FIX-1 (legal/accessibility review L07; WCAG 1.1.1 Non-text Content and 2.4.4 Link Purpose): source links that would
 * render with no accessible name. Nothing new is worded; each case reuses the page's own structure or text.
 * - `unwrap`: the link has no content at all (empty, or only line breaks), so its content renders without the link.
 * - `decorative`: an image-only link whose card also holds a named link to the same destination (an Elementor image box:
 *   picture + titled heading link). The picture link leaves the accessibility tree and the tab order (aria-hidden,
 *   tabindex -1); the card's heading link is the one named link. Pointer users can still click the picture.
 * - `label`: an image-only link with no such twin is named by its card's heading.
 */
export type NamelessLink = { kind: 'unwrap' } | { kind: 'decorative' } | { kind: 'label'; label: string }
const hidden = (n: El) => n.attrs['aria-hidden'] === 'true' || 'hidden' in n.attrs
/** The accessible name a source subtree would carry (its text, image alts, SVG titles, aria-labels), or ''. */
export function sourceName(n: SalmonNode): string {
  if (typeof n === 'string') return n
  if (hidden(n)) return ''
  if (n.attrs['aria-label']?.trim()) return n.attrs['aria-label']
  if (n.tag === 'img') return n.attrs.alt ?? ''
  if (n.tag === 'svg') {
    const title = n.children.find((c): c is El => typeof c !== 'string' && c.tag === 'title')
    return title ? salmonNodeText(title) : ''
  }
  return n.children.map(sourceName).join(' ')
}
const hasImage = (n: SalmonNode): boolean => typeof n !== 'string' && (n.tag === 'img' || n.children.some(hasImage))
const named = (n: SalmonNode) => sourceName(n).replace(/\s+/g, ' ').trim() !== ''
const destination = (href: string | undefined, base: string): string | undefined => {
  if (!href || href.startsWith('#')) return undefined
  try {
    const url = new URL(href, base)
    return url.pathname.replace(/\/?$/, '/')
  } catch {
    return undefined
  }
}
const namelessCache = new WeakMap<object, Map<string, NamelessLink>>()
/** Source key → the treatment of every link in the document that has no accessible name. */
export function namelessLinks(doc: Pick<SalmonDocument, 'children' | 'sourceUrl'>): Map<string, NamelessLink> {
  const hit = namelessCache.get(doc.children)
  if (hit) return hit
  const out = new Map<string, NamelessLink>()
  const items: Array<{ key: string; node: El; ancestors: string[]; kind: 'h' | 'a' }> = []
  const walk = (n: SalmonNode, key: string, ancestors: string[]) => {
    if (typeof n === 'string') return
    if (HEADING.test(n.tag)) items.push({ key, node: n, ancestors, kind: 'h' })
    if (n.tag === 'a') items.push({ key, node: n, ancestors, kind: 'a' })
    n.children.forEach((c, i) => walk(c, `${key}.${i}`, [...ancestors, key]))
  }
  ;(doc.children as SalmonNode[]).forEach((c, i) => walk(c, `body.${i}`, []))
  for (const link of items) {
    if (link.kind !== 'a' || named(link.node)) continue
    if (!hasImage(link.node)) {
      out.set(link.key, { kind: 'unwrap' })
      continue
    }
    const target = destination(link.node.attrs.href, doc.sourceUrl)
    let treatment: NamelessLink | undefined
    for (const anc of [...link.ancestors].reverse()) {
      const inCard = items.filter((it) => it.key !== link.key && it.ancestors.includes(anc))
      const twin = inCard.find((it) => it.kind === 'a' && named(it.node) && target !== undefined && destination(it.node.attrs.href, doc.sourceUrl) === target)
      if (twin) {
        treatment = { kind: 'decorative' }
        break
      }
      const heading = inCard.find((it) => it.kind === 'h' && text(it.node))
      if (heading) {
        treatment = { kind: 'label', label: text(heading.node) }
        break
      }
    }
    if (treatment) out.set(link.key, treatment)
  }
  namelessCache.set(doc.children, out)
  return out
}
/** The treatment for a link node outside the document body (e.g. a product panel): only the content-free case is decided here. */
export const namelessLink = (doc: Pick<SalmonDocument, 'children' | 'sourceUrl'>, key: string, node: SalmonNode): NamelessLink | undefined =>
  namelessLinks(doc).get(key) ?? (typeof node !== 'string' && node.tag === 'a' && !named(node) && !hasImage(node) ? { kind: 'unwrap' } : undefined)
