import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { isContentAdmin } from '../../../../content/access'
import { isPayloadContent } from '../../../../content/runtime-read'
import { computeRevocations } from '../../../../content/revocation'
import { publishedUpdatedAt, sitemapResponse } from '../../../../content/sitemap-response'
import { SITEMAP_FILE } from '../../../../content/sitemap'

/**
 * Private sitemap preview (CT sitemap brief §7): exactly what the production indexing policy would publish, through
 * the same code path as the public sitemap, so it can be verified on staging while staging itself stays closed.
 * Content admins only; anyone else (anonymous included) gets 404, so the route does not advertise itself.
 * `?file=page-sitemap.xml` selects a child; without it the index is returned. Never cached, never indexed.
 */
export const dynamic = 'force-dynamic'
const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  if (!isPayloadContent()) return notFound()
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !isContentAdmin({ user } as never)) return notFound()
  const name = new URL(request.url).searchParams.get('file') ?? 'sitemap_index.xml'
  if (!SITEMAP_FILE.test(`/${name}`)) return notFound()
  let revoked: Set<string>
  let lastmod: Map<string, string>
  try {
    revoked = (await computeRevocations(payload)).paths
    lastmod = await publishedUpdatedAt(payload)
  } catch {
    return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
  return sitemapResponse(name, { revoked, lastmod, production: true }, { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' })
}
