import type { CollectionConfig } from 'payload'
import { isAdmin, canWriteContent, canReadContentDrafts } from '@factory/agency-core/cms/kernel'
import { auditAfterChange, auditAfterDelete } from '@factory/agency-core/cms/foundation'

/**
 * Manufacturers — the first H2O catalog collection.
 *
 * Adopted verbatim from the frozen Phase 1 blueprint
 * (PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[slug=manufacturers]).
 * No field is added, renamed or re-typed here.
 *
 * Two properties of this collection matter beyond its own contents, and both are why it was chosen as
 * the scaffold's proving collection:
 *
 *  - it has no relationships, so it can exist before any other collection does; and
 *  - `estate_brand_term` is the field that lets a brand be recorded exactly as the legacy catalog wrote
 *    it, which is what makes it possible for a product's manufacturer relation to stay null without
 *    inventing a placeholder manufacturer entity.
 *
 * 21 brand terms exist in the estate. 17 of the 210 products carry none; those products get a null
 * relation and an UNKNOWN evidence state, never a row in this collection.
 */
export const Manufacturers: CollectionConfig = {
  slug: 'manufacturers',
  labels: { singular: 'Manufacturer', plural: 'Manufacturers' },
  admin: { useAsTitle: 'name', group: 'Catalog', defaultColumns: ['name', 'corporate_status'] },
  /**
   * Read is `canReadContentDrafts`, not `publishedOrContentReader`.
   *
   * 2A.1B shipped `publishedOrContentReader` here and it returned HTTP 500 to every anonymous request:
   *
   *     GET /api/manufacturers  ->  500  "Cannot find field for path at _status"
   *
   * The shared helper is not defective. Its contract, stated in its own doc comment, is "public
   * collections **with drafts**": for an anonymous caller it returns the Where clause
   * `{ _status: { equals: 'published' } }`, which the database layer can only resolve if the collection
   * actually has a `_status` column. Every other shared collection that uses it declares drafts —
   * `pages` explicitly, and `people` through the `content()` factory, which pairs
   * `versions: { drafts: true }` with the helper in the same object. `locations`, which has no draft
   * lifecycle, uses the `taxonomy()` factory and `read: anyone` instead. The invariant held everywhere
   * until this collection adopted the helper without the drafts half of the pair.
   *
   * The fix is therefore not to give Manufacturers a `_status`. The frozen
   * `architecture/PAYLOAD_COLLECTION_BLUEPRINT.md` collection table records manufacturers with
   * "Drafts/versions: —": this is evidenced reference data about 21 brand terms, and it has no
   * publication lifecycle to filter on. Adding `_status` to silence the error would invent a lifecycle
   * the contract does not give it, and would be exactly the shortcut the 2A.3 authorization forbids.
   *
   * `canReadContentDrafts` — authenticated content readers — is the same rule every other H2O catalog
   * collection already carries, so this collection stops being the one exception in the layer. It is
   * fail-closed: the 500 becomes a 403 for anonymous callers rather than a 200 with data.
   *
   * Making this collection anonymously readable was considered and deliberately not done. It would be
   * the only publicly readable collection in a catalog whose products are all `BLOCKED`, whose public
   * routes do not exist (2D is LOCKED), and it would expose `corporate_status` — including
   * `RESEARCH_REQUIRED` — and the internal `estate_brand_term` to callers with no page to render them.
   * The designed public posture, its field projection and its unlock gate are specified in
   * `06_PUBLIC_PRIVATE_DATA_CLASSIFICATION.md`; opening it is a Control Tower decision, not a side
   * effect of fixing a 500.
   */
  access: {
    read: canReadContentDrafts,
    create: canWriteContent,
    update: canWriteContent,
    delete: isAdmin,
  },
  /**
   * Audit coverage (2A.3 R1, authorized by Control Tower §8).
   *
   * This was the only H2O catalog collection without the standard hooks — it was authored in 2A.1B, as
   * the scaffold's proving collection, before the pattern reached the catalog layer, so brand-identity
   * and `corporate_status` changes were recorded nowhere. The same two accepted hooks the other eight
   * catalog collections already carry; no new audit architecture, no shared change.
   */
  hooks: { afterChange: [auditAfterChange], afterDelete: [auditAfterDelete] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'legal_or_current_name', type: 'text', required: false },
    {
      name: 'corporate_status',
      type: 'select',
      required: false,
      options: [
        'INDEPENDENT_MANUFACTURER_ACTIVE',
        'BRAND_NOW_UNDER_PARENT',
        'DIVISION_OF_ANOTHER_COMPANY',
        'ICS_OWN_BRAND',
        'RESEARCH_REQUIRED',
      ],
      admin: {
        description:
          'A stale corporate identity is a naming decision for the owner. It does not change what the part is and must not be silently rewritten.',
      },
    },
    { name: 'official_source_url', type: 'text', required: false },
    { name: 'official_document_url', type: 'text', required: false },
    {
      name: 'estate_brand_term',
      type: 'text',
      required: false,
      admin: { description: 'The term exactly as it appears in the legacy catalog, kept for traceability.' },
    },
  ],
}
