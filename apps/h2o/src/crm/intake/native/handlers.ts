import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { fixtureRegistry } from '../../../rfq-native/registry'
import type { Registry } from '../../../rfq-native/model'
import { readEmailConfig, resolveSalesAddress as resolveSalesAddressEnv } from '../../../email/config'
import { emailKey } from '../../normalize'
import { ingestParsed, intakeLog } from '../typeform/ingest'
import { admit, bucketFor, EMAIL_RULE, requestIp, SUBMIT_RULES, TOKEN_RULE, UNTRUSTED_BUCKET, UNTRUSTED_RULES } from './limits'
import { contentHash, parseEnvelope, storedPayload, toDelivery, validateAnswers, type NativeRequest } from './normalize'
import { checkFormToken, issueFormToken } from './token'

/**
 * Native RFQ intake adapter (contract H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1 §2–§4). Route handlers call these; they hold
 * no HTTP framework code, so DB tests drive them directly with `Request` objects.
 *
 * Submit order (each step can end the request):
 *   same-origin · size ≤ 32 KB · JSON · switch on · envelope · form token (409) · honeypot (200; quarantined, no RFQ) ·
 *   answers (422 keys) · replay of the same submission (200 same RFQ / 409 conflict) · rate limits (429) ·
 *   canonical ingest — persist the intake event, then the RFQ (notifications are queued with the RFQ) → 200 RFQ number.
 * Logs carry codes only: never an answer, address, IP, token or hash salt.
 */
// RFQ-FIX-1 (audit R4): byte-safe — the longest flow in a 3-byte script with full context and attribution fits (test)
export const MAX_BODY_BYTES = 32 * 1024
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
export function servedRegistry(env: NodeJS.ProcessEnv = process.env, salesAddress: string = resolveSalesAddressEnv(env)): Registry {
  const base = fixtureRegistry()
  const cfg = readEmailConfig(env)
  const strings = { ...base.strings }
  // RFQ-FIX-1 (audit R15, OGCS strings a4b21326): one body line, with the promise only when it is configured (the owner's
  // "within one business day" by default); the attachments line matches the customer acknowledgement (reply to our email
  // when it is on; otherwise email the sales address with the RFQ number). The separate response-time line is retired.
  const promise = cfg.responsePromise
  strings['confirm.body'] = promise ? strings['confirm.body.promise_on']!.replace('within one business day', promise) : strings['confirm.body.promise_off']!
  delete strings['confirm.response_time']
  strings['confirm.attachments'] = cfg.customerAck ? strings['confirm.attachments.ack_on']! : strings['confirm.attachments.ack_off']!.replace('{{sales_email}}', salesAddress)
  return { ...base, locale: 'en', enabled: nativeIntakeOn(env), strings }
}

/** ALERTS-1: `salesAddress` is the live setting (email/routing-read.ts resolveSalesAddressLive); the route resolves it first. */
export function registryReply(req: Request, env: NodeJS.ProcessEnv = process.env, salesAddress?: string): Reply {
  const reg = servedRegistry(env, salesAddress)
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
  const wait = await admit(payload, [{ bucket, rules: [TOKEN_RULE] }], now)
  if (wait > 0) return reply(429, { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: wait }, { 'retry-after': String(wait) })
  return reply(200, issueFormToken(now))
}

// ── submit (§4) ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function submitReply(payload: Payload, req: Request, now: Date = new Date()): Promise<Reply> {
  if (crossSite(req)) return reply(403, { ok: false, code: 'CROSS_SITE' })
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return reply(413, { ok: false, code: 'TOO_LARGE' })
  // RFQ-FIX-1 (audit R14): read at most the limit (+1 byte), so a chunked body without a length is never held whole
  const text = await readCapped(req, MAX_BODY_BYTES)
  if (text === null) return reply(413, { ok: false, code: 'TOO_LARGE' })
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
    // A filled honeypot: "accepted" for the sender. RFQ-FIX-1 (audit R5): kept as a QUARANTINED_SPAM intake event (admins
    // only; no RFQ, no alert, no email) so a person whose browser filled the trap is never lost — an admin sees the day's
    // count on the CRM overview. RFQ-FIX-1.1 (auditor): under the same per-IP limits as a real request (admit), so a bot
    // can store at most the limit; a refused one gets the same reply and stores nothing.
    const wait = await admit(payload, [{ bucket: ipBucket, rules: ip === UNTRUSTED_BUCKET ? UNTRUSTED_RULES : SUBMIT_RULES }], now)
    if (wait === 0) await quarantineSpam(payload, r, now)
    log('HONEYPOT', 200, wait === 0 ? 'QUARANTINED_SPAM' : 'RATE_LIMITED_DISCARDED')
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
    // SEC-CRM-1: counted before it is checked (limits.ts admit), so a parallel burst cannot pass every rule at once.
    const wait = await admit(payload, [{ bucket: ipBucket, rules: ipRules }, { bucket: emailBucket, rules: [EMAIL_RULE], refundIfRefused: true }], now)
    if (wait > 0) {
      log('RATE_LIMITED', 429)
      return reply(429, { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: wait }, { 'retry-after': String(wait) })
    }
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

/** The body as text, or null when it is longer than `max` bytes (reading stops there; the rest is cancelled). */
export async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * RFQ-FIX-1.1 (auditor): what a quarantined request keeps — at most SPAM_PAYLOAD_BYTES of it (the full content hash is
 * stored beside it). Answers are shortened first, then context and attribution dropped, then only the answer keys kept.
 */
export const SPAM_PAYLOAD_BYTES = 2048
export function cappedPayload(p: ReturnType<typeof storedPayload>, max = SPAM_PAYLOAD_BYTES): Record<string, unknown> {
  const size = (o: unknown) => Buffer.byteLength(JSON.stringify(o), 'utf8')
  if (size(p) <= max) return p
  const short = (n: number) => Object.fromEntries(Object.entries(p.answers).map(([k, v]) => [k, Array.from(v).slice(0, n).join('')]))
  for (const n of [200, 60]) {
    const c = { ...p, answers: short(n), truncated: true }
    if (size(c) <= max) return c
  }
  const bare = { source: p.source, registryVersion: p.registryVersion, locale: p.locale, answers: short(60), truncated: true }
  if (size(bare) <= max) return bare
  return { source: p.source, answerKeys: Object.keys(p.answers).slice(0, 40).map((k) => k.slice(0, 40)), truncated: true }
}

/** RFQ-FIX-1 (R5): the honeypot request as an admin-only intake event; once per submission id, never an RFQ. */
async function quarantineSpam(payload: Payload, r: NativeRequest, now: Date): Promise<void> {
  try {
    await payload.create({
      collection: 'crm-intake-events',
      data: {
        source_system: r.source,
        source_event_id: `native:${r.submissionId}`,
        source_event_type: r.source.toLowerCase(),
        source_form_id: 'native',
        signature_state: 'FORM_TOKEN_VERIFIED',
        raw_payload_hash: contentHash(r),
        raw_payload: cappedPayload(storedPayload(r)) as never,
        received_at: now.toISOString(),
        processing_state: 'QUARANTINED_SPAM',
        failure_code: 'HONEYPOT',
        replay_count: 0,
      } as never,
      context: { crmServer: {} },
      overrideAccess: true,
      depth: 0,
    })
  } catch {
    // the same submission again (unique event id), or a store failure: the sender's reply is unchanged either way
  }
}

/** Next route helper: a Reply → a Response. */
export const toResponse = (r: Reply): Response => new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers })
