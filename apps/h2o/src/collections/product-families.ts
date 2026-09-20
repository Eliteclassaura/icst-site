import type { CollectionConfig } from 'payload'
import { canReadContentDrafts, canWriteContent, isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'

/**
 * Product families — a manufacturer's product line.
 *
 * `manufacturer` is **required** here while `products.manufacturer` is not, and the asymmetry is
 * deliberate: a family is a manufacturer's line, so a family without a manufacturer is not a family. A
 * product whose brand is unidentified simply has no family until its brand is established.
 *
 * 111 families exist; only 12 have more than one member, so most products are standalone today.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[productFamilies]
 */
export const ProductFamilies: CollectionConfig = {
  slug: 'product-families',
  admin: { useAsTitle: 'name', group: 'H2O catalog', defaultColumns: ['name', 'manufacturer', 'category'] },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'manufacturer', type: 'relationship', relationTo: 'manufacturers', required: true },
    { name: 'category', type: 'relationship', relationTo: 'product-categories' },
    { name: 'members', type: 'relationship', relationTo: 'products', hasMany: true },
    {
      name: 'narrative',
      type: 'group',
      fields: [{ name: 'summary', type: 'richText', localized: true }],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'description', type: 'textarea', localized: true },
        { name: 'canonical', type: 'text' },
        { name: 'robots', type: 'select', options: ['index', 'noindex'] },
      ],
    },
  ],
}
