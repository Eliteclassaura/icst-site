import config from '@payload-config'
import { getPayload } from 'payload'
import { mfaCookieHeader } from '../../../../../auth/mfa/endpoint'
import { pendingSession } from '../../../../../auth/mfa/guard'
import { safeNext } from '../../../../../auth/mfa/next'

/**
 * Patch L2: leave the two-factor page. Only a session that has passed two-factor gets the routing cookie and goes on
 * to `next` (an admin or CRM path); anything else goes back to the two-factor page. GET, no state change beyond the
 * cookie, which is UX routing only (the server guard decides what the session may do).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const next = safeNext(url.searchParams.get('next'))
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, request.headers)
  const headers = new Headers({ 'cache-control': 'no-store' })
  if (!pending) {
    headers.set('location', `/admin/login/?redirect=${encodeURIComponent(next)}`)
    return new Response(null, { status: 303, headers })
  }
  if (!pending.verified) {
    headers.set('location', `/crm/mfa/?next=${encodeURIComponent(next)}`)
    return new Response(null, { status: 303, headers })
  }
  headers.set('set-cookie', mfaCookieHeader(pending.sid))
  headers.set('location', next)
  return new Response(null, { status: 303, headers })
}
