import type { ReactNode } from 'react'
import '@factory/agency-core/design-system/global.css'
import '@factory/agency-core/design-system/primitives.css'
import { client, DEFAULT_CLIENT } from '../../client'
import { DS_BRIDGE_CSS } from '../../client/site/bridge'
import { loadChrome, loadThemeCss } from '../../client/site/content'

/**
 * KIT-0 H6: root layout of the non-default client site. It has its own CSS (the agency-core design system plus the client's theme), so
 * none of the default site's CSS reaches it. With CLIENT unset (the default client) this group never renders: its pages 404 (see the page).
 */
export default function ClientRootLayout({ children }: { children: ReactNode }) {
  const c = client()
  const fonts = c.slug === DEFAULT_CLIENT ? [] : (loadChrome(c.slug).fonts ?? [])
  const css = c.slug === DEFAULT_CLIENT ? '' : `${loadThemeCss(c.slug)}\n${DS_BRIDGE_CSS}`
  return (
    <html lang={c.manifest.locales.default}>
      <head>
        {fonts.map((href) => (
          // Preview only: remote font stylesheets. H6b self-hosts the font files from the client folder, as the default site does.
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
