import { client } from '../../../../client'
import { serveMedia } from '../../../../client/site/media'

export const dynamic = 'force-dynamic'

// Hero and brand images of the client (/brand-media/<file>), from the baked allow-list only.
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params
  return serveMedia('brand', path, client().slug, req.headers.get('if-none-match'))
}
