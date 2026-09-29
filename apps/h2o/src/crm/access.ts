import type { Access, CollectionBeforeOperationHook, FieldAccess } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'

/**
 * CRM-1 access rules — composed from the shared role model; no role is invented and nothing is exported
 * back into agency-core.
 *
 * Who is a CRM user is the shared `CRM_USERS` group: platform-admin, client-admin, sales. `editor`,
 * `search-analyst` and `viewer` have **no** CRM access — least privilege, and a content role gaining
 * sight of customer PII would be a silent widening. (Whether `viewer` should read the pipeline is an owner
 * input, recorded in CRM_OPEN_OWNER_INPUTS.md; the answer widens additively.)
 *
 * Anonymous requests have no user and therefore no role: every rule below returns `false` for them. There is
 * no `anyone` rule on any CRM collection, and no `Where` clause is ever returned — a filter is an allow.
 *
 * These rules govern REST, GraphQL (disabled by default) and the admin UI. The Local API defaults to
 * `overrideAccess: true`, so **the invariants that must hold everywhere live in hooks** (`guards.ts`), not
 * here.
 */

export const crmUser: Access = ({ req }) => hasRole(req, CRM_USERS)
export const crmAdmin: Access = ({ req }) => hasRole(req, ADMINS)
export const noOne: Access = () => false

export const crmUserField: FieldAccess = ({ req }) => hasRole(req, CRM_USERS)
export const crmAdminField: FieldAccess = ({ req }) => hasRole(req, ADMINS)

/**
 * Value-sensitive write: a non-admin may write the field, but never to one of the named `privileged`
 * values. A missing/non-string incoming value is allowed because there is then nothing to write — Payload
 * substitutes the existing value or the default (the same fail-closed reasoning as `src/access/index.ts`).
 */
export const adminOnlyValues =
  (field: string, privileged: readonly string[]): FieldAccess =>
  ({ req, siblingData }) => {
    if (hasRole(req, ADMINS)) return true
    const incoming = (siblingData as Record<string, unknown> | undefined)?.[field]
    if (typeof incoming !== 'string') return true
    return !privileged.includes(incoming)
  }

/** Largest page a non-admin may request. Paging stays possible; a single-request bulk export does not. */
export const NON_ADMIN_MAX_PAGE = 100

/**
 * Anti-bulk-export control. Payload lets a caller ask for `limit=0` / `pagination=false`, which returns an
 * entire collection in one response. For a non-admin that is an export in all but name, so the request is
 * narrowed to a bounded page. Admin export is still a deliberate, audited act (CRM_SECURITY_MODEL.md §6).
 */
export const capListForNonAdmins: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'read' || hasRole(req, ADMINS)) return args
  const a = args as { limit?: number; pagination?: boolean; overrideAccess?: boolean }
  // Trusted server code (overrideAccess) must see the whole answer — a suppression lookup capped at one
  // page could miss a suppression. REST/GraphQL/admin requests never run with overrideAccess.
  if (a.overrideAccess === true) return args
  if (a.pagination === false) a.pagination = true
  if (typeof a.limit !== 'number' || a.limit <= 0 || a.limit > NON_ADMIN_MAX_PAGE)
    a.limit = NON_ADMIN_MAX_PAGE
  return args
}

/** Standard CRM collection access: CRM users read/create/update; nobody deletes (durability). */
export const crmCollectionAccess = {
  read: crmUser,
  create: crmUser,
  update: crmUser,
  delete: noOne,
} as const
