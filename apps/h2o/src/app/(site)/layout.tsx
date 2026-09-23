/**
 * H2O Phase 2D — the public document shell.
 *
 * A separate root layout from the Payload admin group, so the admin is untouched by anything here.
 * The shell is all this layout owns: the chrome is rendered per route by `SiteChrome`, because the
 * header and footer RFQ surfaces are per-route decisions a root layout cannot make.
 *
 * The default `robots` below is the estate-level reading of the same gate every page uses: while no
 * route in the accepted cohort is publication-ready, the default is `noindex, nofollow`. It is not
 * a constant — the day a route becomes ready the default stops being asserted here and each page's
 * own metadata decides, which is the behaviour the positive-path test proves.
 */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { estateHasPublicationReadyRoute } from '../../site/gate'
import './site.css'
import './r3.css'
import './r4.css'
import './r41.css'
import './salmon.css'
import './luxury-fonts.css'
import './luxury.css'
import './figma-home.css'
import './figma-services.css'
import './figma-contact.css'
import './figma-parts.css'
import './figma-wave4.css'

export const defaultRobots = (anyReady: boolean): Metadata['robots'] =>
  anyReady ? undefined : { follow: false, googleBot: { follow: false, index: false }, index: false }

export const metadata: Metadata = {
  robots: defaultRobots(estateHasPublicationReadyRoute()),
  title: 'Industrial Cooling Solutions',
}

const SiteLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>
      {/* R3: a skip link is the first focusable thing on every route. */}
      <a className="skip" href="#main">
        Skip to content
      </a>
      {children}
    </body>
  </html>
)

export default SiteLayout
