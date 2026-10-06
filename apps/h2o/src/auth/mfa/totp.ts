import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Patch L2: TOTP (RFC 6238 over RFC 4226 HOTP), the scheme every authenticator app uses — HMAC-SHA1, 30-second steps,
 * 6 digits. Node's crypto only; no third-party code handles a secret.
 */
export const STEP_SECONDS = 30
export const DIGITS = 6
/** Accepted clock drift: the previous, current and next step. */
export const WINDOW = 1

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!s || /[^A-Z2-7]/.test(s)) return null
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new 160-bit secret, base32 (what authenticator apps expect). */
export const generateSecret = (): string => base32Encode(randomBytes(20))

/** HOTP value for `counter` (RFC 4226 dynamic truncation). */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', secret).update(msg).digest()
  const offset = h[h.length - 1]! & 0x0f
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0')
}

export const stepAt = (at: Date): number => Math.floor(at.getTime() / 1000 / STEP_SECONDS)

/** The code an authenticator shows at `at` (for tests and the rehearsal helper only). */
export function totpCode(secretB32: string, at: Date = new Date()): string {
  const key = base32Decode(secretB32)
  if (!key) throw new Error('totpCode: secret is not base32')
  return hotp(key, stepAt(at))
}

export type TotpCheck = { ok: true; step: number } | { ok: false; reason: 'FORMAT' | 'MISMATCH' | 'REPLAY' }

/**
 * Verify a 6-digit code against `secretB32` at `at`, allowing ±WINDOW steps of drift. A step at or before
 * `lastStep` (the last code this user used) is refused as a replay, so a code works once.
 */
export function verifyTotp(secretB32: string, code: string, at: Date, lastStep: number | null): TotpCheck {
  const c = code.replace(/\s/g, '')
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(c)) return { ok: false, reason: 'FORMAT' }
  const key = base32Decode(secretB32)
  if (!key) return { ok: false, reason: 'MISMATCH' }
  const now = stepAt(at)
  let matched: number | null = null
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    // Compare every candidate (no early exit), in constant time per comparison.
    if (timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(c)) && matched === null) matched = step
  }
  if (matched === null) return { ok: false, reason: 'MISMATCH' }
  if (lastStep !== null && matched <= lastStep) return { ok: false, reason: 'REPLAY' }
  return { ok: true, step: matched }
}

/** The otpauth URI authenticator apps import (also opens the app when tapped on a phone). */
export function otpauthUri(secretB32: string, account: string, issuer = 'ICS CRM'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

/** Recovery codes: 10 single-use codes, "xxxxx-xxxxx" (base32, lower case; 50 bits each). */
export const RECOVERY_CODE_COUNT = 10
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const s = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase()
    return `${s.slice(0, 5)}-${s.slice(5)}`
  })
}
export const normaliseRecoveryCode = (code: string): string | null => {
  const s = code.toLowerCase().replace(/[\s-]/g, '')
  return /^[a-z2-7]{10}$/.test(s) ? `${s.slice(0, 5)}-${s.slice(5)}` : null
}
