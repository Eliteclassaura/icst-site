import type { Endpoint, PayloadRequest } from 'payload'
import { pendingSession } from './guard'
import { MFA_COOKIE, mfaCookieValue } from './keys'
import { verifySecondFactor } from './service'

/**
 * Patch L2: `POST /api/mfa/verify` with `{ "code": "123456" }` (or a recovery code) and the session's JWT (cookie or
 * `Authorization: JWT …`). For scripted sign-ins (rehearsal smoke tests); people use the /crm/mfa/ page.
 *
 *   200 { ok: true }                   the session now authenticates; the `h2o-mfa` routing cookie is set
 *   400 { ok: false, code }            not enrolled / wrong format
 *   401 { ok: false, code }            no signed-in session, or a wrong code
 *   423 { ok: false, code: 'LOCKED' }  too many wrong codes (Retry-After)
 * The code is never logged or echoed.
 */
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

export const MFA_VERIFY_PATH = '/mfa/verify'

export function mfaCookieHeader(sid: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${MFA_COOKIE}=${mfaCookieValue(sid)}; Path=/; HttpOnly; SameSite=Lax${secure}`
}

const verifyEndpoint: Endpoint = {
  path: MFA_VERIFY_PATH,
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const pending = await pendingSession(req.payload, req.headers)
    if (!pending) return json(401, { ok: false, code: 'NOT_SIGNED_IN' })
    let body: { code?: unknown } | undefined
    try {
      body = (await req.json?.()) as { code?: unknown } | undefined
    } catch {
      return json(400, { ok: false, code: 'FORMAT' })
    }
    const code = typeof body?.code === 'string' ? body.code.slice(0, 32) : ''
    const out = await verifySecondFactor(req.payload, pending.user, pending.sid, code)
    if (out.ok) return json(200, { ok: true, recoveryRemaining: out.recoveryRemaining ?? null }, { 'set-cookie': mfaCookieHeader(pending.sid) })
    if (out.code === 'LOCKED') return json(423, { ok: false, code: out.code }, { 'retry-after': String(out.retryAfterSeconds ?? 900) })
    if (out.code === 'FORMAT' || out.code === 'NOT_ENROLLED') return json(400, { ok: false, code: out.code })
    return json(401, { ok: false, code: out.code })
  },
}

export const mfaEndpoints: Endpoint[] = [verifyEndpoint]
