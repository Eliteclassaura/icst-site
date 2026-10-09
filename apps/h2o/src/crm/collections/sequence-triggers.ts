import type { CollectionConfig } from 'payload'
import { crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { options } from '../vocabulary'

/**
 * SEQ-BUILD-1 — trigger rules: four fixed rules that start a sequence on their own. One row per rule (`key`), created
 * on first view. A rule is OFF until an admin turns it on (admin + step-up), and it can only be turned on when every
 * activation gate is met, so with the engine OFF nothing is on and nothing can start. Written only by trusted server
 * code; the API is read-only. Audited (enabled / sequence / who).
 */
export const TRIGGER_KEYS = ['RFQ_RECEIVED', 'RFQ_NEEDS_INFO', 'DEAL_QUOTE_SENT', 'NO_ACTIVITY'] as const
export type TriggerKey = (typeof TRIGGER_KEYS)[number]

export const CrmSequenceTriggers: CollectionConfig = crmCollection(
  {
    slug: 'crm-sequence-triggers',
    labels: { singular: 'Trigger rule', plural: 'Trigger rules' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    admin: {
      useAsTitle: 'key',
      description: 'Rules that start a sequence automatically. Manage them in the CRM: Email Revenue → Advanced → Rules.',
      defaultColumns: ['key', 'enabled', 'sequence'],
    },
    fields: [
      { name: 'key', type: 'select', required: true, unique: true, index: true, options: options(TRIGGER_KEYS) },
      { name: 'enabled', type: 'checkbox', defaultValue: false, index: true },
      { name: 'sequence', type: 'relationship', relationTo: 'crm-sequences' },
      { name: 'idle_days', type: 'number', min: 7, max: 365, admin: { description: 'No activity for this many days (the idle rule only).' } },
      { name: 'skip_in_sequence', type: 'checkbox', defaultValue: true, admin: { description: 'Skip contacts already in another sequence.' } },
      { name: 'skip_open_deal', type: 'checkbox', defaultValue: true, admin: { description: 'Skip contacts with an open deal.' } },
      { name: 'skip_recent_days', type: 'number', min: 0, max: 90, defaultValue: 7, admin: { description: 'Skip contacts emailed in the last n days.' } },
      { name: 'last_matched_at', type: 'date' },
      { name: 'changed_at', type: 'date' },
      userRelation('changed_by', 'Who last changed this rule.'),
    ],
  },
  { deleteAlternative: 'Turn the rule off instead.' },
)
