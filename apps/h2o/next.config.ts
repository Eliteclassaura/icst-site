import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

// Phase 2 increment 2A.1 left trailing-slash behaviour unset, as a catalog concern for the routing
// increment. PV-05 is that increment, and this is its one line.
//
// Every one of the 29 accepted canonical paths ends in a slash — `canonical_path` and `canonical`
// alike, and the internal link plan writes the same form — which is the URL form h2ocooling.com
// already has. Next's default is `trailingSlash: false`, so without this the server would answer
// the accepted canonical URL with a 308 to a different URL: every canonical would redirect away
// from itself, which is the one thing a migration must never do to existing URL equity.
//
// With it true, the canonical form is served directly and the other form gets exactly one 308 to
// it. One hop, no chain, no blanket redirect: `PRESERVE SAME URL BY DEFAULT`.
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
}
export default withPayload(nextConfig)
