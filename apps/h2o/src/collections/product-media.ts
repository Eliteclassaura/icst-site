import type { CollectionConfig } from 'payload'
import path from 'node:path'
import { canReadContentDrafts, canWriteContent, isAdmin } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'
import {
  forbidOriginalBinaryPreOperation,
  forbidOriginalBinaryReplacement,
  forbidReferencedOriginalDelete,
  requireDerivativeProvenance,
} from '../hooks/catalog-integrity'
import { provenanceFieldWrite } from '../access/index'

/**
 * H2O product/catalog media — the frozen contract's `media` entity, implemented at the namespace Control
 * Tower set: **`product-media`**, distinct from the shared Agency Core `media`.
 *
 * The two are not variants of one thing. Shared `media` is page, SEO and generic CMS imagery with `alt`
 * and `rights`; `product-media` is product evidence, and it carries the one question shared media never
 * has to answer: *is this actually the product, and is this actually the original?*
 *
 * Three rules are load-bearing here.
 *
 * **Originals are immutable and derivatives are separate records.** Two rules, because the shape rule
 * alone is not immutability. `requireDerivativeProvenance` enforces the shape — a record is either an
 * original (`ORIGINAL_VERIFIED`, no `original_asset`) or a derivative (any other state, `original_asset`
 * required) — so an AI-enhanced image cannot be filed as an original and quietly lose the chain back to
 * its source. `forbidOriginalBinaryReplacement` enforces the bytes: an existing `ORIGINAL_VERIFIED`
 * record's stored file cannot be replaced or detached by any write path, because otherwise the claim
 * survives intact while the evidence underneath it changes.
 *
 * **A WordPress `-WxH` file is not a source original.** 34,633 of them exist against ~3,270 originals.
 * Nothing in this collection treats a rendition as a source, and no `imageSizes` are configured — Payload
 * would generate presentation renditions that look exactly like the derivatives `image_state` exists to
 * distinguish. Presentation sizing belongs to the design layer.
 *
 * **AI enhancement may improve presentation, never technical fact.** Resolution, cleanup, background,
 * lighting, crop and noise are presentation. Geometry, labels, ports, dimensions, model identity and
 * specifications are not, and where a derivative alters them it is `AI_RECONSTRUCTED_ILLUSTRATIVE`.
 * `AI_COMPOSITE_MARKETING` is presentation, and a presentation composite is not technical evidence.
 *
 * Contract: PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[media], invariants[5]
 */
export const ProductMedia = (mediaDir: string): CollectionConfig => ({
  slug: 'product-media',
  admin: {
    useAsTitle: 'alt',
    group: 'H2O catalog',
    defaultColumns: ['filename', 'alt', 'image_state', 'exact_product_match'],
  },
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  upload: {
    staticDir: path.join(mediaDir, 'product-media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    // No imageSizes: a generated rendition is not a derivative in this collection's sense, and the two
    // must not be confusable. Presentation sizing arrives with the design layer.
  },
  hooks: {
    /**
     * Two barriers, at two different lifecycle points, for one invariant.
     *
     * `beforeOperation` is the **storage** barrier and is new in 2A.3 R2. Payload 3.88.0 deletes the
     * existing binary (`utilities/update.js:78`) and writes the replacement (`:120`) *before* any
     * document hook runs (`:125`), so a `beforeChange` rejection arrives after the bytes are already
     * gone — which is exactly what Commander observed: document intact, original binary absent,
     * replacement orphaned on disk. This hook runs at `updateByID.js:23`, before `generateFileData`,
     * and refuses with a 409 rather than letting a 500 surface after the damage.
     *
     * `beforeChange` is the **document** barrier and is retained deliberately as defence in depth. It
     * still sees `originalDoc` and the stamped filename, and still covers paths the pre-operation guard
     * cannot reach. Neither is redundant; they refuse different things at different moments.
     */
    beforeOperation: [forbidOriginalBinaryPreOperation],
    /**
     * The delete barrier (2A.3 R2.3). Both guards above are update-path guards, and delete is not an
     * update — which is how a `platform-admin` DELETE returned 200, destroyed an `ORIGINAL_VERIFIED`
     * source and its binary, and left a surviving derivative pointing at `null`.
     *
     * `beforeDelete` runs after authorization (`deleteByID.js:36`) and before the binary is unlinked
     * (`:90`) or the row removed (`:127`), and the bulk path runs the same hook per document
     * (`delete.js:107`). One guard, both paths, no existence oracle.
     *
     * Necessary, and on its own not sufficient: the `original_asset` FK is `ON DELETE set null`, so a
     * derivative committed by another transaction between the check and the delete is nulled rather
     * than refused. See `21_CONCURRENCY_TOCTOU_REVIEW.md` — `DATABASE_BACKSTOP_REQUIRED`.
     */
    beforeDelete: [forbidReferencedOriginalDelete],
    // Immutability first: it is the cheaper check and the more fundamental one. A request that would
    // rewrite an original's bytes is rejected before anything asks what shape the record claims to be.
    beforeChange: [forbidOriginalBinaryReplacement, requireDerivativeProvenance],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: '179 legacy associations carry no alt text. Required here so migration cannot skip it.',
      },
    },
    {
      name: 'image_state',
      type: 'select',
      required: true,
      // Provenance authority (2A.3 R1): what an image *is* may be asserted only by an admin. The frozen
      // security contract separates writing product copy from certifying it true, and assigns this to a
      // reviewer role the implemented enum does not have; admins is the narrower, honest stand-in until
      // 2C introduces it. Read is unrestricted on purpose — hiding a derivative's state from the people
      // judging it would make the image look more certain than it is. See `../access/index`.
      //
      // `create` as well as `update`: Payload evaluates field access per operation, so an update-only
      // rule leaves the create path open. This field is `required` with no `defaultValue`, so a denied
      // create resolves to `undefined` and fails validation — which makes creating a `product-media`
      // record admin-only in practice. That consequence is measured, not incidental: see
      // `H2O_PRODUCT_MEDIA_CREATE_NARROWED` in `13_OPEN_BLOCKERS_AND_DEFERRED_WORK.md`.
      access: { create: provenanceFieldWrite, update: provenanceFieldWrite },
      options: [
        'ORIGINAL_VERIFIED',
        'AI_ENHANCED_VERIFIED',
        'AI_COMPOSITE_MARKETING',
        'AI_RECONSTRUCTED_ILLUSTRATIVE',
      ],
      admin: {
        description:
          'ORIGINAL_VERIFIED is a source asset. The other three are derivatives and must name their original.',
      },
    },
    {
      name: 'exact_product_match',
      type: 'select',
      options: ['EXACT', 'FAMILY_ONLY', 'NOT_ESTABLISHED'],
      admin: {
        description:
          'Whether this image is the product, its family, or unestablished. NOT_ESTABLISHED is an answer, not a gap.',
      },
    },
    {
      name: 'original_asset',
      type: 'upload',
      relationTo: 'product-media',
      // The link from a derivative to its source is half of the same assertion as `image_state`; leaving
      // it writable by content writers would let the pair be separated one field at a time — on either
      // operation, which is why both are named.
      access: { create: provenanceFieldWrite, update: provenanceFieldWrite },
      admin: {
        description:
          'The untouched source this record was derived from. Required for a derivative, forbidden on an original.',
      },
    },
    { name: 'legacy_url', type: 'text' },
    {
      name: 'rights_status',
      type: 'select',
      options: ['ICS_OWNED', 'MANUFACTURER_PERMITTED', 'REVIEW_RIGHTS'],
    },
  ],
})
