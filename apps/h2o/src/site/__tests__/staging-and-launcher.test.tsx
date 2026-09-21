// @vitest-environment happy-dom

/**
 * H2O Phase 2D — the bounded staging-readiness overlay, and the V1 floating launcher.
 *
 * Two things have to be true at once in this increment, and they pull in opposite directions:
 *
 *   1. the accepted Typeform interface must now be **exercisable** on all 29 routes, so a private
 *      staging validation can actually be performed;
 *   2. nothing about **publication** may have moved — not indexing, not the robots header, not the
 *      private-preview notice, not navigation.
 *
 * A pass that got (1) by quietly reinterpreting the historical `publication_ready` field would look
 * identical from the outside on the day it shipped, and would open indexing on 29 unpublished
 * routes. So the tests below assert both halves, and the half that matters most is the second one.
 *
 * The overlay's own integrity is asserted the same way: not "the file says the right thing" but
 * "the file cannot say the wrong thing without failing the build" — a changed state string, a
 * missing route, a route that is not in the cohort, a historical value that no longer matches the
 * file it claims to have read, or a deleted protection each throw.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cohort, type CohortPage } from '../cohort'
import { FLOATING_LAUNCHER_MOUNT_ID, FloatingQuoteLauncher } from '../FloatingQuoteLauncher'
import { isIndexable, mountGate, navTargetRenderable, publicationState, showsPreviewNotice } from '../gate'
import { metadataFor } from '../metadata'
import { implementedMounts, mountContract, mountTreatment } from '../mounts'
import { registryRow } from '../registry'
import { xRobotsTagForPath } from '../robots'
import {
  REQUIRED_PROTECTIONS,
  STAGING_READY,
  stagingOverlay,
  stagingValidationReady,
  StagingOverlayError,
  effectivePattern,
  overlayMounts,
} from '../staging'

/**
 * The accepted safe-context allowlist, read from the accepted mount contract rather than imported
 * from the adapter. Two reasons: this file then asserts against the authority document rather than
 * against the code that implements it, and it stays outside the integration boundary — the list of
 * files authorized to reference the adapter is short on purpose, and a test has no business
 * lengthening it.
 */
const SAFE_CONTEXT_KEYS: string[] = (
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'content', '2d-launch-cohort', 'TYPEFORM_CONVERSION_MOUNT_CONTRACT.json'),
      'utf8',
    ),
  ) as { adapter_constants_read_from_the_accepted_source: { safe_context_keys: string[] } }
).adapter_constants_read_from_the_accepted_source.safe_context_keys

const pages = cohort()
const OVERLAY_FILE = path.join(
  process.cwd(),
  'content',
  '2d-launch-cohort',
  'PHASE2D_STAGING_READINESS_AND_MOUNT_OVERLAY.json',
)

const ENV = {
  H2O_TYPEFORM_FORM_ID: 'F22cAgx3',
  H2O_TYPEFORM_ORIGIN: 'https://form.typeform.com',
}

describe('the staging-readiness overlay is a second reading, not a reinterpretation', () => {
  it('asserts exactly one state, and that state is not a publication state', () => {
    expect(STAGING_READY).toBe('READY_FOR_PRIVATE_STAGING_VALIDATION')
    const raw = JSON.parse(readFileSync(OVERLAY_FILE, 'utf8')) as Record<string, unknown>
    expect(raw.what_this_overlay_means).toBe(STAGING_READY)
    const disclaimers = (raw.what_this_overlay_does_not_mean ?? []) as string[]
    expect(disclaimers.join(' ')).toMatch(/NOT production-published/i)
    expect(disclaimers.join(' ')).toMatch(/NOT permission to index/i)
    expect(disclaimers.join(' ')).toMatch(/NOT a change to any route's historical publication_ready/i)
  })

  it('covers the cohort exactly — no route missing, no route smuggled in', () => {
    const overlay = stagingOverlay()
    expect(overlay.routes.size).toBe(pages.length)
    expect(overlay.routes.size).toBe(29)
    expect([...overlay.routes.keys()].sort()).toEqual(pages.map((page) => page.routeId).sort())
    for (const page of pages) {
      expect(overlay.routes.get(page.routeId)?.canonicalPath).toBe(page.canonicalPath)
      expect(stagingValidationReady(page)).toBe(true)
    }
  })

  it('records the historical values as they actually stand on disk right now', () => {
    for (const page of pages) {
      const row = stagingOverlay().routes.get(page.routeId)
      expect(row?.historicalPublicationCondition).toBe(page.publicationCondition)
      expect(row?.historicalPublicationReady).toBe(registryRow(page.routeId).publicationReady)
    }
  })

  it('still asserts every retained protection', () => {
    const asserted = stagingOverlay().protections.join(' ')
    for (const protection of REQUIRED_PROTECTIONS) expect(asserted).toContain(protection)
  })

  it('exports the error type a loosened overlay would throw', () => {
    // The loader's refusals are what make the assertions above enforcement rather than description.
    expect(new StagingOverlayError('x')).toBeInstanceOf(Error)
  })
})

describe('the historical authority is untouched, and publication has not moved', () => {
  it('leaves publication_ready as the frozen registry records it, on all 29 rows', () => {
    for (const page of pages) {
      expect(registryRow(page.routeId).publicationReady).toBe('NOT_READY_CONTENT_REMEDIATION_INCOMPLETE')
    }
  })

  it('leaves publication_condition as the accepted content index records it, on all 29 rows', () => {
    for (const page of pages) {
      expect(page.publicationCondition).toBe('PUBLICATION_READY_REQUIRED;OWNER_SME_GATE_OUTSTANDING')
      expect(publicationState(page).ready).toBe(false)
    }
  })

  it('keeps every route noindex in its page metadata', () => {
    for (const page of pages) {
      expect(isIndexable(page)).toBe(false)
      expect(metadataFor(page).robots).toEqual({
        follow: false,
        googleBot: { follow: false, index: false },
        index: false,
      })
    }
  })

  it('keeps the X-Robots-Tag header noindex on every accepted path', () => {
    for (const page of pages) {
      expect(xRobotsTagForPath(page.canonicalPath, pages)).toBe('noindex, nofollow')
    }
  })

  it('keeps the private-preview notice on every route', () => {
    for (const page of pages) expect(showsPreviewNotice(page)).toBe(true)
  })

  it('keeps every navigation label suppressed', () => {
    for (const page of pages) expect(navTargetRenderable(page.canonicalPath, pages)).toBe(false)
  })

  it('separates the two readinesses on every route — staging yes, publication no', () => {
    // The single assertion that would catch a merge of the two gates.
    for (const page of pages) {
      expect(stagingValidationReady(page)).toBe(true)
      expect(publicationState(page).ready).toBe(false)
    }
  })
})

describe('the floating launcher mount', () => {
  it('is added by the overlay, not by the accepted contract', () => {
    /*
      The overlay is the only place a mount is added, and the launcher is the first of them. The
      visual implementation added two more through the same seam — `home_hero_primary` and
      `home_conversion_band`, both homepage-only — so this asserts the whole overlay set rather
      than a count, and asserts the launcher's position in it. A mount appearing here that this
      list does not name is exactly the change this test exists to fail on.
    */
    expect(overlayMounts().map((mount) => mount.mount_id)).toEqual([
      FLOATING_LAUNCHER_MOUNT_ID,
      'home_hero_primary',
      'home_conversion_band',
      'commercial_page_cta',
    ])
    expect(mountContract().mounts.map((mount) => mount.mount_id)).not.toContain(FLOATING_LAUNCHER_MOUNT_ID)
    for (const added of overlayMounts()) {
      expect(mountContract().mounts.map((mount) => mount.mount_id)).not.toContain(added.mount_id)
    }
  })

  it('is implemented on all 29 routes', () => {
    const mount = implementedMounts().find((entry) => entry.mountId === FLOATING_LAUNCHER_MOUNT_ID)
    expect(mount?.routeIds.length).toBe(29)
    expect(mount?.state).toBe('APPLICABLE_GATED')
  })

  it('carries a cta_placement that is the overlay mount id, not a string this build invented', () => {
    const mount = implementedMounts().find((entry) => entry.mountId === FLOATING_LAUNCHER_MOUNT_ID)
    expect(mount?.ctaPlacement).toBe(overlayMounts()[0]?.mount_id)
    expect(mount?.ctaPlacement).toBe('floating_quote_launcher')
  })

  it('proposes no context key outside the accepted adapter allowlist', () => {
    for (const mount of overlayMounts()) {
      for (const key of mount.context_keys) expect(SAFE_CONTEXT_KEYS).toContain(key)
    }
  })

  it('carries the one accepted label and intent', () => {
    expect(overlayMounts()[0]?.label).toBe('Request a Quote')
  })

  it('never takes the signal treatment while an accepted mount holds it', () => {
    for (const page of pages) {
      expect(mountTreatment(FLOATING_LAUNCHER_MOUNT_ID, page, pages)).toBe('NEUTRAL')
      const signal = implementedMounts()
        .filter((mount) => mount.routeIds.includes(page.routeId))
        .filter((mount) => mountTreatment(mount.mountId, page, pages) === 'SIGNAL')
      expect(signal.map((mount) => mount.mountId)).toEqual(['header_action'])
    }
  })

  it('opens the same gate as every other mount, and reports MOUNTED', () => {
    for (const page of pages) {
      const gate = mountGate(page, { env: ENV, mountId: FLOATING_LAUNCHER_MOUNT_ID, pages })
      expect(gate.mounted).toBe(true)
      expect(gate.reason).toBe('MOUNTED')
    }
  })

  it('closes when the configuration does not resolve', () => {
    const gate = mountGate(pages[0] as CohortPage, {
      env: {},
      mountId: FLOATING_LAUNCHER_MOUNT_ID,
      pages,
    })
    expect(gate.mounted).toBe(false)
    expect(gate.reason).toBe('CONFIGURATION_UNRESOLVED')
  })
})

describe("the Contact page's bounded V1 decision", () => {
  it('renders the accepted dialog rather than a fabricated embedded surface', () => {
    expect(effectivePattern('rfq_page', 'EMBEDDED_IN_PAGE')).toBe('DIALOG')
  })

  it('leaves the historical EMBEDDED_IN_PAGE intent recorded, not deleted', () => {
    const accepted = mountContract().mounts.find((mount) => mount.mount_id === 'rfq_page')
    expect(accepted?.pattern).toBe('EMBEDDED_IN_PAGE')
    const decision = stagingOverlay().mountPatternDecisions.find((d) => d.mount_id === 'rfq_page')
    expect(decision?.historical_pattern).toBe('EMBEDDED_IN_PAGE')
    expect(decision?.v1_pattern).toBe('DIALOG')
  })

  it('changes no other mount pattern', () => {
    expect(stagingOverlay().mountPatternDecisions.map((d) => d.mount_id)).toEqual(['rfq_page'])
    for (const mount of mountContract().mounts) {
      if (mount.mount_id === 'rfq_page') continue
      expect(effectivePattern(mount.mount_id, mount.pattern)).toBe(mount.pattern)
    }
  })
})

/**
 * Rendered behaviour.
 *
 * The form id used here is a **test placeholder**, never the production identity. Rendering the
 * dialog creates a real iframe, and happy-dom will try to fetch its `src`; pointing that at the
 * production form would mean this suite reaching the owner's live form on every run. The accepted
 * adapter's own rendered tests use a placeholder for the same reason. No submission is made, no
 * production form is addressed, and no non-production form id is invented as a *staging* identity —
 * that is still required externally and is still outstanding.
 */
const TEST_PLACEHOLDER_FORM_ID = 'zzTESTzz00'

describe('the launcher, rendered', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    // React 19 wants this declared before `act` is used outside a framework runner.
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    process.env.H2O_TYPEFORM_FORM_ID = TEST_PLACEHOLDER_FORM_ID
    process.env.H2O_TYPEFORM_ORIGIN = ENV.H2O_TYPEFORM_ORIGIN
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const render = (page: CohortPage): void => {
    act(() => root.render(<FloatingQuoteLauncher page={page} />))
  }

  const control = (): HTMLAnchorElement => {
    const el = host.querySelector('[data-testid="floating-quote-launcher"] a')
    if (el === null) throw new Error('no launcher control rendered')
    return el as HTMLAnchorElement
  }

  it('renders one control, and it is a real link to the form', () => {
    render(pages[0] as CohortPage)
    expect(host.querySelectorAll('[data-testid="floating-quote-launcher"]').length).toBe(1)
    const link = control()
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toContain(`https://form.typeform.com/to/${TEST_PLACEHOLDER_FORM_ID}`)
    // Progressive enhancement: without scripting this opens the form, never a dead circle.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('gives the control an accessible name, from the accepted label', () => {
    render(pages[0] as CohortPage)
    expect(control().textContent?.trim()).toBe('Request a Quote')
  })

  it('carries the route path and the placement in the form URL, and nothing else', () => {
    const page = pages.find((p) => p.canonicalPath === '/cooling-tower-maintenance/') as CohortPage
    render(page)
    const href = control().getAttribute('href') ?? ''
    expect(href).toContain('page_path=%2Fcooling-tower-maintenance%2F')
    expect(href).toContain('cta_placement=floating_quote_launcher')
    const fragment = href.split('#')[1] ?? ''
    const keys = fragment.split('&').map((pair) => pair.split('=')[0])
    for (const key of keys) expect(SAFE_CONTEXT_KEYS).toContain(key)
  })

  it('renders in the neutral treatment, never the signal one', () => {
    render(pages[0] as CohortPage)
    const wrapper = host.querySelector('[data-testid="floating-quote-launcher"]')
    expect(wrapper?.className).toContain('launcher-neutral')
    expect(wrapper?.className).not.toContain('launcher-signal')
  })

  it('opens a dialog on activation, and closes on Escape with focus returned', () => {
    render(pages[0] as CohortPage)
    const link = control()
    act(() => link.click())

    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')

    const frame = host.querySelector('iframe')
    expect(frame?.getAttribute('src')).toContain(`https://form.typeform.com/to/${TEST_PLACEHOLDER_FORM_ID}`)
    expect(frame?.getAttribute('sandbox')).toBeTruthy()
    expect(frame?.getAttribute('referrerpolicy')).toBe('strict-origin')

    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(control())
  })

  it('reopens after closing', () => {
    render(pages[0] as CohortPage)
    act(() => control().click())
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
    act(() => {
      host
        .querySelector('[role="dialog"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    act(() => control().click())
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('renders nothing on a route the staging overlay does not cover', () => {
    // The overlay is the authority for this gate, so removing a row is how a route becomes
    // unready. Restored in `finally`, and no authority file is touched.
    const page = pages[0] as CohortPage
    const overlay = stagingOverlay()
    const row = overlay.routes.get(page.routeId)
    try {
      overlay.routes.delete(page.routeId)
      expect(stagingValidationReady(page)).toBe(false)
      render(page)
      expect(host.querySelector('[data-testid="floating-quote-launcher"]')).toBeNull()
    } finally {
      if (row !== undefined) overlay.routes.set(page.routeId, row)
    }
  })

  it('refuses loudly, rather than silently, for a route no supplied authority defines', () => {
    // Fail-closed here means throw: a route absent from the accepted registry has no determined
    // mount surface, and rendering nothing would hide that the authority is missing.
    const page = { ...(pages[0] as CohortPage), routeId: 'RT-NOT-IN-ANY-AUTHORITY' }
    expect(() => render(page)).toThrow(/not in PUBLIC_ROUTE_REGISTRY\.tsv/)
  })

  it('renders nothing when the adapter configuration does not resolve', () => {
    delete process.env.H2O_TYPEFORM_FORM_ID
    render(pages[0] as CohortPage)
    expect(host.querySelector('[data-testid="floating-quote-launcher"]')).toBeNull()
  })
})
