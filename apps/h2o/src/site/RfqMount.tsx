/**
 * H2O Phase 2D — the RFQ mount, gated, on a named accepted surface.
 *
 * This is where the accepted Phase 2C-min conversational Typeform RFQ interface attaches to the
 * public estate. It is integrated and fail-closed: the component exists, the wiring is real, and
 * the gate is currently shut for every route.
 *
 * Every mount is a named surface from the accepted mount contract, not a generic CTA dropped onto
 * a page. The `mountId` decides three things, all from the authority:
 *
 *   - whether the mount applies to this route at all (`applies_to`, resolved against the accepted
 *     route registry);
 *   - the label, carried verbatim from the contract;
 *   - the `cta_placement` value, which is the contract's own `mount_id` — not a string invented
 *     here, and asserted against the contract by test.
 *
 * The gate then asks the accepted authorities and needs all of them to agree — the mount applies,
 * the route is publication-ready, the no-script fallback route `/contact-us/` is publication-ready,
 * and the adapter's configuration resolves. Neither readiness condition holds in this build, so
 * nothing renders anywhere.
 *
 * Rendering nothing is deliberate and is what the accepted navigation contract requires: a control
 * whose target is not ready is suppressed, never shown as a dead button and never replaced by a
 * telephone number, an email address or a third-party contact widget. There is no such fact to
 * offer, and inventing one is forbidden.
 */
import type { CohortPage } from './cohort'
import { mountGate } from './gate'
import { implementedMounts, mountTreatment } from './mounts'
import { QuoteCta } from '../conversion/QuoteCta'
import { resolveQuoteCta } from '../conversion/resolve'

export type RfqMountProps = {
  /** The accepted `mount_id` this surface renders. */
  mountId: string
  page: CohortPage
}

export const RfqMount = ({ mountId, page }: RfqMountProps) => {
  // A route with no accepted CTA never mounts one, whatever the surface says.
  if (!page.ctaPresent) return null

  // Only a surface this build implements renders: an applicable mount whose pattern the accepted
  // adapter can actually render. A mount whose pattern has no accepted component is reported by
  // `undeterminedMounts` and renders nothing rather than substituting a different pattern.
  const mount = implementedMounts().find((candidate) => candidate.mountId === mountId) ?? null
  if (mount === null) return null

  const gate = mountGate(page, { mountId })
  if (!gate.mounted) return null

  // Beyond this line the mount applies, the route is publication-ready, the fallback is
  // publication-ready and the configuration resolved. The adapter then applies its own allowlist
  // and its own fail-closed configuration check; this component adds no key outside the accepted
  // eleven.
  const resolved = resolveQuoteCta({
    cta_placement: mount.ctaPlacement,
    page_path: page.canonicalPath,
  })
  if (!resolved.available) return null

  const treatment = mountTreatment(mountId, page)

  // The dialog heading carries the mount's own accepted label, so the contract's "one intent, one
  // label" rule holds inside the dialog as well as on the control that opened it.

  return (
    <span className={treatment === 'SIGNAL' ? 'rfq rfq-signal' : 'rfq rfq-neutral'}>
      <QuoteCta
        ctaPlacement={mount.ctaPlacement}
        formUrl={resolved.formUrl}
        label={mount.label}
        origin={resolved.origin}
        pagePath={page.canonicalPath}
        title={mount.label}
      />
    </span>
  )
}
