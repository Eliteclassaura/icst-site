import { client } from '../../../client'
import { listPages } from '../../../client/site/content'
import { indexingOn, llmsTxt } from '../../../client/site/seo'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  const c = client()
  return new Response(llmsTxt(c.manifest, listPages(c.slug), indexingOn()), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
