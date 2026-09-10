import React from 'react'
import type { Metadata, Viewport } from 'next'
import '../../design/generated/tokens.css'
import '../../design/generated/fonts.css'
import '@factory/agency-core/design-system/global.css'
import '@factory/agency-core/design-system/primitives.css'
import { themeColor } from '../../design/generated/tokens'
import contract from '../../../design/design-contract.json'

export const metadata: Metadata = {
  title: { default: 'syed.ai', template: '%s | syed.ai' },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/assets/img/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/assets/img/apple-touch-icon.png',
  },
}
export const viewport: Viewport = { themeColor, colorScheme: 'dark' }

// Preload only the two critical font files (design-contract typography.*.files[].preload)
const preload = [contract.typography.display, contract.typography.text]
  .flatMap((f) => f.files)
  .filter((f) => f.preload)

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {preload.map((f) => (
          <link
            key={f.path}
            rel="preload"
            as="font"
            type="font/woff2"
            href={f.path}
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  )
}
