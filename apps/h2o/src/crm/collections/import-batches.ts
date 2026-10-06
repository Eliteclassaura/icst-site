import type { CollectionConfig } from 'payload'
import { crmAdmin, noOne } from '../access'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { writeOnce } from '../guards'
import { options } from '../vocabulary'

/**
 * Wave 1 W1-3: one row per applied CSV import. A dry run writes nothing, so it never creates a batch.
 *
 * The row is the batch's identity (`canonical_id` is stamped on every record the batch creates, in
 * `provenance.import_batch_id`) and its outcome. It holds **no personal data**: the file is represented by its
 * SHA-256, the mapping by target field names and column positions, the outcome by counts, and fills by record id
 * plus field names. Values never land here (or in the audit log). Undo archives what the batch created and
 * reverts fills nobody has touched since; it deletes nothing. Admin-only, end to end.
 */
export const IMPORT_BATCH_STATUS = ['APPLIED', 'UNDONE'] as const
export const IMPORT_ENTITY = ['CONTACTS'] as const

export const CrmImportBatches: CollectionConfig = crmCollection(
  {
    slug: 'crm-import-batches',
    labels: { singular: 'Import batch', plural: 'Import batches' },
    access: { read: crmAdmin, create: crmAdmin, update: crmAdmin, delete: noOne },
    admin: {
      useAsTitle: 'canonical_id',
      description: 'Applied CSV imports (Wave 1). Counts and ids only; undo archives, never deletes.',
      defaultColumns: ['createdAt', 'entity', 'status', 'row_count', 'applied_by'],
    },
    hooks: {
      beforeChange: [writeOnce('crm-import-batches', ['entity', 'file_sha256', 'row_count', 'mapping', 'options', 'counts', 'applied_by', 'source_label', 'basis'])],
    },
    fields: [
      { name: 'entity', type: 'select', required: true, defaultValue: 'CONTACTS', options: options(IMPORT_ENTITY), index: true },
      { name: 'status', type: 'select', required: true, defaultValue: 'APPLIED', options: options(IMPORT_BATCH_STATUS), index: true },
      { name: 'file_sha256', type: 'text', required: true, index: true, admin: { description: 'Identifies the file without storing it.' } },
      { name: 'row_count', type: 'number', required: true },
      { name: 'mapping', type: 'json', required: true, admin: { description: 'Target field → column position. No header text, no values.' } },
      { name: 'options', type: 'json' },
      {
        name: 'source_label',
        type: 'text',
        admin: { description: 'Where the file came from, e.g. "email-IQ export 2026-07-14". No personal data.' },
      },
      {
        name: 'basis',
        type: 'text',
        admin: { description: 'Why the records may be held, e.g. "owner-attested existing customers (2026-10-05)".' },
      },
      { name: 'counts', type: 'json', required: true, admin: { description: 'Outcome counts only.' } },
      { name: 'fills', type: 'json', admin: { description: 'Existing contacts this batch filled: id + field names (for undo).' } },
      userRelation('applied_by', 'The admin who applied the batch.'),
      { name: 'applied_at', type: 'date' },
      userRelation('undone_by', 'The admin who undid the batch.'),
      { name: 'undone_at', type: 'date' },
      { name: 'undo_counts', type: 'json' },
      { name: 'undo_note', type: 'textarea' },
    ],
  },
  { deleteAlternative: 'Undo the batch instead.' },
)
