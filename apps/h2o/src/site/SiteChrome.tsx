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
 *   - the accepted RFQ actions on the header and footer surfaces, plus a mobile-only fixed RFQ
 *     bar after the footer; the legacy floating launcher wrapper is intentionally not mounted;
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
import { showsPreviewNotice } from './gate'
import {
  renderableFooterGroups,
  renderableHeaderItems,
} from './navigation'
import { RfqMount } from './RfqMount'
import { shellFooter, shellPrimary } from './r3-shell'
import { ContactDirectory } from './ContactDirectory'

export const PREVIEW_NOTICE =
  'Private implementation preview. This route is not publication-ready and nothing here is published.'

export const SiteChrome = ({
  bleed,
  children,
  page,
}: {
  /** R3: the composition owns its own full-bleed bands, so the chrome must not wrap it in a shell. */
  bleed?: boolean
  children: ReactNode
  page: CohortPage
}) => {
  const contractPrimary = renderableHeaderItems()
  const groups = renderableFooterGroups()

  /*
   * R3 header navigation.
   *
   * The accepted contract's own renderable items come first and are never dropped. R3 then adds the
   * cohort-backed shell links for any destination the contract does not already carry, so the four
   * commercial pathways and the company pages are reachable from every route. `shellPrimary()`
   * intersects its wish list with the accepted 29-route table, so a label exists only where the
   * route does — no invented route, no dead link.
   */
  const contractHrefs = new Set(contractPrimary.map((item) => item.href))
  const primary = [
    ...contractPrimary.map((item) => ({ href: item.href, label: item.label })),
    ...shellPrimary().filter((link) => !contractHrefs.has(link.href)),
  ]
  const footerGroups = shellFooter()
  const year = new Date().getFullYear()

  return (
    <>
      {showsPreviewNotice(page) ? (
        <p className="preview">
          <span className="shell">{PREVIEW_NOTICE}</span>
        </p>
      ) : null}

      <header className="header">
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
                <a
                  aria-current={item.href === page.canonicalPath ? 'page' : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}
          <RfqMount mountId="header_action" page={page} />
          {primary.length === 0 ? null : (
            <details className="nav-disclosure">
              <summary className="nav-button">
                <span aria-hidden="true" className="nav-bars" />
                <span className="nav-label">Menu</span>
              </summary>
              <div className="nav-panel">
                {/* Decorative. The dimmed backdrop, not a second unlabelled control. */}
                <span aria-hidden="true" className="nav-scrim" />
                {/*
                  R3 mobile navigation is composed, not collapsed: the drawer leads with the
                  commercial pathways as a titled group, then orientation, then the RFQ action as a
                  full-width block. Touch targets are set in CSS at 48px minimum.
                */}
                <nav aria-label="Primary, small screen" className="nav-drawer">
                  <span className="nav-drawer-title">Capability &amp; company</span>
                  {primary.map((item) => (
                    <a
                      aria-current={item.href === page.canonicalPath ? 'page' : undefined}
                      href={item.href}
                      key={`m-${item.href}`}
                    >
                      {item.label}
                    </a>
                  ))}
                  <span className="nav-drawer-rfq">
                    <RfqMount mountId="header_action" page={page} />
                  </span>
                </nav>
              </div>
            </details>
          )}
        </div>
      </header>

      {bleed === true ? (
        <main className="main main--bleed" id="main">
          {children}
        </main>
      ) : (
        <main className="main" id="main">
          <div className="shell">{children}</div>
        </main>
      )}

      <footer className="footer r3footer">
        <div className="shell">
          {/* Brand block: the approved white-transparent derivative, and positioning drawn from the
              accepted body rather than a written slogan. */}
          <div className="r3footer-top">
            <div className="r3footer-brand">
              <img
                alt="Industrial Cooling Solutions"
                height={46}
                src="/brand/ics-logo-white-transparent.png"
                width={180}
              />
              <p>
                Field-erected industrial cooling towers: new construction, repair, thermal upgrade
                and replacement parts.
              </p>
              <div className="r3footer-cta">
                <RfqMount mountId="footer_rfq_band" page={page} />
              </div>
            </div>

            {footerGroups.length === 0 ? null : (
              <nav aria-label="Footer" className="r3footer-nav">
                {footerGroups.map((group) => (
                  <div key={group.title}>
                    <h2>{group.title}</h2>
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
            <ContactDirectory variant="footer" />
          </div>

          {/*
            The contract's own footer groups, preserved. R2.2 rendered these and R3 does not drop
            them: any item whose target became renderable still appears, under its contract group
            name, below the R3 groups. Today the contract's renderable set is small; it is kept
            rather than silently removed.
          */}
          {groups.length === 0 ? null : (
            <nav aria-label="Footer, accepted contract" className="r3footer-contract">
              {groups.map((group) => (
                <div key={group.group}>
                  <h2>{group.group}</h2>
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

          {/*
            The legal bar.

            R2.2 rendered a bare production domain string here. R3 removes it: it is a production
            URL on a public surface, the public brand is Industrial Cooling Solutions, and the
            accepted chrome notes the domain was never a mark. The removal is recorded in the R3
            diff ledger rather than made silently.

            The contact directory is rendered from the owner-authorized contact record. It provides
            only the three confirmed office records and telephone affordances; it does not infer an
            email address, map, social profile, served region or additional location.

            The year is computed at render, so the bar cannot go stale.
          */}
          <div className="r3legal">
            <span>© {year} Industrial Cooling Solutions</span>
            <span className="r3legal-note">
              Private implementation preview — not a published site.
            </span>
          </div>
        </div>
      </footer>

      {/*
        The mobile action bar is last in document order. It replaces the legacy floating launcher
        and is visible only on the small-screen composition, where its full-width label makes the
        conversion path clear without competing with the header action.
      */}
      <div className="mobile-rfq-bar">
        <RfqMount mountId="header_action" page={page} />
      </div>
    </>
  )
}
