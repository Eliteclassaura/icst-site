import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { CrmInvariantError } from '../guards'
import { options } from '../vocabulary'

/**
 * EMAIL-LIB-1 — the Email Library: the catalogue of every written ERS email (E1.1–E1.4 exact copy, the E2 skeletons
 * and the existing T-series templates). ERS-HUB-1 / SEQ-BUILD-1 assemble sequences from it.
 *
 *   - A row is one STEP with its subject / copy / role variants, exactly as imported (`status` IMPORTED_EXACT,
 *     `source_hash` = sha256 of the exact source block). Imported content is IMMUTABLE here (hook below); an edit is a
 *     NEW row (`supersedes` → the original, `version` + 1), so the original always stays.
 *   - It is NOT a sending surface: sending uses crm-email-templates, where one chosen variant is materialised per step
 *     (hash-approved, linted). The engine, outbox and hash-approval are untouched. An E2 SKELETON row is never sendable.
 *   - `approval_recommended` is the contract's mode; `approval_mode` is the owner's effective default for sequences
 *     built from it (AUTO, owner ruling 2026-10-08). Changing it is admin + step-up with a written reason, audited; any admin may set any mode (owner policy, no floor in code).
 *
 * Written only by the importer and the library settings actions (trusted server code); the API is read-only. Audited.
 */
export const LIBRARY_PROGRAMS = ['E1.1', 'E1.2', 'E1.3', 'E1.4', 'E2', 'T-series', 'CUSTOM'] as const
export type LibraryProgram = (typeof LIBRARY_PROGRAMS)[number]
export const LIBRARY_STATUS = ['IMPORTED_EXACT', 'SKELETON', 'LINKED', 'EDITED'] as const
export const LIBRARY_STEP_TYPE = ['EMAIL', 'TASK'] as const
export const LIBRARY_APPROVAL = ['REQUIRED', 'RULE_BASED', 'AUTO'] as const
export const LIBRARY_LINT_BADGE = ['PASS', 'NOTES', 'REVIEW', 'BLOCKED', 'NOT_RUN'] as const

/** Fields that make up the imported wording and its provenance: frozen once a row is IMPORTED_EXACT / SKELETON / LINKED. */
const FROZEN = [
  'key',
  'program',
  'sequence_code',
  'step',
  'step_code',
  'type',
  'timing',
  'subject_variants',
  'copy_variants',
  'role_variants',
  'merge_fields',
  'placeholders',
  'evidence_fields',
  'stop_conditions',
  'pause_conditions',
  'reply_handling',
  'task_creation',
  'source_ref',
  'source_line',
  'source_hash',
  'source_file_sha256',
  'status',
  'sendable',
  'approval_recommended',
  'linked_template',
] as const

const rules: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  const d = data as Record<string, unknown>
  if (operation === 'create') {
    // A skeleton is never sendable, whatever else the row says.
    if (d.status === 'SKELETON') d.sendable = false
    return data
  }
  const orig = (originalDoc ?? {}) as Record<string, unknown>
  if (orig.status === 'IMPORTED_EXACT' || orig.status === 'SKELETON' || orig.status === 'LINKED') {
    const changed = FROZEN.filter((k) => k in d && JSON.stringify(d[k]) !== JSON.stringify(orig[k]))
    if (changed.length)
      throw new CrmInvariantError(
        'LIBRARY_COPY_IMMUTABLE',
        'Imported library copy cannot change. Make an edited copy instead; the original stays.',
      )
  }
  if (orig.status === 'SKELETON' || d.status === 'SKELETON') d.sendable = false
  return data
}

export const CrmEmailLibrary: CollectionConfig = crmCollection(
  {
    slug: 'crm-email-library',
    labels: { singular: 'Library email', plural: 'Email library' },
    access: { read: crmUser, create: noOne, update: noOne, delete: noOne },
    admin: {
      useAsTitle: 'key',
      description: 'Every written Email Revenue email. Browse it in the CRM: Email Revenue → Library.',
      defaultColumns: ['key', 'program', 'sequence_code', 'step', 'type', 'status', 'lint_badge'],
    },
    hooks: { beforeChange: [rules] },
    fields: [
      {
        name: 'key',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        maxLength: 160,
        admin: { description: 'program|sequence|step — stable identity of the row.' },
      },
      { name: 'program', type: 'select', required: true, index: true, options: options(LIBRARY_PROGRAMS) },
      { name: 'sequence_code', type: 'text', required: true, index: true, maxLength: 96 },
      { name: 'sequence_label', type: 'text', required: true, maxLength: 160 },
      { name: 'step', type: 'number', required: true },
      { name: 'step_code', type: 'text', required: true, maxLength: 96 },
      { name: 'type', type: 'select', required: true, options: options(LIBRARY_STEP_TYPE) },
      {
        name: 'timing',
        type: 'text',
        maxLength: 240,
        admin: { description: 'The contract timing text, as written.' },
      },
      { name: 'subject_variants', type: 'json' },
      { name: 'copy_variants', type: 'json' },
      { name: 'role_variants', type: 'json' },
      { name: 'merge_fields', type: 'json', admin: { description: 'Names used in the copy.' } },
      {
        name: 'missing_merge_fields',
        type: 'json',
        admin: { description: 'Names the template engine cannot fill yet (a gap, never invented).' },
      },
      { name: 'placeholders', type: 'json' },
      { name: 'evidence_fields', type: 'json' },
      { name: 'stop_conditions', type: 'json' },
      { name: 'pause_conditions', type: 'json' },
      { name: 'reply_handling', type: 'textarea', maxLength: 4000 },
      { name: 'task_creation', type: 'textarea', maxLength: 4000 },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'IMPORTED_EXACT',
        index: true,
        options: options(LIBRARY_STATUS),
      },
      {
        name: 'sendable',
        type: 'checkbox',
        defaultValue: true,
        admin: { description: 'False for E2 skeletons: they cannot be sent or activated.' },
      },
      { name: 'version', type: 'number', required: true, defaultValue: 1 },
      {
        name: 'supersedes',
        type: 'relationship',
        relationTo: 'crm-email-library',
        admin: { description: 'The imported original this edited copy replaces.' },
      },
      {
        name: 'approval_recommended',
        type: 'select',
        required: true,
        defaultValue: 'REQUIRED',
        options: options(LIBRARY_APPROVAL),
        admin: { description: 'The contract’s mode.' },
      },
      {
        name: 'approval_mode',
        type: 'select',
        required: true,
        defaultValue: 'AUTO',
        index: true,
        options: options(LIBRARY_APPROVAL),
        admin: {
          description:
            'Effective default for sequences built from this email (owner ruling 2026-10-08: AUTO).',
        },
      },
      {
        name: 'approval_reason',
        type: 'text',
        maxLength: 300,
        admin: { description: 'Why an admin last changed the approval mode.' },
      },
      { name: 'approval_changed_at', type: 'date' },
      userRelation('approval_changed_by', 'Who last changed the approval mode.'),
      { name: 'source_ref', type: 'text', maxLength: 240 },
      { name: 'source_line', type: 'number' },
      {
        name: 'source_hash',
        type: 'text',
        maxLength: 64,
        index: true,
        admin: { description: 'sha256 of the exact source block.' },
      },
      { name: 'source_file_sha256', type: 'text', maxLength: 64 },
      {
        name: 'linked_template',
        type: 'relationship',
        relationTo: 'crm-email-templates',
        admin: {
          description:
            'T-series: the existing template this row points at. Its text is never copied or changed.',
        },
      },
      {
        name: 'lint',
        type: 'json',
        admin: { description: 'Copy-check result per variant (rule set, findings, rules not evaluated).' },
      },
      {
        name: 'lint_badge',
        type: 'select',
        required: true,
        defaultValue: 'NOT_RUN',
        index: true,
        options: options(LIBRARY_LINT_BADGE),
      },
      { name: 'lint_rule_set', type: 'text', maxLength: 64 },
      { name: 'lint_run_at', type: 'date' },
      {
        name: 'flags',
        type: 'json',
        admin: { description: 'Owner flags shown on the row (scope, phone/address, sign-off note).' },
      },
    ],
  },
  { deleteAlternative: 'Library rows are kept; make an edited copy instead.' },
)
