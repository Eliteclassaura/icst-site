import type { Access, FieldAccess } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'

/**
 * H2O-local access rules.
 *
 * Everything here composes the shared Agency Core primitives; nothing here changes shared semantics, and
 * no rule in this file is exported back into the shared package. Where a shared primitive already says
 * exactly the right thing, the collection uses the shared primitive directly rather than an alias — this
 * file exists only for the rules H2O needs that the shared role model cannot express on its own.
 *
 * ## Why provenance authority is admin-only here
 *
 * The frozen `H2O_SECURITY_REQUIREMENTS.md` RBAC table separates two people deliberately: "the person who
 * writes product copy is not the person who certifies it as technically true." It assigns *"Approve a
 * truth state / promote evidence"* to a `technical_reviewer` role.
 *
 * **That role does not exist in the implemented enum.** `packages/agency-core/src/cms/access/roles.ts`
 * defines exactly six: platform-admin, client-admin, editor, search-analyst, sales, viewer. The reviewer
 * workflow that would give `technical_reviewer` its meaning belongs to Phase 2C, which is LOCKED.
 *
 * Three options existed. Inventing a role is forbidden and would anticipate 2C's design. Granting the
 * capability to `editor` would collapse exactly the separation the contract draws, and would be very hard
 * to walk back once content teams rely on it. Restricting it to ADMINS is stricter than the eventual
 * model, expresses the separation truthfully today, and widens cleanly when 2C introduces the reviewer.
 *
 * So: admins only, deliberately narrower than the end state, and recorded as such. This is an access
 * rule, not a business rule — it governs *who may ask*. What the answer may be is still governed by the
 * frozen `beforeChange` guards in `../hooks/catalog-integrity`, which are unchanged and which no role,
 * including platform-admin, can talk past.
 *
 * ## CREATE and UPDATE are separate operations
 *
 * Payload evaluates field access per operation. `payload@3.88.0`
 * `dist/fields/config/types.d.ts:305` types the block as `{ create?, read?, update? }`, and
 * `dist/fields/hooks/beforeValidate/promise.js:217` reads `field.access[operation]` — so a rule declared
 * only on `update` places **no restriction at all on the create path**. Every rule below is therefore
 * wired to both operations at every call site. A field protected on one operation is not protected.
 *
 * What a denied write actually does, read from the same file rather than assumed:
 * `promise.js:226` does `delete siblingData[field.name]`, and the next statement substitutes
 * `getFallbackValue()`, which resolves to the existing document's value if there is one, else the field's
 * `defaultValue`, else `undefined`. So a denied write is **discarded, not rejected** — and on a required
 * field with no `defaultValue` the resulting `undefined` fails validation and the whole operation is
 * rejected. Both outcomes are fail-closed. Which one applies per field is recorded in
 * `05_PRODUCT_MEDIA_PROVENANCE_AUTHORITY.md`, and the transport behaviour is still a Commander gate.
 */

/** Provenance and truth-state assertions: admins only until 2C introduces the reviewer role. */
export const isProvenanceAuthority: Access = ({ req }) => hasRole(req, ADMINS)

/**
 * Field-level form of the same rule, for fields whose *value* is a provenance or truth assertion even
 * though the record around them is ordinary editable content.
 *
 * Read is deliberately **not** restricted: a content reader must be able to see that an image is
 * `AI_ENHANCED_VERIFIED`, or that a specification is `AI_DRAFT_UNVERIFIED`. Hiding a provenance state
 * from the people judging the content would make the content look more certain than it is, which is the
 * opposite of what this schema is for. Only the authority to *assert* it is narrowed.
 */
export const provenanceFieldWrite: FieldAccess = ({ req }) => hasRole(req, ADMINS)

/* ------------------------------------------------------------------------------------------------
 * Value-sensitive truth promotion
 *
 * Three fields carry a state enum in which *some* values are ordinary source classification and others
 * are a truth promotion. Restricting the whole field to admins would be wrong in both directions: it
 * would stop an editor recording that a value is `AI_DRAFT_UNVERIFIED` or `UNKNOWN` — the honest states
 * this catalog is mostly made of — while adding nothing, because the states that matter are the few that
 * assert verification.
 *
 * The frozen contract is specific about which those are:
 *
 *   - `PRODUCT_SCHEMA.md`: "`AUTHORIZED_DISTRIBUTOR` is a state that must be *proven* before it is set —
 *     setting it is the assertion the owner decision forbids making casually."
 *   - `PAYLOAD_COLLECTION_BLUEPRINT.md` invariant 3: "Truth mapping is one-way and non-upgrading…
 *     Nothing in migration may produce `VERIFIED_ICS` or `VERIFIED_MANUFACTURER`."
 *   - `H2O_SECURITY_REQUIREMENTS.md`: audit "every promotion of an `AI_EXTRACTED_UNCONFIRMED` value."
 *
 * So the promoting values are named, and everything else in each enum stays editor-writable.
 *
 * Fail-open analysis, because a value-sensitive rule invites one. If the incoming value cannot be read,
 * the rule allows — and that is safe rather than lax, because there is then no value to write: Payload
 * substitutes the existing value or the field's default (`getFallbackValue`, above), neither of which can
 * be a promotion the caller did not already hold. The rule can only ever be reached with a value the
 * caller supplied, and every promoting value it supplies is refused.
 */

/** States that assert verification rather than describe a source. Named by the frozen contract. */
export const PROMOTING_EVIDENCE_STATES = [
  'VERIFIED_MANUFACTURER',
  'VERIFIED_ICS',
  'AUTHORIZED_DISTRIBUTOR',
] as const

/** `identifier_state`'s promoting values. `ABSENT` and `UNKNOWN` are answers, not promotions. */
export const PROMOTING_IDENTIFIER_STATES = ['VERIFIED_MANUFACTURER', 'VERIFIED_ICS'] as const

/**
 * Build a field rule that admits any value except a promotion to a verified/approved state.
 *
 * `field` names the field within its own sibling scope — for a field inside a group, Payload passes the
 * group's contents as `siblingData`, so the bare name is correct there too.
 */
export const truthPromotionWrite =
  (field: string, promoting: readonly string[]): FieldAccess =>
  ({ req, siblingData }) => {
    if (hasRole(req, ADMINS)) return true
    const incoming = (siblingData as Record<string, unknown> | undefined)?.[field]
    if (typeof incoming !== 'string') return true
    return !promoting.includes(incoming)
  }
