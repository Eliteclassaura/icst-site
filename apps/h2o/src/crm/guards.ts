import { APIError } from 'payload'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'
import { uuidv7 } from './ids'

/**
 * Invariants that must hold on **every** path — REST, GraphQL, admin UI and the Local API.
 *
 * Access control is skipped by the Local API unless a caller passes `overrideAccess: false`, so anything
 * that must be true regardless of who asks is enforced here, in collection hooks, which run on all paths.
 * Each guard throws a public 4xx `APIError`: an attempted violation is **rejected**, never silently
 * discarded, so a caller (or a test) cannot mistake a refused write for a successful one.
 */

export class CrmInvariantError extends APIError {
  constructor(
    readonly code: string,
    message: string,
    status = 400,
  ) {
    super(`[${code}] ${message}`, status, { code }, true)
  }
}

/** Relationship values arrive as ids or populated objects depending on depth; compare by id. */
export function relId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in (value as object)) return String((value as { id: unknown }).id)
  return null
}

const comparable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(comparable)
  if (value && typeof value === 'object') {
    // A populated relationship is a stored document (it has timestamps); compare it by id. An array row
    // also has an `id`, but it is compared by content — otherwise editing a row's value while keeping its
    // row id would look unchanged.
    if ('id' in (value as object) && ('createdAt' in (value as object) || 'updatedAt' in (value as object)))
      return relId(value)
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as object).sort()) {
      if (k === 'id') continue // array-row ids are storage artefacts
      out[k] = comparable((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value ?? null
}
export const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))

/** Server-assigned canonical UUIDv7 on create. A client-supplied value is ignored, never trusted. */
export const assignCanonicalId: CollectionBeforeValidateHook = ({ data, operation, originalDoc }) => {
  if (!data) return data
  if (operation === 'create') data.canonical_id = uuidv7()
  else if (originalDoc) {
    if ('canonical_id' in data && !sameValue(data.canonical_id, originalDoc.canonical_id))
      throw new CrmInvariantError('CANONICAL_ID_IMMUTABLE', 'canonical_id cannot change.')
    data.canonical_id = originalDoc.canonical_id
  }
  return data
}

/** Fields that may be set when a record is created and never changed afterwards. */
export const writeOnce =
  (collection: string, fields: readonly string[]): CollectionBeforeChangeHook =>
  ({ data, operation, originalDoc }) => {
    if (operation !== 'update' || !originalDoc) return data
    for (const f of fields) {
      if (!(f in data)) continue
      if (!sameValue((data as Record<string, unknown>)[f], (originalDoc as Record<string, unknown>)[f]))
        throw new CrmInvariantError('WRITE_ONCE_FIELD', `${collection}.${f} is write-once and cannot change.`)
    }
    return data
  }

/** A timeline/ledger record: created once, never updated. */
export const appendOnly =
  (collection: string): CollectionBeforeChangeHook =>
  ({ data, operation }) => {
    if (operation === 'update')
      throw new CrmInvariantError(
        'APPEND_ONLY',
        `${collection} records are append-only and cannot be updated.`,
      )
    return data
  }

/** Durable records are never deleted — not by an admin, not through the Local API. */
export const forbidDelete =
  (collection: string, alternative: string): CollectionBeforeDeleteHook =>
  () => {
    throw new CrmInvariantError(
      'DELETE_FORBIDDEN',
      `${collection} records cannot be deleted. ${alternative}`,
      403,
    )
  }

/**
 * Fields only the server may set. On create they are overwritten from `server`; on update any attempt to
 * change them is rejected. Used for provenance stamps a client must never supply.
 */
export const serverOwned =
  (collection: string, fields: readonly string[]): CollectionBeforeValidateHook =>
  ({ data, operation, originalDoc, context }) => {
    if (!data) return data
    if (operation === 'update' && originalDoc) {
      for (const f of fields)
        if (
          f in data &&
          !sameValue((data as Record<string, unknown>)[f], (originalDoc as Record<string, unknown>)[f])
        )
          throw new CrmInvariantError('SERVER_OWNED_FIELD', `${collection}.${f} is set by the server only.`)
      return data
    }
    // On create, trusted server code passes values through `context.crmServer`; anything in `data` for
    // these fields that did not come from there is discarded.
    const server = (context as { crmServer?: Record<string, unknown> } | undefined)?.crmServer ?? {}
    for (const f of fields) {
      if (f in server) (data as Record<string, unknown>)[f] = server[f]
      else delete (data as Record<string, unknown>)[f]
    }
    return data
  }

/** Is this call from CRM-1 trusted server code? Only the Local API can set `context`; REST cannot. */
export const isServerContext = (context: unknown): boolean =>
  Boolean((context as { crmServer?: unknown } | undefined)?.crmServer)

/** The acting user's id, or null for system/integration writes. */
export const actorId = (req: PayloadRequest): string | null => (req.user ? String(req.user.id) : null)
/**
 * The document as it will be after this write. Collection `beforeChange` hooks receive only the incoming
 * fields on a partial update (REST PATCH), so every cross-field rule validates against this merged view
 * and writes its derived values back into `data`.
 */
export const merged = <T extends Record<string, unknown>>(data: Partial<T>, originalDoc?: T | null): T =>
  ({ ...((originalDoc ?? {}) as T), ...(data as T) }) as T
