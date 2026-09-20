/**
 * H2O Phase 2D — the public chrome, rendered per route.
 *
 * The chrome lives here rather than in the root layout for one reason: two of the four implemented
 * mount surfaces — `header_action` and `footer_rfq_band` — are per-route decisions, and a Next root
 * layout does not know which route is rendering. Reading the path from a request header in the
 * layout would have made every page dynamic and thrown away the static prerender that makes the
 * route set structurally equal to the accepted table. So the layout owns the document shell and the
 * page owns the chrome, and every gate keeps its route.
 *
 * What the chrome renders today, and why:
 *
 *   - the supplied ICS identity, full-colour on the light header and the approved white-transparent
 *     derivative on the dark footer at 180x46 (160x41 on mobile), per the accepted design;
 *   - no navigation links at all, because the accepted contract suppresses every label whose target
 *     is not publication-ready and no route is;
 *   - the accepted RFQ actions on the header and footer surfaces, and the V1 floating launcher
 *     after the footer, each gated on the bounded staging-readiness overlay and on the no-script
 *     fallback route being staging-validation-ready under that same overlay;
 *   - the private-preview notice, because this route is not publication-ready — bound to the same
 *     gate as robots, so a published route would not carry it;
 *   - no telephone, email, live chat, location or region module anywhere, because no such fact is
 *     held by any accepted authority and inventing one is forbidden;
 *   - no H2O wordmark: the supplied ICS mark is the only identity, and h2ocooling.com is a domain
 *     identifier, never a mark.
 *
 * A suppressed item renders nothing. It is never a dead link, a greyed control, or a placeholder
 * carrying an internal truth-state token.
 */
import type { ReactNode } from 'react'
import type { CohortPage } from './cohort'
import { FloatingQuoteLauncher } from './FloatingQuoteLauncher'
import { showsPreviewNotice } from './gate'
import { renderableHeaderItems, renderableOrientationItems } from './navigation'
import { RfqMount } from './RfqMount'

export const PREVIEW_NOTICE =
  'Private implementation preview. This route is not publication-ready and nothing here is published.'

export const SiteChrome = ({ children, page }: { children: ReactNode; page: CohortPage }) => {
  const orientation = renderableOrientationItems()
  const primary = renderableHeaderItems()

  return (
    <>
      {showsPreviewNotice(page) ? (
        <p className="preview">
          <span className="shell">{PREVIEW_NOTICE}</span>
        </p>
      ) : null}

      <header className="header">
        {orientation.length > 0 ? (
          <div className="strip">
            <nav aria-label="Orientation" className="shell">
              {orientation.map((item) => (
                <a href={item.href} key={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        ) : null}

        <div className="row shell">
          <span className="identity">
            {/*
              A plain <img>, not next/image: the optimiser would emit a resized, re-encoded
              derivative of an accepted brand asset, and the accepted design forbids producing
              any derivative of the supplied mark. Native aspect with object-fit: contain, so
              neither a crop nor a stretch is possible if the box changes.
            */}
            <img
              alt="Industrial Cooling Solutions"
              height={44}
              src="/brand/ics-logo-original.webp"
              width={172}
            />
          </span>
          {primary.length > 0 ? (
            <nav aria-label="Primary" className="nav">
              {primary.map((item) => (
                <a href={item.href} key={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}
          <RfqMount mountId="header_action" page={page} />
        </div>
      </header>

      <main className="main">
        <div className="shell">{children}</div>
      </main>

      <footer className="footer">
        <div className="shell">
          <span className="footer-identity">
            <img
              alt="Industrial Cooling Solutions"
              height={46}
              src="/brand/ics-logo-white-transparent.png"
              width={180}
            />
          </span>
          <RfqMount mountId="footer_rfq_band" page={page} />
          {/*
            Domain identifier only, never a wordmark and never a link. The locations and regions
            modules are absent entirely: the accepted contract omits them from the public build
            because no office, address or served region is held, and an internal truth-state token
            is never emitted as user-facing content.
          */}
          <p className="legal">h2ocooling.com</p>
        </div>
      </footer>

      {/*
        The V1 floating launcher, last in document order on purpose: it is a persistent
        site-wide affordance, so the tab order should reach it after the page's own content and
        the footer, not before them. It is out of flow, so its position here costs no layout.
      */}
      <FloatingQuoteLauncher page={page} />
    </>
  )
}
