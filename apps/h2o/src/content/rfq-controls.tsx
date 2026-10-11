import type { ReactNode } from 'react'
import { isPayloadContent } from './runtime-read'
import { D2_WIDGET } from './rfq-intent'
import { categoryAndFamilyGate, mountGate, publicMountGate, RFQ_FALLBACK_PATH } from '../site/gate'
import { implementedMounts } from '../site/mounts'
import { RfqMount } from '../site/RfqMount'
import { pageForSegments } from '../site/cohort'
import { salmonDocumentCard, salmonRoutes, type SalmonDocument } from '../site/salmon'
import { matchedWave4Article } from '../site/wave4'

/**
 * Quote actions in the canonical Payload rendering (R1B; Control Tower D1–D6, F7).
 *
 * Intent is **data**, not a label match. At import (./rfq-intent) an explicit source quote action gets
 * `data-rfq-intent="quote"` (and `data-rfq-product` for a verified D1 product card). The editor's action slot
 * carries that intent from then on (./content-slots). Here, at render, a marked action becomes the approved
 * adapter whatever its current label says, so editing the wording never turns a quote action back into a
 * Contact link. Removing the intent is a deliberate, validated slot change.
 *
 *   product relation present → `category_and_family` on eligible listing/family pages (./gate D1), with product
 *                              context derived from the relation; if the gate refuses (held/private/missing/
 *                              mismatched product, non-listing page) the verified fallback renders
 *   no relation              → `editorial_inline` with the actual page path (generic context)
 *
 * The configuration-unresolved fallback is a plain `/contact-us/` link with the same label, never a dead
 * control. Payload content mode only; repository/static rendering is unchanged.
 *
 * D2: on a matched Wave 4 article, the legacy standalone "Get A Quote" widget (`ee68c85`) is suppressed only
 * when the article's canonical in-body `editorial_inline` quote control actually renders.
 */
type Node = string | { tag: string; attrs: Record<string, string>; children: Node[] }
type Doc = { routeId: string; targetPath: string; sourceUrl?: string }

const textOf = (n: Node): string => (typeof n === 'string' ? n : n.children.map(textOf).join(' '))
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const BUY = /^(?:Buy|Order|Purchase) Now$/i
const displayLabel = (raw: string) => (BUY.test(raw) ? 'Request a Quote' : raw)

function productDocument(routeId: string): SalmonDocument | null {
  const route = salmonRoutes().find((r) => r.routeId === routeId)
  if (!route) return null
  try {
    return salmonDocumentCard(route)
  } catch {
    return null
  }
}

const fallback = (key: string, label: string) => (
  <a key={key} className="lux-button" href={RFQ_FALLBACK_PATH} data-source-node={key}>
    {label}
  </a>
)

/**
 * Render a quote-intent action (`undefined` when `node` is not one). `renderOriginal` renders the node as the
 * accepted template would without intent (used when a gate refuses for a reason other than configuration).
 */
export function renderQuoteAction(doc: Doc, node: Node, key: string, renderOriginal: (n: Node, key: string) => ReactNode, enabled = isPayloadContent()): ReactNode | undefined {
  if (!enabled || typeof node === 'string' || node.tag !== 'a' || node.attrs?.['data-rfq-intent'] !== 'quote') return undefined
  const label = displayLabel(norm(textOf(node)))
  const plain = { ...node, attrs: Object.fromEntries(Object.entries(node.attrs).filter(([k]) => k !== 'data-rfq-intent' && k !== 'data-rfq-product')) }
  const productId = node.attrs['data-rfq-product']
  if (productId) {
    const product = productDocument(productId)
    const gate = categoryAndFamilyGate(doc.targetPath, product, node.attrs.href ?? '')
    if (gate.mounted)
      return (
        <span key={key} data-source-node={key} data-rfq-source-control={label}>
          <RfqMount mountId="category_and_family" routePath={doc.targetPath} cardProduct={product} cardHref={node.attrs.href ?? ''} label={label} />
        </span>
      )
    return gate.reason === 'CONFIGURATION_UNRESOLVED' ? fallback(key, label) : renderOriginal(plain, key)
  }
  const gate = publicMountGate(doc.targetPath, 'editorial_inline')
  if (!gate.mounted) return gate.reason === 'CONFIGURATION_UNRESOLVED' ? fallback(key, label) : renderOriginal(plain, key)
  return (
    <span key={key} data-source-node={key} data-rfq-source-control={label}>
      <RfqMount mountId="editorial_inline" routePath={doc.targetPath} label={label} />
    </span>
  )
}

/** Does the Wave 4 article's canonical in-body `editorial_inline` control render for this path? */
export function editorialInlineRenders(path: string): boolean {
  const page = pageForSegments(path.split('/').filter(Boolean))
  if (!page) return publicMountGate(path, 'editorial_inline').mounted
  if (!page.ctaPresent) return false
  const mount = implementedMounts().find((m) => m.mountId === 'editorial_inline')
  if (!mount || !mountGate(page, { mountId: 'editorial_inline' }).mounted) return false
  // Configuration resolution goes through the public gate (the only authorized adapter bridges resolve it).
  return publicMountGate(page.canonicalPath, 'editorial_inline').mounted
}

/** D2: suppress the duplicate legacy article quote widget under its explicit condition. */
export function suppressedDuplicate(doc: SalmonDocument, node: Node, enabled = isPayloadContent()): boolean {
  if (!enabled || typeof node === 'string' || node.attrs?.['data-id'] !== D2_WIDGET) return false
  if (!matchedWave4Article(doc)) return false
  return editorialInlineRenders(doc.targetPath)
}

/**
 * For renderers that address source nodes by key (LuxuryCanonical's `leaf`): the label of the quote-intent
 * action enclosing `key`, or null.
 */
export function rfqControlLabelAt(_doc: Doc, key: string, nodes: Map<string, Node>, ancestors: Map<string, string[]>, enabled = isPayloadContent()): string | null {
  if (!enabled) return null
  for (const k of [key, ...[...(ancestors.get(key) ?? [])].reverse()]) {
    const n = nodes.get(k)
    // A product-card action (D1) is category_and_family on the nine listing pages only; key-addressed
    // (Luxury) templates keep their accepted treatment for it.
    if (n && typeof n !== 'string' && n.tag === 'a') return n.attrs?.['data-rfq-intent'] === 'quote' && !n.attrs['data-rfq-product'] ? displayLabel(norm(textOf(n))) : null
  }
  return null
}

/**
 * Design Fixes R2 (#7): a legacy service hero's primary action (../site/hero-actions). The approved adapter where the gate
 * mounts it, otherwise the verified `/contact-us/` link with the same label, so the hero always carries the quote action.
 */
export function heroQuoteAction(doc: Doc, key: string, label: string): ReactNode {
  return rfqControlElement(doc, key, label) ?? fallback(key, label)
}

/** The generic adapter control for a key-addressed renderer (same gate and fallback rules). */
export function rfqControlElement(doc: Doc, key: string, label: string): ReactNode | undefined {
  const gate = publicMountGate(doc.targetPath, 'editorial_inline')
  if (!gate.mounted) return gate.reason === 'CONFIGURATION_UNRESOLVED' ? fallback(key, label) : undefined
  return (
    <span key={key} data-canonical-text={key} data-rfq-source-control={label}>
      <RfqMount mountId="editorial_inline" routePath={doc.targetPath} label={label} />
    </span>
  )
}
