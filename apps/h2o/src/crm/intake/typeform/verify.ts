import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Typeform webhook signature verification.
 *
 * Typeform signs each delivery with the webhook's secret: header `Typeform-Signature: sha256=<base64>` where
 * `<base64>` is the base64 HMAC-SHA256 of the **raw request body**. Verification must therefore run on the
 * exact bytes received, before any JSON parsing, and compare in constant time.
 *
 * A delivery that fails verification is not evidence of anything: it is rejected (401) and **nothing** is
 * persisted — an attacker must not be able to write rows, open reviews or create tasks by posting to the
 * endpoint. Only the reason code is logged.
 */
export const SIGNATURE_HEADER = 'typeform-signature'

export type SignatureResult =
  | { ok: true }
  | {
      ok: false
      reason: 'SIGNATURE_MISSING' | 'SIGNATURE_MALFORMED' | 'SIGNATURE_MISMATCH' | 'SECRET_MISSING'
    }

export function verifyTypeformSignature(
  rawBody: Uint8Array | string,
  header: string | null | undefined,
  secret: string,
): SignatureResult {
  if (!secret) return { ok: false, reason: 'SECRET_MISSING' }
  if (!header) return { ok: false, reason: 'SIGNATURE_MISSING' }
  const m = /^sha256=([A-Za-z0-9+/]+={0,2})$/.exec(header.trim())
  if (!m) return { ok: false, reason: 'SIGNATURE_MALFORMED' }
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const given = Buffer.from(m[1]!, 'base64')
  if (given.length !== expected.length) return { ok: false, reason: 'SIGNATURE_MISMATCH' }
  return timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: 'SIGNATURE_MISMATCH' }
}

/** Test/fixture helper: sign a body the way Typeform does. */
export const signTypeformBody = (rawBody: Uint8Array | string, secret: string): string =>
  `sha256=${createHmac('sha256', secret).update(rawBody).digest('base64')}`

export const sha256Hex = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex')
