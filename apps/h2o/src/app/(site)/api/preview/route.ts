import config from '@payload-config'
import { draftMode, headers } from 'next/headers'
import { getPayload } from 'payload'
import { isEditorialReader } from '../../../../content/access'

/**
 * Private preview entry (Payload admin "Preview" button). Requires a signed-in editorial user; enables Next
 * draft mode for this browser and redirects to the page. The draft cookie alone grants nothing: the page
 * re-checks the signed-in role on every request, and preview responses are `private, no-store`, noindex.
 * The path must be a site-relative page path; anything else is refused (no open redirect).
 */
export const dynamic = 'force-dynamic'
const SAFE = /^\/(?:[A-Za-z0-9%._~-]+\/)*$/

export async function GET(request: Request) {
  const url = new URL(request.url)
  const target = url.searchParams.get('path') ?? '/'
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return new Response('Sign in to preview.', { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  if (!isEditorialReader({ user } as never)) return new Response('Preview is available to editors only.', { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
  if (!SAFE.test(target) || target.startsWith('//')) return new Response('Invalid preview path.', { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
  ;(await draftMode()).enable()
  return new Response(null, { status: 307, headers: { Location: target, 'Cache-Control': 'private, no-store' } })
}
