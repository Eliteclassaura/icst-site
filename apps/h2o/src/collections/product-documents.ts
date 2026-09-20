import type { CollectionConfig } from 'payload'
import { canReadContentDrafts, canWriteContent, isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'

/**
 * Product documents — the logical technical-literature record. 137 of them.
 *
 * A logical document is not its bytes. 143 physical PDFs reduce to 119 distinct binaries, and 137 logical
 * documents reference those binaries — so `sha256` here is **required and not unique**. It records which
 * bytes this record was built from, which is what proves an asset was not silently swapped; it is not an
 * identity key, and making it one would collapse 137 records into 119 and destroy logical documents the
 * redirect map still points at.
 *
 * 72 of the 137 carry a `*_REVIEW_REQUIRED` type: the classification itself is unverified for more than
 * half the library, and `UNCLASSIFIED_REVIEW_REQUIRED` is the honest default rather than a guess.
 *
 * 43 documents are linked to no product. They are not discarded — a legitimate technical asset is not
 * made illegitimate by an incomplete product record — so nothing here requires a product relation.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[productDocuments]
 */
export const ProductDocuments: CollectionConfig = {
  slug: 'product-documents',
  admin: {
    useAsTitle: 'title',
    group: 'H2O catalog',
    defaultColumns: ['title', 'document_type', 'manufacturer', 'rights_status'],
  },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'document_type',
      type: 'select',
      options: [
        'MANUAL_OR_INSTALLATION',
        'DATASHEET_OR_SPECIFICATION',
        'CATALOG',
        'BROCHURE',
        'FORM_OR_DATA_SHEET',
        'CERTIFICATE_OR_CREDENTIAL',
        'EDUCATIONAL_REFERENCE',
        'QUOTATION_HISTORICAL',
        'UNCLASSIFIED_REVIEW_REQUIRED',
      ],
    },
    { name: 'manufacturer', type: 'relationship', relationTo: 'manufacturers' },
    {
      name: 'model_association',
      type: 'text',
      admin: {
        description: 'The model this document covers, as the document states it. Not a verified identifier.',
      },
    },
    {
      name: 'file',
      type: 'upload',
      relationTo: 'product-document-files',
      required: true,
      admin: { description: 'The canonical stored binary. Byte-identical documents share one asset record.' },
    },
    {
      name: 'sha256',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'Content hash of the bytes this record was built from. NOT unique: 24 byte-identical duplicates exist and remain distinct logical documents.',
      },
    },
    { name: 'bytes', type: 'number' },
    { name: 'version_or_date', type: 'text' },
    { name: 'language', type: 'text' },
    {
      name: 'rights_status',
      type: 'select',
      options: ['ICS_OWNED', 'MANUFACTURER_PERMITTED', 'REVIEW_RIGHTS', 'LINK_ONLY'],
      admin: {
        description:
          'Governs hosting. ICS_OWNED and MANUFACTURER_PERMITTED may be hosted; REVIEW_RIGHTS is held; LINK_ONLY links out.',
      },
    },
    {
      name: 'legacy_url',
      type: 'text',
      admin: {
        description:
          'The legacy document URL. Preserved or redirected — a 404 on a manual is a lost enquiry.',
      },
    },
    { name: 'indexable', type: 'checkbox' },
    { name: 'canonical', type: 'text' },
  ],
}
