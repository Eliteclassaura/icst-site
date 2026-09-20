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
import { describe, expect, it } from 'vitest'
import { cohort, type CohortPage } from '../cohort'
import {
  estateHasPublicationReadyRoute,
  isIndexable,
  mountGate,
  navTargetRenderable,
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

  it('suppresses every navigation label', () => {
    expect(renderableHeaderItems(accepted())).toEqual([])
    expect(orientationStrip(accepted()).filter((item) => item.rendered)).toEqual([])
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
  it('suppresses a label whose target route is in the cohort but not ready', () => {
    const products = headerPrimary(accepted()).find((item) => item.label === 'Products')
    expect(products?.rendered).toBe(false)
    expect(navTargetRenderable('/cooling-tower-parts-online/', accepted())).toBe(false)
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
