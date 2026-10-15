import { client } from '../../../client'
import { listPages } from '../../../client/site/content'
import { indexingOn, sitemapChildren, sitemapIndexXml } from '../../../client/site/seo'

export const dynamic = 'force-dynamic'

/** Private deploys answer 404: there is nothing to index. */
export function GET(): Response {
  const c = client()
  const on = indexingOn()
  if (!on) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  return new Response(sitemapIndexXml(c.origin, sitemapChildren(listPages(c.slug), on)), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
