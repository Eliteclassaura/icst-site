import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmCollection, stampProvenance } from '../collection'
import { provenanceGroup } from '../fields'
import { CrmInvariantError, merged, relId, writeOnce } from '../guards'
import { PRODUCT_RESOLUTION_STATE, QUANTITY_STATUS, options } from '../vocabulary'

type Doc = Record<string, unknown>

/**
 * Product context is stored **as the source supplied it** (`*_source` fields). The optional `product`
 * relation is set only when the supplied slug equals an H2O product's slug exactly — never by fuzzy match,
 * title similarity or family. The public mount's `product_id` is a legacy route number, not a Payload id,
 * so it is never used to resolve a product.
 *
 * There is no price field on this collection. Quantity is KNOWN only when supplied; nothing is inferred.
 */
const productResolution: CollectionBeforeChangeHook = async ({ data: incoming, originalDoc, req }) => {
  const data = merged(incoming, originalDoc) as Doc
  const productId = relId(data.product)
  const slug = typeof data.product_slug_source === 'string' ? data.product_slug_source : null
  if (productId) {
    const product = await req.payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
      overrideAccess: true,
      req,
      select: { slug: true },
    })
    if (!slug || (product as Doc).slug !== slug)
      throw new CrmInvariantError(
        'RFQ_ITEM_PRODUCT_NOT_EXACT',
        'A product is linked only when its slug equals the submitted product slug exactly.',
      )
    incoming.product_resolution_state = 'RESOLVED_EXACT_SLUG'
  } else if (!slug && !data.product_id_source) incoming.product_resolution_state = 'NOT_SUPPLIED'
  else if (data.product_resolution_state !== 'INVALID_CONTEXT')
    incoming.product_resolution_state = 'UNRESOLVED'
  const qty = data.requested_quantity
  if (qty !== null && qty !== undefined) {
    if (typeof qty !== 'number' || !(qty > 0))
      throw new CrmInvariantError(
        'RFQ_ITEM_QUANTITY_INVALID',
        'A requested quantity is a positive number, or empty when not supplied.',
      )
    incoming.quantity_status = 'KNOWN'
  } else incoming.quantity_status = 'NOT_SUPPLIED'
  return incoming
}

export const CrmRfqItems: CollectionConfig = crmCollection(
  {
    slug: 'crm-rfq-items',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'RFQ item', plural: 'RFQ items' },
    admin: {
      useAsTitle: 'canonical_id',
      description:
        'What was asked for, as supplied. No price, SKU, manufacturer or specification is inferred.',
      defaultColumns: [
        'rfq',
        'line_no',
        'product_slug_source',
        'product',
        'product_resolution_state',
        'requested_quantity',
      ],
    },
    indexes: [{ fields: ['rfq', 'line_no'], unique: true }],
    hooks: {
      beforeValidate: [stampProvenance],
      beforeChange: [
        writeOnce('crm-rfq-items', [
          'rfq',
          'product_id_source',
          'product_slug_source',
          'product_path_source',
          'product_title_source',
        ]),
        productResolution,
      ],
    },
    fields: [
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', required: true, index: true },
      { name: 'line_no', type: 'number', required: true, min: 1, defaultValue: 1 },
      {
        name: 'product_id_source',
        type: 'text',
        admin: { readOnly: true, description: 'As supplied by the page context (a legacy route number).' },
      },
      { name: 'product_slug_source', type: 'text', index: true, admin: { readOnly: true } },
      { name: 'product_path_source', type: 'text', admin: { readOnly: true } },
      { name: 'product_title_source', type: 'text', admin: { readOnly: true } },
      {
        name: 'product',
        type: 'relationship',
        relationTo: 'products',
        admin: { description: 'Only an exact slug match.' },
      },
      {
        name: 'product_resolution_state',
        type: 'select',
        required: true,
        defaultValue: 'NOT_SUPPLIED',
        options: options(PRODUCT_RESOLUTION_STATE),
      },
      { name: 'requested_quantity', type: 'number', admin: { description: 'Only when supplied.' } },
      {
        name: 'quantity_status',
        type: 'select',
        required: true,
        defaultValue: 'NOT_SUPPLIED',
        options: options(QUANTITY_STATUS),
        admin: { readOnly: true },
      },
      { name: 'requested_scope', type: 'text' },
      { name: 'customer_requirements', type: 'textarea' },
      provenanceGroup(),
    ],
  },
  { deleteAlternative: 'RFQ items are part of the submitted record.' },
)
