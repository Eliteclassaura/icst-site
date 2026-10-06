import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { fixtureRegistry } from '../../../rfq-native/registry'
import type { Registry } from '../../../rfq-native/model'
import { readEmailConfig } from '../../../email/config'
import { emailKey } from '../../normalize'
import { ingestParsed, intakeLog } from '../typeform/ingest'
import { bucketFor, count, EMAIL_RULE, requestIp, retryAfter, SUBMIT_RULES, TOKEN_RULE, UNTRUSTED_BUCKET, UNTRUSTED_RULES } from './limits'
import { contentHash, parseEnvelope, storedPayload, toDelivery, validateAnswers } from './normalize'
import { checkFormToken, issueFormToken } from './token'

/**
 * Native RFQ intake adapter (contract H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1 §2–§4). Route handlers call these; they hold
 * no HTTP framework code, so DB tests drive them directly with `Request` objects.
 *
 * Submit order (each step can end the request):
 *   same-origin · size ≤ 16 KB · JSON · switch on · envelope · form token (409) · honeypot (200, nothing stored) ·
 *   answers (422 keys) · replay of the same submission (200 same RFQ / 409 conflict) · rate limits (429) ·
 *   canonical ingest — persist the intake event, then the RFQ (notifications are queued with the RFQ) → 200 RFQ number.
 * Logs carry codes only: never an answer, address, IP, token or hash salt.
 */
export const MAX_BODY_BYTES = 16 * 1024
const JSONH = { 'content-type': 'application/json', 'cache-control': 'no-store' }
export type Reply = { status: number; body: unknown; headers?: Record<string, string> }
const reply = (status: number, body: unknown, headers: Record<string, string> = {}): Reply => ({ status, body, headers: { ...JSONH, ...headers } })

export const nativeIntakeOn = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_NATIVE_INTAKE === 'on'

function crossSite(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return true
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (origin && host) {
    try {
      return new URL(origin).host !== host
    } catch {
      return true
    }
  }
  return false
}

// ── registry (§2) ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The registry as served: Main's registry (one source of the structure and the EN strings), with the served locale
 * (EN only until JA/TH data exists), the on/off switch, and the owner's response-time line (decision 2026-10-05) when
 * the promise is configured.
 */
export function servedRegistry(env: NodeJS.ProcessEnv = process.env): Registry {
  const base = fixtureRegistry()
  const promise = readEmailConfig(env).responsePromise
  const strings = { ...base.strings }
  if (promise) strings['confirm.response_time'] = `We'll respond ${promise}.`
  return { ...base, locale: 'en', enabled: nativeIntakeOn(env), strings }
}

export function registryReply(req: Request, env: NodeJS.ProcessEnv = process.env): Reply {
  const reg = servedRegistry(env)
  const json = JSON.stringify(reg)
  const etag = `"${createHash('sha256').update(json).digest('base64url').slice(0, 27)}"`
  const cache = { 'cache-control': 'public, max-age=300, stale-while-revalidate=86400', etag }
  if (req.headers.get('if-none-match') === etag) return { status: 304, body: null, headers: cache }
  return { status: 200, body: reg, headers: { 'content-type': 'application/json', ...cache } }
}

// ── token (§3) ─────────────────────────────────────────────────────────────────────────────────────────────────────
export async function tokenReply(payload: Payload, req: Request, now: Date = new Date()): Promise<Reply> {
  if (!nativeIntakeOn()) return reply(503, { ok: false, code: 'INTAKE_DISABLED' })
  const bucket = bucketFor('token', requestIp(req.headers))
  const wait = await retryAfter(payload, bucket, [TOKEN_RULE], now)
  if (wait > 0) return reply(429, { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: wait }, { 'retry-after': String(wait) })
  await count(payload, bucket, now)
  return reply(200, issueFormToken(now))
}

// ── submit (§4) ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function submitReply(payload: Payload, req: Request, now: Date = new Date()): Promise<Reply> {
  if (crossSite(req)) return reply(403, { ok: false, code: 'CROSS_SITE' })
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return reply(413, { ok: false, code: 'TOO_LARGE' })
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return reply(413, { ok: false, code: 'TOO_LARGE' })
  if (!nativeIntakeOn()) return reply(503, { ok: false, code: 'INTAKE_DISABLED' })
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return reply(422, { ok: false, code: 'VALIDATION', fields: {} })
  }
  const r = parseEnvelope(raw)
  if (!r) return reply(422, { ok: false, code: 'VALIDATION', fields: {} })
  const log = (code: string, status: number, outcome?: string) => intakeLog(payload, status >= 500 ? 'error' : 'info', { code, event_id: `native:${r.submissionId}`, status, outcome, source: r.source })

  const tokenState = checkFormToken(r.antiAbuse.formToken, now)
  if (tokenState !== 'OK') {
    log(`TOKEN_${tokenState}`, 409)
    return reply(409, { ok: false, code: 'TOKEN_INVALID' })
  }
  const ip = requestIp(req.headers)
  const ipBucket = bucketFor('ip', ip)
  if (typeof r.antiAbuse.hp === 'string' && r.antiAbuse.hp !== '') {
    // A filled honeypot: "accepted", nothing stored; counted, so a bot that keeps trying is throttled.
    await count(payload, ipBucket, now)
    log('HONEYPOT', 200, 'DISCARDED')
    return reply(200, { ok: true, rfqNumber: null, replay: false })
  }

  const reg = fixtureRegistry()
  const fields = validateAnswers(reg, r)
  if (Object.keys(fields).length > 0) {
    log('VALIDATION', 422)
    return reply(422, { ok: false, code: 'VALIDATION', fields })
  }

  // Replay of the same submission: the same RFQ again (never counted against the limits), or a conflict.
  const hash = contentHash(r)
  const eventId = `native:${r.submissionId}`
  const prior = (await payload.find({ collection: 'crm-intake-events', where: { source_event_id: { equals: eventId } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as
    | { id: string; raw_payload_hash?: string; rfq?: unknown; processing_state?: string }
    | undefined
  if (prior && prior.raw_payload_hash !== hash) {
    log('SUBMISSION_CONFLICT', 409, 'CONFLICTING_REPLAY_REFUSED')
    return reply(409, { ok: false, code: 'SUBMISSION_CONFLICT' })
  }

  if (!prior) {
    const ipRules = ip === UNTRUSTED_BUCKET ? UNTRUSTED_RULES : SUBMIT_RULES
    const emailBucket = bucketFor('email', emailKey(r.answers.email)?.matchKey ?? '')
    const wait = Math.max(await retryAfter(payload, ipBucket, ipRules, now), await retryAfter(payload, emailBucket, [EMAIL_RULE], now))
    if (wait > 0) {
      log('RATE_LIMITED', 429)
      return reply(429, { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: wait }, { 'retry-after': String(wait) })
    }
    await count(payload, ipBucket, now)
    await count(payload, emailBucket, now)
  }

  const { delivery, attributionRejected } = toDelivery(reg, r, now)
  const result = await ingestParsed(payload, { d: delivery, hash, rawPayload: storedPayload(r), receivedAt: now, signatureState: 'FORM_TOKEN_VERIFIED', conflict: 'refuse' })
  if (attributionRejected.length > 0) log('ATTRIBUTION_DROPPED', 200)
  if (result.status === 409) return reply(409, { ok: false, code: 'SUBMISSION_CONFLICT' })
  if (result.status !== 200 || !result.rfqId) return reply(500, { ok: false, code: 'SERVER' })
  let rfqNumber = result.rfqNumber
  if (!rfqNumber) {
    const rfq = (await payload.findByID({ collection: 'crm-rfqs', id: result.rfqId, depth: 0, overrideAccess: true })) as unknown as { rfq_number?: string }
    rfqNumber = rfq.rfq_number
  }
  const replay = result.outcome === 'DUPLICATE_DELIVERY_NOOP' || result.outcome === 'DUPLICATE_SUBMISSION_LINKED'
  return reply(200, { ok: true, rfqNumber: rfqNumber ?? null, replay })
}

/** Next route helper: a Reply → a Response. */
export const toResponse = (r: Reply): Response => new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers })
