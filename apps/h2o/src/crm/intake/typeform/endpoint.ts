import type { PayloadHandler } from 'payload'
import { intakeConfigFromEnv } from './config'
import { ingestTypeformDelivery, intakeLog } from './ingest'
import { SIGNATURE_HEADER } from './verify'

/**
 * HTTP adapter for the future Typeform webhook. **Not registered anywhere in CRM-1.**
 *
 * Activation (CRM-2, separately authorized) would register it as a root endpoint, e.g.
 * `endpoints: [{ path: '/crm/intake/typeform', method: 'post', handler: typeformWebhookHandler }]`, set the
 * three environment values, and point the Typeform webhook at it. Until then there is no route, no secret
 * and no webhook, and even a mounted handler answers 503 unless `H2O_CRM_TYPEFORM_INGEST_ENABLED=1`.
 *
 * The raw body is read once as text — the signature covers the exact bytes — and the response body carries
 * only an outcome code and, on success, the stable `rfq_number` reference.
 */
export const MAX_BODY_BYTES = 256 * 1024

export const typeformWebhookHandler: PayloadHandler = async (req) => {
  const cfg = intakeConfigFromEnv()
  if (!cfg.ok || !cfg.value.enabled) {
    intakeLog(req.payload, 'warn', { code: cfg.ok ? 'INTAKE_DISABLED' : `CONFIG_${cfg.reason}`, status: 503 })
    return Response.json({ outcome: 'UNAVAILABLE' }, { status: 503 })
  }
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return Response.json({ outcome: 'TOO_LARGE' }, { status: 413 })
  const raw = typeof req.text === 'function' ? await req.text() : ''
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES)
    return Response.json({ outcome: 'TOO_LARGE' }, { status: 413 })
  const result = await ingestTypeformDelivery(req.payload, {
    rawBody: raw,
    signature: req.headers.get(SIGNATURE_HEADER),
    config: cfg.value,
  })
  return Response.json(
    { outcome: result.outcome, ...(result.rfqNumber ? { rfq_number: result.rfqNumber } : {}) },
    { status: result.status },
  )
}
