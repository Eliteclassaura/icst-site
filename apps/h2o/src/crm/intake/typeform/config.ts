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
