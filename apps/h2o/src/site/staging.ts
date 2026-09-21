/**
 * H2O Phase 2D — the bounded staging-readiness overlay.
 *
 * The Typeform mounts were held shut by one reading: `publicationState`, taken from the historical
 * frozen authorities, which say `NOT_READY_CONTENT_REMEDIATION_INCOMPLETE` for all 29 routes. That
 * reading was correct when it was written and it is still correct — those routes are not published
 * and must not be indexed.
 *
 * But it was answering the wrong question for staging. There are two questions, and conflating them
 * is what would make this pass dangerous:
 *
 *   1. **Is this route published and indexable?** Answered only by the historical fields. Today:
 *      no, for all 29. Nothing in this module touches that. `isIndexable`, the `X-Robots-Tag`
 *      header, the private-preview notice and navigation-label suppression all keep reading
 *      `publicationState` and all keep saying no.
 *   2. **May the accepted Typeform interface be exercised in private staging validation?**
 *      Answered here, by an overlay Control Tower authorized after the closures it derives from —
 *      owner/SME, OD-05, content remediation, media freeze, PV-02, PV-05, documents, navigation,
 *      OD-15 and the clean technical and browser QA. Today: yes, for all 29.
 *
 * So this is a **second and separate** reading, not a reinterpretation of the first. The historical
 * files are read and never written; the overlay is its own file with its own id; and the two never
 * feed the same consumer. `READY_FOR_PRIVATE_STAGING_VALIDATION` is the only state it can produce,
 * and the string is compared exactly — an overlay that said anything else would fail closed.
 *
 * Three integrity properties are enforced on load rather than trusted:
 *
 *   - the overlay's route set must equal the cohort exactly, so it can neither miss a route nor
 *     smuggle one in;
 *   - every row must carry the historical values the overlay claims it read, and they must match
 *     the historical files as they are on disk right now — an overlay built against a different
 *     registry cannot silently apply to this one;
 *   - the overlay must still assert every retained protection, so deleting `noindex` from the
 *     protections list is a build failure rather than a quiet loosening.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cohort, type CohortPage } from './cohort'
import { registryRow } from './registry'

const CONTENT_ROOT = path.join(process.cwd(), 'content', '2d-launch-cohort')
const OVERLAY = 'PHASE2D_STAGING_READINESS_AND_MOUNT_OVERLAY.json'

export class StagingOverlayError extends Error {}

/** The one state this overlay may assert. Compared by equality, never by pattern. */
export const STAGING_READY = 'READY_FOR_PRIVATE_STAGING_VALIDATION'

/** Protections the overlay must still assert. Removing one from the file fails the build. */
export const REQUIRED_PROTECTIONS = [
  'PAGE_ROBOTS_NOINDEX',
  'X_ROBOTS_TAG_NOINDEX',
  'PRIVATE_PREVIEW_NOTICE',
  'NAVIGATION_LABEL_SUPPRESSION',
  'NO_SITEMAP_EMITTED',
  // R2.1: staging was activated under later authority, so the overlay no longer claims a staging
  // lock it does not hold. The production lock is unchanged and still required here, and the
  // deployment_state block below is checked as well, so this is a rename plus an addition — the
  // overlay can no longer drop the production lock or quietly declare production unlocked.
  'PRODUCTION_LOCKED',
] as const

export type StagingRoute = {
  canonicalPath: string
  historicalPublicationCondition: string
  historicalPublicationReady: string
  routeId: string
  stagingReadiness: string
}

export type OverlayMount = {
  applies_to: string
  context_keys: string[]
  label: string
  mount_id: string
  no_script_fallback_target: string
  pattern: string
  surface: string
}

export type PatternDecision = {
  historical_pattern: string
  mount_id: string
  reason: string
  v1_pattern: string
}

export type StagingOverlay = {
  mountPatternDecisions: PatternDecision[]
  mountsAdded: OverlayMount[]
  overlayId: string
  precedenceOrder: string[]
  protections: string[]
  routes: Map<string, StagingRoute>
}

let cache: StagingOverlay | null = null

/** The overlay document as parsed JSON, for readers that need a key the typed view does not carry. */
const rawOverlay = (): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(CONTENT_ROOT, OVERLAY), 'utf8')) as Record<string, unknown>

const load = (): StagingOverlay => {
  const raw = JSON.parse(readFileSync(path.join(CONTENT_ROOT, OVERLAY), 'utf8')) as Record<
    string,
    // The shape is validated below rather than asserted by a cast that proves nothing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >

  if (raw.what_this_overlay_means !== STAGING_READY) {
    throw new StagingOverlayError(
      `${OVERLAY} asserts "${String(raw.what_this_overlay_means)}", not "${STAGING_READY}". ` +
        'Only that exact state activates a mount, so this overlay fails closed.',
    )
  }

  const protections = (raw.protections_retained ?? []) as string[]
  for (const required of REQUIRED_PROTECTIONS) {
    if (!protections.some((line) => line.startsWith(`${required}:`) || line === required)) {
      throw new StagingOverlayError(
        `${OVERLAY} no longer asserts the retained protection ${required}. A staging-readiness ` +
          'overlay may not loosen an indexing, robots, notice or navigation protection.',
      )
    }
  }

  const deployment = (raw.deployment_state ?? {}) as Record<string, string>
  if (deployment.PRODUCTION !== 'LOCKED') {
    throw new StagingOverlayError(
      `${OVERLAY} declares deployment_state.PRODUCTION "${String(deployment.PRODUCTION)}". ` +
        'Production is locked and this overlay may not say otherwise, so it fails closed.',
    )
  }
  if (deployment.STAGING !== 'ACTIVE' && deployment.STAGING !== 'LOCKED') {
    throw new StagingOverlayError(
      `${OVERLAY} declares deployment_state.STAGING "${String(deployment.STAGING)}", which is ` +
        'neither ACTIVE nor LOCKED. The overlay must state a staging state it can be held to.',
    )
  }

  const rows = (raw.staging_readiness?.routes ?? []) as Array<Record<string, string>>
  const routes = new Map<string, StagingRoute>()
  for (const row of rows) {
    if (row.staging_readiness !== STAGING_READY) {
      throw new StagingOverlayError(
        `${OVERLAY} route ${row.route_id} carries staging_readiness "${row.staging_readiness}"`,
      )
    }
    routes.set(row.route_id ?? '', {
      canonicalPath: row.canonical_path ?? '',
      historicalPublicationCondition: row.historical_publication_condition ?? '',
      historicalPublicationReady: row.historical_publication_ready ?? '',
      routeId: row.route_id ?? '',
      stagingReadiness: row.staging_readiness ?? '',
    })
  }

  // The overlay's route set must equal the cohort exactly, and each row must match the historical
  // values it claims to have read, as those files stand right now.
  const pages = cohort()
  for (const page of pages) {
    const row = routes.get(page.routeId)
    if (row === undefined) {
      throw new StagingOverlayError(`${OVERLAY} has no row for cohort route ${page.routeId}`)
    }
    if (row.canonicalPath !== page.canonicalPath) {
      throw new StagingOverlayError(
        `${OVERLAY} row ${page.routeId} names ${row.canonicalPath}, the cohort names ${page.canonicalPath}`,
      )
    }
    if (row.historicalPublicationCondition !== page.publicationCondition) {
      throw new StagingOverlayError(
        `${OVERLAY} row ${page.routeId} records historical publication_condition ` +
          `"${row.historicalPublicationCondition}", the accepted content index says ` +
          `"${page.publicationCondition}". The overlay was built against a different authority.`,
      )
    }
    if (row.historicalPublicationReady !== registryRow(page.routeId).publicationReady) {
      throw new StagingOverlayError(
        `${OVERLAY} row ${page.routeId} records historical publication_ready ` +
          `"${row.historicalPublicationReady}", the accepted registry says ` +
          `"${registryRow(page.routeId).publicationReady}".`,
      )
    }
  }
  for (const routeId of routes.keys()) {
    if (!pages.some((page) => page.routeId === routeId)) {
      throw new StagingOverlayError(`${OVERLAY} carries route ${routeId}, which is not in the cohort`)
    }
  }

  return {
    mountPatternDecisions: (raw.mount_pattern_decisions ?? []) as PatternDecision[],
    mountsAdded: (raw.mounts_added ?? []) as OverlayMount[],
    overlayId: String(raw.overlay_id ?? ''),
    precedenceOrder: (raw.viewport_precedence_addition?.order_after_addition ?? []) as string[],
    protections,
    routes,
  }
}

export const stagingOverlay = (): StagingOverlay => {
  cache = cache ?? load()
  return cache
}

/**
 * Whether a route may have the accepted Typeform interface exercised in private staging validation.
 *
 * This is deliberately **not** named anything resembling "published" or "ready", because it is not
 * that question and must never be mistaken for it.
 */
export const stagingValidationReady = (page: CohortPage): boolean =>
  stagingOverlay().routes.get(page.routeId)?.stagingReadiness === STAGING_READY

/** Mounts the overlay adds to the accepted contract's own eight. */
export const overlayMounts = (): OverlayMount[] => stagingOverlay().mountsAdded

/**
 * The pattern a mount renders in under the V1 decision, or its historical pattern when the overlay
 * makes no decision about it. The historical value is never deleted, only overridden by a recorded,
 * reasoned decision.
 */
export const effectivePattern = (mountId: string, historicalPattern: string): string =>
  stagingOverlay().mountPatternDecisions.find((entry) => entry.mount_id === mountId)?.v1_pattern ??
  historicalPattern

/**
 * Is bounded staging navigation authorized by the overlay?
 *
 * Read from the overlay rather than assumed, and read strictly: the entry must be present and must
 * say its scope is private staging navigation. A build whose overlay does not carry it renders no
 * navigation — which is the R1 behaviour, and the correct default.
 */
export const stagingNavigationAuthorized = (): boolean => {
  const raw = rawOverlay() as {
    staging_navigation_authorization?: { scope?: string }
  }
  return raw.staging_navigation_authorization?.scope === 'PRIVATE_STAGING_NAVIGATION_ONLY'
}
