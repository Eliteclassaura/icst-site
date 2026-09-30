import { draftMode } from 'next/headers'

/** Leave private preview. */
export const dynamic = 'force-dynamic'
export async function GET() {
  ;(await draftMode()).disable()
  return new Response(null, { status: 307, headers: { Location: '/', 'Cache-Control': 'private, no-store' } })
}
