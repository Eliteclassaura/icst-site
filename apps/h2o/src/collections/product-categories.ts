import type { CollectionConfig } from 'payload'
import { canReadContentDrafts, canWriteContent, isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'

/**
 * Product categories — the legacy `product_cat` taxonomy, imported honestly.
 *
 * Only 10 of the 59 legacy terms are clean: 9 are malformed, 18 duplicate a name, 22 are empty. `state`
 * records which, so a term can be migrated exactly as it was found and still be findable by whoever has
 * to decide what it should become.
 *
 * `slug` is deliberately **not** unique. Eighteen legacy terms duplicate a name, and a unique constraint
 * would force the import either to drop them or to rename them — either of which destroys a legacy term
 * the redirect map still points at. Uniqueness here is a review outcome, not an import precondition.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[productCategories]
 */
export const ProductCategories: CollectionConfig = {
  slug: 'product-categories',
  admin: { useAsTitle: 'name', group: 'H2O catalog', defaultColumns: ['name', 'slug', 'state'] },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Legacy term slug, preserved as written. Not unique: 18 legacy terms duplicate a name.',
      },
    },
    { name: 'parent', type: 'relationship', relationTo: 'product-categories' },
    {
      name: 'state',
      type: 'select',
      options: [
        'USABLE',
        'MALFORMED_TERM_REVIEW_REQUIRED',
        'DUPLICATE_NAME_REVIEW_REQUIRED',
        'EMPTY_TERM_REVIEW_REQUIRED',
      ],
      admin: { description: 'Condition of the legacy term. 10 of 59 are USABLE today.' },
    },
    {
      name: 'indexable',
      type: 'checkbox',
      admin: {
        description: 'Indexability decision. Absent means undecided, which is not the same as false.',
      },
    },
  ],
}
