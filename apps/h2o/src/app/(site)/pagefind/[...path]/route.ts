import config from '@payload-config'
import { getPayload } from 'payload'
import { fragmentUrl, readSearchAsset } from '../../../../content/search-index'
import { computeRevocations } from '../../../../content/revocation'

/**
 * The promoted Pagefind index (publishing-driven). R1B (Control Tower F4/F6):
 *
 *   /pagefind/<file>             the active release's search generation
 *   /pagefind/g/<searchId>/<file> a pinned generation (the one the search page was rendered with), served for
 *                                 as long as it is retained, so a promotion mid-query never mixes the
 *                                 entry/index/fragments of two generations (immutable, cacheable)
 *
 * A result fragment whose page has been withdrawn since that generation was built answers 410 (revocation
 * overlay, ../../../../content/revocation), so a stale index never presents a withdrawn page as a result.
 * Only files inside the generation are served.
 */
export const dynamic = 'force-dynamic'
const SAFE = /^[A-Za-z0-9._-]+$/
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  let parts = (await params).path
  if (!parts.every((p) => SAFE.test(p) && p !== '..' && p !== '.')) return new Response('Not found', { status: 404 })
  let generation: string | null = null
  if (parts[0] === 'g') {
    generation = parts[1] ?? null
    parts = parts.slice(2)
    if (!generation || !parts.length) return new Response('Not found', { status: 404 })
  }
  const asset = readSearchAsset(parts, generation)
  if (!asset) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  if (parts[0] === 'fragment' && parts.length === 2) {
    const url = fragmentUrl(asset.dir, parts[1]!)
    let revoked: boolean
    try {
      const rev = await computeRevocations(await getPayload({ config }))
      revoked = Boolean(url) && rev.paths.has(new URL(url, 'https://h2o.invalid').pathname)
    } catch {
      revoked = false
    }
    if (revoked) return new Response('Gone', { status: 410, headers: { 'Cache-Control': 'no-store' } })
    // Fragments are revocable, so they are always revalidated.
    return new Response(new Uint8Array(asset.bytes), { headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } })
  }
  const cache = generation ? 'public, max-age=300, immutable' : 'public, max-age=0, must-revalidate'
  return new Response(new Uint8Array(asset.bytes), { headers: { 'Content-Type': asset.type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } })
}
