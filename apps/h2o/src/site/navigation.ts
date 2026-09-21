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
import { navTargetRenderable, navTargetStagingRenderable } from './gate'

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

type ContractGroup = { group: string; items: ContractItem[] }

type NavigationContract = {
  footer: { groups: ContractGroup[] } & Record<string, unknown>
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
  /** Which reading made this label render: publication, bounded staging, or neither. */
  renderBasis: string
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
    return {
      href: target,
      label,
      renderBasis: 'NOT_RENDERED',
      rendered: false,
      suppressionReason: 'TARGET_IS_NOT_A_ROUTE',
    }
  }

  // The instruction is conditional, so the condition is what is evaluated. An item whose render
  // instruction is something else entirely is not silently rendered either: only the accepted
  // conditional instruction is understood here, and anything else stays suppressed and says so.
  const conditional = item.render === SUPPRESS_UNTIL_READY

  /*
    Two readings, asked in order, and the order is the governance.

    `navTargetRenderable` is the historical publication gate and is asked first. When it says yes,
    the label renders because the route is publication-ready — the accepted rule, unchanged.

    When it says no, the bounded staging authorization is asked. It renders a label only on a
    target inside the accepted cohort that is ready for private staging validation, and only when
    the overlay carries the authorization by name. Nothing about publication moves: the route is
    still not publication-ready, still noindex, and still carries the private-preview notice.

    A label that renders under the staging reading says so in its own reason string rather than
    reporting itself as publication-ready, so the evidence never conflates the two.
  */
  const publicationReady = conditional && navTargetRenderable(target, pages)
  const stagingReady = conditional && !publicationReady && navTargetStagingRenderable(target, pages)
  const rendered = publicationReady || stagingReady

  return {
    href: target,
    label,
    rendered,
    renderBasis: publicationReady
      ? 'TARGET_IS_PUBLICATION_READY'
      : stagingReady
        ? 'BOUNDED_STAGING_NAVIGATION_TARGET_IS_STAGING_VALIDATION_READY'
        : 'NOT_RENDERED',
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

export type ResolvedNavGroup = {
  group: string
  items: ResolvedNavItem[]
  renderedCount: number
  suppressedCount: number
}

/**
 * Footer groups, with the same two readings applied item by item.
 *
 * Every group in the accepted contract is resolved and reported, including the ones where nothing
 * renders — a group is not silently dropped from the reconciliation just because all six of its
 * targets are held routes. What the chrome then renders is only the groups that have at least one
 * item, which is `renderableFooterGroups` below.
 *
 * The accepted footer is six groups of mostly product-category, region and application routes,
 * none of which are in the cohort. So the honest outcome on staging is a small footer: Services,
 * Technical Library and Company each contribute one or two links, and Products, Regions served and
 * Applications contribute none at all. That is the estate as it actually stands, and an invented
 * destination to fill a column is exactly what the contract's first invariant forbids.
 */
export const footerGroups = (pages: CohortPage[] = cohort()): ResolvedNavGroup[] =>
  navigationContract().footer.groups.map((group) => {
    const items = group.items.map((item) => resolve(item, pages))
    return {
      group: group.group,
      items,
      renderedCount: items.filter((item) => item.rendered).length,
      suppressedCount: items.filter((item) => !item.rendered).length,
    }
  })

/** Only the groups with something to show, each reduced to the items that render. */
export const renderableFooterGroups = (pages: CohortPage[] = cohort()): ResolvedNavGroup[] =>
  footerGroups(pages)
    .map((group) => ({ ...group, items: group.items.filter((item) => item.rendered) }))
    .filter((group) => group.items.length > 0)
