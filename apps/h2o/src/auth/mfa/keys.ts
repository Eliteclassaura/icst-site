import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Patch L2 key material. One root secret — `H2O_MFA_KEY` when set (≥ 32 characters, from the secret store), else
 * `PAYLOAD_SECRET` — and a separate HKDF-derived key per purpose, so no key is ever used for two things:
 *
 *   - `enc`    AES-256-GCM for the TOTP secrets at rest (a database dump alone cannot produce codes)
 *   - `codes`  HMAC-SHA256 for recovery codes (stored as digests only)
 *   - `cookie` HMAC-SHA256 for the `h2o-mfa` routing cookie (UX routing only; the server checks the session itself)
 *
 * Changing the root secret makes every enrolment unreadable: everyone re-enrols (an admin resets them). The runbook
 * says so; `H2O_MFA_KEY` exists so `PAYLOAD_SECRET` can rotate without that.
 */
type Purpose = 'enc' | 'codes' | 'cookie'
const cache = new Map<string, Buffer>()

function root(): string {
  const k = process.env.H2O_MFA_KEY
  if (k && k.length >= 32) return k
  const p = process.env.PAYLOAD_SECRET
  if (!p) throw new Error('[h2o] MFA needs H2O_MFA_KEY (≥ 32 chars) or PAYLOAD_SECRET. The value itself is never logged.')
  return p
}

export function mfaKey(purpose: Purpose): Buffer {
  const r = root()
  const id = `${purpose}:${r.length}:${createHmac('sha256', 'h2o-mfa-key-id').update(r).digest('hex').slice(0, 16)}`
  let k = cache.get(id)
  if (!k) {
    k = Buffer.from(hkdfSync('sha256', r, 'h2o-mfa-v1', `h2o-mfa-${purpose}`, 32))
    cache.set(id, k)
  }
  return k
}

/** "v1.<iv>.<tag>.<ciphertext>" (base64url), AES-256-GCM with a fresh 96-bit IV. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', mfaKey('enc'), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptSecret(sealed: unknown): string | null {
  if (typeof sealed !== 'string') return null
  const [v, iv, tag, body] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !body) return null
  // SEC-CRM-1: the tag is exactly 16 bytes (pinned, so a truncated tag can never be accepted).
  const t = Buffer.from(tag, 'base64url')
  if (t.length !== 16) return null
  try {
    const d = createDecipheriv('aes-256-gcm', mfaKey('enc'), Buffer.from(iv, 'base64url'), { authTagLength: 16 })
    d.setAuthTag(t)
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

export const hashRecoveryCode = (normalised: string): string => createHmac('sha256', mfaKey('codes')).update(normalised).digest('hex')

/** The routing cookie value for a session id: "<sid>.<hmac>". */
export const mfaCookieValue = (sid: string): string => `${sid}.${createHmac('sha256', mfaKey('cookie')).update(sid).digest('base64url')}`

export function mfaCookieValid(value: string | undefined, sid: string): boolean {
  if (!value) return false
  const expected = Buffer.from(mfaCookieValue(sid))
  const got = Buffer.from(value)
  return got.length === expected.length && timingSafeEqual(got, expected)
}

export const MFA_COOKIE = 'h2o-mfa'
