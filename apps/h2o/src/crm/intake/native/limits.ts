import { createHmac, hkdfSync } from 'node:crypto'
import type { Payload } from 'payload'

/**
 * Native intake rate limits (contract §4.2), counted in Postgres (`crm-intake-rate`) so they hold across restarts and
 * processes. Buckets are keyed HMACs: an IP address or email address is never stored.
 *
 *   per IP     5 submits / 10 minutes and 20 / day
 *   per email  3 submits / hour
 *   per IP     30 form tokens / 10 minutes
 * Each limit can be tuned by environment (H2O_RFQ_LIMIT_*), never removed. The client IP comes from the trusted proxy
 * (`TRUSTED_PROXY=cloudflare` in production reads cf-connecting-ip only); without one, everyone shares one bucket.
 */
type Rule = { bucket: 'ip' | 'email' | 'token' | 'mail-check' | 'mail-test'; windowMs: number; max: number; env: string }
const MIN = 60_000
export const SUBMIT_RULES: Rule[] = [
  { bucket: 'ip', windowMs: 10 * MIN, max: 5, env: 'H2O_RFQ_LIMIT_IP_10M' },
  { bucket: 'ip', windowMs: 24 * 60 * MIN, max: 20, env: 'H2O_RFQ_LIMIT_IP_DAY' },
]
/**
 * Without a trusted proxy every visitor shares one bucket; per-IP limits would then lock real customers out after five
 * submissions site-wide, so the shared bucket gets a global cap instead. Production sets TRUSTED_PROXY=cloudflare.
 */
export const UNTRUSTED_RULES: Rule[] = [
  { bucket: 'ip', windowMs: 10 * MIN, max: 60, env: 'H2O_RFQ_LIMIT_SHARED_10M' },
  { bucket: 'ip', windowMs: 24 * 60 * MIN, max: 300, env: 'H2O_RFQ_LIMIT_SHARED_DAY' },
]
export const EMAIL_RULE: Rule = { bucket: 'email', windowMs: 60 * MIN, max: 3, env: 'H2O_RFQ_LIMIT_EMAIL_HOUR' }
export const TOKEN_RULE: Rule = { bucket: 'token', windowMs: 10 * MIN, max: 30, env: 'H2O_RFQ_LIMIT_TOKEN_10M' }
const PRUNE_AFTER_MS = 2 * 24 * 60 * MIN

const maxOf = (r: Rule) => {
  const n = Number(process.env[r.env])
  return Number.isInteger(n) && n > 0 ? n : r.max
}

let key: { root: string; k: Buffer } | null = null
function bucketKey(): Buffer {
  const root = process.env.IP_HASH_SALT || process.env.PAYLOAD_SECRET || ''
  if (!root) throw new Error('[h2o] native intake needs IP_HASH_SALT or PAYLOAD_SECRET. The value itself is never logged.')
  if (!key || key.root !== root) key = { root, k: Buffer.from(hkdfSync('sha256', root, 'h2o-rfq-v1', 'h2o-rfq-rate-bucket', 32)) }
  return key.k
}
/** The stored bucket for a value: a keyed HMAC prefix (never the IP or email address). */
export const bucketFor = (kind: Rule['bucket'], value: string): string =>
  `${kind}:${createHmac('sha256', bucketKey()).update(`${kind}:${value}`).digest('base64url').slice(0, 32)}`

/**
 * The client address for rate limiting — the same trust rules as agency-core's `clientIp` (C8), mirrored here because
 * that package's intake index pulls in collections H2O does not register:
 *   TRUSTED_PROXY=cloudflare → cf-connecting-ip only · xff → first X-Forwarded-For entry · xff-last → last entry ·
 *   unset → nobody's header is trusted and every request shares one bucket (strict, visible, safe).
 */
export const UNTRUSTED_BUCKET = 'untrusted-shared-bucket'
export function requestIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const clean = (v: string | null | undefined) => (v && /^[0-9a-fA-F:.]{3,45}$/.test(v.trim()) ? v.trim() : null)
  const mode = (env.TRUSTED_PROXY ?? '').trim().toLowerCase()
  if (mode === 'cloudflare') return clean(headers.get('cf-connecting-ip')) ?? UNTRUSTED_BUCKET
  if (mode === 'xff' || mode === 'xff-last') {
    const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    return clean(mode === 'xff' ? parts[0] : parts[parts.length - 1]) ?? UNTRUSTED_BUCKET
  }
  return UNTRUSTED_BUCKET
}

const sys = { overrideAccess: true as const }

/** Seconds until the bucket is under every rule again, or 0 when the request may proceed. */
export async function retryAfter(payload: Payload, bucket: string, rules: Rule[], now: Date = new Date()): Promise<number> {
  let wait = 0
  for (const r of rules) {
    const since = new Date(now.getTime() - r.windowMs).toISOString()
    const res = await payload.find({ collection: 'crm-intake-rate' as never, where: { and: [{ bucket: { equals: bucket } }, { at: { greater_than: since } }] } as never, sort: 'at', limit: maxOf(r), depth: 0, ...sys })
    if (res.totalDocs >= maxOf(r)) {
      const oldest = new Date(String((res.docs[0] as unknown as { at: string }).at)).getTime()
      wait = Math.max(wait, Math.ceil((oldest + r.windowMs - now.getTime()) / 1000))
    }
  }
  return Math.max(0, wait)
}

/**
 * SEC-CRM-1: count first, then check. Each bucket's row for this request is written before the window is counted, so
 * in a parallel burst a request sees at least as many rows as its place in line — at most `max` requests can see
 * themselves within a limit (the old check-then-count let a burst pass every rule before any was counted). A refused
 * request stays counted, so a burst throttles itself. Returns the seconds to wait, or 0 when the request may proceed.
 */
export async function admit(payload: Payload, checks: Array<{ bucket: string; rules: Rule[] }>, now: Date = new Date()): Promise<number> {
  for (const c of checks) await count(payload, c.bucket, now)
  let wait = 0
  for (const c of checks)
    for (const r of c.rules) {
      const since = new Date(now.getTime() - r.windowMs).toISOString()
      const res = await payload.find({ collection: 'crm-intake-rate' as never, where: { and: [{ bucket: { equals: c.bucket } }, { at: { greater_than: since } }] } as never, sort: 'at', limit: 1, depth: 0, ...sys })
      if (res.totalDocs > maxOf(r)) {
        const oldest = new Date(String((res.docs[0] as unknown as { at: string }).at)).getTime()
        wait = Math.max(wait, Math.max(1, Math.ceil((oldest + r.windowMs - now.getTime()) / 1000)))
      }
    }
  return wait
}

/** Count one request in the bucket, and prune rows nobody needs any more. */
export async function count(payload: Payload, bucket: string, now: Date = new Date()): Promise<void> {
  await payload.create({ collection: 'crm-intake-rate' as never, data: { bucket, at: now.toISOString() } as never, ...sys })
  await payload.delete({ collection: 'crm-intake-rate' as never, where: { at: { less_than: new Date(now.getTime() - PRUNE_AFTER_MS).toISOString() } } as never, ...sys }).catch(() => undefined)
}
