import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { crmCollection } from '../collection'
import { CrmInvariantError, isServerContext, relId } from '../guards'
import { noOne } from '../access'

/**
 * CRM-ATTACH-1: one row per attached file. The bytes are NOT here: `storage_key` points into the private store
 * (`crm/attachments/store.ts`), and only the attachments routes read it.
 *
 *   - the record is one of four kinds (contact, account, opportunity, RFQ): `record_kind` says which relation is set,
 *     and exactly that one is set;
 *   - reading is for admins through the API; sales read files through the record-visibility route, never by listing;
 *   - writes come only from trusted server code (`context.crmServer`), through the attachments service;
 *   - a file is never edited or purged through the API. Deleting is soft: `deleted_at` and `deleted_by` are set, the row
 *     and the stored object stay for audit (a hard purge is a separate admin act, not in this scope).
 */

const KINDS = ['CONTACT', 'ACCOUNT', 'OPPORTUNITY', 'RFQ'] as const
const RELATION = { CONTACT: 'contact', ACCOUNT: 'account', OPPORTUNITY: 'opportunity', RFQ: 'rfq' } as const

/** Only the soft-delete fields may change after creation. Everything else is evidence. */
const MUTABLE_AFTER_CREATE = new Set(['deleted_at', 'deleted_by'])

const shape: CollectionBeforeChangeHook = ({ data, operation, originalDoc, context }) => {
  if (!data) return data
  const d = data as Record<string, unknown>
  if (!isServerContext(context)) throw new CrmInvariantError('ATTACHMENT_WRITE_SERVER_ONLY', 'Attachments are added and removed through the attachments service only.')
  if (operation === 'create') {
    const kind = d.record_kind as keyof typeof RELATION | undefined
    if (!kind || !(KINDS as readonly string[]).includes(kind)) throw new CrmInvariantError('ATTACHMENT_KIND_INVALID', 'An attachment belongs to a contact, account, deal or inquiry.')
    const set = KINDS.filter((k) => relId(d[RELATION[k]]))
    if (set.length !== 1 || set[0] !== kind) throw new CrmInvariantError('ATTACHMENT_RECORD_INVALID', 'An attachment belongs to exactly one record, of the kind it names.')
    return data
  }
  const before = (originalDoc ?? {}) as Record<string, unknown>
  for (const k of Object.keys(d)) {
    if (MUTABLE_AFTER_CREATE.has(k)) continue
    if (JSON.stringify(d[k] ?? null) !== JSON.stringify(before[k] ?? null)) throw new CrmInvariantError('ATTACHMENT_IMMUTABLE', `${k} cannot change after the file is attached.`)
  }
  return data
}

export const CrmAttachments: CollectionConfig = crmCollection(
  {
    slug: 'crm-attachments',
    labels: { singular: 'Attachment', plural: 'Attachments' },
    access: {
      // The API lists for admins only; sales reach a record's files through the visibility-checked route.
      read: ({ req }) => hasRole(req, ADMINS),
      create: noOne,
      update: noOne,
      delete: noOne,
    },
    admin: {
      useAsTitle: 'original_name',
      description: 'Files attached to a contact, account, deal or inquiry. The bytes are in private storage; open a file from its record.',
      defaultColumns: ['original_name', 'record_kind', 'size_bytes', 'uploaded_by', 'createdAt', 'deleted_at'],
    },
    hooks: { beforeChange: [shape] },
    fields: [
      { name: 'record_kind', type: 'select', required: true, options: [...KINDS], index: true },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', index: true },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      { name: 'opportunity', type: 'relationship', relationTo: 'crm-opportunities', index: true },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true },
      { name: 'original_name', type: 'text', required: true, maxLength: 180 },
      { name: 'extension', type: 'text', required: true, maxLength: 8 },
      { name: 'mime', type: 'text', required: true, maxLength: 100 },
      { name: 'size_bytes', type: 'number', required: true, min: 1 },
      { name: 'sha256', type: 'text', required: true, minLength: 64, maxLength: 64 },
      { name: 'storage_key', type: 'text', required: true, maxLength: 200, access: { read: () => false } },
      { name: 'note', type: 'textarea', maxLength: 500 },
      { name: 'uploaded_by', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      { name: 'deleted_at', type: 'date', index: true },
      { name: 'deleted_by', type: 'relationship', relationTo: 'users' },
    ],
  },
  { deleteAlternative: 'Remove the file from its record (Delete file). The removal is kept in the audit log.' },
)
