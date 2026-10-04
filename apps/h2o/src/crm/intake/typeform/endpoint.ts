import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'
import { intakeConfigFromEnv } from './config'
import { ingestTypeformDelivery, intakeLog } from './ingest'
import { SIGNATURE_HEADER } from './verify'

/**
 * HTTP adapter for the Typeform webhook — mounted by the CRM go-live patch (Control Tower 2026-10-02) as the
 * root endpoint `POST /api/crm/intake/typeform/`.
 *
 * Fail-closed, in this order:
 *
 *   1. `H2O_CRM_TYPEFORM_INGEST_ENABLED` is not exactly `1` → **404**, indistinguishable from an unmounted
 *      route. Nothing is read, nothing is stored. This is the default state of every environment.
 *   2. Enabled but the configuration does not resolve (no secret, a secret under 24 characters, no or a
 *      malformed form id, a malformed field map) → **503**, so Typeform retries once the operator fixes it.
 *   3. Wrong content type → 415; a declared or measured body over `MAX_BODY_BYTES` → 413. The body is read
 *      through a bounded reader, so an oversized request is never buffered whole.
 *   4. The signature is verified on the exact bytes (401, nothing stored) before any parsing.
 *
 * Every response is `no-store`, carries only an outcome code (and, on success, the stable `rfq_number`), and
 * never echoes the request. Logs go through the allowlisted `intakeLog` — codes and non-personal ids only.
 * An unexpected error is caught here, logged as a code, and answered 500 so Typeform retries; the error object
 * itself (whose message could quote submitted data) is never logged.
 */
export const MAX_BODY_BYTES = 256 * 1024
export const TYPEFORM_INTAKE_PATH = '/crm/intake/typeform'

const reply = (body: Record<string, unknown>, status: number): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' },
  })

/** Read at most `max` bytes. Returns null when the body is larger (the rest is not read into memory). */
export async function readBounded(req: Pick<PayloadRequest, 'body' | 'text'>, max: number): Promise<string | null> {
  const body = (req as { body?: ReadableStream<Uint8Array> | null }).body
  if (body && typeof (body as ReadableStream).getReader === 'function') {
    const reader = (body as ReadableStream<Uint8Array>).getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
  }
  const raw = typeof req.text === 'function' ? await req.text() : ''
  return Buffer.byteLength(raw, 'utf8') > max ? null : raw
}

export const typeformWebhookHandler: PayloadHandler = async (req) => {
  if (process.env.H2O_CRM_TYPEFORM_INGEST_ENABLED !== '1') {
    intakeLog(req.payload, 'info', { code: 'INTAKE_DISABLED', status: 404 })
    return reply({ outcome: 'NOT_FOUND' }, 404)
  }
  const cfg = intakeConfigFromEnv()
  if (!cfg.ok || !cfg.value.enabled) {
    intakeLog(req.payload, 'warn', { code: cfg.ok ? 'INTAKE_DISABLED' : `CONFIG_${cfg.reason}`, status: 503 })
    return reply({ outcome: 'UNAVAILABLE' }, 503)
  }
  try {
    const type = (req.headers.get('content-type') ?? '').toLowerCase()
    if (!/^application\/json(\s*;|$)/.test(type)) {
      intakeLog(req.payload, 'warn', { code: 'UNSUPPORTED_MEDIA_TYPE', status: 415 })
      return reply({ outcome: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
    }
    const declared = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      intakeLog(req.payload, 'warn', { code: 'BODY_TOO_LARGE', status: 413 })
      return reply({ outcome: 'TOO_LARGE' }, 413)
    }
    const raw = await readBounded(req, MAX_BODY_BYTES)
    if (raw === null) {
      intakeLog(req.payload, 'warn', { code: 'BODY_TOO_LARGE', status: 413 })
      return reply({ outcome: 'TOO_LARGE' }, 413)
    }
    const result = await ingestTypeformDelivery(req.payload, {
      rawBody: raw,
      signature: req.headers.get(SIGNATURE_HEADER),
      config: cfg.value,
    })
    return reply(
      { outcome: result.outcome, ...(result.rfqNumber ? { rfq_number: result.rfqNumber } : {}) },
      result.status,
    )
  } catch {
    intakeLog(req.payload, 'error', { code: 'INTAKE_HANDLER_ERROR', status: 500 })
    return reply({ outcome: 'FAILED_RETRYABLE' }, 500)
  }
}

/** The CRM's only HTTP endpoint. Registered by `payload.config.ts` through `crmEndpoints`. */
export const typeformIntakeEndpoint: Endpoint = {
  path: TYPEFORM_INTAKE_PATH,
  method: 'post',
  handler: typeformWebhookHandler,
}
