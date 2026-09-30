import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { isPayloadContent } from '../../../../content/runtime-read'
import { computeRevocations } from '../../../../content/revocation'
import { sitemapResponse } from '../../../../proxy'

/**
 * /sitemap.xml (rewritten here by the proxy) in payload content mode: the published ledger of the active release minus the routes withdrawn
 * since it was built (R1B revocation overlay). The private indexing policy intentionally publishes an empty
 * sitemap; membership is reported separately from the hosted response.
 */
export const dynamic = 'force-dynamic'
export async function GET() {
  if (!isPayloadContent()) return new NextResponse('Not found', { status: 404 })
  let revoked: Set<string>
  try {
    revoked = (await computeRevocations(await getPayload({ config }))).paths
  } catch {
    return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return sitemapResponse(revoked)
}
