import { client } from '../../../../../client'
import { serveMedia } from '../../../../../client/site/media'

export const dynamic = 'force-dynamic'

// ICST media at its original live paths (/wp-content/uploads/...), from the baked allow-list only.
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params
  return serveMedia('uploads', path, client().slug, req.headers.get('if-none-match'))
}
