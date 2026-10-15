import type { CollectionConfig } from 'payload'
import { canReadContentDrafts, canWriteContent, isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'
import { PROMOTING_EVIDENCE_STATES, provenanceFieldWrite, truthPromotionWrite } from '../access/index'

/**
 * Product evidence — per-field provenance. 2,904 rows at import.
 *
 * This is the collection the rest of the catalog hangs off. Every specification row on a product points
 * at a record here, which is what makes "where did this number come from" answerable for any technical
 * claim on the site.
 *
 * `evidence_state` carries the same seven-token vocabulary as `products.truth_status`, and `LEGACY_ICS`
 * means only "legacy the company content with traceable provenance" — it says nothing about review. That is what
 * `reviewer_status` is for, and why the migration mapping is one-way: `LEGACY_ICS_UNVERIFIED` becomes
 * `LEGACY_ICS` **plus** `reviewer_status: UNREVIEWED`, never `VERIFIED_*`.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[productEvidence], truth_state_mapping
 */
export const ProductEvidence: CollectionConfig = {
  slug: 'product-evidence',
  admin: {
    useAsTitle: 'field',
    group: 'H2O catalog',
    defaultColumns: ['field', 'product', 'evidence_state', 'reviewer_status'],
  },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', required: true, index: true },
    {
      name: 'field',
      type: 'text',
      required: true,
      admin: { description: 'The product field this record is evidence for.' },
    },
    { name: 'value', type: 'text' },
    {
      name: 'evidence_state',
      type: 'select',
      required: true,
      // Value-sensitive truth authority (2A.3 R1). This enum is mixed: `LEGACY_ICS`,
      // `THIRD_PARTY_SUPPORTING`, `AI_DRAFT_UNVERIFIED` and `UNKNOWN` are ordinary source classification
      // and are most of what this catalog honestly contains, so an editor must be able to write them.
      // The other three assert verification, and the frozen contract names each: nothing may produce
      // `VERIFIED_ICS` or `VERIFIED_MANUFACTURER` without review (blueprint invariant 3), and
      // `AUTHORIZED_DISTRIBUTOR` "must be proven before it is set" (PRODUCT_SCHEMA).
      //
      // Restricting the whole field to admins was rejected: it is `required` with no `defaultValue`, so
      // a denied write fails validation and no editor could create an evidence row at all — while adding
      // nothing, because only the promoting values matter.
      access: {
        create: truthPromotionWrite('evidence_state', PROMOTING_EVIDENCE_STATES),
        update: truthPromotionWrite('evidence_state', PROMOTING_EVIDENCE_STATES),
      },
      options: [
        'VERIFIED_MANUFACTURER',
        'VERIFIED_ICS',
        'LEGACY_ICS',
        'AUTHORIZED_DISTRIBUTOR',
        'THIRD_PARTY_SUPPORTING',
        'AI_DRAFT_UNVERIFIED',
        'UNKNOWN',
      ],
      admin: {
        description:
          'AUTHORIZED_DISTRIBUTOR must be proven before it is set — it is an affiliation claim, not a source tier.',
      },
    },
    { name: 'source_url', type: 'text' },
    { name: 'source_title', type: 'text' },
    { name: 'source_tier', type: 'text' },
    {
      name: 'exact_model_match',
      type: 'select',
      options: ['EXACT', 'FAMILY', 'NOT_ESTABLISHED'],
      admin: { description: 'Whether the source documents this exact model or only its family.' },
    },
    { name: 'retrieved_date', type: 'date' },
    { name: 'source_document_version', type: 'text' },
    { name: 'ai_extracted', type: 'checkbox' },
    { name: 'confidence', type: 'select', options: ['HIGH', 'MEDIUM', 'LOW'] },
    {
      name: 'reviewer_status',
      type: 'select',
      options: ['UNREVIEWED', 'APPROVED', 'REJECTED'],
      // Truth-state authority (2A.3 R1). "Approve a truth state / promote evidence" is the one
      // capability the frozen RBAC table withholds from `editor` and grants to a reviewer role that does
      // not exist yet. Admins-only is the narrower reading; 2C widens it. Without this, an editor could
      // mark their own AI-extracted value APPROVED — precisely the separation the contract draws — and
      // without the `create` half, they could do it by creating the row already APPROVED.
      //
      // Optional with no `defaultValue`, so a denied write simply leaves it unset. An editor can still
      // create evidence rows; they just cannot arrive pre-approved.
      access: { create: provenanceFieldWrite, update: provenanceFieldWrite },
      admin: {
        description:
          'Carries the _UNVERIFIED half of the legacy truth token. A migrated row is UNREVIEWED; nothing in migration may set APPROVED.',
      },
    },
    { name: 'notes', type: 'textarea' },
  ],
}
