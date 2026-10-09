import crypto from 'node:crypto'
import type { Payload } from 'payload'

/**
 * STEP-UP-1: check a user's own password for a step-up (no session, no token, no side effect; the caller counts the
 * failure and audits). Payload has no public "is this the password" call (`login` would open a session and move the
 * sign-in counters), so this reads the stored salt and hash and compares them the way Payload writes them:
 *   current:  `pbkdf2-sha256-v1:<hex>`  PBKDF2-SHA256, 600000 iterations, 32 bytes
 *   legacy:   `<hex>`                   PBKDF2-SHA256,  25000 iterations, 512 bytes
 * A test creates a user through Payload, changes its password through Payload, and requires this to agree, so a change
 * to Payload's hashing fails a test instead of silently refusing every password.
 * Returns null when the account has no password hash at all (it cannot confirm with a password).
 */
const CURRENT_PREFIX = 'pbkdf2-sha256-v1:'
const MAX_LENGTH = 1024

export async function verifyAccountPassword(payload: Payload, userId: string | number, password: string): Promise<boolean | null> {
  const doc = (await payload
    .findByID({ collection: 'users', id: userId, depth: 0, showHiddenFields: true, overrideAccess: true })
    .catch(() => null)) as { hash?: unknown; salt?: unknown } | null
  if (!doc || typeof doc.hash !== 'string' || typeof doc.salt !== 'string' || !doc.hash || !doc.salt) return null
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_LENGTH) return false
  const current = doc.hash.startsWith(CURRENT_PREFIX)
  const stored = Buffer.from(current ? doc.hash.slice(CURRENT_PREFIX.length) : doc.hash, 'hex')
  const iterations = current ? 600_000 : 25_000
  const keyLength = current ? 32 : 512
  const derived = await new Promise<Buffer>((resolve, reject) =>
    crypto.pbkdf2(password, doc.salt as string, iterations, keyLength, 'sha256', (err, key) => (err ? reject(err) : resolve(key))),
  )
  return derived.length === stored.length && crypto.timingSafeEqual(derived, stored)
}
