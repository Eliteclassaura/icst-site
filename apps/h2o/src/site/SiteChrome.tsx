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
import {
  renderableFooterGroups,
  renderableHeaderItems,
  renderableOrientationItems,
} from './navigation'
import { RfqMount } from './RfqMount'

export const PREVIEW_NOTICE =
  'Private implementation preview. This route is not publication-ready and nothing here is published.'

export const SiteChrome = ({ children, page }: { children: ReactNode; page: CohortPage }) => {
  const orientation = renderableOrientationItems()
  const primary = renderableHeaderItems()
  const groups = renderableFooterGroups()

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

        {/*
          The small-screen navigation.

          The first cut of the R2 layer hid `.nav` below 40rem and put nothing in its place, which
          made parts, services, resources and about unreachable from the chrome on a phone. The
          second cut replaced it with a visually hidden checkbox and two labels. That worked with
          a pointer and failed with a keyboard: on desktop the checkbox stayed in the tab order
          while its visible label was `display: none`, so a sighted keyboard user hit an invisible
          stop; and on mobile the accessible control was the checkbox while the thing that looked
          like a button was `aria-hidden`.

          This is the replacement, and it is native `<details>` and `<summary>`. The summary IS the
          button: it is focusable only where it is visible, it carries its own name, and the
          browser reports expanded and collapsed state and handles Enter and Space without a line
          of script. The CSP is hash-based and unchanged, and the menu still works with scripting
          off.

          Above the breakpoint the whole `<details>` is `display: none`, so nothing inside it is
          focusable and there is no phantom tab stop. The scrim is a plain decorative element and
          is not a control: on a phone the menu closes with the same summary that opened it, which
          is where the focus already is.
        */}
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
          {primary.length === 0 && orientation.length === 0 ? null : (
            <details className="nav-disclosure">
              <summary className="nav-button">
                <span aria-hidden="true" className="nav-bars" />
                Menu
              </summary>
              <div className="nav-panel">
                {/* Decorative. The dimmed backdrop, not a second unlabelled control. */}
                <span aria-hidden="true" className="nav-scrim" />
                <nav aria-label="Primary, small screen" className="nav-drawer">
                  {[...orientation, ...primary].map((item) => (
                    <a href={item.href} key={`m-${item.href}`}>
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>
            </details>
          )}
        </div>
      </header>

      <main className="main">
        <div className="shell">{children}</div>
      </main>

      <footer className="footer">
        <div className="shell">
          {groups.length === 0 ? null : (
            <nav aria-label="Footer" className="footer-nav">
              {groups.map((group) => (
                <div className="footer-group" key={group.group}>
                  <h2 className="footer-group-title">{group.group}</h2>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <a href={item.href}>{item.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
          <div className="footer-top">
            <span className="footer-identity">
              <img
                alt="Industrial Cooling Solutions"
                height={46}
                src="/brand/ics-logo-white-transparent.png"
                width={180}
              />
            </span>
            {/*
              The footer quote band. It sits on the dark ground, so it renders in the inverted
              neutral treatment: the shared neutral style is ink-on-transparent, which on this
              background would be ink on ink and therefore invisible. That was a real contrast
              defect on the staging baseline, not a new risk introduced by the visual pass.
            */}
            <div className="footer-cta">
              <RfqMount mountId="footer_rfq_band" page={page} />
            </div>
          </div>
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
