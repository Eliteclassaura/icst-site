/**
 * PLACEHOLDER-CARDS-1 (CT 2026-10-11, staging audit H2O-098/102): the WordPress demo products "ABB Motor Example", "TECO / Westinghouse Motor
 * Example" and "Vibration Switch Example" are retired (their product pages 301 to the category), but the home's product tabs, the Parts hub and the
 * Motors and Tower Hardware pages still carried their loop cards, linking to a redirect.
 *
 * A loop card (`e-loop-item`, or a WooCommerce `li.product`) that links to a `/product/<slug>-example/` page is replaced IN PLACE by the site's existing
 * public-exclusion stub (`div[data-public-exclusion]`, children none): the renderers draw nothing for it (so the grid closes up, no gap, no CSS), the content
 * slots skip it, and every sibling keeps its position-derived key (same rule as ./public-exclusions). Pure and code-owned: it applies on
 * read in both content modes and at publish; nothing is written to the database. The search index is built from the same read, so it loses the cards too.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type Doc = { children?: unknown } & Record<string, unknown>

/** The placeholder products' own paths: any `/product/<slug>-example/` (the three demo products of the import). */
export const PLACEHOLDER_PRODUCT = /^\/product\/[^/]+-example\/?$/i

const el = (n: Node): n is Exclude<Node, string> => typeof n !== 'string'
const classes = (n: Node): string[] => (el(n) ? (n.attrs?.class ?? '').split(/\s+/).filter(Boolean) : [])
const pathOf = (href: string): string => { try { return new URL(href, 'https://h2ocooling.com').pathname } catch { return href } }
/** A product card: an Elementor loop item or a WooCommerce archive item. */
const isCard = (n: Node): boolean => el(n) && (classes(n).includes('e-loop-item') || (n.tag === 'li' && classes(n).includes('product')))
const linksToPlaceholder = (n: Node): boolean => el(n) && ((n.tag === 'a' && Boolean(n.attrs.href) && PLACEHOLDER_PRODUCT.test(pathOf(n.attrs.href))) || n.children.some(linksToPlaceholder))
/** The existing public-exclusion stub (./public-exclusions): rendered as nothing, skipped by content slots and search text. */
const stub = (n: Exclude<Node, string>): Node => ({ tag: 'div', attrs: { 'data-public-exclusion': `placeholder-card:${/\be-loop-item-(\d+)\b|\bpost-(\d+)\b/.exec(n.attrs?.class ?? '')?.slice(1).find(Boolean) ?? 'x'}` }, children: [] })

/** Number of placeholder loop cards in a document (the transform's precheck). */
export const placeholderCardCount = (doc: unknown): number => {
  let k = 0
  const walk = (x: Node) => {
    if (!el(x)) return
    if (isCard(x) && linksToPlaceholder(x)) { k++; return }
    for (const c of x.children) walk(c)
  }
  for (const c of ((doc as Doc)?.children as Node[] | undefined) ?? []) walk(c)
  return k
}

/** Blank every placeholder loop card; the same document object when there is none. */
export function withoutPlaceholderCards<T extends Doc>(doc: T): T {
  if (!Array.isArray(doc.children) || placeholderCardCount(doc) === 0) return doc
  const visit = (n: Node): Node => {
    if (!el(n)) return n
    if (isCard(n) && linksToPlaceholder(n)) return stub(n)
    return { ...n, children: n.children.map(visit) }
  }
  return { ...doc, children: (doc.children as Node[]).map(visit) } as T
}
