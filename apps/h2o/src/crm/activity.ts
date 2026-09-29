import type { Payload, PayloadRequest } from 'payload'
import type { ActivityType } from './vocabulary'

/**
 * System timeline writer. Every system-generated activity carries an `idempotency_key`, so a replayed
 * webhook or a retried hook cannot write the same event twice: the unique index refuses the second insert
 * and the writer treats that as "already recorded".
 *
 * `summary` must never contain personal data (name, email, phone, message text). Callers pass ids and
 * enum values; the timeline shows the related records through their relationships.
 */
export type ActivityInput = {
  type: ActivityType
  summary: string
  idempotency_key: string
  event_name?: string | null
  occurred_at?: string
  account?: string | null
  contact?: string | null
  site?: string | null
  asset?: string | null
  opportunity?: string | null
  rfq?: string | null
  task?: string | null
  detail?: Record<string, unknown>
  actor_kind?: 'USER' | 'SYSTEM' | 'INTEGRATION'
}

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as {
    code?: string
    cause?: { code?: string }
    message?: string
    data?: { errors?: Array<{ message?: string }> }
  }
  if (e?.code === '23505' || e?.cause?.code === '23505') return true
  const text = `${e?.message ?? ''} ${JSON.stringify(e?.data ?? '')}`
  return /unique|already exists|duplicate key/i.test(text)
}

export async function recordActivity(
  req: PayloadRequest | { payload: Payload; user?: null },
  input: ActivityInput,
): Promise<'CREATED' | 'ALREADY_RECORDED'> {
  // A real request is threaded through (same transaction); a bare `{ payload }` is a system call.
  const tx = 'headers' in req ? { req: req as PayloadRequest } : {}
  const existing = await req.payload.find({
    collection: 'crm-activities',
    where: { idempotency_key: { equals: input.idempotency_key } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    ...tx,
  })
  if (existing.docs.length > 0) return 'ALREADY_RECORDED'
  try {
    await req.payload.create({
      collection: 'crm-activities',
      data: {
        type: input.type,
        summary: input.summary,
        event_name: input.event_name ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        account: input.account ?? null,
        contact: input.contact ?? null,
        site: input.site ?? null,
        asset: input.asset ?? null,
        opportunity: input.opportunity ?? null,
        rfq: input.rfq ?? null,
        task: input.task ?? null,
        detail: input.detail ?? null,
        provenance: { source_system: 'SYSTEM_DERIVED', verification_state: 'UNKNOWN' },
      } as never, // canonical_id and the server-owned fields are filled by the collection hooks
      context: {
        crmServer: {
          actor_kind: input.actor_kind ?? (req.user ? 'USER' : 'SYSTEM'),
          actor: req.user ? req.user.id : null,
          idempotency_key: input.idempotency_key,
          recorded_at: new Date().toISOString(),
        },
      },
      overrideAccess: true,
      ...tx,
    })
    return 'CREATED'
  } catch (err) {
    if (isUniqueViolation(err)) return 'ALREADY_RECORDED'
    throw err
  }
}

export { isUniqueViolation }
