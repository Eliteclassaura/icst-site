import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import {readFileSync} from 'node:fs'
import path from 'node:path'

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
// Payload runtime (H2O_CONTENT_SOURCE=payload, set at build and run): public pages, redirects, sitemap and
// robots follow Payload's published state at request time (src/proxy.ts, src/content/**), so no build-time
// redirect table is compiled in and the public X-Robots-Tag is decided per request by the indexing policy.
// Repository mode (tests, static release, plain dev) keeps the accepted behaviour exactly.
const payloadRuntime = process.env.H2O_CONTENT_SOURCE === 'payload'
// MEDIA-CACHE-1 (CT 2026-10-09): /media/* otherwise answers Next's `public, max-age=0` and Cloudflare turns that into a 4 h browser TTL.
// Only a URL that changes when its bytes change may be immutable: a file named by its own sha256 (`/media/<dir>/<64 hex>.<ext>`, the
// physical hash files) and a descriptive image URL whose last 8 hex are the file's sha256 prefix (`/media/<slug>-<hash8>.<ext>`, IMG-SEO-1
// phase B; image-slugs.test.tsx pins that rule). Every other /media file (named design/Figma/video/testimonial assets that can be
// replaced under the same name) revalidates daily and may be served stale for a week. Later rules override earlier ones for the same key.
const IMAGE_EXT = 'png|jpe?g|webp|gif|avif'
const mediaCache = [
  { source: '/media/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
  { source: `/media/:dir/:file([0-9a-f]{64}\\.(?:${IMAGE_EXT}))`, headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  { source: `/media/:file([^/]+-[0-9a-f]{8}\\.(?:${IMAGE_EXT}))`, headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
]
const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace packages (@factory/agency-core) from the repository root.
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // Pagefind runs its native indexer binary; it must stay a runtime dependency, not a bundled module.
  serverExternalPackages: ['pagefind', '@pagefind/linux-x64', '@pagefind/linux-arm64'],
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/pagefind@*/node_modules/pagefind/**', '../../node_modules/.pnpm/@pagefind+linux-*/node_modules/@pagefind/**'],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  async headers() {
    // Payload admin is never framed (clickjacking); it opens previews in a new tab, not a live-preview iframe.
    const adminFraming = { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] }
    // R2.5 (CT 2026-10-05, launch indexing contract): in payload runtime the X-Robots-Tag decision is the proxy's, at RUNTIME,
    // from H2O_INDEXING_POLICY (src/proxy.ts) — one image serves staging (private) and production. A header compiled here at
    // build time would follow the build environment, not the running one, and override the proxy on every page.
    if (payloadRuntime) return [...mediaCache, adminFraming]
    // Repository mode (tests, the static release path, plain dev): unchanged, plus the media cache rules.
    return [...mediaCache, {source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]
  },
  async redirects() {
    if (payloadRuntime) return []
    const rows=JSON.parse(readFileSync(path.join(process.cwd(),'content/salmon/redirects.json'),'utf8')) as Array<{source:string;destination:string}>
    const reconciled=JSON.parse(readFileSync(path.join(process.cwd(),'content/luxury/reconciled-redirects.json'),'utf8')) as Array<{source:string;destination:string}>
    return [...rows,...reconciled,{source:'/cooling-tower-resources/',destination:'/resources/'}].map(row=>({source:row.source,destination:row.destination,permanent:true}))
  },
}
export default withPayload(nextConfig)
