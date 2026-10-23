/**
 * Liveness: the process answers. No database, no configuration, nothing to leak.
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return new Response('ok', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
