import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeOperationHook,
} from 'payload'
import { APIError } from 'payload'
// `sql` is a public export of `@payloadcms/db-postgres`, which `@factory/h2o` already declares as a
// direct dependency (it is what `payload.config.ts` builds its adapter from, and what every migration
// in `src/migrations` imports). Nothing is added to package.json or the lockfile to obtain it.
import { sql } from '@payloadcms/db-postgres'

/**
 * Catalog integrity hooks — the invariants the frozen contract says must be code, not prose.
 *
 * All three throw rather than correct. A record that violates one of these is not a record with a
 * fixable field; it is a claim the evidence does not support, and silently normalising it is exactly how
 * an UNKNOWN becomes a fact nobody decided to assert. Nothing here auto-fills a state, a reason, a
 * relation or a provenance link.
 *
 * ## Why these read the delta the way they do
 *
 * On an update, Payload passes `data` as the **changed-field delta** and `originalDoc` as the full
 * previous document. That makes two situations look identical to a naive read and mean opposite things:
 *
 *   { }                        the field was omitted  — keep whatever it was
 *   { manufacturer: null }     the field was cleared  — it is now null
 *
 * `??` collapses those two, because `null ?? previous` yields the previous value. A hook written that
 * way reads a clearing update as "unchanged", approves it, and Payload then writes the null — so the
 * invariant is enforced on every path except the one that breaks it. Every read below therefore goes
 * through `provided()`, which asks whether the key was actually present in the delta.
 */

/** Was `key` actually present in this object? Distinguishes "omitted" from "explicitly set to null". */
const provided = (o: unknown, key: string): boolean =>
  typeof o === 'object' && o !== null && Object.prototype.hasOwnProperty.call(o, key)

const read = (o: unknown, key: string): unknown => (o as Record<string, unknown>)[key]

/** The effective post-update value: the delta's value when it was provided (null included), else the previous. */
const effective = (data: unknown, previous: unknown, key: string): unknown => {
  if (provided(data, key)) return read(data, key)
  if (provided(previous, key)) return read(previous, key)
  return undefined
}

/**
 * The effective post-update value of a group, merged member by member.
 *
 * A partial update to a group carries only the members it changes, so the group must be evaluated
 * member-wise: a member absent from the delta keeps its previous value, a member explicitly set to null
 * stays null. Treating the incoming group as either wholly new or wholly absent gets both cases wrong.
 *
 * An explicitly cleared group (`{ manufacturer_evidence: null }`) clears every member.
 */
const effectiveGroup = (
  data: unknown,
  previous: unknown,
  key: string,
  members: readonly string[],
): Record<string, unknown> => {
  const incoming = provided(data, key) ? read(data, key) : undefined
  const prior = provided(previous, key) ? read(previous, key) : undefined
  if (provided(data, key) && (incoming === null || incoming === undefined)) return {}
  const out: Record<string, unknown> = {}
  for (const m of members) out[m] = effective(incoming, prior, m)
  return out
}

/** Null, undefined and the empty string all mean "no value" for a relation or a filename. */
const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === ''

/**
 * Invariant 9 / blueprint invariant 1 — the manufacturer relation is nullable **on purpose**.
 *
 * 17 of the 210 legacy products carry no brand term. The contract's answer is not a placeholder
 * "Unknown Manufacturer" entity and not an invented relation: the relation stays null and
 * `manufacturer_evidence` carries the reason. This hook enforces the other half of that bargain — a null
 * relation is only valid when the record says *why* — and it enforces it against the **effective**
 * post-update record, so clearing a manufacturer without supplying a reason is rejected rather than
 * silently accepted because the previous value happened to be valid.
 *
 * `PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> collections[products].manufacturer_evidence.rule`
 * `PAYLOAD_COLLECTION_BLUEPRINT.md -> invariant 1: "Enforce with a validation hook"`
 */
export const requireManufacturerEvidence: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const relation = effective(data, originalDoc, 'manufacturer')
  const evidence = effectiveGroup(data, originalDoc, 'manufacturer_evidence', ['state', 'unknown_reason'])
  const state = evidence.state
  const reason = evidence.unknown_reason

  if (!isEmpty(relation)) {
    if (state === 'UNKNOWN') {
      throw new Error(
        'manufacturer_evidence.state is UNKNOWN but a manufacturer relation is set. ' +
          'UNKNOWN describes an unidentified manufacturer; it is not a label for an identified one.',
      )
    }
    return data
  }

  if (state !== 'UNKNOWN') {
    throw new Error(
      'A product with no manufacturer relation must record manufacturer_evidence.state = UNKNOWN. ' +
        'No placeholder manufacturer entity is created for an unidentified brand.',
    )
  }
  if (isEmpty(reason)) {
    throw new Error(
      'manufacturer_evidence.unknown_reason is required when the manufacturer is UNKNOWN. ' +
        'An unexplained UNKNOWN cannot be queued for research, which is the only way it ever resolves.',
    )
  }
  return data
}

/**
 * Invariant 5 / blueprint invariant 5, first half — a derivative must name the original it came from.
 *
 * Enforced as a shape rule on the effective post-update record: a derivative names its source, an
 * original does not. Clearing `original_asset` on an existing derivative is therefore rejected, because
 * the resulting record would be a derivative with no provenance — indistinguishable from an original,
 * which is the confusion these fields exist to prevent.
 *
 * `PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> invariants[5]`, `collections[media].original_asset`
 */
export const requireDerivativeProvenance: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const state = effective(data, originalDoc, 'image_state')
  const original = effective(data, originalDoc, 'original_asset')
  const hasOriginal = !isEmpty(original)

  if (state === 'ORIGINAL_VERIFIED') {
    if (hasOriginal) {
      throw new Error(
        'An ORIGINAL_VERIFIED asset must not reference original_asset: it is the original. ' +
          'A record that points at a source is a derivative and must carry a derivative image_state.',
      )
    }
    return data
  }
  if (!hasOriginal) {
    throw new Error(
      `image_state "${String(state)}" describes a derivative, so original_asset is required. ` +
        'A derivative with no source is indistinguishable from an original, which is the confusion ' +
        'this field exists to prevent.',
    )
  }
  return data
}

/**
 * Invariant 5, second half — the source binary of an original is immutable.
 *
 * The shape rule above says a record *claims* to be an original. It does nothing to stop the bytes behind
 * that record being replaced, which would leave the claim intact and the evidence gone: every derivative
 * still points at "the original", and the original is now a different image. Immutability has to be a
 * server-side rule or it is not a rule.
 *
 * **Detection, for Payload 3.88.0 specifically.** `generateFileData` runs in the update operation *before*
 * the document-level hooks, and when a file is present it stamps the new `filename` onto the data that
 * reaches `beforeChange`; when no file is present it returns the incoming data untouched. So inside this
 * hook:
 *
 *   - `req.file` present                          a binary arrived with this request
 *   - `filename` in the delta, differing          a new binary was written (also covers the crop /
 *                                                 focal-point re-upload path, which rewrites the bytes)
 *   - `filename` in the delta, empty              the binary is being detached
 *   - `filename` absent, or present and identical  metadata-only; the bytes are untouched
 *
 * **CORRECTED IN 2A.3 R2 — this hook is the second line of defence, not the first.**
 *
 * The 2A.2 version of this comment argued that `beforeChange` was "the right hook rather than
 * `beforeOperation`", because `beforeOperation` sees neither the stamped filename nor an `originalDoc`.
 * That reasoning was correct about *document* safety and wrong about *storage* safety, and Commander
 * native testing proved it wrong: a `platform-admin` REST replacement of an `ORIGINAL_VERIFIED` record
 * was rejected by this hook, the document was left unchanged — and the original binary was already gone
 * from disk, with the rejected replacement orphaned beside it.
 *
 * Payload 3.88.0's update-by-ID path, read from `dist/collections/operations/`:
 *
 *   updateByID.js:23    beforeOperation - Collection
 *   updateByID.js:98    generateFileData
 *   utilities/update.js:78   deleteAssociatedFiles   <-- fs.unlink of the EXISTING binary
 *   utilities/update.js:120  uploadFiles             <-- the replacement is written to disk
 *   utilities/update.js:125  beforeChange - Collection   <-- this hook finally runs
 *
 * By the time this hook throws, the bytes are already gone. A `beforeChange` rejection can guarantee that
 * the *document* is not updated; it cannot guarantee that the *storage* was not mutated. Those are
 * different promises and 2A.2 conflated them.
 *
 * `forbidOriginalBinaryPreOperation` below is the storage-safety barrier and runs at step 1, before any
 * filesystem effect. This hook is retained deliberately as defence in depth: it still runs per document,
 * still sees `originalDoc` and the stamped filename, and still covers paths the pre-operation guard
 * cannot reach — a direct `updateDocument` call, a future operation that skips `beforeOperation`, or a
 * signal that only becomes visible after `generateFileData` has run. Two independent refusals is the
 * point.
 *
 * Creating a new original is untouched — this applies only to `update`. Creating derivatives is
 * untouched. Metadata edits to an original remain permitted, because they do not mutate the bytes.
 *
 * `PAYLOAD_PRODUCT_MODEL_CONTRACT.json -> invariants[5]`; Control Tower 2A.2 §6 media hard rules;
 * Control Tower 2A.3 R2 §4 defence in depth
 */
export const forbidOriginalBinaryReplacement: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update') return data
  const previousState = provided(originalDoc, 'image_state') ? read(originalDoc, 'image_state') : undefined
  if (previousState !== 'ORIGINAL_VERIFIED') return data

  if (req?.file) {
    throw new Error(
      'The source binary of an ORIGINAL_VERIFIED asset cannot be replaced. ' +
        'Originals are immutable; an improved or corrected version is a new record with ' +
        'original_asset pointing at this one.',
    )
  }

  if (!provided(data, 'filename')) return data

  const nextFilename = read(data, 'filename')
  if (isEmpty(nextFilename)) {
    throw new Error(
      'The source binary of an ORIGINAL_VERIFIED asset cannot be removed. ' +
        'Every derivative that references this record depends on its bytes still being the bytes it was ' +
        'derived from.',
    )
  }

  const previousFilename = provided(originalDoc, 'filename') ? read(originalDoc, 'filename') : undefined
  if (nextFilename !== previousFilename) {
    throw new Error(
      'The source binary of an ORIGINAL_VERIFIED asset cannot be replaced. ' +
        `This update would change the stored file from "${String(previousFilename)}" to ` +
        `"${String(nextFilename)}".`,
    )
  }
  return data
}

/* ==================================================================================================
 * Invariant 5, pre-storage barrier — 2A.3 R2
 *
 * Commander native evidence (`H2O_ORIGINAL_MEDIA_REPLACEMENT_STORAGE_ATOMICITY_DEFECT`): an
 * authenticated `platform-admin` REST replacement of an `ORIGINAL_VERIFIED` record returned HTTP 500,
 * the document was correctly unchanged, and the original binary was **already deleted from disk** with
 * the rejected replacement orphaned beside it.
 *
 *   ORIGINAL_BINARY_SHA_PRESERVED       = FAIL
 *   ORIGINAL_FILENAME_PRESERVED         = FAIL
 *   I3_REJECTED_REPLACEMENT_ORPHAN_CHECK = FAIL
 *
 * A document-level guard cannot fix that, because the filesystem has already moved by the time any
 * document hook runs. The rejection has to happen earlier than `generateFileData`, and
 * `beforeOperation` is the only collection hook that does.
 *
 * ## What counts as "this operation will rewrite the bytes"
 *
 * Read from `payload@3.88.0/dist/uploads/generateFileData.js`, not assumed. A file is produced — and
 * therefore `deleteAssociatedFiles` will unlink the existing binary — when either:
 *
 *   - `req.file` is present (`generateFileData.js:42`), or
 *   - `shouldReupload(uploadEdits, incomingData)` is true (`:54`), which `:16-32` defines as
 *     `crop` set, or `widthInPixels` set, or `heightInPixels` set, or a `focalPoint` whose x/y differ
 *     from the incoming data's `focalX`/`focalY`.
 *
 * `uploadEdits` comes from `req.query.uploadEdits` (`:342`). The focal-point comparison is reproduced
 * exactly rather than simplified to "focalPoint present", because Payload's admin UI sends the focal
 * point on **every** save — treating its mere presence as a mutation would block metadata-only edits,
 * which §7 requires to keep working.
 *
 * Filename comparison is deliberately **not** used. `deleteAssociatedFiles` unlinks
 * `${staticDir}/${existingDoc.filename}` whenever any file is produced, regardless of what the new file
 * is called, so a same-name overwrite destroys the original exactly as a rename does.
 *
 * ## Not an access rule
 *
 * This runs before Payload's own access step, so an unauthenticated caller would otherwise be able to
 * tell an `ORIGINAL_VERIFIED` id from a non-existent one by the error it gets back. To close that, the
 * collection's own `update` access is evaluated first and a denial returns the arguments untouched —
 * Payload then produces its normal 403 and nothing is disclosed. The guard never widens access, never
 * returns document data, and never grants anything.
 *
 * Under `overrideAccess` (imports, fixtures) the access pre-check is skipped but **the guard still
 * runs**: original-binary immutability is an integrity invariant, not a permission, and 2B will import
 * 396 images through exactly that path.
 * ================================================================================================== */

/** Upload states whose stored bytes are the evidence and may never be rewritten. */
const IMMUTABLE_BINARY_STATES = new Set(['ORIGINAL_VERIFIED'])

type UploadEdits = {
  crop?: unknown
  focalPoint?: { x?: unknown; y?: unknown }
  heightInPixels?: unknown
  widthInPixels?: unknown
}

const uploadEditsOf = (req: unknown): undefined | UploadEdits => {
  const query = (req as undefined | { query?: unknown })?.query
  if (typeof query !== 'object' || query === null) return undefined
  const edits = (query as Record<string, unknown>).uploadEdits
  if (typeof edits !== 'object' || edits === null) return undefined
  return edits as UploadEdits
}

/**
 * Mirrors `generateFileData`'s own decision. True means this request will produce a file, which means
 * `deleteAssociatedFiles` will unlink whatever binary the target record currently has.
 */
export const willRegenerateBinary = (req: unknown, data: unknown): boolean => {
  if ((req as undefined | { file?: unknown })?.file) return true
  const edits = uploadEditsOf(req)
  if (!edits) return false
  if (edits.crop || edits.widthInPixels || edits.heightInPixels) return true
  const focal = edits.focalPoint
  if (focal && typeof focal === 'object') {
    const incoming = data as Record<string, unknown> | null | undefined
    // Payload compares the requested focal point against the incoming data and re-uploads on a
    // difference. An unchanged echo — what the admin UI sends on a metadata-only save — is not a
    // mutation.
    return !(focal.x === incoming?.focalX && focal.y === incoming?.focalY)
  }
  return false
}

/**
 * Refuse, and tell the compiler this path ends.
 *
 * Declared as a function rather than a `const` arrow so that its `never` return participates in
 * control-flow analysis: after `refuseImmutable(...)` TypeScript knows the following code is
 * unreachable, which is what lets the callable and result narrowings below hold without a cast.
 */
function refuseImmutable(detail: string): never {
  throw new APIError(
    `The source binary of an ORIGINAL_VERIFIED asset is immutable and cannot be rewritten. ${detail} ` +
      `Create a new derivative record that references this one through original_asset instead. ` +
      `No file was changed.`,
    409,
    null,
    true,
  )
}

/**
 * The only operation-argument fields this guard reads.
 *
 * `beforeOperation` receives the arguments of whichever operation is running, so `args` is a union in
 * which only some members carry `id` and only some carry `where`. This is a deliberately narrow
 * structural view of the four fields the immutability decision needs — it never becomes the hook's
 * return type, and every field stays `unknown` so each one is narrowed at the point of use.
 */
type ImmutabilityOperationArgs = {
  data?: unknown
  id?: unknown
  where?: unknown
}

/** A document reader proven callable before invocation. */
type TargetReader = (args: Record<string, unknown>) => Promise<unknown>

const readerOf = (payload: unknown): TargetReader | undefined => {
  const candidate = (payload as undefined | { findByID?: unknown })?.findByID
  return typeof candidate === 'function' ? (candidate as TargetReader) : undefined
}

const finderOf = (payload: unknown): TargetReader | undefined => {
  const candidate = (payload as undefined | { find?: unknown })?.find
  return typeof candidate === 'function' ? (candidate as TargetReader) : undefined
}

/** Payload's own 404 for a document that is simply not there. Not this guard's to answer. */
const isMissingDocument = (error: unknown): boolean => {
  const status = (error as undefined | { status?: unknown })?.status
  const name = (error as undefined | { name?: unknown })?.name
  return status === 404 || name === 'NotFound'
}

const imageStateOf = (doc: unknown): string | undefined => {
  const raw = (doc as null | undefined | { image_state?: unknown })?.image_state
  return typeof raw === 'string' ? raw : undefined
}

/**
 * Pre-storage immutability barrier for `product-media` updates.
 *
 * Runs at `beforeOperation`, before `generateFileData` and therefore before any file is deleted or
 * written. Throws `APIError` 409 rather than letting a 500 surface after the damage is done.
 *
 * **Returns nothing on every permitted path.** `BeforeOperationHook` allows `void | Promise<void>`
 * alongside a replacement argument object, and this guard never modifies the operation arguments — so
 * returning `void` says exactly that, and keeps the narrow `ImmutabilityOperationArgs` view above from
 * escaping into the hook's public type.
 */
export const forbidOriginalBinaryPreOperation: CollectionBeforeOperationHook = async ({
  args,
  collection,
  operation,
  overrideAccess,
  req,
}) => {
  if (operation !== 'update') return

  const opArgs = args as ImmutabilityOperationArgs
  if (!willRegenerateBinary(req, opArgs.data)) return

  /**
   * H2O document ids are UUID strings.
   *
   * `payload.config.ts` configures the Postgres adapter with `idType: 'uuid'`, and the generated
   * `payload-types.ts` records `db: { defaultIDType: string }`. So in this application's type context an
   * access callback's `id` is `string | undefined`, and there is no such thing as a numeric H2O
   * collection id.
   *
   * R2.1 typed this `string | number | undefined` — generality the application does not have. It
   * compiled against Payload's standalone declarations, where `defaultIDType` is still the library
   * default, and failed the real project typecheck:
   *
   *   TS2322  Type 'string | number | undefined' is not assignable to type 'string | undefined'.
   *
   * The raw value stays `unknown` and only a string is accepted as a usable target. A non-string id is
   * not coerced, not stringified, and not reinterpreted as a bulk operation — it is a malformed target
   * for this application, and §5 below refuses it.
   */
  const rawTargetId = opArgs.id
  const targetId = typeof rawTargetId === 'string' ? rawTargetId : undefined

  // Access pre-check: a caller who could not perform this update anyway must see no difference.
  if (overrideAccess !== true) {
    const updateAccess = collection?.access?.update
    if (typeof updateAccess === 'function') {
      let permitted: unknown
      try {
        // `await` inside the try catches a synchronous throw and a rejected promise alike.
        permitted = await updateAccess({ data: opArgs.data, id: targetId, req })
      } catch {
        permitted = false
      }
      // `false` means Payload will refuse at its own access step; leave the request untouched so the
      // response is byte-for-byte what it would have been without this guard. A `Where` result is
      // treated as permitted-in-principle and the guard proceeds: over-refusing a document the caller
      // could not have written is harmless, under-refusing one they could is not.
      if (!permitted) return
    }
  }

  /**
   * Order matters here, and it is the reason this check sits below the access pre-check rather than
   * beside the narrowing above.
   *
   * A caller who is not allowed to perform this update must get exactly the response they would have
   * got without this guard — Payload's own 403 — whatever shape their id was. Refusing a malformed id
   * *before* the access check would hand an unauthorized caller a distinct 409, which is a different
   * answer for a different reason and therefore a signal. So: narrow first, check access, and only then
   * refuse the malformed target.
   *
   * By this point the caller is authorized (or running with `overrideAccess`). An id that survived to
   * here and is not a string cannot address an H2O document, so it cannot be resolved — and an
   * unresolvable target on a byte-mutating request is exactly the ambiguity that must fail closed.
   */
  if (rawTargetId !== undefined && targetId === undefined) {
    refuseImmutable('The target id is not a string, so the record it refers to cannot be resolved.')
  }

  const slug = collection?.slug ?? 'product-media'

  // ---- single-document update -------------------------------------------------------------------
  if (targetId !== undefined) {
    const reader = readerOf(req.payload)
    // No way to establish the target. Fail closed: this path would otherwise destroy bytes.
    if (!reader) refuseImmutable('The target record could not be read to confirm it is not an original.')

    let state: string | undefined
    try {
      state = imageStateOf(
        await reader({ collection: slug, depth: 0, id: targetId, overrideAccess: true, req }),
      )
    } catch (error) {
      // A missing document is Payload's 404 to give, not ours — returning discloses nothing.
      if (isMissingDocument(error)) return
      refuseImmutable('The target record could not be read to confirm it is not an original.')
    }
    if (state !== undefined && IMMUTABLE_BINARY_STATES.has(state)) {
      refuseImmutable('This request would have replaced, cropped, resized or re-rendered its stored file.')
    }
    return
  }

  // ---- bulk update --------------------------------------------------------------------------------
  // One file applied across a `where` match. Establish that no matched document is an original; if that
  // cannot be established, refuse. Ambiguity on a binary-mutating path fails closed.
  const where = opArgs.where
  if (!where || typeof where !== 'object') {
    refuseImmutable('A bulk update carrying a file has no resolvable target set.')
  }

  const finder = finderOf(req.payload)
  if (!finder) refuseImmutable('The target records could not be read to confirm none is an original.')

  let matched: unknown
  try {
    matched = await finder({
      collection: slug,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { and: [where, { image_state: { equals: 'ORIGINAL_VERIFIED' } }] },
    })
  } catch {
    refuseImmutable('The target records could not be read to confirm none is an original.')
  }

  const docs = (matched as null | undefined | { docs?: unknown })?.docs
  if (!Array.isArray(docs)) {
    refuseImmutable('The target records could not be read to confirm none is an original.')
  }
  if (docs.length > 0) {
    refuseImmutable('At least one matched record is an ORIGINAL_VERIFIED asset.')
  }
}

/* ==================================================================================================
 * Invariant 5, delete barrier — 2A.3 R2.3
 *
 * Commander native evidence (`H2O_ADV_PROV5_ORIGINAL_MEDIA_DELETE_GUARD_BLOCKED`): a `platform-admin`
 * deleted an `ORIGINAL_VERIFIED` source that an `AI_ENHANCED_VERIFIED` derivative referenced through
 * `original_asset`. `DELETE` returned **HTTP 200**; the record and its binary were destroyed, the
 * derivative survived with its own bytes intact, and its `original_asset` silently became `null`.
 *
 * The derivative is now a claim with no evidence behind it: still labelled AI-enhanced, still pointing
 * at nothing. That is precisely the failure invariant 5 exists to prevent, arriving through the one
 * operation neither 2A.2's `beforeChange` guard nor R2's `beforeOperation` guard covers — both are
 * update-path guards, and delete is not an update.
 *
 * ## Why `beforeDelete`, read from `payload@3.88.0`
 *
 *   deleteByID.js:22   initTransaction
 *   deleteByID.js:24   beforeOperation
 *   deleteByID.js:36   executeAccess          <- throws Forbidden when access denies
 *   deleteByID.js:44   beforeDelete           <- this guard
 *   deleteByID.js:68   db.findOne
 *   deleteByID.js:90   deleteAssociatedFiles  <- the binary is unlinked
 *   deleteByID.js:127  db.deleteOne           <- the row is removed, FK ON DELETE SET NULL fires
 *   deleteByID.js:190  afterDelete
 *   deleteByID.js:217  commitTransaction
 *
 * `beforeDelete` is the earliest hook that runs after authorization and before anything destructive, so
 * it is the correct point on both counts — and the access ordering means an unauthorized caller is
 * refused at :36 and never reaches this hook at all. No existence oracle is created by construction
 * rather than by careful sequencing inside the guard.
 *
 * `afterDelete` was never a candidate: by definition it runs after the row and the bytes are gone.
 *
 * The bulk path is the same hook. `delete.js:107` runs `beforeDelete` **per matched document**, before
 * `deleteAssociatedFiles` (:117) and `deleteOne` (:149), so one guard covers `deleteByID` and
 * `delete-many` without a second code path.
 *
 * ## What is protected, and what deliberately is not
 *
 * The rule is *referenced*, not *original*: any `product-media` record that another record still points
 * at through `original_asset` cannot be deleted. That is the invariant as stated, it needs no
 * assumption about `image_state`, and it protects a derivative that has itself become someone's source.
 *
 * It is not a blanket delete ban, and no frozen contract asks for one. Deleting a derivative nothing
 * references, an unreferenced original, or an original whose derivatives have already been removed all
 * remain permitted — cases D9 and D10 in `verify/delete-provenance.test.mjs` are the negative controls.
 *
 * ## Not an access rule
 *
 * `overrideAccess` does not reach this hook: Payload runs `beforeDelete` unconditionally, and a
 * structural provenance invariant is not a permission anyone holds. A trusted Local API caller cannot
 * silently destroy a still-referenced canonical source, which is what case D7 asserts.
 *
 * ## THIS HOOK IS NECESSARY AND, ON ITS OWN, NOT SUFFICIENT
 *
 * The `original_asset` foreign key is declared `ON DELETE set null`
 * (`migrations/20260913_012440.ts:421`), and the reference check here is a plain non-locking read. A
 * derivative inserted and committed by another transaction between this check and `db.deleteOne` is
 * therefore nulled rather than refused, silently, exactly as in the reported failure. The full analysis
 * is in `21_CONCURRENCY_TOCTOU_REVIEW.md`; the conclusion is `DATABASE_BACKSTOP_REQUIRED`, and closing
 * that race is Control Tower's decision, not this hook's.
 * ================================================================================================== */

/**
 * Reaching the delete request's OWN database transaction.
 *
 * WHY THIS IS NECESSARY AT ALL
 *
 * A reference check alone cannot protect the binary. Payload 3.88.0 `deleteByID` runs, in order
 * (`dist/collections/operations/deleteByID.js`):
 *
 *     initTransaction        :22      the request's transaction opens here
 *     beforeOperation        :24
 *     executeAccess          :36      unauthorized callers are rejected here, before this hook
 *     beforeDelete           :44      <- this hook
 *     db.findOne             :68
 *     deleteAssociatedFiles  :90      <- the ORIGINAL BINARY IS UNLINKED HERE
 *     db.deleteOne          :127      <- the foreign key is evaluated only here
 *     afterDelete           :190
 *     commitTransaction     :217
 *
 * The `ON DELETE RESTRICT` foreign key added in migration
 * `20260914_133257_delete_provenance_fk_restrict` protects referential integrity, but it is evaluated
 * at `:127` — seventy-odd lines after the file has already been unlinked at `:90`. A derivative that
 * commits between this hook's read and `:90` therefore produces:
 *
 *     database transaction rolls back   -> source row present, derivative present, relationship present
 *     filesystem unlink does NOT roll back -> SOURCE BINARY MISSING
 *
 * So the application layer has to make it impossible for a new reference to commit between the check
 * and the unlink. That is what the row lock below does.
 *
 * HOW THE LOCK JOINS THE REQUEST'S TRANSACTION
 *
 * `@payloadcms/drizzle@3.88.0 dist/transactions/beginTransaction.js` opens a real drizzle transaction
 * and parks inside its callback, storing the live `tx` client at `adapter.sessions[id].db` until
 * `commitTransaction` or `rollbackTransaction` resolves it. `dist/utilities/getTransaction.js:17`
 * resolves exactly `adapter.sessions[await req.transactionID]?.db`, and that is the client every
 * Payload database call for this request already uses. Executing on it puts this statement in the
 * same transaction, on the same pooled connection, and the lock it takes is released only when that
 * transaction commits or rolls back — which is after `deleteAssociatedFiles` and after `db.deleteOne`.
 *
 * `getTransaction` falls back to `adapter.drizzle` (the pool) when no transaction exists. That
 * fallback is deliberately NOT reproduced here: a `FOR UPDATE` on the pool would commit and release
 * immediately in its own implicit transaction, which is not a lock at all. A delete with no
 * transaction — `deleteByID.js:22` is skipped when a caller passes `disableTransaction` — is refused
 * instead.
 */
type TransactionExecutor = { execute: (query: unknown) => Promise<unknown> }

type PostgresAdapterView = {
  sessions?: Record<string, undefined | { db?: unknown }>
  tableNameMap?: Map<string, string>
}

const isTransactionExecutor = (value: unknown): value is TransactionExecutor =>
  typeof (value as undefined | { execute?: unknown })?.execute === 'function'

const adapterOf = (req: unknown): PostgresAdapterView | undefined => {
  const db = (req as undefined | { payload?: { db?: unknown } })?.payload?.db
  return db && typeof db === 'object' ? (db as PostgresAdapterView) : undefined
}

/**
 * The physical table backing a collection, as the adapter itself resolved it. Read from
 * `adapter.tableNameMap` rather than assumed, and `undefined` when it cannot be resolved, so the
 * caller fails closed instead of guessing an identifier.
 */
const tableNameFor = (req: unknown, slug: string): string | undefined => {
  const map = adapterOf(req)?.tableNameMap
  if (!(map instanceof Map)) return undefined
  const key = slug.replace(/-/g, '_')
  const name = map.get(key)
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

/** The drizzle client bound to THIS request's transaction, or `undefined` if there is none. */
const transactionExecutorOf = async (req: unknown): Promise<TransactionExecutor | undefined> => {
  const raw = (req as undefined | { transactionID?: unknown })?.transactionID
  let transactionID: unknown = raw
  if (raw instanceof Promise) {
    try {
      transactionID = await raw
    } catch {
      return undefined
    }
  }
  if (typeof transactionID !== 'string' || transactionID.length === 0) return undefined
  const client = adapterOf(req)?.sessions?.[transactionID]?.db
  return isTransactionExecutor(client) ? client : undefined
}

const REFERENCES_UNKNOWN = 'Its references could not be checked.'
const NO_TRANSACTION =
  'Its references could not be checked because this delete is not running inside a database transaction.'

function refuseReferencedDelete(detail: string): never {
  throw new APIError(
    `This asset is still referenced as the original of another product-media record and cannot be ` +
      `deleted. ${detail} Remove or re-point the records that reference it first. Nothing was deleted.`,
    409,
    null,
    true,
  )
}

/**
 * Refuse deletion of a `product-media` record that another record still names through `original_asset`.
 *
 * Runs at `beforeDelete`: after authorization, before the binary is unlinked and before the row is
 * removed. Covers `deleteByID` and `delete-many` alike.
 *
 * ORDER MATTERS, AND IT IS LOCK FIRST.
 *
 *   1. take `FOR UPDATE` on the target row, in the delete request's own transaction;
 *   2. only then ask whether anything references it.
 *
 * Reversing those two steps would reproduce the defect this guard exists to close. A derivative
 * `INSERT` (or an `UPDATE` re-pointing an existing derivative at this row) must take `FOR KEY SHARE`
 * on the parent to satisfy the foreign key, and `FOR KEY SHARE` conflicts with `FOR UPDATE`. So:
 *
 *   - a derivative that committed BEFORE the lock is visible to the check that follows it;
 *   - a derivative trying to commit AFTER the lock blocks until this request's transaction ends;
 *   - a derivative already holding `FOR KEY SHARE` when the lock is requested makes the lock WAIT,
 *     and the check then runs against a snapshot that includes it.
 *
 * There is no window left in which a reference can appear between the check and
 * `deleteAssociatedFiles`, because the lock is still held when that runs, and for the whole of
 * `db.deleteOne` and the commit.
 *
 * The lock waits rather than failing fast. `NOWAIT` would turn an ordinary concurrent edit into a
 * refused delete; waiting is what makes the race-B ordering resolve correctly. The cost is that a
 * long-running transaction holding a reference to this row delays the delete for its duration —
 * PostgreSQL's default `lock_timeout` of 0 applies, and no statement-level timeout is imposed here.
 */
export const forbidReferencedOriginalDelete: CollectionBeforeDeleteHook = async ({ collection, id, req }) => {
  const slug = collection?.slug ?? 'product-media'

  // ---------------------------------------------------------------------------------------------
  // 1. Transaction-bound parent row lock.
  // ---------------------------------------------------------------------------------------------

  // H2O uses `idType: 'uuid'`, so the identifier is a string. Anything else cannot be resolved to a
  // row and is refused rather than silently skipping the lock.
  const targetId = typeof id === 'string' ? id : undefined
  if (targetId === undefined) {
    refuseReferencedDelete(REFERENCES_UNKNOWN)
  }

  const table = tableNameFor(req, slug)
  if (table === undefined) {
    refuseReferencedDelete(REFERENCES_UNKNOWN)
  }

  const transaction = await transactionExecutorOf(req)
  if (!transaction) {
    // No transaction means no durable lock is obtainable, which means the binary cannot be protected.
    // Refusing is the only honest outcome. This message is returned whether or not the target exists,
    // so it is not an existence oracle, and it carries no SQL, identifier or record content.
    refuseReferencedDelete(NO_TRANSACTION)
  }

  try {
    await transaction.execute(
      sql`SELECT "id" FROM ${sql.identifier(table)} WHERE "id" = ${targetId} FOR UPDATE`,
    )
  } catch {
    // A lock that could not be taken is indistinguishable, for safety purposes, from references that
    // could not be read. Fail closed, before anything touches storage.
    refuseReferencedDelete(REFERENCES_UNKNOWN)
  }

  // A target that does not exist returns zero rows and takes no lock. That is correct and is left to
  // Payload's ordinary not-found handling: nothing can reference a row that is not there, because the
  // foreign key would reject it. No distinct response is produced here, so no existence is disclosed.

  // ---------------------------------------------------------------------------------------------
  // 2. Reference check — now serialised behind the lock.
  // ---------------------------------------------------------------------------------------------

  // The reference check reads with `overrideAccess: true` on purpose. Whether this record is safe to
  // delete is a fact about the data, not about the caller: a derivative the caller cannot read still
  // depends on this source. Nothing is returned to the caller from this read.
  //
  // `req` is passed through, so this read runs on the same transaction as the lock above and sees the
  // same snapshot.
  const finder = finderOf(req.payload)
  if (!finder) {
    refuseReferencedDelete(REFERENCES_UNKNOWN)
  }

  let matched: unknown
  try {
    matched = await finder({
      collection: slug,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { original_asset: { equals: id } },
    })
  } catch {
    // Fail closed. Uncertainty about references is not permission to destroy evidence, and the public
    // message carries no query, no identifiers and no record content.
    refuseReferencedDelete(REFERENCES_UNKNOWN)
  }

  const docs = (matched as null | undefined | { docs?: unknown })?.docs
  if (!Array.isArray(docs)) {
    refuseReferencedDelete(REFERENCES_UNKNOWN)
  }
  if (docs.length > 0) {
    refuseReferencedDelete('At least one derivative still names it as its original.')
  }
}
