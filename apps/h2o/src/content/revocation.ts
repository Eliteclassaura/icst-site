import type { Payload } from 'payload'
import { PUBLISHED_PUBLIC } from './access'
import { pendingEvents } from './events'
import { currentRelease } from './release'

/**
 * Withdrawal revocation overlay (R1B, Control Tower F4.5 / F6).
 *
 * The page itself is read from the database on every request, so an unpublished page is a 404 at once. What
 * lags is the derived release: listings, sitemap, related links, RFQ eligibility and search results come from
 * the promoted content+search pair until the runner promotes the next one. If that next build fails, the last
 * release must not keep presenting withdrawn content as current.
 *
 * Every public request therefore subtracts the **revoked set**: routes with a committed publication event
 * that the active release does not reflect (`pg_visible_in_snapshot` false) and that are not currently
 * published PUBLIC in the database. Revocation is immediate and holds for as long as the release is behind,
 * however long a failed runner takes. A republish removes the route from the set; content changes to
 * still-published routes are ordinary backlog (the page is already current).
 *
 * Cached per process for REVOCATION_TTL_MS keyed by release id, so a busy server makes at most one small
 * query per interval.
 */
export type Revocations = { routeIds: Set<string>; paths: Set<string>; pending: number; oldestPendingAt: string | null; releaseId: string | null }
const REVOCATION_TTL_MS = 2000
let cached: { at: number; key: string; value: Revocations } | null = null
const EMPTY = (releaseId: string | null): Revocations => ({ routeIds: new Set(), paths: new Set(), pending: 0, oldestPendingAt: null, releaseId })

type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }

export async function computeRevocations(payload: Payload, now = Date.now()): Promise<Revocations> {
  const release = currentRelease()
  const key = release?.id ?? 'none'
  if (cached && cached.key === key && now - cached.at < REVOCATION_TTL_MS) return cached.value
  const ex = (payload.db as unknown as { drizzle: Exec }).drizzle
  const pend = await pendingEvents(ex, release?.pgSnapshot ?? null)
  const value = EMPTY(release?.id ?? null)
  value.pending = pend.count
  value.oldestPendingAt = pend.oldestAt
  if (pend.changedRouteIds.length) {
    const live = await payload.find({
      collection: 'public-routes' as never,
      where: { and: [PUBLISHED_PUBLIC, { routeId: { in: pend.changedRouteIds } }] } as never,
      select: { routeId: true } as never,
      depth: 0,
      pagination: false,
      overrideAccess: false,
    })
    const stillPublic = new Set((live.docs as unknown as Array<{ routeId: string }>).map((d) => String(d.routeId)))
    const gone = pend.changedRouteIds.filter((id) => !stillPublic.has(id))
    if (gone.length) {
      const rows = await payload.find({
        collection: 'public-routes' as never,
        where: { routeId: { in: gone } } as never,
        select: { routeId: true, path: true } as never,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })
      for (const r of rows.docs as unknown as Array<{ routeId: string; path: string }>) {
        value.routeIds.add(String(r.routeId))
        value.paths.add(String(r.path))
      }
      // A deleted record has no row left: its route id (and the path recorded with the event) stay revoked.
      for (const id of gone) {
        value.routeIds.add(id)
        if (pend.paths[id]) value.paths.add(pend.paths[id]!)
      }
    }
  }
  cached = { at: now, key, value }
  return value
}

export const resetRevocationCache = () => {
  cached = null
}
