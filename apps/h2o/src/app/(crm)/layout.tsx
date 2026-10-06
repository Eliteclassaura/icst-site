import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../../crm/workspace/ui/crm.css'

/**
 * Root layout of the private Sales Workspace (route group `(crm)`). It is not copied into the static public
 * build (release/prepare.mjs copies only `src/app/(site)`), is never indexable (metadata + the app-wide
 * `X-Robots-Tag: noindex, nofollow` header) and renders no public-site chrome.
 */
export const metadata: Metadata = {
  title: { default: 'Sales Workspace', template: '%s · Sales Workspace' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'same-origin',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export const dynamic = 'force-dynamic'

export default function CrmRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="c-body">{children}</body>
    </html>
  )
}
