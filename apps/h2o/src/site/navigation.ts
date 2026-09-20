/**
 * H2O Phase 2D — navigation, resolved against the accepted contract.
 *
 * The contract lists every header, orientation-strip and footer item together with the route it
 * targets and that route's publication readiness. This module reads it and applies the contract's
 * own first rule: a label whose target is not publication-ready is **suppressed** — not greyed, not
 * repointed, not rendered as a dead link.
 *
 * `SUPPRESS_UNTIL_TARGET_IS_PUBLICATION_READY` is read as what it says: *until*. It is a condition,
 * not a verdict. An item carrying it is suppressed while its target is not publication-ready and
 * renders once the target is — which is why this module asks `navTargetRenderable` every time
 * rather than treating the instruction's presence as permanent suppression. Reading it as permanent
 * would make the accepted contract unfalsifiable: the label could never render, whatever any future
 * authority decided, and the "until" clause would be decoration.
 *
 * Today every routed label is suppressed, because no route is publication-ready. The chrome
 * therefore renders identity and structure and no navigation links at all, which is the correct
 * rendering of the accepted contract and not a placeholder for one.
 *
 * Two orientation-strip items — the locale switcher and the domain identifier — target no route at
 * all. They are not suppressed pending readiness; they have nothing to point at, and the contract's
 * own notes say so. They are reported with that distinct reason.
 *
 * An observed contradiction, recorded and not resolved here: the contract's per-section item arrays
 * mark all five header primary items `SUPPRESS_UNTIL_TARGET_IS_PUBLICATION_READY` and state
 * `primary_rendered_items: 0`, while its `suppression_summary` block reports `Header primary:
 * rendered 3, suppressed 2`. The contract's own `aggregate_count_rule` says each count is computed
 * from its own item array, so the arrays govern and the summary is a stale aggregate. Factory
 * implements the arrays and reports the discrepancy rather than deciding which is right.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cohort, type CohortPage } from './cohort'
import { navTargetRenderable } from './gate'

const CONTENT_ROOT = path.join(process.cwd(), 'content', '2d-launch-cohort')

type ContractItem = {
  label?: string
  render?: string
  route_classification?: string
  route_id?: string
  suppression_reason?: string
  target?: string
  target_publication_ready?: string
}

type NavigationContract = {
  footer: Record<string, unknown>
  header: { orientation_strip: ContractItem[]; primary: ContractItem[] } & Record<string, unknown>
  invariants: string[]
}

let contractCache: NavigationContract | null = null

export const navigationContract = (): NavigationContract => {
  if (contractCache === null) {
    contractCache = JSON.parse(readFileSync(path.join(CONTENT_ROOT, 'NAVIGATION_CONTRACT.json'), 'utf8'))
  }
  return contractCache as NavigationContract
}

export type NavSuppressionReason = '' | 'TARGET_IS_NOT_A_ROUTE' | 'TARGET_NOT_PUBLICATION_READY'

export type ResolvedNavItem = {
  href: string
  label: string
  rendered: boolean
  /** Why it is not rendered. Kept for the evidence ledger; never emitted to the page. */
  suppressionReason: string
}

/** The contract's conditional suppression instruction: suppressed *until* the target is ready. */
export const SUPPRESS_UNTIL_READY = 'SUPPRESS_UNTIL_TARGET_IS_PUBLICATION_READY'

const resolve = (item: ContractItem, pages: CohortPage[]): ResolvedNavItem => {
  const target = item.target ?? ''
  const label = item.label ?? ''

  // No route to point at — a locale switcher and a domain identifier are not links, and no future
  // readiness decision makes them one.
  if (!target.startsWith('/')) {
    return { href: target, label, rendered: false, suppressionReason: 'TARGET_IS_NOT_A_ROUTE' }
  }

  // The instruction is conditional, so the condition is what is evaluated. An item whose render
  // instruction is something else entirely is not silently rendered either: only the accepted
  // conditional instruction is understood here, and anything else stays suppressed and says so.
  const conditional = item.render === SUPPRESS_UNTIL_READY
  const rendered = conditional && navTargetRenderable(target, pages)

  return {
    href: target,
    label,
    rendered,
    suppressionReason: rendered ? '' : (item.suppression_reason ?? 'TARGET_NOT_PUBLICATION_READY'),
  }
}

/** Header primary items, with the contract's suppression applied. */
export const headerPrimary = (pages: CohortPage[] = cohort()): ResolvedNavItem[] =>
  navigationContract().header.primary.map((item) => resolve(item, pages))

/** Orientation-strip items, with the contract's suppression applied. */
export const orientationStrip = (pages: CohortPage[] = cohort()): ResolvedNavItem[] =>
  navigationContract().header.orientation_strip.map((item) => resolve(item, pages))

/** Only the items that actually render. This is what the chrome consumes. */
export const renderableHeaderItems = (pages: CohortPage[] = cohort()): ResolvedNavItem[] =>
  headerPrimary(pages).filter((item) => item.rendered)

export const renderableOrientationItems = (pages: CohortPage[] = cohort()): ResolvedNavItem[] =>
  orientationStrip(pages).filter((item) => item.rendered)

/**
 * Footer modules the accepted contract omits entirely from the public build.
 *
 * `locations_module` and `regions_module` are both `OMITTED_FROM_THE_PUBLIC_BUILD`: no office,
 * branch, address, location or served region is held by any accepted authority, and the contract is
 * explicit that the module is absent rather than placeheld. An earlier design revision specified
 * placeholder rows carrying the internal token `NOT_HELD_PLACEHOLDER`; that was corrected, and this
 * build renders neither the rows nor the token.
 */
export const omittedFooterModules = (): string[] => {
  const footer = navigationContract().footer
  return Object.entries(footer)
    .filter(([, value]) => {
      if (value === null || typeof value !== 'object') return false
      return (value as { render?: string }).render === 'OMITTED_FROM_THE_PUBLIC_BUILD'
    })
    .map(([key]) => key)
}
