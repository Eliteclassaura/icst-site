import { client } from '../../../../client'
import { listPages } from '../../../../client/site/content'
import { indexingOn, sitemapXml } from '../../../../client/site/seo'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const c = client()
  const body = sitemapXml(c.origin, listPages(c.slug), (await params).file, indexingOn())
  if (body === null) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
