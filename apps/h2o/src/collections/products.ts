import type { CollectionConfig } from 'payload'
import {
  adminFieldOnly,
  canReadContentDrafts,
  canWriteContent,
  isAdmin,
} from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'
import { requireManufacturerEvidence } from '../hooks/catalog-integrity'
import {
  PROMOTING_EVIDENCE_STATES,
  PROMOTING_IDENTIFIER_STATES,
  provenanceFieldWrite,
  truthPromotionWrite,
} from '../access/index'

/** The 30 completeness checks, verbatim from P4/PRODUCT_COMPLETENESS_GATE.json. */
const COMPLETENESS_CHECKS = [
  'PRODUCT_IDENTITY',
  'MANUFACTURER',
  'MODEL',
  'FAMILY',
  'IDENTIFIERS',
  'TECHNICAL_FACT_PROVENANCE',
  'UNIQUE_USEFUL_CONTENT',
  'SPECIFICATIONS',
  'APPLICATIONS',
  'COMPATIBILITY',
  'PRIMARY_IMAGE',
  'IMAGE_EXACTNESS',
  'ADDITIONAL_MEDIA',
  'DOCUMENTS',
  'DOCUMENT_URL_MIGRATION',
  'INTERNAL_LINKS',
  'RELATED_SERVICES',
  'TITLE_H1_META',
  'CANONICAL',
  'INDEXABILITY',
  'STRUCTURED_DATA',
  'LOCALE_HREFLANG',
  'RFQ_CTA',
  'CHAT_CONTEXT',
  'CRM_ROUTE',
  'ATTRIBUTION',
  'MOBILE',
  'ACCESSIBILITY',
  'PERFORMANCE',
  'TRUTH_REVIEW',
]

/** The five permitted completeness states. There is no sixth, and in particular no "probably fine". */
const COMPLETENESS_STATES = ['PASS', 'NOT_APPLICABLE', 'UNKNOWN', 'REVIEW_REQUIRED', 'BLOCKED']

/** The seven-token truth vocabulary, shared with productEvidence.evidence_state. */
const TRUTH_STATES = [
  'VERIFIED_MANUFACTURER',
  'VERIFIED_ICS',
  'LEGACY_ICS',
  'AUTHORIZED_DISTRIBUTOR',
  'THIRD_PARTY_SUPPORTING',
  'AI_DRAFT_UNVERIFIED',
  'UNKNOWN',
]

/**
 * Products — the catalog record. 210 of them at import, all of them BLOCKED today.
 *
 * That last part is the design constraint. This is not a schema for a finished catalog; it is a schema
 * for a catalog that mostly does not know things yet, and whose value depends on saying so precisely.
 * 0 verified MPNs. 0 GTINs. 117 unknown model designations. 17 products with no manufacturer term at all.
 * Every field below that looks redundant is there because the alternative is a blank that reads as a fact.
 *
 * Four rules are enforced here rather than documented:
 *
 * **The manufacturer relation is nullable and UNKNOWN is a complete answer.** No placeholder
 * "Unknown Manufacturer" entity is ever created. `requireManufacturerEvidence` makes the null legal only
 * when the record says why it is null.
 *
 * **`commerce_mode: REVIEW` is first-class.** It means no commerce mode has been determined, which is a
 * different statement from QUOTE_ONLY. The default applies to newly authored records only; a migrated
 * record carries its P3 value verbatim and the 37 REVIEW rows stay REVIEW. Collapsing them would assert
 * a commercial position the evidence does not support.
 *
 * **Every specification row carries evidence.** `specifications[].evidence` is required, so a spec row
 * with no provenance cannot be saved. The 1,961 legacy prose bullets migrate as UNVERIFIED evidence
 * pointing at the legacy record; they are not silently normalised into name/value/unit.
 *
 * **`public_price` is admin-scoped and null unless ICS authorised it.** Field-level read and update are
 * admin-only. Nothing in this collection derives a price, and `pricing-observations` can never populate it.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[products], invariants, truth_state_mapping
 */
export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
    group: 'H2O catalog',
    defaultColumns: ['title', 'manufacturer', 'commerce_mode', 'truth_status', 'editorial_state'],
  },
  versions: { drafts: true, maxPerDoc: 25 },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
    readVersions: canReadContentDrafts,
  },
  hooks: {
    beforeChange: [requireManufacturerEvidence],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'Manufacturer plus model designation. Never invented.' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Legacy product slug, preserved. See legacy_urls for the paths it answered.' },
    },
    {
      name: 'manufacturer',
      type: 'relationship',
      relationTo: 'manufacturers',
      admin: {
        description:
          'Nullable by design. 17 of 210 products carry no brand term; the relation stays null and manufacturer_evidence carries the reason.',
      },
    },
    {
      name: 'manufacturer_evidence',
      type: 'group',
      fields: [
        {
          name: 'state',
          type: 'select',
          required: true,
          defaultValue: 'UNKNOWN',
          // Value-sensitive truth authority (2A.3 R1). The same mixed enum as
          // `product-evidence.evidence_state`, and the same split: `UNKNOWN` and `LEGACY_ICS` are what
          // 210 of 210 products honestly carry and editors must be able to write them; the three
          // verifying states are reviewer work. `requireManufacturerEvidence` in
          // `../hooks/catalog-integrity` already governs the *shape* of this group — a null relation
          // demands UNKNOWN with a reason — but it never asked who was speaking. This does.
          access: {
            create: truthPromotionWrite('state', PROMOTING_EVIDENCE_STATES),
            update: truthPromotionWrite('state', PROMOTING_EVIDENCE_STATES),
          },
          options: TRUTH_STATES,
        },
        {
          name: 'estate_brand_term',
          type: 'text',
          admin: {
            description:
              'The brand term as the legacy catalog wrote it, kept even when the relation is null.',
          },
        },
        { name: 'evidence', type: 'relationship', relationTo: 'product-evidence', hasMany: true },
        {
          name: 'unknown_reason',
          type: 'select',
          options: [
            'NO_BRAND_TERM_IN_ESTATE',
            'BRAND_TERM_AMBIGUOUS',
            'MULTIPLE_BRANDS_ON_ONE_RECORD',
            'RESEARCH_PENDING',
            'NOT_APPLICABLE',
          ],
          admin: {
            description:
              'Required when state is UNKNOWN. An unexplained UNKNOWN cannot be queued for research.',
          },
        },
      ],
    },
    { name: 'family', type: 'relationship', relationTo: 'product-families' },
    {
      name: 'model_designation',
      type: 'text',
      admin: {
        description:
          'The manufacturer designation as the manufacturer publishes it. 93 were parsed from ICS prose and none is manufacturer-verified; absent means unknown, never guessed.',
      },
    },
    {
      name: 'identifiers',
      type: 'group',
      fields: [
        {
          name: 'mpn',
          type: 'text',
          admin: {
            description: 'Emit only on an exact-model match against a manufacturer source. 0 of 210 today.',
          },
        },
        {
          name: 'gtin',
          type: 'text',
          admin: {
            description: 'Emit only when assigned by the manufacturer or brand owner. 0 of 210 today.',
          },
        },
        {
          name: 'ics_sku',
          type: 'text',
          admin: {
            description:
              'ICS-assigned codes only. The 16 twelve-character hex tokens in the estate are import artefacts and are not migrated here.',
          },
        },
        {
          name: 'identifier_state',
          type: 'select',
          required: true,
          defaultValue: 'UNKNOWN',
          // Value-sensitive truth authority (2A.3 R1). `ABSENT`, `UNKNOWN` and
          // `AI_EXTRACTED_UNCONFIRMED` are all answers an editor may legitimately record — and
          // `AI_EXTRACTED_UNCONFIRMED` is the honest state for an extracted identifier nobody has
          // checked. The two `VERIFIED_*` values are the promotion, and the frozen security contract
          // requires "every promotion of an `AI_EXTRACTED_UNCONFIRMED` value" to be a reviewed,
          // audited event. MPN, GTIN and SKU are 0/210 today; this keeps the first one honest.
          access: {
            create: truthPromotionWrite('identifier_state', PROMOTING_IDENTIFIER_STATES),
            update: truthPromotionWrite('identifier_state', PROMOTING_IDENTIFIER_STATES),
          },
          options: ['VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'AI_EXTRACTED_UNCONFIRMED', 'ABSENT', 'UNKNOWN'],
          admin: {
            description:
              'ABSENT means the product genuinely has no assigned identifier. UNKNOWN means nobody has checked. They are different answers.',
          },
        },
      ],
    },
    {
      name: 'commerce_mode',
      type: 'select',
      required: true,
      defaultValue: 'QUOTE_ONLY',
      options: ['QUOTE_ONLY', 'FIXED_PRICE_PURCHASABLE', 'REVIEW'],
      admin: {
        description:
          'The default applies to newly authored records only. A migrated record carries its P3 value verbatim; the 37 REVIEW rows stay REVIEW.',
      },
    },
    {
      name: 'fixed_price_research_candidate',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'True for the 27 vibration-instrumentation records — the only class with observable third-party pricing, and the only class ICS has not published. Carries no pricing or publication authorisation.',
      },
    },
    {
      name: 'public_price',
      type: 'group',
      // Admin-scoped across creation as well as subsequent updates (2A.3 R1). The frozen contract is
      // unqualified — "nobody but an admin can set a price" — and `read`+`update` alone did not cover
      // the create path, so a product could have been born with a price. The group is optional with no
      // `defaultValue`, so a denied write simply leaves it unset, which is the post-migration assertion
      // the mapping contract already requires: `public_price` non-null = 0.
      //
      // No pricing semantics, default or schema changed here — this is the access correction only, and
      // no public selling price is authorized.
      access: { create: adminFieldOnly, read: adminFieldOnly, update: adminFieldOnly },
      admin: {
        description: 'Null unless ICS has explicitly authorised a public selling price for this product.',
      },
      fields: [
        { name: 'amount', type: 'number' },
        { name: 'currency', type: 'text' },
        { name: 'approved_by', type: 'text' },
        { name: 'approved_at', type: 'date' },
      ],
    },
    {
      name: 'narrative',
      type: 'group',
      fields: [
        { name: 'summary', type: 'richText', localized: true },
        { name: 'applications', type: 'richText', localized: true },
        { name: 'compatibility', type: 'richText', localized: true },
        { name: 'features', type: 'richText', localized: true },
        {
          name: 'faq',
          type: 'array',
          localized: true,
          fields: [
            { name: 'question', type: 'text', required: true },
            { name: 'answer', type: 'richText', required: true },
          ],
        },
      ],
    },
    {
      name: 'specifications',
      type: 'array',
      admin: {
        description:
          'Every row points at an evidence record. Two specs on one product can come from different sources with different confidence, and per-product provenance would lose that.',
      },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        { name: 'unit', type: 'text' },
        {
          name: 'evidence',
          type: 'relationship',
          relationTo: 'product-evidence',
          required: true,
          admin: { description: 'Required. A specification row with no provenance cannot be saved.' },
        },
      ],
    },
    {
      name: 'variants',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
      admin: {
        description:
          'Sibling models. 93 products are SEPARATE_INDEXABLE_MODEL — each is its own URL and its own record. This relation groups them; it does not collapse them.',
      },
    },
    { name: 'media', type: 'relationship', relationTo: 'product-media', hasMany: true },
    { name: 'documents', type: 'relationship', relationTo: 'product-documents', hasMany: true },
    { name: 'related_products', type: 'relationship', relationTo: 'products', hasMany: true },
    {
      name: 'related_services',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      admin: {
        description: 'Factory pages. The one relation the catalog makes into the shared content model.',
      },
    },
    {
      name: 'legacy_urls',
      type: 'array',
      admin: {
        description:
          '8 legacy product URLs already carry active 301s with recorded hits; the live site holds 73 redirects with 73,872 hits. These must survive migration.',
      },
      fields: [
        { name: 'path', type: 'text' },
        { name: 'redirect_type', type: 'select', options: ['301', '410', 'KEEP'] },
        { name: 'pre_existing_live_redirect', type: 'checkbox' },
      ],
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
    {
      name: 'locale_state',
      type: 'group',
      admin: {
        description:
          'The catalog is monolingual today: zero products sit in any translation group. Localisation is new work, not remediation.',
      },
      fields: [
        { name: 'source_locale', type: 'text', defaultValue: 'en' },
        {
          name: 'translations',
          type: 'array',
          fields: [
            { name: 'locale', type: 'text', required: true },
            { name: 'url', type: 'text' },
          ],
        },
        { name: 'hreflang_eligible', type: 'checkbox' },
      ],
    },
    {
      name: 'truth_status',
      type: 'select',
      required: true,
      defaultValue: 'LEGACY_ICS',
      options: TRUTH_STATES,
      // Truth-state authority (2A.3 R1), same rule and same reason as
      // `product-evidence.reviewer_status`. `editorial_state` immediately below is deliberately NOT
      // restricted: it is editorial workflow, not a claim about what is true, and the frozen contract
      // gives editors the content lane.
      //
      // `create` as well as `update`, and here the pairing is unusually clean: the field is `required`
      // with `defaultValue: 'LEGACY_ICS'`, so a denied create is discarded and the default substituted.
      // An editor can still create a product; it simply lands at `LEGACY_ICS` and can never arrive
      // `VERIFIED_*`. That is exactly blueprint invariant 3 — "truth mapping is one-way and
      // non-upgrading" — enforced by access rather than by hoping the caller omits the field.
      access: { create: provenanceFieldWrite, update: provenanceFieldWrite },
      admin: {
        description:
          'LEGACY_ICS names the source tier — legacy ICS content with traceable provenance. It says nothing about review; reviewer_status on the evidence records carries that.',
      },
    },
    {
      name: 'editorial_state',
      type: 'select',
      required: true,
      defaultValue: 'INCOMPLETE',
      options: [
        'INCOMPLETE',
        'RESEARCHING',
        'AI_DRAFT',
        'TECH_REVIEW',
        'SEO_REVIEW',
        'READY',
        'PUBLISHED',
        'RETIRED',
      ],
      admin: {
        description:
          'An inert state. The actions that move a record between states arrive with the reviewer workflow.',
      },
    },
    {
      name: 'completeness',
      type: 'group',
      admin: {
        description: 'Not a score. All 210 products are BLOCKED today, and that is the honest state.',
      },
      fields: [
        { name: 'state', type: 'select', options: COMPLETENESS_STATES },
        {
          name: 'checks',
          type: 'array',
          fields: [
            { name: 'check', type: 'select', required: true, options: COMPLETENESS_CHECKS },
            { name: 'state', type: 'select', required: true, options: COMPLETENESS_STATES },
            { name: 'note', type: 'textarea' },
          ],
        },
        { name: 'last_evaluated', type: 'date' },
      ],
    },
    { name: 'provenance_refs', type: 'relationship', relationTo: 'product-evidence', hasMany: true },
  ],
}
