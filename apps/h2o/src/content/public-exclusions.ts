/**
 * Withheld public content: the exact accepted exclusions (SALMON_FAMILY_PAGE_V1 1.1.0 `exclusions`, R1.1.1
 * seven-row ledger `SEVEN_EXCLUSIONS.json`, verified 2026-09-30). The Payload import, stored records, editor
 * writes, published snapshots, previews and search must never carry them.
 *
 * **Identity, not text.** Each row is the accepted route id plus the Elementor `data-id` of the withheld source
 * element (and its recorded source key, for audit). Matching never uses the card's text. `64afe52` on
 * /industries/ is explicitly NOT withheld and is pinned as retained.
 *
 * **Projection, not cleanup (R1B, Control Tower F3).** A withheld element is replaced in place by an empty
 * `div[data-public-exclusion]` stub, so siblings keep their position-derived render keys. A container whose
 * element children are all withheld becomes a stub as well (the contract's "no empty container" rule). The
 * document's `text` is never trusted: composition derives it from the stubbed tree (./projection-text), so an
 * independently supplied summary, a stale fixture or an already-stubbed node cannot carry withheld words into
 * search. No replacement content is created.
 */
export type PublicExclusion = { routeId: string; path: string; dataId: string; sourceKey: string; reason: string; ruling: string; owner: 'MAIN_FACTORY' }

export const PUBLIC_EXCLUSIONS: readonly PublicExclusion[] = Object.freeze([
  { routeId: "SALMON-pages-8", path: "/industries/", dataId: "11cbd29", sourceKey: "body.5", reason: "UNSUPPORTED_THEME_TESTIMONIAL", ruling: "CT_R1_REVIEW_2026_09_29_C1: Hostinger AI-theme placeholder portraits and unattributed endorsements; not genuine customer testimony", owner: 'MAIN_FACTORY' },
  { routeId: "SALMON-pages-8", path: "/industries/", dataId: "cacba3b", sourceKey: "body.3.1.3.1.1", reason: "IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING", ruling: "CT_R1_1_REVIEW_2026_09_29_A: \"Manufacturing\" card under Power Plants pairs a cooling-tower stock photograph with a factory-machinery project assertion; no approved mapping, card held", owner: 'MAIN_FACTORY' },
  { routeId: "SALMON-pages-8", path: "/industries/", dataId: "f5dbc72", sourceKey: "body.3.1.3.3.1", reason: "IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING", ruling: "CT_R1_REVIEW_2026_09_29_C1: \"Chemical Plants\" card shows a server/electrical-cabinet corridor photograph; no approved mapping, card held", owner: 'MAIN_FACTORY' },
  { routeId: "SALMON-pages-8", path: "/industries/", dataId: "f3b2417", sourceKey: "body.3.1.3.3.3", reason: "IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING", ruling: "CT_R1_REVIEW_2026_09_29_C1: \"Data Centers\" label with a food-safety description over an industrial-pipework photograph; no approved mapping, card held", owner: 'MAIN_FACTORY' },
  { routeId: "SALMON-pages-7", path: "/solutions/", dataId: "90732f5", sourceKey: "body.1.1.3.1.1", reason: "IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING", ruling: "CT_R1_1_REVIEW_2026_09_29_A: \"Data Center\" card pairs a cooling-tower landscape with server-context copy; no approved mapping, card held", owner: 'MAIN_FACTORY' },
  { routeId: "SALMON-pages-7", path: "/solutions/", dataId: "9c34e97", sourceKey: "body.1.1.3.1.3", reason: "IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING", ruling: "CT_R1_1_REVIEW_2026_09_29_A: \"Manufacturing\" card pairs server/electrical-cabinet corridor imagery with manufacturing copy; no approved mapping, card held", owner: 'MAIN_FACTORY' },
  { routeId: "SALMON-pages-7", path: "/solutions/", dataId: "4492d17", sourceKey: "body.1.1.3.1.7", reason: "IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING", ruling: "CT_R1_1_REVIEW_2026_09_29_A: second \"Manufacturing\" card pairs grain-storage imagery with food-production copy; no approved mapping, card held", owner: 'MAIN_FACTORY' },
])

/** Explicitly retained (Control Tower 2026-09-30): never excluded. */
export const RETAINED_ELEMENTS: readonly { routeId: string; dataId: string }[] = Object.freeze([{ routeId: 'SALMON-pages-8', dataId: '64afe52' }])

type Node = string | { tag: string; attrs?: Record<string, string>; children?: Node[] }
type Doc = Record<string, unknown>

export const exclusionsFor = (routeId: string) => PUBLIC_EXCLUSIONS.filter((e) => e.routeId === routeId)
export const withheldIdsFor = (routeId: string) => new Set(exclusionsFor(routeId).map((e) => e.dataId))

const STUB = (dataId: string): Node => ({ tag: 'div', attrs: { 'data-public-exclusion': dataId }, children: [] })
const isStub = (n: Node) => typeof n !== 'string' && Boolean(n.attrs?.['data-public-exclusion'])

/** Source data-ids of withheld elements still present (as real content) anywhere in a document. */
export function withheldNodesIn(routeId: string, doc: unknown): string[] {
  const ids = withheldIdsFor(routeId)
  if (!ids.size || !doc || typeof doc !== 'object') return []
  const found: string[] = []
  const walk = (n: Node) => {
    if (typeof n === 'string') return
    const id = n.attrs?.['data-id']
    if (id && ids.has(id)) found.push(id)
    for (const c of n.children ?? []) walk(c)
  }
  for (const c of ((doc as Doc).children as Node[] | undefined) ?? []) walk(c)
  return found
}

/**
 * Apply the registry to a document (pure; returns a new document when anything changed). `removed` lists the
 * data-ids replaced now (already-stubbed ids are idempotent no-ops); `collapsed` lists containers that became
 * empty and were stubbed too. `text` is not edited here: composition re-derives it from the tree.
 */
export function applyPublicExclusions(routeId: string, doc: Doc): { doc: Doc; removed: string[]; collapsed: string[] } {
  const ids = withheldIdsFor(routeId)
  if (!ids.size || !Array.isArray(doc.children)) return { doc, removed: [], collapsed: [] }
  const removed: string[] = []
  const collapsed: string[] = []
  const visit = (n: Node): Node => {
    if (typeof n === 'string') return n
    const id = n.attrs?.['data-id']
    if (id && ids.has(id)) {
      removed.push(id)
      return STUB(id)
    }
    if (!n.children) return n
    const kids = n.children.map(visit)
    const elements = kids.filter((k) => typeof k !== 'string')
    const text = kids.some((k) => typeof k === 'string' && k.trim())
    if (elements.length && !text && elements.every(isStub) && kids.some((k, i) => k !== n.children![i])) {
      collapsed.push(id ?? 'container')
      return STUB(id ?? 'container')
    }
    return { ...n, children: kids }
  }
  const children = (doc.children as Node[]).map(visit)
  if (!removed.length) return { doc, removed, collapsed }
  return { doc: { ...doc, children }, removed, collapsed }
}
