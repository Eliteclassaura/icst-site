import { createHash } from 'node:crypto'
import { displayValue, normalizePhone, questionsFor, stripControls, validate } from '../../../rfq-native/flow'
import type { Registry } from '../../../rfq-native/model'
import { splitName } from '../../import/csv'
import { validateAttribution, type AttributionKey } from '../attribution'
import { validateContext, type ParsedDelivery } from '../typeform/parse'

/**
 * Native intake (contract H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1 §4): the submitted request → the canonical
 * `ParsedDelivery` the Typeform adapter also produces, so both run the same pipeline (`ingestParsed`).
 *
 * Validation uses the registry and the client's own rules (`rfq-native/flow.ts`), so the server accepts exactly what
 * the client accepts: the chosen branch's questions only, chip values from the registry, the same lengths and
 * patterns, the same error keys. Errors carry keys only, never a submitted value.
 */
export type NativeSource = 'NATIVE_FORM' | 'NATIVE_CHAT'
export type NativeRequest = {
  submissionId: string
  source: NativeSource
  registryVersion: string
  locale: string
  answers: Record<string, string>
  context: Record<string, unknown>
  attribution: unknown
  antiAbuse: { formToken: unknown; hp: unknown }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/**
 * RFQ-FIX-1.1: a page loaded before the first/last-name split still sends one `name`; it is read as first + last name,
 * so that request is not refused during the deploy.
 */
function legacyName(a: Record<string, string>): Record<string, string> {
  if (typeof a.name !== 'string' || 'first_name' in a) return a
  const { name, ...rest } = a
  const n = splitName(name)
  return { ...rest, first_name: n.first ?? '', ...(n.last ? { last_name: n.last } : {}) }
}

/** Shape check of the envelope. Anything else is a malformed request (422 VALIDATION with no field). */
export function parseEnvelope(body: unknown): NativeRequest | null {
  if (!isObj(body)) return null
  const { submissionId, source, registryVersion, locale, answers, context, attribution, antiAbuse } = body
  if (typeof submissionId !== 'string' || !UUID.test(submissionId)) return null
  if (source !== 'NATIVE_FORM' && source !== 'NATIVE_CHAT') return null
  if (!isObj(answers) || Object.keys(answers).length > 40) return null
  if (Object.values(answers).some((v) => typeof v !== 'string')) return null
  if (!isObj(antiAbuse)) return null
  return {
    submissionId: submissionId.toLowerCase(),
    source,
    registryVersion: typeof registryVersion === 'string' ? registryVersion.slice(0, 40) : '',
    locale: typeof locale === 'string' ? locale.slice(0, 8) : 'en',
    // RFQ-FIX-1 (audit R9): control characters (NUL included) and bidi overrides are removed before anything else reads them
    answers: legacyName(Object.fromEntries(Object.entries(answers as Record<string, string>).map(([k, v]) => [k, stripControls(v)]))),
    context: isObj(context) ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, typeof v === 'string' ? stripControls(v) : v])) : {},
    attribution: isObj(attribution) ? attribution : {},
    antiAbuse: { formToken: antiAbuse.formToken, hp: antiAbuse.hp },
  }
}

/** Field errors (question id → error key) for the request's answers; empty when valid. */
export function validateAnswers(reg: Registry, req: NativeRequest): Record<string, string> {
  const answers = Object.fromEntries(Object.entries(req.answers).map(([k, v]) => [k, v.trim()]))
  const flow = questionsFor(reg, answers)
  const surface = req.source === 'NATIVE_FORM' ? 'form' : 'chat'
  const errors: Record<string, string> = {}
  for (const q of flow) {
    const e = validate(reg, q, answers[q.id], surface)
    if (e) errors[q.id] = e.key
  }
  // A key outside the visitor's flow (another branch, or not a question at all) is not accepted silently.
  const allowed = new Set(flow.map((q) => q.id))
  for (const k of Object.keys(answers)) if (!allowed.has(k) && answers[k]) errors[k.slice(0, 40)] = 'err.server'
  return errors
}

const CONTEXT_TYPES = new Set(['product', 'service', 'category', 'page', 'search'])
const IDENT = /^[A-Za-z0-9._~-]{1,64}$/

/** The delivered content's identity: what the visitor asked, not the transport (token, locale, version). */
export function contentHash(req: NativeRequest): string {
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
  return createHash('sha256')
    .update(JSON.stringify({ source: req.source, answers: sorted(req.answers), context: sorted(req.context), attribution: sorted(req.attribution as Record<string, unknown>) }))
    .digest('hex')
}

/** The valid request → the canonical delivery. Call only after `validateAnswers` returned no errors. */
export function toDelivery(reg: Registry, req: NativeRequest, receivedAt: Date): { delivery: ParsedDelivery; attributionRejected: string[] } {
  const a = Object.fromEntries(Object.entries(req.answers).map(([k, v]) => [k, v.trim()]))
  const flow = questionsFor(reg, a)
  const purpose = reg.purposes.find((p) => p.value === a.purpose)
  // English labels: the CRM is read in English, whatever the visitor's locale.
  const purposeLabel = purpose ? (reg.strings[purpose.labelKey] ?? purpose.value) : ''
  const name = { first: a.first_name || null, last: a.last_name || null }
  const details = flow.filter((q) => q.step === 'details' && a[q.id])
  const message = [`${reg.strings['purpose.q'] ?? 'Request'} ${purposeLabel}`, ...details.map((q) => `${reg.strings[q.labelKey] ?? q.id}\n${displayValue(reg, q, a[q.id])}`)].join('\n\n')

  // Context: the accepted context keys; the contract's context_type / context_id are kept as answers (non-personal).
  const { context_type: contextType, context_id: contextId, ...rest } = req.context
  const ctx = validateContext(rest)
  const other: Record<string, string> = { interest: purposeLabel, native_purpose: purpose?.value ?? '' }
  for (const q of details) other[q.id] = displayValue(reg, q, a[q.id])
  if (typeof contextType === 'string' && CONTEXT_TYPES.has(contextType)) other.context_type = contextType
  if (typeof contextId === 'string' && IDENT.test(contextId)) other.context_id = contextId
  const qty = (a.parts_qty ?? '').trim()

  const attr = validateAttribution(req.attribution)
  return {
    attributionRejected: attr.rejected,
    delivery: {
      eventId: `native:${req.submissionId}`,
      eventType: req.source.toLowerCase(),
      formId: 'native',
      responseToken: req.submissionId,
      submittedAt: receivedAt.toISOString(),
      context: ctx.context,
      contextRejected: ctx.rejected,
      mapped: {
        first_name: name.first,
        last_name: name.last,
        full_name: [a.first_name, a.last_name].filter(Boolean).join(' ') || null,
        email: a.email ?? null,
        // RFQ-FIX-1 (audit R3): stored in its normalised form (full-width digits as ASCII)
        phone: a.phone ? normalizePhone(a.phone) : null,
        company: a.company ?? null,
        country_code: a.country ?? null,
        message,
        requested_quantity: /^\d{1,6}$/.test(qty) ? Number(qty) : null,
        requested_scope: purposeLabel || null,
        other,
      },
      unmappedRefs: [],
      fieldMapPresent: true,
      sourceSystem: req.source,
      attribution: attr.attribution as Partial<Record<AttributionKey, string>>,
    },
  }
}

/** What is kept as the intake event's raw payload (admin-only, like Typeform's): the request without its anti-abuse fields. */
export const storedPayload = (req: NativeRequest) => ({ source: req.source, registryVersion: req.registryVersion, locale: req.locale, answers: req.answers, context: req.context, attribution: req.attribution })
