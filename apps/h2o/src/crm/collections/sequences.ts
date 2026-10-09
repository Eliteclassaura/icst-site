import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { ENROLLMENT_PURPOSE } from '../ers/identity'
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

/**
 * ENGINE-SCOPE-1c ("AUTO applies to new programs only"): a program that already has live work (running, held or failed
 * enrollments) never changes its approval mode silently. The only door is `changeSequenceApprovalMode` (admin + step-up +
 * a written reason, audited), which sets the context flag this hook looks for. A program with no live work may be set directly.
 */
const noSilentModeSwitch: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update' || !originalDoc || data.approval_mode === undefined || data.approval_mode === originalDoc.approval_mode) return data
  if ((req.context as { approvalChangeAllowed?: boolean } | undefined)?.approvalChangeAllowed) return data
  const live = await req.payload.count({
    collection: 'crm-enrollments',
    where: { and: [{ sequence: { equals: String(originalDoc.id) } }, { status: { in: ['ACTIVE', 'AWAITING_SEND', 'PAUSED', 'DEAD_LETTER'] } }] } as never,
    overrideAccess: true,
    req,
  })
  if (live.totalDocs > 0)
    throw new CrmInvariantError('SEQUENCE_MODE_LIVE', 'This program has live work, so its approval mode does not change silently. An admin changes it with a reason.')
  return data
}

export const CrmSequences: CollectionConfig = crmCollection(
  {
    slug: 'crm-sequences',
    labels: { singular: 'Sequence', plural: 'Sequences' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    hooks: { beforeChange: [noSilentModeSwitch] },
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
          // Owner rule 2026-10-06: no postal address in any email; the stored override is kept but not used.
          { ...toggle('address_footer', 'Postal address footer (not used)'), admin: { hidden: true } },
          toggle('business_hours', 'Business-hours window'),
          toggle('warmup', 'Warm-up cap'),
        ],
      },
      { name: 'paused_reason', type: 'text', maxLength: 120 },
      {
        name: 'purpose',
        type: 'select',
        required: true,
        defaultValue: 'RFQ_RESPONSE',
        index: true,
        options: options(ENROLLMENT_PURPOSE),
        admin: { description: 'What enrollments in this sequence are for (the inquiry rule and the scope follow from it).' },
      },
      {
        name: 'readiness',
        type: 'select',
        required: true,
        defaultValue: 'NOT_READY',
        index: true,
        options: [
          { label: 'Not ready', value: 'NOT_READY' },
          { label: 'Ready', value: 'READY' },
        ],
        admin: { description: 'Ready = built and checked, waiting for the safety gates. It starts nothing.' },
      },
      { name: 'ready_at', type: 'date' },
      {
        name: 'reply_mode',
        type: 'select',
        required: true,
        defaultValue: 'NOT_SET',
        index: true,
        options: [
          { label: 'Not set', value: 'NOT_SET' },
          { label: 'Monitored', value: 'MONITORED' },
          { label: 'Manual', value: 'MANUAL' },
        ],
        admin: { description: 'How replies and stop requests are handled. Manual = a named owner checks the reply mailbox; follow-ups are held until they do.' },
      },
      userRelation('reply_owner', 'The person who checks replies and handles stop requests (manual mode).'),
      {
        name: 'reply_coverage',
        type: 'group',
        admin: { description: 'When the reply owner covers the mailbox (manual mode).' },
        fields: [
          { name: 'days', type: 'select', defaultValue: 'MON_FRI', options: [{ label: 'Monday to Friday', value: 'MON_FRI' }, { label: 'Every day', value: 'EVERY_DAY' }] },
          { name: 'start_hour', type: 'number', min: 0, max: 23 },
          { name: 'end_hour', type: 'number', min: 1, max: 24 },
          { name: 'zone', type: 'text', maxLength: 64 },
        ],
      },
      { name: 'initial_batch', type: 'number', min: 1, max: 500, admin: { description: 'Manual mode releases only this many first emails.' } },
      { name: 'reply_last_check_at', type: 'date' },
      userRelation('reply_last_check_by', 'Who recorded the last reply check.'),
      userRelation('ready_by', 'Who marked it Ready.'),
      {
        name: 'library_source',
        type: 'json',
        admin: { description: 'Which Library emails this sequence was built from (keys and source hashes).' },
      },
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

