import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { noOne } from '../access'
import { recordActivity } from '../activity'
import { crmCollection } from '../collection'
import { appendOnly, CrmInvariantError, isServerContext, relId } from '../guards'
import { emailKey } from '../normalize'
import { clearRuleFor, ledgerFor, activeFromLedger } from '../suppression'
import {
  SUPPRESSION_ACTION,
  SUPPRESSION_REASON,
  SUPPRESSION_SCOPE,
  SUPPRESSION_SOURCE,
  TENANT,
  options,
  type SuppressionReason,
} from '../vocabulary'

/** SEC-CRM-1: APPLY reasons a non-admin user may not record by hand. */
export const PRIVILEGED_APPLY_REASONS: readonly SuppressionReason[] = ['HARD_BOUNCE', 'INVALID_ADDRESS', 'COMPLAINT']

const SCOPE_RANK = { MARKETING_EMAIL: 1, ALL_EMAIL: 2, ALL_OUTREACH: 3 } as const
type Scope = keyof typeof SCOPE_RANK

/** E0.1 precedence effects, as the *minimum* scope each reason carries. `null` = must be chosen explicitly. */
const MIN_SCOPE: Record<SuppressionReason, Scope | null> = {
  DO_NOT_CONTACT: 'ALL_OUTREACH',
  LEGAL_PROHIBITION: 'ALL_OUTREACH',
  COMPLAINT: 'MARKETING_EMAIL',
  HARD_BOUNCE: 'ALL_EMAIL',
  INVALID_ADDRESS: 'ALL_EMAIL',
  UNSUBSCRIBED: 'MARKETING_EMAIL',
  MANUAL_SUPPRESSION: null,
  SOFT_BOUNCE_HOLD: 'MARKETING_EMAIL',
}

/** Resolve the address identity from `address` or the related contact; stamp the server-owned fields. */
const resolveIdentity: CollectionBeforeValidateHook = async ({ context, data, operation, req }) => {
  if (!data || operation !== 'create') return data
  const d = data as Record<string, unknown>
  let key = emailKey(d.address)?.matchKey ?? null
  const contactId = relId(d.contact)
  if (contactId) {
    const contact = await req.payload.findByID({
      collection: 'crm-contacts',
      id: contactId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const contactKey = (contact as { email_match_key?: string }).email_match_key ?? null
    if (key && contactKey && key !== contactKey)
      throw new CrmInvariantError(
        'SUPPRESSION_ADDRESS_CONTACT_MISMATCH',
        'The address does not belong to the selected contact.',
      )
    key = key ?? contactKey
  }
  if (!key)
    throw new CrmInvariantError(
      'SUPPRESSION_ADDRESS_REQUIRED',
      'A suppression needs a valid address or a contact.',
    )
  d.email_match_key = key
  delete d.address // the key is the identity; the raw input is not kept twice
  d.tenant = TENANT
  d.recorded_at = new Date().toISOString()
  d.recorded_by = req.user ? req.user.id : null
  if (!isServerContext(context)) {
    const admin = hasRole(req, ADMINS)
    // SEC-CRM-1: reasons that only evidence can establish (a bounce, an invalid address, a complaint) are recorded by
    // the server from that evidence, or by an admin — never by a sales user (two of them can never be cleared, and a
    // complaint pauses all sequence sending). The legal-review source is an admin's statement too.
    if (!admin && d.action !== 'CLEAR' && PRIVILEGED_APPLY_REASONS.includes(d.reason as SuppressionReason))
      throw new CrmInvariantError('SUPPRESSION_REASON_PRIVILEGED', `Only an admin can record ${String(d.reason)}.`, 403)
    d.source = d.action === 'CLEAR' ? 'MANUAL' : d.source === 'LEGAL_REVIEW' && admin ? 'LEGAL_REVIEW' : 'MANUAL'
    d.source_event_id = null
  }
  const reason = d.reason as SuppressionReason | undefined
  if (d.action !== 'CLEAR' && reason) {
    const min = MIN_SCOPE[reason]
    if (!d.scope) {
      if (!min)
        throw new CrmInvariantError(
          'SUPPRESSION_SCOPE_REQUIRED',
          'A manual suppression must state its scope.',
        )
      d.scope = min
    }
    if (min && SCOPE_RANK[d.scope as Scope] < SCOPE_RANK[min])
      throw new CrmInvariantError(
        'SUPPRESSION_SCOPE_TOO_NARROW',
        `${reason} carries at least ${min} scope (E0.1 precedence).`,
      )
  }
  return data
}

/** CLEAR is privileged, evidenced, and impossible for hard bounces / invalid addresses. */
const clearGate: CollectionBeforeChangeHook = async ({ context, data, operation, req }) => {
  if (operation !== 'create' || data.action !== 'CLEAR') return data
  if (!hasRole(req, ADMINS) && !isServerContext(context))
    throw new CrmInvariantError('SUPPRESSION_CLEAR_PRIVILEGED', 'Only an admin can clear a suppression.', 403)
  const targetId = relId(data.clears)
  if (!targetId)
    throw new CrmInvariantError('SUPPRESSION_CLEAR_TARGET_REQUIRED', 'Name the suppression being cleared.')
  const ledger = await ledgerFor(req, String(data.email_match_key))
  const target = activeFromLedger(ledger).find((r) => String(r.id) === targetId)
  if (!target)
    throw new CrmInvariantError(
      'SUPPRESSION_CLEAR_TARGET_NOT_ACTIVE',
      'That suppression is not active for this address.',
      409,
    )
  const rule = clearRuleFor(target)
  if (rule === 'NEVER')
    throw new CrmInvariantError(
      'SUPPRESSION_NEVER_CLEARABLE',
      `${target.reason} cannot be cleared. A verified replacement address is a new identity (E0.1).`,
      409,
    )
  if (!data.reason_note || String(data.reason_note).trim() === '')
    throw new CrmInvariantError('SUPPRESSION_CLEAR_REASON_REQUIRED', 'Clearing needs a written reason.')
  if (rule === 'RECONSENT_REQUIRED' && (!data.evidence_ref || String(data.evidence_ref).trim() === ''))
    throw new CrmInvariantError(
      'SUPPRESSION_CLEAR_RECONSENT_REQUIRED',
      `${target.reason} is cleared only with explicit re-consent evidence (E0.1: never auto-clear).`,
    )
  data.reason = target.reason
  data.scope = target.scope
  return data
}

const timeline: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  const d = doc as Record<string, unknown>
  await recordActivity(req, {
    type: d.action === 'CLEAR' ? 'SUPPRESSION_CLEARED' : 'SUPPRESSION_RECORDED',
    summary: `${d.action === 'CLEAR' ? 'Suppression cleared' : 'Suppression recorded'}: ${String(d.reason)} (${String(d.scope)})`,
    contact: relId(d.contact),
    idempotency_key: `suppression:${String(d.canonical_id)}`,
    detail: { reason: d.reason, scope: d.scope, action: d.action },
  })
  return doc
}

/**
 * Revenue Engine slice 1: a recorded suppression stops every live sequence enrollment for that address at once, and a
 * COMPLAINT pauses sequence sending (owner override). Loaded lazily (the engine imports the CRM model). A failure is
 * logged by code and never blocks the ledger write — the engine re-checks the ledger before every step and send.
 */
const stopSequences: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  try {
    const { onSuppressionRecorded } = await import('../ers/feedback')
    await onSuppressionRecorded(req.payload, doc as Record<string, unknown>)
  } catch (err) {
    req.payload.logger.error({ code: 'ERS_SUPPRESSION_HOOK_FAILED', errName: (err as Error)?.name })
  }
  return doc
}

export const CrmSuppressions: CollectionConfig = crmCollection(
  {
    slug: 'crm-suppressions',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'Suppression', plural: 'Suppressions (do not email)' },
    access: { update: noOne },
    admin: {
      useAsTitle: 'email_match_key',
      description:
        'Append-only do-not-email ledger, keyed on the address. Survives sequence, mailbox and domain changes. Clearing is a new privileged row, never an edit or a delete.',
      defaultColumns: ['email_match_key', 'action', 'reason', 'scope', 'recorded_at'],
      listSearchableFields: ['email_match_key'],
    },
    hooks: {
      beforeValidate: [resolveIdentity],
      beforeChange: [appendOnly('crm-suppressions'), clearGate],
      afterChange: [timeline, stopSequences],
    },
    fields: [
      {
        name: 'address',
        type: 'text',
        virtual: true,
        admin: { description: 'Address to suppress (or choose a contact).' },
      },
      { name: 'email_match_key', type: 'text', required: true, index: true, admin: { readOnly: true } },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', index: true },
      {
        name: 'action',
        type: 'select',
        required: true,
        defaultValue: 'APPLY',
        options: options(SUPPRESSION_ACTION),
      },
      { name: 'reason', type: 'select', required: true, options: options(SUPPRESSION_REASON), index: true },
      { name: 'scope', type: 'select', options: options(SUPPRESSION_SCOPE) },
      {
        name: 'clears',
        type: 'relationship',
        relationTo: 'crm-suppressions',
        admin: { description: 'For CLEAR: the APPLY row being cleared.' },
      },
      {
        name: 'source',
        type: 'select',
        required: true,
        defaultValue: 'MANUAL',
        options: options(SUPPRESSION_SOURCE),
      },
      { name: 'source_event_id', type: 'text', index: true },
      { name: 'evidence_ref', type: 'text' },
      { name: 'reason_note', type: 'textarea' },
      { name: 'tenant', type: 'text', required: true, defaultValue: TENANT, admin: { readOnly: true } },
      { name: 'recorded_by', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      { name: 'recorded_at', type: 'date', required: true, admin: { readOnly: true } },
    ],
  },
  {
    deleteAlternative:
      'Suppression is durable. Record a CLEAR row (admin, with reason and evidence) instead.',
  },
)
