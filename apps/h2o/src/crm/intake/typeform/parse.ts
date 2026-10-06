import { emailKey, textOrNull } from '../../normalize'
import type { FieldTarget } from './config'

/**
 * Parse and normalise a Typeform `form_response` delivery. Pure: no I/O, no clock, no logging.
 *
 * Only the documented envelope is read: `event_id`, `event_type`, `form_response.{form_id, token,
 * submitted_at, landed_at, hidden, answers[]}`. Answers are taken by `field.ref` through the configured map;
 * an answer whose ref is not mapped is counted (by ref) but its value is not used, so nothing lands in a
 * CRM field because of how a question happened to be worded.
 */

/**
 * The context keys the accepted public adapter forwards (`src/conversion/context.ts` `SAFE_CONTEXT_KEYS`).
 * Re-declared, not imported — `src/site/__tests__/integration-boundary.test.ts` forbids CRM importing the
 * adapter — and a CRM test asserts the two lists are identical.
 */
export const INTAKE_CONTEXT_KEYS = [
  'product_id',
  'product_slug',
  'product_path',
  'product_title',
  'page_path',
  'cta_placement',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const
export type ContextKey = (typeof INTAKE_CONTEXT_KEYS)[number]

const MAX: Record<ContextKey, number> = {
  cta_placement: 64,
  page_path: 512,
  product_id: 64,
  product_path: 512,
  product_slug: 128,
  product_title: 160,
  utm_campaign: 128,
  utm_content: 128,
  utm_medium: 64,
  utm_source: 64,
  utm_term: 128,
}
/** Any C0 control character or DEL. Written as a code-point test so no control char appears in a regex. */
const hasControl = (v: string): boolean =>
  [...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)
const PATH = /^\/(?:[A-Za-z0-9\-._~/]|%[0-9A-Fa-f]{2})*$/
const IDENT = /^[A-Za-z0-9._~%-]+$/

/** Re-validate hidden context on arrival. The public side validated it; the server does not trust that. */
export function validateContext(hidden: unknown): {
  context: Partial<Record<ContextKey, string>>
  rejected: string[]
} {
  const context: Partial<Record<ContextKey, string>> = {}
  const rejected: string[] = []
  if (!hidden || typeof hidden !== 'object' || Array.isArray(hidden)) return { context, rejected }
  for (const [k, v] of Object.entries(hidden as Record<string, unknown>)) {
    if (!(INTAKE_CONTEXT_KEYS as readonly string[]).includes(k)) {
      rejected.push(`${k}:NOT_ALLOWLISTED`)
      continue
    }
    const key = k as ContextKey
    if (typeof v !== 'string' || v.trim() === '') continue // absent/empty = not supplied, not an error
    const value = v.trim()
    if (value.length > MAX[key] || hasControl(value)) {
      rejected.push(`${key}:INVALID`)
      continue
    }
    if (key === 'page_path' || key === 'product_path') {
      let decoded: string
      try {
        decoded = decodeURIComponent(value)
      } catch {
        rejected.push(`${key}:INVALID`)
        continue
      }
      if (
        !PATH.test(value) ||
        value.startsWith('//') ||
        decoded.startsWith('//') ||
        decoded.includes('\\') ||
        decoded.split('/').includes('..')
      ) {
        rejected.push(`${key}:INVALID`)
        continue
      }
    } else if (key !== 'product_title' && !IDENT.test(value)) {
      rejected.push(`${key}:INVALID`)
      continue
    } else if (key === 'product_title' && (/[<>]/.test(value) || value.includes('://'))) {
      rejected.push(`${key}:INVALID`)
      continue
    }
    context[key] = value
  }
  return { context, rejected }
}

/**
 * Placements on which the public site attaches product context (`src/site/RfqMount.tsx`): the three product-page
 * mounts, whose `page_path` is the product's own page, and the D1 `category_and_family` card mount, whose
 * `page_path` is the listing. On every other placement (`editorial_inline`, the page-level header/footer of a
 * non-product page, …) the site sends `page_path` and `cta_placement` only.
 */
export const PRODUCT_CONTEXT_PLACEMENTS = ['header_action', 'footer_rfq_band', 'rfq_page', 'category_and_family'] as const
const PRODUCT_KEYS = ['product_id', 'product_slug', 'product_path', 'product_title'] as const

/**
 * Genuine product context only. Product fields survive when the site could have produced them: a product
 * placement, a page path, a product slug, and (when present) a numeric product id — the shape `RfqMount`
 * derives from the verified product record. Anything else is evidence of a hand-built or tampered link, so the
 * product fields are dropped (recorded in `rejected`) and no RFQ item is made from them. `page_path` and the
 * placement itself are kept: they are still true about where the visitor was.
 */
export function genuineProductContext(
  context: Partial<Record<ContextKey, string>>,
  rejected: string[],
): Partial<Record<ContextKey, string>> {
  const present = PRODUCT_KEYS.filter((k) => context[k] !== undefined)
  if (present.length === 0) return context
  const placement = context.cta_placement
  let reason: string | null = null
  if (!placement || !(PRODUCT_CONTEXT_PLACEMENTS as readonly string[]).includes(placement)) reason = 'PLACEMENT_NOT_PRODUCT'
  else if (!context.page_path) reason = 'PAGE_PATH_MISSING'
  else if (!context.product_slug) reason = 'PRODUCT_SLUG_MISSING'
  else if (context.product_id !== undefined && !/^[0-9]{1,20}$/.test(context.product_id)) reason = 'PRODUCT_ID_INVALID'
  if (!reason) return context
  const out = { ...context }
  for (const k of present) {
    delete out[k]
    rejected.push(`${k}:${reason}`)
  }
  return out
}

type Answer = {
  type?: string
  field?: { ref?: string; id?: string; type?: string }
  text?: string
  email?: string
  phone_number?: string
  number?: number
  boolean?: boolean
  date?: string
  url?: string
  choice?: { label?: string; other?: string }
  choices?: { labels?: string[]; other?: string }
}

const answerValue = (a: Answer): string | number | null => {
  switch (a.type) {
    case 'text':
      return textOrNull(a.text)
    case 'email':
      return textOrNull(a.email)
    case 'phone_number':
      return textOrNull(a.phone_number)
    case 'number':
      return typeof a.number === 'number' && Number.isFinite(a.number) ? a.number : null
    case 'boolean':
      return typeof a.boolean === 'boolean' ? String(a.boolean) : null
    case 'date':
      return textOrNull(a.date)
    case 'url':
      return textOrNull(a.url)
    case 'choice':
      return textOrNull(a.choice?.label ?? a.choice?.other)
    case 'choices':
      return Array.isArray(a.choices?.labels) ? textOrNull(a.choices!.labels!.join('; ')) : null
    default:
      return null
  }
}

export type ParsedDelivery = {
  eventId: string
  eventType: string
  formId: string
  responseToken: string
  submittedAt: string | null
  context: Partial<Record<ContextKey, string>>
  contextRejected: string[]
  mapped: {
    first_name: string | null
    last_name: string | null
    full_name: string | null
    email: string | null
    phone: string | null
    company: string | null
    country_code: string | null
    message: string | null
    requested_quantity: number | null
    requested_scope: string | null
    other: Record<string, string | number>
  }
  unmappedRefs: string[]
  fieldMapPresent: boolean
  /** The canonical source (native adapter). Absent = TYPEFORM. */
  sourceSystem?: 'TYPEFORM' | 'NATIVE_FORM' | 'NATIVE_CHAT'
  /** Patch L4 click ids and first-touch context (native adapter), validated by `intake/attribution.ts`. */
  attribution?: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content' | 'gclid' | 'gbraid' | 'wbraid' | 'ga_client_id' | 'landing_page' | 'referrer', string>>
}

export type ParseFailure = {
  ok: false
  code:
    | 'NOT_JSON_OBJECT'
    | 'EVENT_ID_MISSING'
    | 'UNSUPPORTED_EVENT_TYPE'
    | 'FORM_RESPONSE_MISSING'
    | 'FORM_ID_MISSING'
    | 'RESPONSE_TOKEN_MISSING'
  eventId: string | null
}

const ID = /^[A-Za-z0-9_-]{1,128}$/

export function parseTypeformDelivery(
  json: unknown,
  fieldMap: Record<string, FieldTarget> | null,
): { ok: true; value: ParsedDelivery } | ParseFailure {
  if (!json || typeof json !== 'object' || Array.isArray(json))
    return { ok: false, code: 'NOT_JSON_OBJECT', eventId: null }
  const env = json as Record<string, unknown>
  const eventId = typeof env.event_id === 'string' && ID.test(env.event_id) ? env.event_id : null
  if (!eventId) return { ok: false, code: 'EVENT_ID_MISSING', eventId: null }
  if (env.event_type !== 'form_response') return { ok: false, code: 'UNSUPPORTED_EVENT_TYPE', eventId }
  const fr = env.form_response as Record<string, unknown> | undefined
  if (!fr || typeof fr !== 'object') return { ok: false, code: 'FORM_RESPONSE_MISSING', eventId }
  const formId = typeof fr.form_id === 'string' && ID.test(fr.form_id) ? fr.form_id : null
  if (!formId) return { ok: false, code: 'FORM_ID_MISSING', eventId }
  const token = typeof fr.token === 'string' && ID.test(fr.token) ? fr.token : null
  if (!token) return { ok: false, code: 'RESPONSE_TOKEN_MISSING', eventId }
  const submittedAt =
    typeof fr.submitted_at === 'string' && !Number.isNaN(Date.parse(fr.submitted_at))
      ? new Date(fr.submitted_at).toISOString()
      : null
  const validated = validateContext(fr.hidden)
  const rejected = validated.rejected
  const context = genuineProductContext(validated.context, rejected)

  const mapped: ParsedDelivery['mapped'] = {
    first_name: null,
    last_name: null,
    full_name: null,
    email: null,
    phone: null,
    company: null,
    country_code: null,
    message: null,
    requested_quantity: null,
    requested_scope: null,
    other: {},
  }
  const unmapped: string[] = []
  for (const a of (Array.isArray(fr.answers) ? fr.answers : []) as Answer[]) {
    const ref = a?.field?.ref
    if (typeof ref !== 'string') continue
    const target = fieldMap?.[ref]
    if (!target) {
      unmapped.push(ref)
      continue
    }
    const value = answerValue(a)
    if (value === null) continue
    if (target.startsWith('other:')) {
      mapped.other[target.slice(6)] = value
      continue
    }
    switch (target) {
      case 'email':
        // Only a syntactically valid address is an email. Anything else is kept as an unmapped fact.
        mapped.email = emailKey(value) ? String(value).trim() : null
        if (!mapped.email) mapped.other.email_unparseable = 'PRESENT_BUT_INVALID'
        break
      case 'requested_quantity':
        mapped.requested_quantity = typeof value === 'number' && value > 0 ? value : null
        break
      case 'country_code':
        mapped.country_code =
          typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : null
        break
      default:
        ;(mapped as Record<string, unknown>)[target] = typeof value === 'string' ? value : String(value)
    }
  }
  return {
    ok: true,
    value: {
      eventId,
      eventType: 'form_response',
      formId,
      responseToken: token,
      submittedAt,
      context,
      contextRejected: rejected,
      mapped,
      unmappedRefs: unmapped,
      fieldMapPresent: fieldMap !== null,
    },
  }
}
