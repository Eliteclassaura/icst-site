/**
 * H2O Phase 2D — the V1 floating quote launcher.
 *
 * The owner's V1 conversion UX: a small chat/message affordance fixed to the bottom-right of every
 * applicable public page which, on activation, opens the accepted conversational Typeform dialog.
 *
 * **What this is not, and why that matters more than what it is.** It is not a chatbot, a chat-form
 * engine, a CRM, a Revenue Engine, native RFQ persistence or custom email handling, and it is not a
 * third-party chat product. It renders no message list, holds no conversation state, sends no
 * message anywhere and has no backend of its own. Typeform remains the form and the notification
 * engine. The only thing this component owns is the affordance: a control in a fixed position,
 * wearing a chat mark, wired to `QuoteCta` — the same accepted Phase 2C-min interface every other
 * mount uses, through the same gate, with the same allowlisted context.
 *
 * **Why it delegates instead of reimplementing.** Everything hard here — the dialog, the focus
 * trap, Escape, focus restoration, the origin-checked `postMessage` listener, the load budget and
 * the no-script fallback link — already exists, accepted and tested, in `QuoteCta`. A second dialog
 * for the launcher would have meant a second focus trap to get wrong and a second message listener
 * to secure. So this file is a **presentation wrapper**: it places the accepted control and gives
 * it a chat affordance, and the control does the rest. It is also why the markup stays a real link:
 * a visitor without scripting gets the form in a new tab rather than a dead circle.
 *
 * **Why the chat mark is drawn in CSS.** The accepted `QuoteCta` renders one anchor whose text is
 * its accessible name. Wrapping an icon element around or over that anchor would mean either
 * editing the accepted adapter or layering a second node with `pointer-events` juggling. Instead
 * `site.css` masks the mark onto the anchor's own `::before`, so there is exactly one element, one
 * control, one accessible name, and the mark inherits the treatment's colour through
 * `currentColor`. The mark is an inline `data:` URI, so no request leaves the origin for it — a
 * floating chat widget fetching a remote icon is precisely the pattern this build refuses.
 *
 * **Why it is lowest in precedence.** The accepted contract allows exactly one signal-colour RFQ
 * action in a viewport at a time. The launcher is persistent and site-wide, so the overlay appends
 * it at the end of the precedence order: on a route that already carries a signal-colour action it
 * renders in the neutral treatment. It adds a position, not a second shout.
 *
 * Placement decisions, none of them defaults:
 *
 *   - `position: fixed`, with the offsets computed from `env(safe-area-inset-*)`, so it clears a
 *     notch and a home indicator instead of sitting under them;
 *   - rendered **after** the footer in document order, so the tab order reaches it last and it
 *     never interrupts the page's own reading order;
 *   - out of flow entirely, so it can cause no layout shift and no horizontal overflow — both are
 *     measured on all 87 route-viewports rather than asserted here;
 *   - a 48px minimum control on every viewport, past the 44px WCAG 2.5.5 target, with the label
 *     beside the mark on wide viewports and the mark alone on narrow ones, where the label stays in
 *     the accessibility tree and only stops being painted.
 */
import type { CohortPage } from './cohort'
import { mountGate } from './gate'
import { implementedMounts, mountTreatment } from './mounts'
import { QuoteCta } from '../conversion/QuoteCta'
import { resolveQuoteCta } from '../conversion/resolve'

/** The overlay mount this surface renders. Never a string invented at the call site. */
export const FLOATING_LAUNCHER_MOUNT_ID = 'floating_quote_launcher'

export const FloatingQuoteLauncher = ({ page }: { page: CohortPage }) => {
  // A route with no accepted CTA never mounts one, whatever the surface says.
  if (!page.ctaPresent) return null

  // Only a surface this build implements renders: an applicable mount whose pattern the accepted
  // adapter can actually render.
  const mount =
    implementedMounts().find((candidate) => candidate.mountId === FLOATING_LAUNCHER_MOUNT_ID) ?? null
  if (mount === null) return null

  const gate = mountGate(page, { mountId: FLOATING_LAUNCHER_MOUNT_ID })
  if (!gate.mounted) return null

  // The adapter applies its own allowlist and its own fail-closed configuration check; this
  // component adds no key outside the accepted eleven.
  const resolved = resolveQuoteCta({
    cta_placement: mount.ctaPlacement,
    page_path: page.canonicalPath,
  })
  if (!resolved.available) return null

  const treatment = mountTreatment(FLOATING_LAUNCHER_MOUNT_ID, page)

  // The dialog heading carries the mount's own label rather than the adapter's default, so the
  // accepted contract's rule — "One intent, one label: 'Request a Quote' everywhere it appears" —
  // holds in the dialog too, not only on the control that opened it.

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
