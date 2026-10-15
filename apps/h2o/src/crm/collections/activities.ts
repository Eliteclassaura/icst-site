import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { noOne } from '../access'
import { crmCollection, stampProvenance } from '../collection'
import { provenanceGroup } from '../fields'
import { appendOnly, CrmInvariantError, isServerContext, serverOwned } from '../guards'
import { ACTIVITY_TYPE, ACTOR_KIND, HUMAN_ACTIVITY_TYPES, options } from '../vocabulary'

const SERVER_FIELDS = ['actor', 'actor_kind', 'idempotency_key', 'recorded_at'] as const

/**
 * A person may log what they did (a call, a meeting, a reference to an email). A person may not write a
 * system event — "RFQ created", "stage changed", "suppression recorded" are recorded by the system when the
 * thing actually happens, never typed in to make a timeline look busy.
 */
const humanTypesOnly: CollectionBeforeValidateHook = ({ context, data, operation, req }) => {
  if (!data || operation !== 'create' || isServerContext(context)) return data
  if (!HUMAN_ACTIVITY_TYPES.includes(String(data.type) as never))
    throw new CrmInvariantError(
      'ACTIVITY_TYPE_SYSTEM_ONLY',
      `${String(data.type)} is recorded by the system, not entered by hand.`,
      403,
    )
  data.actor = req.user ? req.user.id : null
  data.actor_kind = 'USER'
  data.recorded_at = new Date().toISOString()
  data.idempotency_key = null
  return data
}

export const CrmActivities: CollectionConfig = crmCollection(
  {
    slug: 'crm-activities',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'Activity', plural: 'Activity' },
    access: { update: noOne },
    admin: {
      useAsTitle: 'summary',
      description:
        'Append-only commercial timeline. System events are written when they happen; people log calls, meetings and references.',
      defaultColumns: ['occurred_at', 'type', 'summary', 'account', 'opportunity', 'rfq', 'actor'],
      listSearchableFields: ['summary', 'event_name'],
    },
    defaultSort: '-occurred_at',
    hooks: {
      beforeValidate: [serverOwned('crm-activities', SERVER_FIELDS), humanTypesOnly, stampProvenance],
      beforeChange: [appendOnly('crm-activities')],
    },
    fields: [
      { name: 'type', type: 'select', required: true, options: options(ACTIVITY_TYPE), index: true },
      {
        name: 'summary',
        type: 'text',
        required: true,
        maxLength: 240,
        admin: { description: 'Short, factual, no personal data.' },
      },
      {
        name: 'event_name',
        type: 'text',
        index: true,
        admin: { description: 'E0.1 event name when this mirrors a catalog event (e.g. crm.rfq.persisted).' },
      },
      {
        name: 'occurred_at',
        type: 'date',
        required: true,
        index: true,
        admin: { date: { pickerAppearance: 'dayAndTime' } },
      },
      { name: 'recorded_at', type: 'date', required: true, admin: { readOnly: true } },
      { name: 'actor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      {
        name: 'actor_kind',
        type: 'select',
        required: true,
        options: options(ACTOR_KIND),
        admin: { readOnly: true },
      },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', index: true },
      { name: 'site', type: 'relationship', relationTo: 'crm-sites', index: true },
      { name: 'asset', type: 'relationship', relationTo: 'crm-assets', index: true },
      { name: 'opportunity', type: 'relationship', relationTo: 'crm-opportunities', index: true },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true },
      { name: 'task', type: 'relationship', relationTo: 'crm-tasks', index: true },
      { name: 'detail', type: 'json', admin: { description: 'Ids and enum values only.' } },
      { name: 'idempotency_key', type: 'text', unique: true, index: true, admin: { readOnly: true } },
      provenanceGroup(),
    ],
  },
  { deleteAlternative: 'The timeline is append-only.' },
)
