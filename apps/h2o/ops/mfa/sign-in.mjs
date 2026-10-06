// Patch L2: finish a scripted sign-in. After `POST /api/users/login/` the session is password-only and can do nothing
// until it passes two-factor; this posts the current TOTP code to `/api/mfa/verify` (same token), so the token works.
//
//   const token = await completeMfa(origin, token, process.env.SOME_TOTP_SECRET, { envName: 'SOME_TOTP_SECRET' })
//
// The secret comes from the 0600 credentials file (exported into the environment like the password). It is never
// logged. Without a secret, the helper checks whether the server enforces two-factor and, if so, says which variable
// to set — instead of letting every later call fail with 401/403.
import { totpCode } from './totp.mjs'

export async function completeMfa(origin, token, secret, { envName = 'the *_TOTP_SECRET variable', headers = {}, fetchImpl = fetch } = {}) {
  const auth = { Authorization: `JWT ${token}`, ...headers }
  if (!secret) {
    const me = await fetchImpl(`${origin}/api/users/me`, { headers: auth })
    const body = await me.json().catch(() => null)
    if (body?.user) return token
    throw new Error(`two-factor is required for this sign-in: set ${envName} (from the 0600 credentials file)`)
  }
  const r = await fetchImpl(`${origin}/api/mfa/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ code: totpCode(secret) }),
  })
  if (r.status !== 200) throw new Error(`two-factor verification failed (${r.status})`)
  return token
}
