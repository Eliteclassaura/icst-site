import { client } from '../../../client'
import { indexingOn, robotsTxt } from '../../../client/site/seo'

export const dynamic = 'force-dynamic'

export function GET(): Response {
  return new Response(robotsTxt(client().origin, indexingOn()), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
