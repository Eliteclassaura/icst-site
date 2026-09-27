/**
 * Synthetic fixtures — CRM-1.
 *
 * Every value here is invented. Addresses use the RFC 2606 reserved `example.test` / `example.com`
 * domains; companies, plants and towers are fictional ("Northwind Thermal", "Plant A"); phone numbers use
 * the fictional 555-01xx range. No production contact, account, plant, tower, legacy CSV row or live
 * Typeform response is used or approximated. A test asserts this file contains no other mail domain.
 */
import type { IntakeConfig } from '../intake/typeform/config'
import { signTypeformBody } from '../intake/typeform/verify'

export const SYNTHETIC_FORM_ID = 'SynthForm01'
export const SYNTHETIC_SECRET = 'test-synthetic-typeform-signing-secret-0001'

/** A field map for the synthetic form (the live form's refs are an owner/Commander input). */
export const SYNTHETIC_FIELD_MAP = {
  ref_first: 'first_name',
  ref_last: 'last_name',
  ref_email: 'email',
  ref_phone: 'phone',
  ref_company: 'company',
  ref_message: 'message',
  ref_qty: 'requested_quantity',
  ref_urgency: 'other:urgency',
} as const

export const intakeConfig = (over: Partial<IntakeConfig> = {}): IntakeConfig => ({
  enabled: true,
  formId: SYNTHETIC_FORM_ID,
  secret: SYNTHETIC_SECRET,
  fieldMap: { ...SYNTHETIC_FIELD_MAP },
  ...over,
})

export type SubmissionSpec = {
  eventId?: string
  token?: string
  formId?: string
  first?: string | null
  last?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  message?: string | null
  quantity?: number | null
  hidden?: Record<string, string>
  extraAnswers?: unknown[]
}

let seq = 0
export const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

/** A Typeform-shaped `form_response` delivery (documented envelope only). */
export function typeformDelivery(spec: SubmissionSpec = {}) {
  const answers: unknown[] = []
  const text = (ref: string, v: string | null | undefined) => {
    if (v !== null && v !== undefined)
      answers.push({ type: 'text', text: v, field: { id: `id_${ref}`, ref, type: 'short_text' } })
  }
  text('ref_first', spec.first === undefined ? 'Avery' : spec.first)
  text('ref_last', spec.last === undefined ? 'Synthetic' : spec.last)
  const email = spec.email === undefined ? 'avery.synthetic@northwind.example.com' : spec.email
  if (email !== null)
    answers.push({ type: 'email', email, field: { id: 'id_email', ref: 'ref_email', type: 'email' } })
  const phone = spec.phone === undefined ? '+1 555 0100' : spec.phone
  if (phone !== null)
    answers.push({
      type: 'phone_number',
      phone_number: phone,
      field: { id: 'id_phone', ref: 'ref_phone', type: 'phone_number' },
    })
  text('ref_company', spec.company === undefined ? 'Northwind Thermal (synthetic)' : spec.company)
  text(
    'ref_message',
    spec.message === undefined
      ? 'Synthetic request: fan stack replacement quote for one cell.'
      : spec.message,
  )
  if (spec.quantity !== undefined && spec.quantity !== null)
    answers.push({
      type: 'number',
      number: spec.quantity,
      field: { id: 'id_qty', ref: 'ref_qty', type: 'number' },
    })
  answers.push({
    type: 'choice',
    choice: { label: 'Within 3 months' },
    field: { id: 'id_urg', ref: 'ref_urgency', type: 'multiple_choice' },
  })
  answers.push(...(spec.extraAnswers ?? []))
  return {
    event_id: spec.eventId ?? nextId('evt'),
    event_type: 'form_response',
    form_response: {
      form_id: spec.formId ?? SYNTHETIC_FORM_ID,
      token: spec.token ?? nextId('tok'),
      landed_at: '2026-09-20T10:00:00Z',
      submitted_at: '2026-09-20T10:04:00Z',
      hidden: spec.hidden ?? { page_path: '/contact-us/', cta_placement: 'header_action' },
      definition: { id: spec.formId ?? SYNTHETIC_FORM_ID, title: 'Synthetic RFQ form', fields: [] },
      answers,
    },
  }
}

export const signed = (body: unknown, secret = SYNTHETIC_SECRET) => {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  return { raw, signature: signTypeformBody(raw, secret) }
}
