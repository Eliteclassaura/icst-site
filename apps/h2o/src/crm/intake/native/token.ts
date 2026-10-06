import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Native intake form token (contract §3): a signed, opaque timing token issued when the visitor opens the panel or
 * starts the form. It carries no visitor data — only when it was issued and a nonce — and lets the submit endpoint
 * refuse a submission that arrives impossibly fast (a bot) or far too late (a stale page).
 *
 *   "v1.<issued ms, base36>.<nonce>.<hmac>"  HMAC-SHA256 under a key derived from PAYLOAD_SECRET for this purpose only.
 */
export const MIN_SECONDS_TO_SUBMIT = 3
export const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000

let key: { root: string; k: Buffer } | null = null
function tokenKey(): Buffer {
  const root = process.env.PAYLOAD_SECRET ?? ''
  if (!root) throw new Error('[h2o] native intake needs PAYLOAD_SECRET to sign form tokens. The value itself is never logged.')
  if (!key || key.root !== root) key = { root, k: Buffer.from(hkdfSync('sha256', root, 'h2o-rfq-v1', 'h2o-rfq-form-token', 32)) }
  return key.k
}
const mac = (body: string) => createHmac('sha256', tokenKey()).update(body).digest('base64url')

export function issueFormToken(now: Date = new Date()): { formToken: string; issuedAt: string } {
  const body = `v1.${now.getTime().toString(36)}.${randomBytes(12).toString('base64url')}`
  return { formToken: `${body}.${mac(body)}`, issuedAt: now.toISOString() }
}

export type TokenCheck = 'OK' | 'MISSING' | 'MALFORMED' | 'BAD_SIGNATURE' | 'TOO_FAST' | 'EXPIRED'

export function checkFormToken(token: unknown, now: Date = new Date()): TokenCheck {
  if (typeof token !== 'string' || !token) return 'MISSING'
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^[0-9a-z]{1,12}$/.test(parts[1]!) || !/^[A-Za-z0-9_-]{16}$/.test(parts[2]!)) return 'MALFORMED'
  const expected = Buffer.from(mac(parts.slice(0, 3).join('.')))
  const got = Buffer.from(parts[3]!)
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return 'BAD_SIGNATURE'
  const age = now.getTime() - parseInt(parts[1]!, 36)
  if (age < MIN_SECONDS_TO_SUBMIT * 1000) return 'TOO_FAST'
  if (age > MAX_TOKEN_AGE_MS) return 'EXPIRED'
  return 'OK'
}
