import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Patch C: secrets an admin enters in the CRM (an SMTP password) are stored sealed, AES-256-GCM, under a key derived
 * from `H2O_SETTINGS_KEY` (≥ 32 characters, from the secret store). There is deliberately no fallback to
 * PAYLOAD_SECRET: without the key, nothing can be stored or used, and the environment profile stays in charge.
 *
 * The sealed value is bound to its purpose and record ("additional data"), so a sealed password copied into another
 * record or field does not open. Rotating the key makes every stored password unreadable: re-enter them (runbook).
 */
const MIN_KEY = 32
let cached: { id: string; k: Buffer } | null = null

export const settingsKeyConfigured = (env: Record<string, string | undefined> = process.env): boolean => (env.H2O_SETTINGS_KEY ?? '').length >= MIN_KEY

function key(): Buffer {
  const root = process.env.H2O_SETTINGS_KEY ?? ''
  if (root.length < MIN_KEY) throw new SettingsKeyError()
  const id = createHmac('sha256', 'h2o-settings-key-id').update(root).digest('hex')
  if (!cached || cached.id !== id) cached = { id, k: Buffer.from(hkdfSync('sha256', root, 'h2o-settings-v1', 'h2o-settings-enc', 32)) }
  return cached.k
}

export class SettingsKeyError extends Error {
  readonly code = 'SETTINGS_KEY_MISSING'
  constructor() {
    super('[h2o] H2O_SETTINGS_KEY (≥ 32 characters) is required to store or use secrets entered in the CRM. The value itself is never logged.')
    this.name = 'SettingsKeyError'
  }
}

/** "s1.<iv>.<tag>.<ciphertext>" (base64url). `context` names the purpose and record, e.g. "smtp-password:<id>". */
export function seal(plain: string, context: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  c.setAAD(Buffer.from(context, 'utf8'))
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['s1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

/** The plain value, or null when it does not open (wrong key, wrong context, tampered, or not a sealed value). */
export function unseal(sealed: unknown, context: string): string | null {
  if (typeof sealed !== 'string') return null
  const [v, iv, tag, body] = sealed.split('.')
  if (v !== 's1' || !iv || !tag || !body) return null
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    d.setAAD(Buffer.from(context, 'utf8'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8')
  } catch (err) {
    if (err instanceof SettingsKeyError) throw err
    return null
  }
}
