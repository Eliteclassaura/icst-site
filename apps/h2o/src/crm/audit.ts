import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/**
 * PII-safe CRM audit, written into the **existing** foundation `audit-log` collection.
 *
 * Why not the shared `auditAfterChange`: it redacts values only for a hard-coded slug set (`contacts`,
 * `leads`, …). For any other slug it writes `summary = title ?? name ?? slug ?? email` — so a `crm-contacts`
 * row would put a person's name or email address into the audit log. Changing that shared set would be a
 * shared-schema change; this adapter makes one unnecessary (CRM_REUSE_MATRIX #5).
 *
 * What an entry holds:
 *   - action, collection, docId, actor id           — who did what to which record
 *   - changedKeys                                   — field NAMES only
 *   - detail.transitions                            — before→after for a per-collection allowlist of
 *                                                    non-personal state fields (stage, status, owner id…)
 *
 * What it never holds: field values outside that allowlist, `summary`, the actor's email address, the
 * client IP, raw payloads, tokens or secrets. A failed audit write is logged by code only and never blocks
 * the business write — the same posture as the shared hook — but CRM-1 tests assert the entry exists.
 */

// Wave 1 W1-4 adds 'export' (who exported what, never the values).
export type CrmAuditAction = 'create' | 'update' | 'delete' | 'export'

/** Non-PII fields whose before/after values may be recorded, per collection. Ids and enums only. */
export const AUDITED_TRANSITIONS: Record<string, readonly string[]> = {
  'crm-accounts': ['account_state', 'relationship_state', 'strategic_tier', 'owner', 'parent_account'],
  'crm-contacts': ['record_state', 'account', 'account_link_confidence', 'owner', 'marketing_eligibility'],
  'crm-sites': ['account', 'site_state', 'site_link_confidence'],
  'crm-assets': ['site', 'asset_state', 'condition_state'],
  'crm-opportunities': [
    'stage',
    'outcome_status',
    'owner',
    'amount_status',
    'currency',
    'revenue_verification_state',
    'revenue_truth_state',
    'project_state',
    'project_stage',
    'motion',
    'account',
    'site',
  ],
  'crm-buying-group-members': [
    'membership_class',
    'membership_verification',
    'role_class',
    'role_verification',
  ],
  'crm-rfqs': ['status', 'assignee', 'contact', 'account', 'site', 'opportunity', 'follow_up_state', 'office'],
  'crm-rfq-items': ['product_resolution_state'],
  // `due_at` is a date, not personal data: Wave 1 W1-9 requires due-date changes to be audited.
  'crm-tasks': ['status', 'assignee', 'kind', 'priority', 'due_at'],
  'crm-notes': [],
  'crm-activities': ['type'],
  'crm-suppressions': ['action', 'reason', 'scope'],
  'crm-intake-events': ['processing_state'],
  'crm-identity-reviews': ['state', 'reason'],
  'crm-email-library': ['status', 'approval_mode', 'approval_changed_by', 'sendable', 'version', 'lint_badge'],
  'crm-sequence-triggers': ['key', 'enabled', 'sequence', 'changed_by'],
  'crm-ers-simulations': ['sequence', 'snapshot_hash', 'approved_by'],
  'crm-email-outbox': ['status', 'kind', 'attempts', 'last_error_code'],
  'crm-email-events': ['event', 'kind', 'code'],
  'crm-import-batches': ['status', 'entity', 'row_count'],
  // IMPORT-TYPEFORM-1: states and ids only, never an answer or the file link
  'crm-historical-inquiries': ['record_state', 'state', 'source', 'import_batch'],
  'crm-saved-views': ['list', 'shared', 'pinned'],
  'crm-email-messages': ['direction', 'status', 'status_code'],
  'crm-reply-tokens': ['expires_at', 'revoked_at'],
  'crm-email-review': ['reason', 'state', 'rfq', 'resolved_by'],
  'crm-office-settings': [],
  // Patch C: never a host, user name, sender or password — only these states.
  'crm-sending-profiles': ['active', 'use', 'preset', 'password_set', 'last_check_state', 'last_check_code'],
  'crm-email-templates': ['approved', 'approved_by', 'purpose', 'version'],
  'crm-sequences': ['run_state', 'published_version', 'approval_mode', 'readiness', 'ready_by', 'reply_mode', 'reply_owner', 'initial_batch', 'reply_last_check_by'],
  'crm-sequence-versions': ['state', 'definition_hash'],
  'crm-enrollments': ['status', 'current_step', 'exit_reason', 'pause_reason', 'hold_code'],
  'crm-ers-settings': [],
  'crm-email-routing': [],
}

const SKIP_KEYS = new Set(['updatedAt', 'createdAt', 'id'])

const scalar = (v: unknown): string | number | boolean | null => {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'object' && 'id' in (v as object)) return String((v as { id: unknown }).id)
  return null
}

export function changedKeys(doc: Record<string, unknown>, previous?: Record<string, unknown>): string[] {
  return Object.keys(doc).filter(
    (k) =>
      !k.startsWith('_') &&
      !SKIP_KEYS.has(k) &&
      (!previous || JSON.stringify(doc[k]) !== JSON.stringify(previous[k])),
  )
}

export function transitions(
  slug: string,
  doc: Record<string, unknown>,
  previous?: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const f of AUDITED_TRANSITIONS[slug] ?? []) {
    const to = scalar(doc[f])
    const from = previous ? scalar(previous[f]) : null
    if (!previous || from !== to) out[f] = { from, to }
  }
  return out
}

export async function writeCrmAudit(
  req: PayloadRequest,
  entry: {
    action: CrmAuditAction
    collection: string
    docId: string
    changedKeys?: string[]
    detail?: Record<string, unknown>
  },
): Promise<void> {
  try {
    await req.payload.create({
      collection: 'audit-log',
      data: {
        action: entry.action,
        collection: entry.collection,
        docId: entry.docId,
        changedKeys: entry.changedKeys ?? null,
        summary: null,
        actor: req.user ? String(req.user.id) : null,
        actorEmail: null,
        ip: null,
        detail: { crm: true, ...(entry.detail ?? {}) },
      },
      overrideAccess: true,
      req,
    })
  } catch (err) {
    // Code only: an error object can carry the failed row's values.
    req.payload.logger.error({
      code: 'CRM_AUDIT_WRITE_FAILED',
      collection: entry.collection,
      errName: (err as Error)?.name,
    })
  }
}

export const crmAuditAfterChange: CollectionAfterChangeHook = async ({
  collection,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const slug: string = collection.slug
  const prev = operation === 'update' ? (previousDoc as Record<string, unknown>) : undefined
  await writeCrmAudit(req, {
    action: operation === 'create' ? 'create' : 'update',
    collection: slug,
    docId: String((doc as { id: string | number }).id),
    changedKeys: changedKeys(doc as Record<string, unknown>, prev),
    detail: {
      canonical_id: (doc as { canonical_id?: string }).canonical_id ?? null,
      transitions: transitions(slug, doc as Record<string, unknown>, prev),
    },
  })
  return doc
}

export const crmAuditAfterDelete: CollectionAfterDeleteHook = async ({ collection, id, req }) => {
  await writeCrmAudit(req, { action: 'delete', collection: collection.slug, docId: String(id) })
}
