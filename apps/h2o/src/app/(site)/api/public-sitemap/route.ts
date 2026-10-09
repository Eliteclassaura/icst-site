import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { isPayloadContent } from '../../../../content/runtime-read'
import { computeRevocations } from '../../../../content/revocation'
import { publishedUpdatedAt, sitemapPreviewOrigin, sitemapResponse } from '../../../../content/sitemap-response'
import { SITEMAP_ORIGIN_HEADER, requestedSitemapFile } from '../../../../content/sitemap-request'

/**
 * /sitemap_index.xml, /sitemap.xml and the sitemap children (the proxy rewrites them here with the `x-h2o-sitemap-file`
 * request header and `?file=<name>`; R3.3: the standalone runtime drops the rewrite's query) in
 * payload content mode: the published ledger of the active release minus the routes withdrawn since it was built
 * (R1B revocation overlay), with each document's `updatedAt` as `lastmod`. The private indexing policy
 * intentionally publishes an empty index; membership is reviewed through /api/sitemap-preview/.
 */
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (!isPayloadContent()) return new NextResponse('Not found', { status: 404 })
  const name = requestedSitemapFile(request)
  if (!name) return new NextResponse('Not found', { status: 404 })
  const production = process.env.H2O_INDEXING_POLICY === 'production'
  // SITEMAP-PREVIEW-1: the private review host gets the real URL set on its own origin (the proxy names the origin; other hosts get the empty index)
  const previewOrigin = production ? undefined : sitemapPreviewOrigin(request.headers.get(SITEMAP_ORIGIN_HEADER))
  let revoked: Set<string>
  let lastmod: Map<string, string> | undefined
  try {
    const payload = await getPayload({ config })
    revoked = (await computeRevocations(payload)).paths
    if (production || previewOrigin) lastmod = await publishedUpdatedAt(payload)
  } catch {
    return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return sitemapResponse(name, { revoked, lastmod, previewOrigin })
}
