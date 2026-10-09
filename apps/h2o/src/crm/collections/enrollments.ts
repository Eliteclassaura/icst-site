import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { ENROLLMENT_PURPOSE, SCOPE_KIND, purposeNeedsRfq } from '../ers/identity'
import { CrmInvariantError } from '../guards'
import { userRelation } from '../fields'
import { ENROLLED_VIA, ENROLLMENT_EXIT_REASON, ENROLLMENT_PAUSE_REASON, ENROLLMENT_STATUS, MISSING_INFORMATION_ITEMS, options } from '../vocabulary'

/**
 * Revenue Engine — enrollments (E0.1 `sequence_runtime.schema.json`, reduced). One contact in one sequence for one purpose
 * and scope (ENGINE-SCOPE-1b): `coalesce_key` = sequence : contact : purpose : scope kind : scope ref : cycle, unique. A
 * replay dedupes (same event); a genuinely new event of the same scope, after the earlier enrollment ended, is the next
 * cycle (see ers/identity.ts and ers/create.ts). An inquiry anchors a response and a quote follow-up (CT ruling 1: the
 * RFQ is the relationship basis and the reply thread); relationship, cohort and publication enrollments need none.
 *
 * The engine (crm/ers/engine.ts) moves `current_step` and `next_action_at` through ers/transition.ts; exits are terminal.
 * Written only by trusted server code; the API is read-only. Audited (status / exit / pause transitions).
 */
const needsRfq: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  const merged = { ...(operation === 'update' ? (originalDoc ?? {}) : {}), ...(data as Record<string, unknown>) } as Record<string, unknown>
  if (purposeNeedsRfq(String(merged.purpose ?? 'RFQ_RESPONSE')) && !merged.rfq)
    throw new CrmInvariantError('ENROLLMENT_RFQ_REQUIRED', 'An inquiry response or a quote follow-up needs an inquiry.')
  return data
}

export const CrmEnrollments: CollectionConfig = crmCollection(
  {
    slug: 'crm-enrollments',
    labels: { singular: 'Sequence enrollment', plural: 'Sequence enrollments' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    hooks: { beforeChange: [needsRfq] },
    admin: { useAsTitle: 'coalesce_key', description: 'Who is in which sequence, and where.', defaultColumns: ['sequence', 'contact', 'status', 'current_step', 'next_action_at'] },
    fields: [
      { name: 'coalesce_key', type: 'text', required: true, unique: true, index: true, maxLength: 400 },
      {
        name: 'identity_base',
        type: 'text',
        index: true,
        maxLength: 380,
        admin: { readOnly: true, description: 'sequence:contact:purpose:scope kind:scope ref (everything but the cycle).' },
      },
      { name: 'purpose', type: 'select', required: true, defaultValue: 'RFQ_RESPONSE', index: true, options: options(ENROLLMENT_PURPOSE) },
      { name: 'scope_kind', type: 'select', options: options(SCOPE_KIND) },
      { name: 'scope_ref', type: 'text', maxLength: 200 },
      { name: 'scope_event_ref', type: 'text', maxLength: 200, admin: { description: 'The event this enrollment answers; a replay has the same one, a new cycle a different one.' } },
      { name: 'cycle', type: 'number', required: true, defaultValue: 1 },
      { name: 'content_version', type: 'text', maxLength: 64, admin: { description: 'The sequence version hash it started on.' } },
      { name: 'sequence', type: 'relationship', relationTo: 'crm-sequences', required: true, index: true },
      { name: 'version', type: 'relationship', relationTo: 'crm-sequence-versions', required: true, index: true },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', required: true, index: true },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true, admin: { description: 'Required for an inquiry response and a quote follow-up; optional for relationship, cohort and publication programs.' } },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      userRelation('owner', 'The RFQ owner when enrolled, else the person who enrolled.'),
      userRelation('enrolled_by', 'Who enrolled this contact.'),
      { name: 'enrolled_via', type: 'select', required: true, options: options(ENROLLED_VIA) },
      { name: 'saved_view', type: 'relationship', relationTo: 'crm-saved-views' },
      { name: 'cohort_hash', type: 'text', maxLength: 64, admin: { description: 'The dry run this enrollment was approved from.' } },
      { name: 'status', type: 'select', required: true, defaultValue: 'ACTIVE', index: true, options: options(ENROLLMENT_STATUS) },
      { name: 'current_step', type: 'number', required: true, defaultValue: 0 },
      { name: 'next_action_at', type: 'date', index: true },
      { name: 'last_step_at', type: 'date' },
      { name: 'enrolled_at', type: 'date', required: true },
      { name: 'pause_reason', type: 'select', options: options(ENROLLMENT_PAUSE_REASON) },
      { name: 'hold_code', type: 'text', maxLength: 80, admin: { description: 'Why the last step was held (a code; never message text).' } },
      { name: 'exit_reason', type: 'select', index: true, options: options(ENROLLMENT_EXIT_REASON) },
      { name: 'exited_at', type: 'date' },
      {
        name: 'missing_items',
        type: 'select',
        hasMany: true,
        options: Object.keys(MISSING_INFORMATION_ITEMS).map((k) => ({ label: k, value: k })),
        admin: { description: 'ICS_MISSING_INFORMATION: picked by a person from the fixed list.' },
      },
      { name: 'awaiting_outbox', type: 'relationship', relationTo: 'crm-email-outbox' },
    ],
  },
  { deleteAlternative: 'Stop the enrollment instead; it stays as the record of what was sent.' },
)
