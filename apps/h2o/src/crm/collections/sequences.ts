import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { CrmInvariantError } from '../guards'
import { options, SEQUENCE_RUN_STATE, SEQUENCE_STEP_TYPE, SEQUENCE_VERSION_STATE } from '../vocabulary'

/**
 * Revenue Engine slice 1 — sequences (E0.1 Sequence + SequenceVersion under the LEAN CUT; CT rulings 2026-10-05).
 *
 * A sequence is a stable key and name; what it sends lives in its versions. A published version is IMMUTABLE: its
 * steps, template references and hash never change (E0.1 §7, "duplicate to edit"). To change a running sequence, an
 * admin duplicates the published version into a new draft and publishes that; existing enrollments stay on the version
 * they started on. Approval mode is AUTO (owner override): the copy-risk linter and the hard gates still hold sends.
 *
 * Written only by the sequence settings pages and the seeds (trusted server code); the API is read-only. Audited.
 */
const toggle = (name: string, label: string) => ({
  name,
  label,
  type: 'select' as const,
  defaultValue: 'INHERIT',
  options: [
    { label: 'As the global setting', value: 'INHERIT' },
    { label: 'On', value: 'ON' },
    { label: 'Off', value: 'OFF' },
  ],
})

export const CrmSequences: CollectionConfig = crmCollection(
  {
    slug: 'crm-sequences',
    labels: { singular: 'Sequence', plural: 'Sequences' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    admin: { useAsTitle: 'name', description: 'Revenue Engine sequences. Manage them in the CRM: Settings → Sequences.', defaultColumns: ['name', 'key', 'run_state', 'language'] },
    fields: [
      { name: 'key', type: 'text', required: true, unique: true, index: true, maxLength: 64 },
      { name: 'name', type: 'text', required: true, maxLength: 120 },
      { name: 'language', type: 'select', required: true, defaultValue: 'EN', options: options(['EN', 'JA', 'TH'] as const) },
      { name: 'message_purpose', type: 'select', required: true, defaultValue: 'ACCOUNT_RELATIONSHIP', options: options(['ACCOUNT_RELATIONSHIP', 'SEQUENCE_OUTREACH'] as const) },
      { name: 'run_state', type: 'select', required: true, defaultValue: 'DRAFT', index: true, options: options(SEQUENCE_RUN_STATE) },
      { name: 'published_version', type: 'relationship', relationTo: 'crm-sequence-versions', index: true },
      { name: 'approval_mode', type: 'select', required: true, defaultValue: 'AUTO', options: options(['AUTO', 'REQUIRED'] as const), admin: { description: 'AUTO (owner override 2026-10-05): lint and hard gates still hold sends.' } },
      { name: 'needs_missing_items', type: 'checkbox', defaultValue: false, admin: { description: 'Enrolment asks which items are missing (ICS_MISSING_INFORMATION).' } },
      {
        name: 'compliance',
        type: 'group',
        admin: { description: 'Per-sequence override of the global compliance toggles (owner decision: default ON). The floor always applies.' },
        fields: [
          toggle('address_footer', 'Postal address footer'),
          toggle('business_hours', 'Business-hours window'),
          toggle('warmup', 'Warm-up cap'),
        ],
      },
      { name: 'paused_reason', type: 'text', maxLength: 120 },
    ],
  },
  { deleteAlternative: 'Retire the sequence instead.' },
)

/** A published version accepts exactly one change: retirement. Everything else is a new version. */
const immutable: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation !== 'update' || !originalDoc || originalDoc.state !== 'PUBLISHED') return data
  const changed = Object.keys(data).filter((k) => !['state', 'updatedAt', 'retired_at'].includes(k) && JSON.stringify(data[k]) !== JSON.stringify(originalDoc[k]))
  if (changed.length || (data.state && !['PUBLISHED', 'RETIRED'].includes(String(data.state))))
    throw new CrmInvariantError('SEQUENCE_VERSION_IMMUTABLE', 'A published sequence version cannot change. Duplicate it into a new draft.')
  return data
}

export const CrmSequenceVersions: CollectionConfig = crmCollection(
  {
    slug: 'crm-sequence-versions',
    labels: { singular: 'Sequence version', plural: 'Sequence versions' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    admin: { useAsTitle: 'definition_hash', description: 'Immutable once published (E0.1).', defaultColumns: ['sequence', 'version_number', 'state', 'published_at'] },
    hooks: { beforeChange: [immutable] },
    fields: [
      { name: 'sequence', type: 'relationship', relationTo: 'crm-sequences', required: true, index: true },
      { name: 'version_number', type: 'number', required: true },
      { name: 'state', type: 'select', required: true, defaultValue: 'DRAFT', index: true, options: options(SEQUENCE_VERSION_STATE) },
      {
        name: 'steps',
        type: 'array',
        labels: { singular: 'Step', plural: 'Steps' },
        fields: [
          { name: 'step_key', type: 'text', required: true, maxLength: 64 },
          { name: 'type', type: 'select', required: true, options: options(SEQUENCE_STEP_TYPE) },
          { name: 'template', type: 'relationship', relationTo: 'crm-email-templates' },
          { name: 'template_hash', type: 'text', maxLength: 64 },
          { name: 'business_days', type: 'number' },
          { name: 'task_title', type: 'text', maxLength: 200 },
          { name: 'task_due_days', type: 'number' },
        ],
      },
      { name: 'definition_hash', type: 'text', maxLength: 64, index: true },
      { name: 'rule_set_sha', type: 'text', maxLength: 64 },
      { name: 'published_at', type: 'date' },
      userRelation('published_by', 'Who published this version.'),
      { name: 'retired_at', type: 'date' },
    ],
  },
  { deleteAlternative: 'Versions are kept; retire them.' },
)

