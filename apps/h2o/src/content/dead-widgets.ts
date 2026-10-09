/**
 * HOME-LOADMORE-1 (owner, 2026-10-09): leftover Elementor "Load More" widgets whose WordPress script no longer exists.
 *
 * A dead widget is blanked IN PLACE: the same subtree shape with no text and only a `data-dead-widget` marker, so siblings and children keep
 * their position-derived keys (content slots and templates that read nodes by position keep working). Two shapes:
 *  - the loop-grid widget's `e-loop__load-more` button wrapper and its empty helpers (`e-load-more-spinner`, `-anchor`, `-message`);
 *  - an `<a>` without an href whose visible text is exactly "Load More".
 * Where a loop sits in a tab panel of the home's product tabs, its button becomes a normal internal link to that tab's own category or hub
 * ("View all fans"), in the same button markup; otherwise it is removed. Pure, code-owned (applies on read in both content modes and at
 * publish); nothing is written to the database, and a slot is only applied when edited, so an unedited page needs no content step.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type Doc = { children?: unknown } & Record<string, unknown>

/** The home product tabs' own destinations (titles as the tab heading shows them). All are public routes (a test pins that). */
export const TAB_DESTINATIONS: Readonly<Record<string, { href: string; label: string }>> = Object.freeze({
  All: { href: '/cooling-tower-parts-online/', label: 'View all parts' },
  'Fan Stack': { href: '/cooling-tower-fan-stacks/', label: 'View all fan stacks' },
  'Drive Shafts': { href: '/drive-shafts-assembles/', label: 'View all drive shafts' },
  'Fill Media': { href: '/fill-media/', label: 'View all fill media' },
  'FRP Members': { href: '/frp-members/', label: 'View all FRP members' },
  Fan: { href: '/fans/', label: 'View all fans' },
  Gearbox: { href: '/gear-box/', label: 'View all gear boxes' },
  Motor: { href: '/motors/', label: 'View all motors' },
  Nozzle: { href: '/nozzles/', label: 'View all nozzles' },
  'Tower Hardware': { href: '/tower-hardware/', label: 'View all tower hardware' },
})

const classes = (n: Node): string[] => (typeof n === 'string' ? [] : (n.attrs?.class ?? '').split(/\s+/).filter(Boolean))
const hasClass = (n: Node, c: string) => classes(n).includes(c)
const text = (n: Node): string => (typeof n === 'string' ? n : n.children.map(text).join(''))
const el = (n: Node): n is Exclude<Node, string> => typeof n !== 'string'
const hasHref = (n: Node): boolean => el(n) && ((n.tag === 'a' && Boolean(n.attrs.href)) || n.children.some(hasHref))
/** The widget's whole subtree with the same shape and no content (no text, no attributes but the marker): templates that read nodes by position keep working. */
const stub = (n: Node): Node => (typeof n === 'string' ? '' : { tag: n.tag, attrs: { 'data-dead-widget': '' }, children: n.children.map(stub) })
const HELPERS = ['e-load-more-spinner', 'e-load-more-anchor', 'e-load-more-message']

/** The button wrapper as a link to `dest` (same markup and classes, an href, the label), or null to remove it. */
function asLink(wrapper: Exclude<Node, string>, dest: { href: string; label: string } | undefined): Node {
  if (!dest) return stub(wrapper)
  const relabel = (n: Node): Node => {
    if (!el(n)) return n
    if (hasClass(n, 'elementor-button-text')) return { ...n, children: [dest.label] }
    return { ...n, children: n.children.map(relabel) }
  }
  const link = (n: Node): Node => {
    if (!el(n)) return n
    if (n.tag === 'a' && hasClass(n, 'elementor-button') && !n.attrs.href) {
      const { role: _role, ...attrs } = n.attrs
      void _role
      return { ...n, attrs: { ...attrs, href: dest.href }, children: n.children.map(relabel) }
    }
    return { ...n, children: n.children.map(link) }
  }
  return link(wrapper)
}

export const deadWidgetCount = (doc: unknown): number => {
  let n = 0
  const walk = (x: Node) => {
    if (!el(x)) return
    if (HELPERS.some((c) => hasClass(x, c)) || (hasClass(x, 'e-loop__load-more') && !hasHref(x)) || (x.tag === 'a' && !x.attrs.href && text(x).trim().toLowerCase() === 'load more')) n++
    for (const c of x.children) walk(c)
  }
  for (const c of ((doc as Doc)?.children as Node[] | undefined) ?? []) walk(c)
  return n
}

/** Replace every dead Load More widget; the same document object when there is none. */
export function withoutDeadLoadMore<T extends Doc>(doc: T): T {
  if (!Array.isArray(doc.children)) return doc
  // the "View all" links are the home's product tabs only; on any other page a dead widget is simply removed
  const home = (doc as { targetPath?: unknown }).targetPath === '/'
  let changed = false
  const visit = (n: Node, dest?: { href: string; label: string }): Node => {
    if (!el(n)) return n
    if (HELPERS.some((c) => hasClass(n, c))) { changed = true; return stub(n) }
    if (hasClass(n, 'e-loop__load-more')) { changed = true; return asLink(n, dest) }
    if (n.tag === 'a' && !n.attrs.href && text(n).trim().toLowerCase() === 'load more') { changed = true; return stub(n) }
    // a tab strip and its panels are siblings: panel i belongs to heading i
    const heading = n.children.find((c) => el(c) && hasClass(c, 'e-n-tabs-heading')) as Exclude<Node, string> | undefined
    const content = n.children.find((c) => el(c) && hasClass(c, 'e-n-tabs-content')) as Exclude<Node, string> | undefined
    if (heading && content) {
      const titles = heading.children.filter(el).map((t) => text(t).replace(/\s+/g, ' ').trim()).filter(Boolean)
      let panel = -1
      const panels = content.children.map((c) => (el(c) ? (panel++, visit(c, home ? TAB_DESTINATIONS[titles[panel] ?? ''] : undefined)) : c))
      const rest = n.children.map((c) => (c === content ? { ...content, children: panels } : visit(c)))
      return { ...n, children: rest }
    }
    return { ...n, children: n.children.map((c) => visit(c, dest)) }
  }
  const children = (doc.children as Node[]).map((c) => visit(c))
  return changed ? ({ ...doc, children } as T) : doc
}
