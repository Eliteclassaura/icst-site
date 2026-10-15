import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'

/**
 * Client-site build configuration (fork of the default site's, pruned). Nothing here reads a content file: the build must be able to run
 * with no default-site data on disk, and the compiled output must carry none (see PORTING_LEDGER.md and the layer-2 scan).
 *
 * Every public path of the client ends in a slash (the canonical form), so `trailingSlash: true` serves it directly and the other form
 * gets exactly one 308 to it.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace packages (@factory/agency-core) from the repository root.
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // The block library ships TypeScript and global CSS.
  transpilePackages: ['@factory/agency-core'],
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  async headers() {
    // Payload admin is never framed (clickjacking); it opens previews in a new tab, not a live-preview iframe.
    // Everything else (CSP, robots, security headers) is decided per request by src/proxy.ts.
    return [
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
    ]
  },
}
export default withPayload(nextConfig)
