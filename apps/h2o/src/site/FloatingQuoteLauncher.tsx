/**
 * Historical launcher wrapper retained for the accepted conversion-overlay record.
 *
 * It is deliberately not mounted by `SiteChrome`: R3 replaces the floating control with the
 * fixed mobile RFQ bar. Keeping this isolated wrapper preserves the supplied overlay and its
 * regression coverage without leaving a second visible action in the public composition.
 */
import type { CohortPage } from './cohort'
import { mountGate } from './gate'
import { implementedMounts, mountTreatment } from './mounts'
import { QuoteCta } from '../conversion/QuoteCta'
import { resolveQuoteCta } from '../conversion/resolve'

/** The historical overlay mount; never rendered by the current site chrome. */
export const FLOATING_LAUNCHER_MOUNT_ID = 'floating_quote_launcher'

export const FloatingQuoteLauncher = ({ page }: { page: CohortPage }) => {
  if (!page.ctaPresent) return null
  const mount =
    implementedMounts().find((candidate) => candidate.mountId === FLOATING_LAUNCHER_MOUNT_ID) ?? null
  if (mount === null) return null

  const gate = mountGate(page, { mountId: FLOATING_LAUNCHER_MOUNT_ID })
  if (!gate.mounted) return null

  const resolved = resolveQuoteCta({
    cta_placement: mount.ctaPlacement,
    page_path: page.canonicalPath,
  })
  if (!resolved.available) return null

  const treatment = mountTreatment(FLOATING_LAUNCHER_MOUNT_ID, page)
  return (
    <div
      className={`launcher ${treatment === 'SIGNAL' ? 'launcher-signal' : 'launcher-neutral'}`}
      data-cta-placement={mount.ctaPlacement}
      data-testid="floating-quote-launcher"
    >
      <QuoteCta
        ctaPlacement={mount.ctaPlacement}
        formUrl={resolved.formUrl}
        label={mount.label}
        origin={resolved.origin}
        pagePath={page.canonicalPath}
        title={mount.label}
      />
    </div>
  )
}
