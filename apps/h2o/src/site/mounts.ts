/**
 * H2O Phase 2D — the accepted Typeform mount surfaces, reconciled against the 29-route cohort.
 *
 * The accepted mount contract defines eight mounts. Each names the routes it applies to with a
 * token — `EVERY_BUILD_ROUTE`, `EDITORIAL_ROUTES_CLASSIFIED_BUILD`, and so on — and the routes
 * those tokens select are decided by the contract's own named route authority,
 * `PUBLIC_ROUTE_REGISTRY.tsv`, not by anything this module invents.
 *
 * Reconciling the eight against the cohort therefore has exactly one honest outcome per mount:
 *
 *   - **applicable** — at least one of the 29 routes matches the token, so the surface is
 *     implemented and gated. Today four mounts are applicable: `header_action` and
 *     `footer_rfq_band` on all 29, `editorial_inline` on the 22 editorial routes, and `rfq_page` on
 *     `/contact-us/`.
 *   - **dormant** — no cohort route matches, so the surface is not implemented at all. That is the
 *     case for `product_detail_primary`, `sticky_floating` (no `PRODUCT_DETAIL` route in the
 *     cohort), `project_inline` (no `PROJECT` route) and `category_and_family` (no route whose
 *     registry template is `category-and-family`). Dormant is reported, never silently skipped.
 *
 * An `applies_to` token this module does not recognise is neither of those. It fails closed and
 * names the authority that would have to determine it, because a surface mapping guessed from a
 * token's wording is exactly what the correction forbids.
 *
 * `cta_placement` is not invented either: the value carried is the contract's own `mount_id`. That
 * keeps the placement vocabulary the authority's rather than this build's, and it is asserted.
 *
 * **The staging overlay adds to this, it does not rewrite it.** `PHASE2D_STAGING_READINESS_AND_
 * MOUNT_OVERLAY.json` may append a mount (`floating_quote_launcher`), record a bounded V1 pattern
 * decision for an accepted mount (`rfq_page`: EMBEDDED_IN_PAGE -> DIALOG), and append to the
 * precedence order. It may not redefine an accepted mount id, reorder the accepted precedence, or
 * delete a historical value — each of those is refused here with the reason named, and the accepted
 * contract file is read and never written.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cohort, type CohortPage } from './cohort'
import { registryRow } from './registry'
import { effectivePattern, overlayMounts, stagingOverlay } from './staging'

const CONTENT_ROOT = path.join(process.cwd(), 'content', '2d-launch-cohort')

export class MountSurfaceUndeterminedError extends Error {}

export type MountDefinition = {
  applies_to: string
  context_keys?: string[]
  label?: string
  mount_id: string
  no_script_fallback_target?: string
  pattern: string
  surface: string
}

type MountContract = {
  mounts: MountDefinition[]
  viewport_precedence: { order: string[]; rule: string }
}

let contractCache: MountContract | null = null

export const mountContract = (): MountContract => {
  if (contractCache === null) {
    contractCache = JSON.parse(
      readFileSync(path.join(CONTENT_ROOT, 'TYPEFORM_CONVERSION_MOUNT_CONTRACT.json'), 'utf8'),
    ) as MountContract
  }
  return contractCache
}

/**
 * The accepted contract's eight mounts, plus any the bounded staging overlay adds.
 *
 * The historical contract file is read and never written. A mount the overlay adds is appended
 * here, at reconciliation time, so the accepted document keeps saying exactly what it said when it
 * was accepted and the addition is attributable to the overlay that authorised it. An overlay mount
 * that reused an accepted `mount_id` would be a redefinition rather than an addition, so it is
 * refused.
 */
export const mountDefinitions = (): MountDefinition[] => {
  const accepted = mountContract().mounts
  const added = overlayMounts()
  for (const mount of added) {
    if (accepted.some((candidate) => candidate.mount_id === mount.mount_id)) {
      throw new MountSurfaceUndeterminedError(
        `The staging overlay adds a mount "${mount.mount_id}" that the accepted contract already ` +
          'defines. An overlay may add a mount; it may not redefine one.',
      )
    }
  }
  return [...accepted, ...added]
}

/**
 * The route selector for an `applies_to` token, read from the registry.
 *
 * Every predicate below is a direct reading of a registry column. None of them infers a surface
 * from a route's name, its path, or the wording of the token.
 */
const selectorFor = (appliesTo: string): ((page: CohortPage) => boolean) => {
  if (appliesTo.startsWith('/')) {
    /*
      A literal path, or a comma-separated list of them. The list form is still an exact match on
      each canonical path — it does not infer a surface from a route's name, a prefix or a pattern,
      which is the property every selector here is required to have. It exists because a mount can
      legitimately apply to a named handful of routes that share no registry column: the five
      commercial routes that are neither editorial nor the RFQ page are exactly that case.
    */
    const paths = appliesTo.split(',').map((p) => p.trim()).filter((p) => p !== '')
    for (const candidate of paths) {
      if (!candidate.startsWith('/') || !candidate.endsWith('/')) {
        throw new MountSurfaceUndeterminedError(
          `Mount surface undetermined: "${candidate}" in "${appliesTo}" is not a rooted directory path`,
        )
      }
    }
    return (page) => paths.includes(page.canonicalPath)
  }

  switch (appliesTo) {
    case 'CATEGORY_AND_FAMILY_ROUTES_CLASSIFIED_BUILD':
      return (page) => {
        const row = registryRow(page.routeId)
        return row.classification === 'BUILD' && row.template === 'category-and-family'
      }
    case 'EDITORIAL_ROUTES_CLASSIFIED_BUILD':
      return (page) => {
        const row = registryRow(page.routeId)
        return row.classification === 'BUILD' && row.routeClass === 'EDITORIAL'
      }
    case 'EVERY_BUILD_ROUTE':
      return (page) => registryRow(page.routeId).classification === 'BUILD'
    case 'PRODUCT_ROUTES_CLASSIFIED_BUILD':
      return (page) => {
        const row = registryRow(page.routeId)
        return row.classification === 'BUILD' && row.pageType === 'PRODUCT_DETAIL'
      }
    case 'PROJECT_ROUTES_CLASSIFIED_BUILD':
      return (page) => {
        const row = registryRow(page.routeId)
        return row.classification === 'BUILD' && row.routeClass === 'PROJECT'
      }
    default:
      throw new MountSurfaceUndeterminedError(
        `Mount surface undetermined: no supplied authority defines which routes "${appliesTo}" selects ` +
          `(missing authority: a route-selection rule for "${appliesTo}" in PUBLIC_ROUTE_REGISTRY.tsv ` +
          `or in TYPEFORM_CONVERSION_MOUNT_CONTRACT.json)`,
      )
  }
}

/**
 * Which patterns the accepted adapter can actually render.
 *
 * Phase 2C-min R1.1 supplies exactly one interface: `QuoteCta`, a real link that opens the form in
 * a dialog. That satisfies `DIALOG`, and it satisfies `INLINE_THEN_DIALOG` — an inline trigger that
 * opens the dialog is what the component is.
 *
 * It does not satisfy `EMBEDDED_IN_PAGE` or `STICKY_TRIGGER_THEN_DIALOG`. No accepted authority
 * supplies an embedded-in-page form surface or the `StickyRFQ` component the contract names, and
 * building either would be Factory inventing a conversion surface. Those mounts therefore fail
 * closed and name what is missing, rather than quietly rendering the dialog in place of the pattern
 * the contract specifies.
 */
export const PATTERNS_THE_ACCEPTED_ADAPTER_RENDERS = ['DIALOG', 'INLINE_THEN_DIALOG'] as const

const missingAuthorityForPattern = (pattern: string): string | null => {
  if ((PATTERNS_THE_ACCEPTED_ADAPTER_RENDERS as readonly string[]).includes(pattern)) return null
  if (pattern === 'STICKY_TRIGGER_THEN_DIALOG') {
    return 'An accepted StickyRFQ component. TYPEFORM_CONVERSION_MOUNT_CONTRACT.json names it (EV-DES:R1.2#sticky-rfq); the accepted Phase 2C-min R1.1 adapter does not supply it.'
  }
  if (pattern === 'EMBEDDED_IN_PAGE') {
    return 'An accepted embedded-in-page RFQ surface. The accepted Phase 2C-min R1.1 adapter supplies only the QuoteCta dialog interface, and no supplied authority defines an embedded form surface.'
  }
  return `An accepted component for mount pattern ${pattern}.`
}

export type MountState =
  'APPLICABLE_GATED' | 'APPLICABLE_PATTERN_NOT_IMPLEMENTABLE' | 'DORMANT_NO_APPLICABLE_ROUTE_IN_COHORT'

export type MountApplicability = {
  appliesTo: string
  /** The accepted `mount_id`, carried verbatim as `cta_placement`. */
  ctaPlacement: string
  label: string
  /** The pattern the accepted contract records, kept even where the overlay decides another. */
  historicalPattern: string
  /** Named when the surface cannot be implemented from the supplied authorities. */
  missingAuthority: string | null
  mountId: string
  pattern: string
  /** Cohort route ids this mount applies to. Empty exactly when the mount is dormant. */
  routeIds: string[]
  state: MountState
  surface: string
}

/** Reconcile every mount in the accepted contract against a cohort. */
export const mountApplicability = (pages: CohortPage[] = cohort()): MountApplicability[] =>
  mountDefinitions().map((mount) => {
    const matches = pages.filter(selectorFor(mount.applies_to))
    // The pattern a mount actually renders in. Where the overlay records a bounded V1 decision —
    // `rfq_page`'s EMBEDDED_IN_PAGE becoming DIALOG — that decision decides, and the historical
    // pattern is carried alongside it rather than overwritten.
    const pattern = effectivePattern(mount.mount_id, mount.pattern)
    const missingAuthority = missingAuthorityForPattern(pattern)
    const state: MountState =
      matches.length === 0
        ? 'DORMANT_NO_APPLICABLE_ROUTE_IN_COHORT'
        : missingAuthority === null
          ? 'APPLICABLE_GATED'
          : 'APPLICABLE_PATTERN_NOT_IMPLEMENTABLE'
    return {
      appliesTo: mount.applies_to,
      ctaPlacement: mount.mount_id,
      historicalPattern: mount.pattern,
      label: mount.label ?? '',
      missingAuthority: state === 'DORMANT_NO_APPLICABLE_ROUTE_IN_COHORT' ? null : missingAuthority,
      mountId: mount.mount_id,
      pattern,
      routeIds: matches.map((page) => page.routeId),
      state,
      surface: mount.surface,
    }
  })

/** The mounts this build implements — applicable, and renderable by the accepted adapter. */
export const implementedMounts = (pages: CohortPage[] = cohort()): MountApplicability[] =>
  mountApplicability(pages).filter((mount) => mount.state === 'APPLICABLE_GATED')

/** The mounts this build implements nothing for, reported rather than omitted. */
export const dormantMounts = (pages: CohortPage[] = cohort()): MountApplicability[] =>
  mountApplicability(pages).filter((mount) => mount.state === 'DORMANT_NO_APPLICABLE_ROUTE_IN_COHORT')

/** Applicable surfaces the supplied authorities do not determine. Failed closed, and named. */
export const undeterminedMounts = (pages: CohortPage[] = cohort()): MountApplicability[] =>
  mountApplicability(pages).filter((mount) => mount.state === 'APPLICABLE_PATTERN_NOT_IMPLEMENTABLE')

/**
 * Whether a named mount applies to a route.
 *
 * Throws when the mount id is not in the accepted contract: a surface this build renders must be
 * one the authority defines, and a typo must not silently become "not applicable".
 */
export const mountAppliesToRoute = (mountId: string, page: CohortPage): boolean => {
  const mount = mountDefinitions().find((candidate) => candidate.mount_id === mountId)
  if (mount === undefined) {
    throw new MountSurfaceUndeterminedError(
      `Mount "${mountId}" is defined neither by TYPEFORM_CONVERSION_MOUNT_CONTRACT.json nor by ` +
        `PHASE2D_STAGING_READINESS_AND_MOUNT_OVERLAY.json ` +
        `(missing authority: a mount definition for "${mountId}")`,
    )
  }
  return selectorFor(mount.applies_to)(page)
}

/**
 * Precedence order, highest first.
 *
 * The accepted contract's order is the start of it; the overlay appends its one mount at the END,
 * so the launcher can never displace an accepted mount and can never become the second
 * signal-colour action the accepted rule forbids. The accepted prefix is asserted rather than
 * assumed: an overlay order that reordered or dropped an accepted mount is refused.
 */
export const viewportPrecedence = (): string[] => {
  const accepted = mountContract().viewport_precedence.order
  const withOverlay = stagingOverlay().precedenceOrder
  if (withOverlay.length === 0) return accepted
  const prefix = withOverlay.slice(0, accepted.length)
  if (prefix.join('|') !== accepted.join('|')) {
    throw new MountSurfaceUndeterminedError(
      'The staging overlay restates the accepted viewport precedence order differently. An overlay ' +
        'may append to that order; it may not reorder or remove an accepted mount.',
    )
  }
  return withOverlay
}

export type MountTreatment = 'NEUTRAL' | 'SIGNAL'

/**
 * The treatment a mount renders in on a route.
 *
 * The accepted contract: "Exactly one signal-colour RFQ action may be visible in any viewport at
 * any time", with a precedence order, and "A lower-precedence mount either does not render while a
 * higher-precedence signal-colour action is in the viewport, or renders in a neutral treatment."
 *
 * Of the two permitted treatments this build takes the second, because it is the one that can be
 * decided without observing a viewport: the highest-precedence implemented mount on the route
 * carries the signal colour, and every lower one renders neutral. No claim is made here about
 * viewport behaviour, which is a browser check and is not executed in this environment.
 */
export const mountTreatment = (
  mountId: string,
  page: CohortPage,
  pages: CohortPage[] = cohort(),
): MountTreatment => {
  const implemented = new Set(
    implementedMounts(pages)
      .filter((mount) => mount.routeIds.includes(page.routeId))
      .map((mount) => mount.mountId),
  )
  const highest = viewportPrecedence().find((candidate) => implemented.has(candidate)) ?? null
  return highest === mountId ? 'SIGNAL' : 'NEUTRAL'
}
