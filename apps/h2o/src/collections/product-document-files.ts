import type { CollectionConfig } from 'payload'
import path from 'node:path'
import { canReadContentDrafts, canWriteContent, isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'

/**
 * Document binaries — the canonical stored asset behind a logical document record.
 *
 * This collection is the referent of `productDocuments.file`, which the frozen contract declares as
 * `{ type: 'upload', required: true }` without naming its target. An upload field needs an upload
 * collection, so the target is named here rather than left implicit.
 *
 * It also carries a rule the two frozen inputs state from opposite directions and which cannot both be
 * satisfied by one collection:
 *
 *   - Control Tower: "Do not flatten 137 logical documents into 119 records solely because binary
 *     hashes match."
 *   - DOCUMENT_LIBRARY_CONTRACT rule 6: "Byte-identical duplicates collapse to one canonical asset,
 *     with redirects from the others."
 *
 * 143 physical PDFs, 119 distinct by content hash, 24 byte-identical duplicates, 137 logical documents.
 * Both statements hold at once only if logical identity and binary identity are separate records: 137
 * documents referencing 119 assets. `sha256` is unique **here**, on the binary, and deliberately not
 * unique on the logical record.
 */
export const ProductDocumentFiles = (mediaDir: string): CollectionConfig => ({
  slug: 'product-document-files',
  admin: { useAsTitle: 'filename', group: 'H2O catalog', defaultColumns: ['filename', 'sha256', 'filesize'] },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  upload: {
    staticDir: path.join(mediaDir, 'product-document-files'),
    mimeTypes: ['application/pdf'],
    // No derivative generation. Every byte stored here is a source asset, not a rendition.
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    {
      name: 'sha256',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description:
          'Content hash of the stored bytes. Unique because this record IS the binary; 119 distinct values back 137 logical documents.',
      },
    },
  ],
})
