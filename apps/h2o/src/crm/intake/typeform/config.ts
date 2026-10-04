/**
 * Typeform → CRM intake configuration. Fail-closed: every value comes from the environment, there are no
 * defaults, and a missing or malformed value makes intake **unavailable** with a reason code — it never
 * degrades to "accept without verifying".
 *
 * The webhook is NOT activated in CRM-1: no route registers `typeformWebhookHandler`, no Typeform webhook is
 * configured, and `H2O_CRM_TYPEFORM_INGEST_ENABLED` must additionally be exactly `1` before the handler
 * would process anything even if it were mounted.
 *
 * The answer field refs of the live form are unknown to the Factory. `H2O_CRM_TYPEFORM_FIELD_MAP` maps
 * each Typeform field `ref` to a CRM target. Without a map, deliveries are still verified and persisted and
 * an RFQ is still created (persistence first), but no contact or account is linked and the RFQ is routed to
 * review with `FIELD_MAPPING_MISSING`. Nothing is guessed from question wording or answer types.
 */

/** Same shape the accepted public adapter enforces for the form id (`conversion/config.ts`). */
export const FORM_ID_PATTERN = /^[A-Za-z0-9]{6,32}$/

export const FIELD_TARGETS = [
  'first_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'company',
  'country_code',
  'message',
  'requested_quantity',
  'requested_scope',
] as const
export type FieldTarget = (typeof FIELD_TARGETS)[number] | `other:${string}`

export type IntakeConfig = {
  enabled: boolean
  formId: string
  secret: string
  fieldMap: Record<string, FieldTarget> | null
}

export type IntakeConfigResolution =
  | { ok: true; value: IntakeConfig }
  | {
      ok: false
      reason:
        | 'SECRET_MISSING'
        | 'SECRET_TOO_SHORT'
        | 'FORM_ID_MISSING'
        | 'FORM_ID_MALFORMED'
        | 'FIELD_MAP_MALFORMED'
    }

const OTHER = /^other:[a-z0-9_]{1,40}$/
const REF = /^[A-Za-z0-9_-]{1,64}$/

export function parseFieldMap(raw: string | undefined): Record<string, FieldTarget> | null | 'MALFORMED' {
  if (raw === undefined || raw.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return 'MALFORMED'
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'MALFORMED'
  const out: Record<string, FieldTarget> = {}
  const singletons = new Set<string>()
  for (const [ref, target] of Object.entries(parsed as Record<string, unknown>)) {
    if (!REF.test(ref) || typeof target !== 'string') return 'MALFORMED'
    if (!(FIELD_TARGETS as readonly string[]).includes(target) && !OTHER.test(target)) return 'MALFORMED'
    // Two refs feeding one identity field would force a choice between them — refuse the map instead.
    if (!target.startsWith('other:')) {
      if (singletons.has(target)) return 'MALFORMED'
      singletons.add(target)
    }
    out[ref] = target as FieldTarget
  }
  return out
}

export function intakeConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): IntakeConfigResolution {
  const secret = (env.H2O_CRM_TYPEFORM_WEBHOOK_SECRET ?? '').trim()
  if (secret === '') return { ok: false, reason: 'SECRET_MISSING' }
  if (secret.length < 24) return { ok: false, reason: 'SECRET_TOO_SHORT' }
  const formId = (env.H2O_TYPEFORM_FORM_ID ?? '').trim()
  if (formId === '') return { ok: false, reason: 'FORM_ID_MISSING' }
  if (!FORM_ID_PATTERN.test(formId)) return { ok: false, reason: 'FORM_ID_MALFORMED' }
  const map = parseFieldMap(env.H2O_CRM_TYPEFORM_FIELD_MAP)
  if (map === 'MALFORMED') return { ok: false, reason: 'FIELD_MAP_MALFORMED' }
  return {
    ok: true,
    value: { enabled: env.H2O_CRM_TYPEFORM_INGEST_ENABLED === '1', formId, secret, fieldMap: map },
  }
}

/**
 * Recommended `H2O_CRM_TYPEFORM_FIELD_MAP` for the production form F22cAgx3 — **not a default**. Intake still
 * reads the map only from the environment (fail-closed, no defaults); this constant documents the value an
 * operator sets and lets a test prove it parses and uses only targets the workspace labels.
 *
 * Source: the CRM-2 authority capture `TYPEFORM_FIELD_LEDGER.tsv` (refs observed on the live form definition
 * 2026-09-26). Q9 (file upload) is deliberately unmapped — files stay in Typeform; CRM attachments are a later
 * phase. Q11 (country of destination) is free text, so it is kept as an answer, not as an ISO `country_code`.
 * Owner/Commander confirm the refs against the form before cutover (a ref changes if a question is recreated).
 */
export const F22CAGX3_RECOMMENDED_FIELD_MAP: Readonly<Record<string, FieldTarget>> = {
  'b6ece272-ea30-4057-a574-03c8d882297b': 'email', // Q1 What is your email address?
  '2a84669b-f0a9-4f64-8eb5-2819e7f8c763': 'first_name', // Q2 Can I get your first name?
  '1ed32286-7b31-43b2-b1ca-0a99401d8aa5': 'last_name', // Q3 And your last name?
  '384b27476ca4d24a': 'company', // Q4 What company are you with?
  '9216a914-ff0a-4936-b6c0-a579038177f4': 'other:interest', // Q5 What are you interested in
  '612225a8-b3ab-4cd2-af2d-a76a23d8cfc8': 'other:part', // Q6 What Part are you interested in?
  '8f243989-0e8f-4d2e-b1e7-97490ab85b2f': 'other:part_details', // Q7 information on the part
  '0b22caef-5cb3-4db3-a00b-455a77824316': 'other:urgency', // Q8 Is this Urgent Part Quote Request?
  'b79f1743-d223-4960-809b-feafba7b4480': 'phone', // Q10 phone number
  'b543840d-da8f-46ea-9b0a-4f59d3c06307': 'other:destination_country', // Q11 Country of Destination
  '55e58066-d55c-4a2c-a749-8a63cebf542c': 'message', // Q12 Anything else you'd like us to know?
}
