import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import staticMap from '../../../../../content/redirects.json'

export const dynamic = 'force-dynamic'

export type RedirectMap = {
  version: number
  redirects: Record<string, { to: string | null; status: 301 | 308 | 410 }>
  gone: Record<string, 404 | 410>
}

/**
 * Active redirects, materialised for the proxy (ADR-028 §7). Payload's local API is never loaded inside
 * `proxy.ts`; the proxy fetches this once per interval and keeps the map in memory. Cached under the
 * `collection:redirects` tag, which the existing revalidation hook busts on every change.
 * `proposed` rows are never included — nothing unattended changes a ranking URL.
 */
const load = unstable_cache(
  async (): Promise<RedirectMap> => {
    const payload = await getPayload({ config })
    const rows = await payload.find({
      collection: 'redirects',
      where: { status: { equals: 'active' } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })
    const redirects: RedirectMap['redirects'] = { ...(staticMap.redirects as RedirectMap['redirects']) }
    for (const r of rows.docs)
      redirects[r.from] = { to: r.to ?? null, status: Number(r.statusCode) as 301 | 308 | 410 }
    return { version: Date.now(), redirects, gone: staticMap.gone as RedirectMap['gone'] }
  },
  ['redirects-map'],
  { tags: ['collection:redirects'] },
)

export async function GET() {
  const map = await load()
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'private, max-age=30', 'X-Robots-Tag': 'noindex' },
  })
}
