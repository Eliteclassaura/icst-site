import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { isPayloadContent } from '../../../../content/runtime-read'
import { computeRevocations } from '../../../../content/revocation'
import { publishedUpdatedAt, sitemapResponse } from '../../../../content/sitemap-response'
import { SITEMAP_FILE } from '../../../../content/sitemap'

/**
 * /sitemap_index.xml, /sitemap.xml and the sitemap children (the proxy rewrites them here with `?file=<name>`) in
 * payload content mode: the published ledger of the active release minus the routes withdrawn since it was built
 * (R1B revocation overlay), with each document's `updatedAt` as `lastmod`. The private indexing policy
 * intentionally publishes an empty index; membership is reviewed through /api/sitemap-preview/.
 */
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (!isPayloadContent()) return new NextResponse('Not found', { status: 404 })
  const name = new URL(request.url).searchParams.get('file') ?? 'sitemap_index.xml'
  if (!SITEMAP_FILE.test(`/${name}`)) return new NextResponse('Not found', { status: 404 })
  const production = process.env.H2O_INDEXING_POLICY === 'production'
  let revoked: Set<string>
  let lastmod: Map<string, string> | undefined
  try {
    const payload = await getPayload({ config })
    revoked = (await computeRevocations(payload)).paths
    if (production) lastmod = await publishedUpdatedAt(payload)
  } catch {
    return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return sitemapResponse(name, { revoked, lastmod })
}
