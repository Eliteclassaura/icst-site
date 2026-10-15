import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import '@factory/agency-core/design-system/global.css'
import '@factory/agency-core/design-system/primitives.css'
import { client } from '../../client'
import { DS_BRIDGE_CSS } from '../../client/site/bridge'
import { loadChrome, loadThemeCss } from '../../client/site/content'

/**
 * KIT-0 H6: root layout of the non-default client site. It has its own CSS (the agency-core design system plus the client's theme), so
 * only the agency-core design system and the client's own CSS are loaded.
 */
export default async function ClientRootLayout({ children }: { children: ReactNode }) {
  // Reading the request headers makes every page of this group dynamic, so Next stamps the per-request CSP nonce (set by the proxy) on its own
  // bootstrap scripts. A statically prerendered page could never carry a per-request nonce, and its inline scripts would be blocked.
  await headers()
  const c = client()
  const fonts = loadChrome(c.slug).fonts ?? []
  const css = `${loadThemeCss(c.slug)}\n${DS_BRIDGE_CSS}`
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
