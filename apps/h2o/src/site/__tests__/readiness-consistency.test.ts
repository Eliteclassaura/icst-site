/**
 * H2O Phase 2D — publication readiness, proved in both states.
 *
 * R2 proved only the negative: everything is shut. A gate that is shut can be shut for the wrong
 * reason — because it reads the accepted authority, or because someone wrote `false`. The two are
 * indistinguishable from the outside while nothing is ready, and they differ completely on the day
 * something is.
 *
 * So every check here runs twice. Once against the accepted cohort, where the answer must be "not
 * published"; once against a **synthetic** cohort whose publication condition is `PUBLICATION_READY`,
 * where the answer must flip. The synthetic cohort is built in memory from an accepted page by
 * changing the one field under test. No accepted authority file is altered, no route is made
 * publication-ready in the build, and nothing synthetic reaches the rendered output.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cohort, type CohortPage } from '../cohort'
import {
  estateHasPublicationReadyRoute,
  isIndexable,
  mountGate,
  navTargetRenderable,
  navTargetStagingRenderable,
  publicationState,
  RFQ_FALLBACK_PATH,
  showsPreviewNotice,
} from '../gate'
import { metadataFor } from '../metadata'
import { stagingValidationReady } from '../staging'
import { headerPrimary, orientationStrip, renderableHeaderItems } from '../navigation'
import { defaultRobots } from '../../app/(site)/layout'
import { xRobotsTagForPath } from '../robots'

/** An accepted page with its publication condition replaced. Nothing else is touched. */
const asReady = (page: CohortPage): CohortPage => ({
  ...page,
  publicationCondition: 'PUBLICATION_READY',
})

/**
 * An accepted page moved outside the staging overlay's route set, and therefore not
 * staging-validation-ready.
 *
 * The overlay answers by route id, so changing the id is how a synthetic page becomes unready —
 * the same technique as `asReady`, applied to the other readiness, and again with no authority file
 * altered and nothing synthetic reaching the rendered output.
 */
const outsideTheStagingOverlay = (page: CohortPage): CohortPage => ({
  ...page,
  routeId: `${page.routeId}-NOT-IN-OVERLAY`,
})

const accepted = (): CohortPage[] => cohort()
const readyCohort = (): CohortPage[] => accepted().map(asReady)

const pageAt = (pages: CohortPage[], canonicalPath: string): CohortPage => {
  const page = pages.find((candidate) => candidate.canonicalPath === canonicalPath)
  if (page === undefined) throw new Error(`no cohort page at ${canonicalPath}`)
  return page
}

describe('present state — nothing in this build is publication-ready', () => {
  it('records no publication-ready route', () => {
    expect(accepted().filter((page) => publicationState(page).ready)).toEqual([])
    expect(estateHasPublicationReadyRoute(accepted())).toBe(false)
  })

  it('emits noindex, nofollow in every page metadata', () => {
    for (const page of accepted()) {
      expect(metadataFor(page).robots).toEqual({
        follow: false,
        googleBot: { follow: false, index: false },
        index: false,
      })
    }
  })

  it('emits an X-Robots-Tag of noindex, nofollow for every accepted path', () => {
    for (const page of accepted()) {
      expect(xRobotsTagForPath(page.canonicalPath, accepted())).toBe('noindex, nofollow')
    }
  })

  it('keeps a path that is not an accepted route out of every index too', () => {
    expect(xRobotsTagForPath('/not-a-route/', accepted())).toBe('noindex, nofollow')
  })

  it('asserts the estate-level noindex default in the root layout', () => {
    expect(defaultRobots(estateHasPublicationReadyRoute(accepted()))).toEqual({
      follow: false,
      googleBot: { follow: false, index: false },
      index: false,
    })
  })

  it('renders the private-preview notice on every route', () => {
    for (const page of accepted()) expect(showsPreviewNotice(page)).toBe(true)
  })

  it('renders no navigation label on the strength of publication readiness', () => {
    /*
      This block is about the publication state, and the publication state has not moved: no route
      is publication-ready, so no label may render for that reason. Labels that render here do so
      under the bounded staging authorization, which is a different question and is asserted
      separately below. The property that matters in this block is that the two never merge.
    */
    for (const item of [...renderableHeaderItems(accepted()), ...orientationStrip(accepted())]) {
      if (!item.rendered) continue
      expect(item.renderBasis).toBe('BOUNDED_STAGING_NAVIGATION_TARGET_IS_STAGING_VALIDATION_READY')
      expect(navTargetRenderable(item.href, accepted())).toBe(false)
    }
  })

  it('mounts no RFQ surface on any route', () => {
    for (const page of accepted()) {
      expect(mountGate(page, { mountId: 'header_action', pages: accepted() }).mounted).toBe(false)
    }
  })
})

describe('synthetic publication-ready state — the gate opens, and nothing is hardcoded shut', () => {
  it('reports the route as publication-ready', () => {
    const ready = readyCohort()
    expect(estateHasPublicationReadyRoute(ready)).toBe(true)
    expect(ready.every((page) => publicationState(page).ready)).toBe(true)
  })

  it('does not keep page metadata hardcoded to noindex', () => {
    const page = asReady(pageAt(accepted(), '/'))
    expect(isIndexable(page)).toBe(true)
    expect(metadataFor(page).robots).toEqual({ follow: true, index: true })
  })

  it('does not keep the X-Robots-Tag hardcoded to noindex', () => {
    const ready = readyCohort()
    expect(xRobotsTagForPath('/', ready)).toBeNull()
    expect(xRobotsTagForPath('/cooling-tower-maintenance/', ready)).toBeNull()
  })

  it('still keeps a path that is not an accepted route out of every index', () => {
    expect(xRobotsTagForPath('/not-a-route/', readyCohort())).toBe('noindex, nofollow')
  })

  it('stops asserting the estate-level noindex default in the root layout', () => {
    expect(defaultRobots(estateHasPublicationReadyRoute(readyCohort()))).toBeUndefined()
  })

  it('does not keep the private-preview notice rendering on a published route', () => {
    expect(showsPreviewNotice(asReady(pageAt(accepted(), '/')))).toBe(false)
  })

  it('opens the mount gate once the route, the fallback and the configuration all agree', () => {
    const ready = readyCohort()
    const page = pageAt(ready, '/cooling-tower-maintenance/')
    const gate = mountGate(page, {
      env: { H2O_TYPEFORM_FORM_ID: 'F22cAgx3', H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com' },
      mountId: 'header_action',
      pages: ready,
    })
    expect(gate.mounted).toBe(true)
    expect(gate.reason).toBe('MOUNTED')
    expect(gate.formUrl).toBe('https://form.typeform.com/to/F22cAgx3')
  })

  it('still refuses the mount when the no-script fallback route is not staging-ready', () => {
    const mixed = accepted().map((page) =>
      page.canonicalPath === RFQ_FALLBACK_PATH ? outsideTheStagingOverlay(page) : page,
    )
    const gate = mountGate(pageAt(mixed, '/cooling-tower-maintenance/'), {
      env: { H2O_TYPEFORM_FORM_ID: 'F22cAgx3', H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com' },
      mountId: 'header_action',
      pages: mixed,
    })
    expect(gate.mounted).toBe(false)
    expect(gate.reason).toBe('FALLBACK_ROUTE_NOT_STAGING_VALIDATION_READY')
  })

  it('still refuses the mount when the route itself is outside the staging overlay', () => {
    const page = outsideTheStagingOverlay(pageAt(accepted(), '/cooling-tower-maintenance/'))
    const gate = mountGate(page, {
      env: { H2O_TYPEFORM_FORM_ID: 'F22cAgx3', H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com' },
      pages: accepted(),
    })
    expect(stagingValidationReady(page)).toBe(false)
    expect(gate.mounted).toBe(false)
    expect(gate.reason).toBe('ROUTE_NOT_STAGING_VALIDATION_READY')
  })

  it('still refuses the mount when the adapter configuration does not resolve', () => {
    const ready = readyCohort()
    const gate = mountGate(pageAt(ready, '/cooling-tower-maintenance/'), {
      env: {},
      mountId: 'header_action',
      pages: ready,
    })
    expect(gate.mounted).toBe(false)
    expect(gate.reason).toBe('CONFIGURATION_UNRESOLVED')
  })
})

describe('navigation suppression is conditional, not permanent', () => {
  it('renders an in-cohort label under the staging reading while publication still says no', () => {
    const products = headerPrimary(accepted()).find((item) => item.label === 'Products')
    expect(products?.rendered).toBe(true)
    expect(products?.renderBasis).toBe('BOUNDED_STAGING_NAVIGATION_TARGET_IS_STAGING_VALIDATION_READY')
    // The historical gate is untouched and still answers no for the same route.
    expect(navTargetRenderable('/cooling-tower-parts-online/', accepted())).toBe(false)
  })

  it('still suppresses a label whose target is outside the accepted cohort', () => {
    const cohortPaths = new Set(accepted().map((p) => p.canonicalPath))
    const outside = headerPrimary(accepted()).filter(
      (item) => item.href.startsWith('/') && !cohortPaths.has(item.href),
    )
    expect(outside.length).toBeGreaterThan(0)
    for (const item of outside) expect(item.rendered).toBe(false)
  })

  it('renders that same label once its target route is publication-ready', () => {
    const ready = readyCohort()
    expect(navTargetRenderable('/cooling-tower-parts-online/', ready)).toBe(true)
    const products = headerPrimary(ready).find((item) => item.label === 'Products')
    expect(products?.rendered).toBe(true)
    expect(products?.href).toBe('/cooling-tower-parts-online/')
    expect(products?.suppressionReason).toBe('')
  })

  it('renders exactly the labels whose targets are in the cohort and ready — no more', () => {
    const ready = readyCohort()
    expect(
      renderableHeaderItems(ready)
        .map((item) => item.label)
        .sort(),
    ).toEqual(['About', 'Products'])
    expect(
      orientationStrip(ready)
        .filter((item) => item.rendered)
        .map((item) => item.label),
    ).toEqual(['Technical Library'])
  })

  it('keeps a label suppressed when its target is not a cohort route at all', () => {
    const ready = readyCohort()
    const services = headerPrimary(ready).find((item) => item.label === 'Services')
    expect(services?.rendered).toBe(false)
  })

  it('never renders an item that targets no route, in either state', () => {
    for (const pages of [accepted(), readyCohort()]) {
      const nonRoutes = orientationStrip(pages).filter((item) => !item.href.startsWith('/'))
      expect(nonRoutes.length).toBe(2)
      for (const item of nonRoutes) {
        expect(item.rendered).toBe(false)
        expect(item.suppressionReason).toBe('TARGET_IS_NOT_A_ROUTE')
      }
    }
  })
})

/**
 * R2.1 §5 and §6 — the overlay's two disputed numbers, recomputed rather than trusted.
 *
 * R2 said nine cohort targets were renderable on staging and then listed seven. R2.1 states both
 * numbers and says what each one counts. These tests recompute them from the accepted navigation
 * contract, so the overlay cannot drift away from the contract it claims to measure.
 */
describe('the staging navigation counts are recomputed from the accepted contract', () => {
  const CONTENT = path.join(process.cwd(), 'content', '2d-launch-cohort')
  const contract = JSON.parse(
    readFileSync(path.join(CONTENT, 'NAVIGATION_CONTRACT.json'), 'utf8'),
  ) as unknown
  const overlayDoc = JSON.parse(
    readFileSync(path.join(CONTENT, 'PHASE2D_STAGING_READINESS_AND_MOUNT_OVERLAY.json'), 'utf8'),
  ) as {
    deployment_state: { PRODUCTION: string; STAGING: string }
    staging_navigation_authorization: {
      measured_consequence: {
        conversion_path_entries_not_rendered_as_navigation_labels: number
        contract_occurrences_with_a_target_inside_the_cohort: number
        count_reconciliation: string
        labels_in_the_accepted_contract: number
        navigation_labels_rendered_on_staging: number
        renderable_items: Array<{ label: string; surface: string; target: string }>
        targets_outside_the_cohort_still_suppressed: number
      }
    }
  }

  const CONVERSION_SURFACES = new Set(['footer/rfq_band/action', 'cta_semantics/primary'])

  type Item = { label: string; surface: string; target: string }
  const walk = (node: unknown, surface: string, out: Item[]): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, surface, out)
      return
    }
    if (node === null || typeof node !== 'object') return
    const row = node as Record<string, unknown>
    const target = row.target ?? row.href ?? row.target_path
    if (typeof row.label === 'string' && typeof target === 'string') {
      out.push({ label: row.label, surface, target })
    }
    for (const [key, value] of Object.entries(row)) {
      walk(value, surface === '' ? key : `${surface}/${key}`, out)
    }
  }

  const items: Item[] = []
  walk(contract, '', items)
  const cohortPaths = new Set(cohort().map((p) => p.canonicalPath))
  const inside = items.filter((i) => cohortPaths.has(i.target))
  const navLabels = inside.filter((i) => !CONVERSION_SURFACES.has(i.surface))
  const conversion = inside.filter((i) => CONVERSION_SURFACES.has(i.surface))
  const mc = overlayDoc.staging_navigation_authorization.measured_consequence

  it('counts every label occurrence in the contract', () => {
    expect(mc.labels_in_the_accepted_contract).toBe(items.length)
  })

  it('states the nine and the seven as different quantities, and both are right', () => {
    expect(mc.contract_occurrences_with_a_target_inside_the_cohort).toBe(inside.length)
    expect(mc.navigation_labels_rendered_on_staging).toBe(navLabels.length)
    expect(mc.conversion_path_entries_not_rendered_as_navigation_labels).toBe(conversion.length)
    expect(navLabels.length + conversion.length).toBe(inside.length)
    expect(mc.count_reconciliation.length).toBeGreaterThan(120)
  })

  it('suppresses every contract target outside the cohort', () => {
    expect(mc.targets_outside_the_cohort_still_suppressed).toBe(items.length - inside.length)
  })

  it('enumerates exactly the navigation labels it counts, and invents none', () => {
    const enumerated = mc.renderable_items
      .map((r) => `${r.surface}|${r.label}|${r.target}`)
      .sort()
    const computed = navLabels.map((r) => `${r.surface}|${r.label}|${r.target}`).sort()
    expect(enumerated).toEqual(computed)
    for (const row of mc.renderable_items) expect(cohortPaths.has(row.target)).toBe(true)
  })

  it('every one of them resolves through the staging gate, not the publication gate', () => {
    const pages = cohort()
    for (const row of mc.renderable_items) {
      expect(navTargetStagingRenderable(row.target, pages)).toBe(true)
      expect(navTargetRenderable(row.target, pages)).toBe(false)
    }
  })
})

describe('the overlay states a deployment state it can be held to', () => {
  const overlayDoc = JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'content', '2d-launch-cohort', 'PHASE2D_STAGING_READINESS_AND_MOUNT_OVERLAY.json'),
      'utf8',
    ),
  ) as { deployment_state: Record<string, string>; protections_retained: string[] }

  it('says production is locked and staging is active', () => {
    expect(overlayDoc.deployment_state.PRODUCTION).toBe('LOCKED')
    expect(overlayDoc.deployment_state.STAGING).toBe('ACTIVE')
  })

  it('no longer claims a staging lock it does not hold', () => {
    const text = JSON.stringify(overlayDoc.protections_retained)
    expect(text).not.toContain('STAGING_AND_PRODUCTION_LOCKED')
    expect(text).toContain('PRODUCTION_LOCKED')
  })

  it('separates staging readiness from publication readiness in its own words', () => {
    expect(overlayDoc.deployment_state.staging_readiness_is_not_publication_readiness.length)
      .toBeGreaterThan(80)
    expect(overlayDoc.deployment_state.what_this_overlay_authorizes).toContain('does not authorize deployment')
  })
})
