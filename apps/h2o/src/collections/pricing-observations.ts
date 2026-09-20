import type { CollectionConfig } from 'payload'
import { isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'

/**
 * Pricing observations — INTERNAL_ONLY_NEVER_PUBLIC. 157 rows.
 *
 * These are observations of what other sellers publish, kept as evidence for a commercial decision ICS
 * has not made. The frozen rule is absolute: **an observation can never be rendered on a public page and
 * can never populate `public_price`.** Where prices exist at all they vary wildly by configuration and
 * condition — the same Metrix 5550 base model spans $1,073.63 to $2,399.00 — so an observed number is
 * not a price for anything until someone decides it is.
 *
 * Access is admin-only on every operation. That is the enforcement, not a note asking people to remember;
 * and it is fail-closed rather than a new access grant, which 2A.2 is not authorized to make.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[pricingObservations], access + rule
 */
export const PricingObservations: CollectionConfig = {
  slug: 'pricing-observations',
  admin: {
    useAsTitle: 'seller',
    group: 'H2O internal',
    description: 'Internal only. Never rendered publicly; never a source for public_price.',
    defaultColumns: ['seller', 'observation_type', 'product', 'observed_date'],
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    {
      name: 'observation_type',
      type: 'select',
      required: true,
      options: [
        'THIRD_PARTY_OBSERVED_PRICE',
        'THIRD_PARTY_NO_PUBLIC_PRICE',
        'HISTORICAL_ICS_SITE_VALUE',
        'ICS_INTERNAL_TARGET_PRICE',
      ],
      admin: {
        description:
          'THIRD_PARTY_NO_PUBLIC_PRICE is a real observation: a competitor hiding a price is evidence about the market.',
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      admin: {
        description: 'Optional. An observation may reference a competitor product with no H2O record.',
      },
    },
    { name: 'seller', type: 'text' },
    { name: 'source_url', type: 'text' },
    { name: 'observed_date', type: 'date' },
    { name: 'exact_model', type: 'text' },
    {
      name: 'match_confidence',
      type: 'select',
      options: [
        'EXACT_SAME_RECORD',
        'EXACT_MODEL_MATCH',
        'PARTIAL_FAMILY_MATCH_NOT_EXACT_CONFIGURATION',
        'NOT_ESTABLISHED',
      ],
    },
    { name: 'amount', type: 'number' },
    { name: 'currency', type: 'text' },
    { name: 'condition', type: 'text' },
    { name: 'configuration_or_options', type: 'text' },
    { name: 'stock_availability', type: 'text' },
    { name: 'shipping_or_freight', type: 'text' },
    { name: 'territory', type: 'text' },
    { name: 'notes', type: 'textarea' },
  ],
}
