import type { Payload, PayloadRequest } from 'payload'
import { isUniqueViolation } from './activity'

/**
 * Deterministic system tasks. A system task exists because an accepted rule says so (E1.1 first-response,
 * an identity review, an intake review) — never to fill a dashboard. Each carries an `idempotency_key`, so a
 * replay or retry produces the same one task, not a second.
 */
export type SystemTaskInput = {
  kind: 'RFQ_FIRST_RESPONSE' | 'MISSING_INFORMATION' | 'IDENTITY_REVIEW' | 'INTAKE_REVIEW' | 'FOLLOW_UP'
  title: string
  priority: 'HIGH' | 'NORMAL' | 'LOW'
  idempotency_key: string
  source_rule: string
  assignee?: string | null
  rfq?: string | null
  contact?: string | null
  account?: string | null
  opportunity?: string | null
  identity_review?: string | null
  due_at?: string | null
}

export async function ensureSystemTask(
  req: PayloadRequest | { payload: Payload; user?: null },
  input: SystemTaskInput,
): Promise<'CREATED' | 'ALREADY_EXISTS'> {
  const tx = 'headers' in req ? { req: req as PayloadRequest } : {}
  const existing = await req.payload.find({
    collection: 'crm-tasks',
    where: { idempotency_key: { equals: input.idempotency_key } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    ...tx,
  })
  if (existing.docs.length > 0) return 'ALREADY_EXISTS'
  try {
    await req.payload.create({
      collection: 'crm-tasks',
      data: {
        title: input.title,
        kind: input.kind,
        priority: input.priority,
        status: 'OPEN',
        assignee: input.assignee ?? null,
        rfq: input.rfq ?? null,
        contact: input.contact ?? null,
        account: input.account ?? null,
        opportunity: input.opportunity ?? null,
        identity_review: input.identity_review ?? null,
        // No due date is invented: the owner-approved sales SLA is an open owner input (E1.1).
        due_at: input.due_at ?? null,
      } as never, // canonical_id and the server-owned fields are filled by the collection hooks
      context: {
        crmServer: {
          source: 'SYSTEM_RULE',
          source_rule: input.source_rule,
          idempotency_key: input.idempotency_key,
        },
      },
      overrideAccess: true,
      ...tx,
    })
    return 'CREATED'
  } catch (err) {
    if (isUniqueViolation(err)) return 'ALREADY_EXISTS'
    throw err
  }
}
