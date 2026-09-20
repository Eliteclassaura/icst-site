/**
 * H2O Phase 2D — the accepted mount surfaces, reconciled against the 29-route cohort.
 *
 * The correction this package answers to asks for an explicit reconciliation of every mount in the
 * accepted contract, with dormant mounts reported accurately and an undetermined surface mapping
 * failing closed rather than guessed. These tests are that reconciliation, expressed so that a
 * future change to the cohort or the contract fails here rather than quietly changing where the
 * conversion interface attaches.
 */
import { describe, expect, it } from 'vitest'
import { cohort, type CohortPage } from '../cohort'
import {
  dormantMounts,
  implementedMounts,
  mountAppliesToRoute,
  mountApplicability,
  mountContract,
  mountDefinitions,
  mountTreatment,
  MountSurfaceUndeterminedError,
  undeterminedMounts,
  viewportPrecedence,
} from '../mounts'
import { overlayMounts, stagingOverlay } from '../staging'
import { registryRow } from '../registry'

const byId = () => new Map(mountApplicability().map((mount) => [mount.mountId, mount]))

describe('every mount in the accepted contract is reconciled', () => {
  it('reconciles all nine — the accepted eight plus the one the overlay adds', () => {
    const all = mountApplicability()
    expect(mountContract().mounts.length).toBe(8)
    expect(overlayMounts().length).toBe(1)
    expect(all.length).toBe(mountDefinitions().length)
    expect(all.length).toBe(9)
    expect(implementedMounts().length + dormantMounts().length + undeterminedMounts().length).toBe(9)
  })

  it('leaves the accepted contract file itself defining exactly its own eight mounts', () => {
    // The overlay adds at reconciliation time. The accepted document keeps saying what it said.
    const accepted = mountContract().mounts.map((mount) => mount.mount_id)
    expect(accepted).toEqual([
      'header_action',
      'footer_rfq_band',
      'product_detail_primary',
      'category_and_family',
      'editorial_inline',
      'project_inline',
      'sticky_floating',
      'rfq_page',
    ])
    expect(accepted).not.toContain('floating_quote_launcher')
  })

  it('implements floating_quote_launcher on all 29 routes, as a dialog', () => {
    const mount = byId().get('floating_quote_launcher')
    expect(mount?.state).toBe('APPLICABLE_GATED')
    expect(mount?.appliesTo).toBe('EVERY_BUILD_ROUTE')
    expect(mount?.routeIds.length).toBe(29)
    expect(mount?.pattern).toBe('DIALOG')
    expect(mount?.surface).toBe('SITE_WIDE_FLOATING')
    expect(mount?.label).toBe('Request a Quote')
    expect(mount?.ctaPlacement).toBe('floating_quote_launcher')
    expect(mount?.missingAuthority).toBeNull()
  })

  it('refuses an overlay mount that would redefine an accepted mount id', () => {
    const overlay = stagingOverlay()
    const added = overlay.mountsAdded
    try {
      overlay.mountsAdded = [{ ...added[0]!, mount_id: 'header_action' }]
      expect(() => mountDefinitions()).toThrow(MountSurfaceUndeterminedError)
    } finally {
      overlay.mountsAdded = added
    }
  })

  it('implements header_action and footer_rfq_band on all 29 routes', () => {
    for (const mountId of ['header_action', 'footer_rfq_band']) {
      const mount = byId().get(mountId)
      expect(mount?.state).toBe('APPLICABLE_GATED')
      expect(mount?.routeIds.length).toBe(29)
      expect(mount?.appliesTo).toBe('EVERY_BUILD_ROUTE')
    }
  })

  it('implements editorial_inline on exactly the 22 editorial routes', () => {
    const mount = byId().get('editorial_inline')
    expect(mount?.state).toBe('APPLICABLE_GATED')
    const editorial = cohort().filter((page) => registryRow(page.routeId).routeClass === 'EDITORIAL')
    expect(editorial.length).toBe(22)
    expect(mount?.routeIds.sort()).toEqual(editorial.map((page) => page.routeId).sort())
  })

  it('applies rfq_page to /contact-us/ alone, as a dialog under the bounded V1 decision', () => {
    const mount = byId().get('rfq_page')
    const contact = cohort().find((page) => page.canonicalPath === '/contact-us/')
    expect(mount?.routeIds).toEqual([contact?.routeId])

    // The accepted contract's pattern is EMBEDDED_IN_PAGE, and no supplied authority defines an
    // embedded-in-page form surface. Until this increment the mount therefore failed closed. The
    // staging overlay records a bounded V1 decision — open the same accepted dialog from the
    // Contact page rather than fabricate an embedded implementation — so the mount now renders.
    //
    // What must remain true, and is asserted here, is that the decision is *recorded* rather than
    // applied silently: the historical pattern is still carried, the overlay still names it, and
    // the reason is still in the file.
    expect(mount?.historicalPattern).toBe('EMBEDDED_IN_PAGE')
    expect(mount?.pattern).toBe('DIALOG')
    expect(mount?.state).toBe('APPLICABLE_GATED')
    expect(mount?.missingAuthority).toBeNull()
    expect(undeterminedMounts()).toEqual([])

    const decision = stagingOverlay().mountPatternDecisions.find((d) => d.mount_id === 'rfq_page')
    expect(decision?.historical_pattern).toBe('EMBEDDED_IN_PAGE')
    expect(decision?.v1_pattern).toBe('DIALOG')
    expect(decision?.reason).toMatch(/no accepted authority supplies an embedded-in-page/i)
  })

  it('leaves the accepted contract still recording EMBEDDED_IN_PAGE for rfq_page', () => {
    const accepted = mountContract().mounts.find((mount) => mount.mount_id === 'rfq_page')
    expect(accepted?.pattern).toBe('EMBEDDED_IN_PAGE')
  })

  it('reports the product, project and category mounts as dormant in this cohort', () => {
    const dormant = dormantMounts()
      .map((mount) => mount.mountId)
      .sort()
    expect(dormant).toEqual(
      ['category_and_family', 'product_detail_primary', 'project_inline', 'sticky_floating'].sort(),
    )
    for (const mount of dormantMounts()) expect(mount.routeIds).toEqual([])
  })

  it('shows why each dormant mount is dormant, from the accepted registry', () => {
    const rows = cohort().map((page) => registryRow(page.routeId))
    // No product-detail route, so neither product mount has anything to attach to.
    expect(rows.filter((row) => row.pageType === 'PRODUCT_DETAIL')).toEqual([])
    // No category or family listing, so category_and_family has nothing to attach to. The registry
    // does carry 28 such routes classified BUILD — none of them is in this cohort.
    expect(rows.filter((row) => row.template === 'category-and-family')).toEqual([])
    // No project route.
    expect(rows.filter((row) => row.routeClass === 'PROJECT')).toEqual([])
    // Every cohort route is classified BUILD, which is why the two chrome mounts apply to all 29.
    expect(rows.every((row) => row.classification === 'BUILD')).toBe(true)
  })
})

describe('placement values come from the accepted contract, not from this build', () => {
  it('carries each mount_id verbatim as its cta_placement', () => {
    for (const mount of mountApplicability()) {
      expect(mount.ctaPlacement).toBe(mount.mountId)
    }
  })

  it('uses only mount ids an authority defines — the accepted contract or the overlay', () => {
    const defined = mountDefinitions().map((mount) => mount.mount_id)
    for (const mount of mountApplicability()) expect(defined).toContain(mount.ctaPlacement)
    // And each id comes from exactly one authority, never both.
    const accepted = mountContract().mounts.map((mount) => mount.mount_id)
    const added = overlayMounts().map((mount) => mount.mount_id)
    expect(accepted.filter((id) => added.includes(id))).toEqual([])
  })

  it('carries the accepted label, one intent and one wording', () => {
    for (const mount of implementedMounts()) expect(mount.label).toBe('Request a Quote')
  })

  it('places cta_placement on the adapter allowlist', () => {
    // `cta_placement` is one of the accepted eleven safe-context keys; nothing else is added.
    const contract = JSON.parse(JSON.stringify(mountContract())) as {
      mounts: Array<{ context_keys?: string[] }>
    }
    for (const mount of contract.mounts) {
      expect(mount.context_keys ?? []).toContain('cta_placement')
    }
  })
})

describe('precedence and treatment', () => {
  it('keeps the accepted precedence order as its prefix and appends the launcher last', () => {
    const accepted = mountContract().viewport_precedence.order
    const order = viewportPrecedence()
    expect(order[0]).toBe('header_action')
    // The accepted order is the prefix, unmodified — not reordered, not shortened.
    expect(order.slice(0, accepted.length)).toEqual(accepted)
    expect(accepted.at(-1)).toBe('footer_rfq_band')
    // The launcher is last, so it can never displace an accepted mount's treatment.
    expect(order.at(-1)).toBe('floating_quote_launcher')
    expect(order.length).toBe(accepted.length + 1)
  })

  it('refuses an overlay precedence order that reorders or drops an accepted mount', () => {
    const overlay = stagingOverlay()
    const order = overlay.precedenceOrder
    try {
      overlay.precedenceOrder = ['floating_quote_launcher', ...order.slice(0, -1)]
      expect(() => viewportPrecedence()).toThrow(MountSurfaceUndeterminedError)
    } finally {
      overlay.precedenceOrder = order
    }
  })

  it('gives the signal treatment to exactly one mount per route', () => {
    for (const page of cohort()) {
      const implemented = implementedMounts().filter((mount) => mount.routeIds.includes(page.routeId))
      const signal = implemented.filter((mount) => mountTreatment(mount.mountId, page) === 'SIGNAL')
      expect(signal.length).toBe(1)
      expect(signal[0]?.mountId).toBe('header_action')
    }
  })

  it('gives every lower-precedence mount the neutral treatment', () => {
    const page = cohort().find((candidate) => candidate.routeClass === 'EDITORIAL') as CohortPage
    expect(mountTreatment('editorial_inline', page)).toBe('NEUTRAL')
    expect(mountTreatment('footer_rfq_band', page)).toBe('NEUTRAL')
  })
})

describe('an undetermined surface mapping fails closed', () => {
  it('refuses a mount id the accepted contract does not define', () => {
    const page = cohort()[0] as CohortPage
    expect(() => mountAppliesToRoute('invented_surface', page)).toThrow(MountSurfaceUndeterminedError)
  })

  it('names the missing authority rather than defaulting to applicable', () => {
    const page = cohort()[0] as CohortPage
    expect(() => mountAppliesToRoute('invented_surface', page)).toThrow(/missing authority/i)
  })

  it('does not apply an editorial mount to a company-or-service route', () => {
    const company = cohort().find((page) => page.routeClass === 'COMPANY_OR_SERVICE') as CohortPage
    expect(mountAppliesToRoute('editorial_inline', company)).toBe(false)
  })

  it('does not apply the rfq_page mount to any route but /contact-us/', () => {
    for (const page of cohort()) {
      expect(mountAppliesToRoute('rfq_page', page)).toBe(page.canonicalPath === '/contact-us/')
    }
  })
})
