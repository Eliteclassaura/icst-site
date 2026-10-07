import type { Payload } from 'payload'

/**
 * SEC-MAIN-1 (security audit R1, deploy.first-register-fresh-prod-db): once any user exists, Payload's first-user
 * bootstrap is gone, not merely refused. `POST /api/users/first-register` and `/admin/create-first-user` answer 404
 * (the REST route and the admin page check this before Payload sees the request).
 *
 * The check is one `count` on `users` until a user is seen; after that the answer is cached for the process (users
 * are never all deleted in normal operation, and a cached "exists" only keeps the endpoints closed).
 */
let seen = false

export async function anyUserExists(payload: Pick<Payload, 'count'>): Promise<boolean> {
  if (seen) return true
  const { totalDocs } = await payload.count({ collection: 'users', overrideAccess: true })
  seen = totalDocs > 0
  return seen
}

/** REST: `/api/users/first-register` (any method). */
export const isFirstRegisterSlug = (slug: readonly string[] | undefined): boolean =>
  slug?.length === 2 && slug[0] === 'users' && slug[1] === 'first-register'

/** Admin: `/admin/create-first-user`. */
export const isCreateFirstUserSegments = (segments: readonly string[] | undefined): boolean =>
  segments?.length === 1 && segments[0] === 'create-first-user'

export const firstUserGone = (): Response =>
  Response.json({ errors: [{ message: 'Not Found' }] }, { status: 404, headers: { 'Cache-Control': 'no-store' } })

/** Test hook only. */
export function resetFirstUserCacheForTests(): void {
  seen = false
}
