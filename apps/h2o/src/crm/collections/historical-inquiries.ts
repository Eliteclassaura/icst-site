import type { CollectionConfig, FieldHook } from 'payload'
import { crmCollection } from '../collection'
import { CrmInvariantError } from '../guards'
import { HISTORICAL_INQUIRY_SOURCE, HISTORICAL_INQUIRY_STATE, options, RECORD_STATE } from '../vocabulary'

/**
 * IMPORT-TYPEFORM-1 (owner, CT 2026-10-08): quote requests received before the CRM, imported read-only from the
 * Typeform leads sheet. A past request is history, not work:
 *   - its own collection, NOT crm-rfqs, so no RFQ creation hook runs: no first-response task, no sales alert, no T1
 *     acknowledgement, no RFQ number, and it is never counted in any RFQ queue or the overview's open work;
 *   - written only by the server import (no create or update through the API or the admin);
 *   - one row per Typeform response: `typeform_token` is UNIQUE in the database, so a re-run or the post-DNS delta
 *     never duplicates one, and a token that comes back with different content is reported, never overwritten;
 *   - the uploaded-file link is kept as text only: https on the Typeform host, never fetched, previewed or logged.
 */
export const TYPEFORM_UPLOAD_HOSTS = ['api.typeform.com'] as const
export function safeUploadUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v.length > 500) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
    return (TYPEFORM_UPLOAD_HOSTS as readonly string[]).includes(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}
const uploadUrlOnly: FieldHook = ({ value }) => {
  if (value === null || value === undefined || value === '') return null
  const safe = safeUploadUrl(String(value))
  if (!safe) throw new CrmInvariantError('UPLOAD_URL_NOT_ALLOWED', 'A file link must be https on the Typeform host.')
  return safe
}
const never = () => false

export const CrmHistoricalInquiries: CollectionConfig = crmCollection(
  {
    slug: 'crm-historical-inquiries',
    disableDuplicate: true,
    labels: { singular: 'Past quote request', plural: 'Past quote requests' },
    admin: {
      useAsTitle: 'canonical_id',
      defaultColumns: ['submitted_at', 'contact', 'interest', 'part', 'destination_country', 'record_state'],
      description: 'Quote requests received before the CRM (imported, read-only). Not in any queue; no tasks, alerts or emails.',
    },
    access: { create: never, update: never },
    fields: [
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', required: true, index: true },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      { name: 'source', type: 'select', required: true, options: options(HISTORICAL_INQUIRY_SOURCE), defaultValue: 'TYPEFORM_LEGACY' },
      { name: 'state', type: 'select', required: true, options: options(HISTORICAL_INQUIRY_STATE), defaultValue: 'HISTORICAL_CLOSED_UNKNOWN' },
      { name: 'record_state', type: 'select', required: true, options: options(RECORD_STATE), defaultValue: 'ACTIVE', index: true },
      { name: 'typeform_token', type: 'text', required: true, unique: true, index: true, maxLength: 64 },
      { name: 'content_sha256', type: 'text', required: true, maxLength: 64, admin: { description: 'Hash of the imported answers: a re-import with different content is reported, never overwritten.' } },
      { name: 'submitted_at', type: 'date', required: true, index: true },
      { name: 'submitted_zone', type: 'text', required: true, maxLength: 64 },
      // The import caps these at INQUIRY_LIMITS in code points (typeform.ts); Payload's maxLength counts UTF-16 units,
      // so it is set to twice the cap (the worst case, every character outside the BMP).
      { name: 'interest', type: 'text', maxLength: 1000 },
      { name: 'part', type: 'text', maxLength: 400 },
      { name: 'details', type: 'textarea', maxLength: 8000 },
      { name: 'urgent', type: 'select', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }, { label: 'Not answered', value: 'UNKNOWN' }], defaultValue: 'UNKNOWN' },
      { name: 'destination_country', type: 'text', maxLength: 240 },
      { name: 'notes', type: 'textarea', maxLength: 8000 },
      { name: 'upload_url', type: 'text', maxLength: 500, hooks: { beforeValidate: [uploadUrlOnly] }, admin: { description: 'Link to the file the customer uploaded (Typeform). Not fetched; it may need a Typeform sign-in or have expired.' } },
      { name: 'cut_fields', type: 'json', admin: { description: 'Fields cut to their limit on import (names only).' } },
      { name: 'file_sha256', type: 'text', required: true, index: true, maxLength: 64 },
      { name: 'import_batch', type: 'relationship', relationTo: 'crm-import-batches', index: true },
    ],
  },
  { deleteAlternative: 'Undo the import instead (archives the records).' },
)
