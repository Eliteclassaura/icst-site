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
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { isPayloadContent } from '../../content/runtime-read'
import { estateHasPublicationReadyRoute } from '../../site/gate'
import {QuietMotion} from '../../site/QuietMotion'
import {TranslateModeProvider} from '../../site/lang/TranslateMode'
import {TranslateProxyNav} from '../../site/lang/TranslateProxyNav'
import {translateModeFor} from '../../site/lang/translate-switch'
import { NativeRfq } from '../../rfq-native/NativeRfq'
import { launcherStrings, nativeIntakeOn } from '../../rfq-native/server'
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
import './final-polish.css'
import './site-completion.css'
import './salmon-parity.css'
import './salmon-parity-overrides.css'
import './r2-discovery.css'
import './english-completion.css'
import './public-chrome-article.css'
import './salmon-families.css'
import './design-fixes.css'
import './design-r3.css'
import './a11y-fixes.css'
import './design-r4.css'
import './design-r5.css'
import './design-r5b.css'
import './design-lang.css'
import './design-articles.css'

export const defaultRobots = (anyReady: boolean): Metadata['robots'] =>
  anyReady ? undefined : { follow: false, googleBot: { follow: false, index: false }, index: false }

/** HEAD-POLISH-1: the browser UI colour is the ICS blue of the favicon tile and the web manifest (theme_color). */
export const viewport: Viewport = { themeColor: '#1B60A8' }

export const metadata: Metadata = {
  // Design R3.2 (owner-approved favicon B, CT 2026-10-06): the ICS drop mark on an ICS-blue tile.
  icons: {icon: [{url: '/favicon.ico', sizes: 'any'}, {url: '/icon.svg', type: 'image/svg+xml'}], apple: '/apple-touch-icon.png'},
  manifest: '/site.webmanifest',
  robots: defaultRobots(estateHasPublicationReadyRoute()),
  title: 'Industrial Cooling Solutions',
}

/** Locale Part B: in payload content mode the proxy passes the page language (`x-h2o-lang`, src/content/locale-language);
 * the repository and static builds are English-only. Only a plain language tag is accepted. */
const pageLanguage = async (): Promise<string> => {
  if (!isPayloadContent()) return 'en'
  const lang = (await headers()).get('x-h2o-lang') ?? 'en'
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(lang) ? lang : 'en'
}

/** LANG-2.2: the translation mode of this request. The static/repository build never reads headers (it stays static) and never offers the
 * in-page Google widget; in Payload mode a signed-in staff member (the proxy sets `x-h2o-staff`) gets plain links only. */
const translateMode = async () =>
  translateModeFor({ staff: isPayloadContent() && (await headers()).get('x-h2o-staff') === '1', payloadContent: isPayloadContent() })

const SiteLayout = async ({ children }: { children: ReactNode }) => {
  const lang = await pageLanguage()
  const mode = await translateMode()
  return (
    <html lang={lang}>
      <body>
        {/* R3: a skip link is the first focusable thing on every route. */}
        <a className="skip" href="#main">
          Skip to content
        </a>
        <TranslateModeProvider mode={mode}>{children}</TranslateModeProvider>
        {/* Native RFQ (CT brief 2026-10-05): the corner launcher and panel, on every public page, when native intake is on. */}
        {nativeIntakeOn() ? <NativeRfq launcher={launcherStrings()} locale={lang} /> : null}
        <QuietMotion/>
        {/* LANG-PROXY-NAV-1: keeps the Google Translate proxy's _x_tr_* parameters on in-site navigation (that host only) */}
        <TranslateProxyNav/>
      </body>
    </html>
  )
}

export default SiteLayout
