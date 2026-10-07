import { Forbidden, type Access, type CollectionBeforeChangeHook, type FieldAccess, type PayloadRequest, type Where } from 'payload'
import { ADMINS, CONTENT_READERS, CONTENT_WRITERS, CRM_USERS, SEARCH_USERS, type Role } from './roles'

type UserLike = { id: string | number; roles?: Role[] | null; email?: string } | null | undefined

export function userRoles(req: PayloadRequest): Role[] {
  const u = req.user as UserLike
  return (u?.roles ?? []) as Role[]
}
export function hasRole(req: PayloadRequest, roles: Role[]): boolean {
  const mine = userRoles(req)
  return mine.some((r) => roles.includes(r))
}

/** Access: any authenticated user with one of the roles. */
export const roles =
  (...allowed: Role[]): Access =>
  ({ req }) =>
    hasRole(req, allowed)

export const isAdmin: Access = ({ req }) => hasRole(req, ADMINS)
export const isPlatformAdmin: Access = ({ req }) => hasRole(req, ['platform-admin'])
export const canWriteContent: Access = ({ req }) => hasRole(req, CONTENT_WRITERS)
export const canReadContentDrafts: Access = ({ req }) => hasRole(req, CONTENT_READERS)
export const isCrmUser: Access = ({ req }) => hasRole(req, CRM_USERS)
export const isSearchUser: Access = ({ req }) => hasRole(req, SEARCH_USERS)
export const anyone: Access = () => true
export const nobody: Access = () => false

/**
 * Public collections with drafts: anonymous visitors see only published docs;
 * content readers see drafts too. Returned as a Where clause for the anonymous case
 * so list queries filter server-side (no leak through search endpoints).
 */
export const publishedOrContentReader: Access = ({ req }) => {
  if (hasRole(req, CONTENT_READERS)) return true
  return { _status: { equals: 'published' } } as Where
}

/** Field-level: only admins may change roles. */
export const adminFieldOnly: FieldAccess = ({ req }) => hasRole(req, ADMINS)

/** Users may read/update themselves; admins everyone. */
export const selfOrAdmin: Access = ({ req }) => {
  if (hasRole(req, ADMINS)) return true
  const u = req.user as UserLike
  if (!u) return false
  return { id: { equals: u.id } } as Where
}

/**
 * SEC-MAIN-1 (security audit R1, users.client-admin-platform-admin-takeover; CT ruling): platform-admin is the agency
 * tier. Only a platform-admin may grant or revoke platform-admin, or change a platform-admin account (password, email,
 * two-factor reset, anything else). Client-admins manage only non-platform users. Enforced three ways, so REST, GraphQL,
 * the admin UI and the Local API with a user all agree:
 *   - collection `update` access (`usersUpdate`): a client-admin is refused a platform-admin target by id (the admin
 *     UI shows that account read-only);
 *   - field access (`tierFieldAccess`) on `roles` and on app fields such as the two-factor reset;
 *   - a `beforeChange` guard (`guardPlatformTier`) on every create/update made by a signed-in user, which also covers
 *     bulk updates and a grant of platform-admin. Server code without a user (seed, break-glass) is not affected.
 */
export const PLATFORM_ADMIN: Role = 'platform-admin'
export const isPlatformAdminUser = (req: PayloadRequest): boolean => hasRole(req, [PLATFORM_ADMIN])
const holdsPlatformAdmin = (doc: unknown): boolean =>
  Array.isArray((doc as { roles?: unknown } | null | undefined)?.roles) && ((doc as { roles: unknown[] }).roles).includes(PLATFORM_ADMIN)

/** Users collection update: self, or an admin; a client-admin never a platform-admin account. */
export const usersUpdate: Access = async ({ req, id }) => {
  if (isPlatformAdminUser(req)) return true
  if (hasRole(req, ADMINS)) {
    if (id == null) return true // bulk update: guardPlatformTier refuses each platform-admin row
    const target = await req.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, req, disableErrors: true })
    return !holdsPlatformAdmin(target)
  }
  const u = req.user as UserLike
  if (!u) return false
  return { id: { equals: u.id } } as Where
}

/** Field access for tier-sensitive user fields: a platform-admin always; another admin only on a non-platform account. */
export const tierFieldAccess: FieldAccess = ({ req, doc }) => isPlatformAdminUser(req) || (hasRole(req, ADMINS) && !holdsPlatformAdmin(doc))

/** Users beforeChange: refuse a non-platform actor who grants platform-admin or changes a platform-admin account. */
export const guardPlatformTier: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!req.user || isPlatformAdminUser(req)) return data
  if (holdsPlatformAdmin(data)) throw new Forbidden(req.t)
  if (holdsPlatformAdmin(originalDoc)) throw new Forbidden(req.t)
  return data
}

/** Sensitive record collections: read-limited to a role group, never public. */
export const crmRead: Access = ({ req }) => hasRole(req, CRM_USERS)
export const crmWrite: Access = ({ req }) => hasRole(req, CRM_USERS)
export const searchRead: Access = ({ req }) => hasRole(req, SEARCH_USERS)
export {
  ROLES,
  ROLE_LABELS,
  ADMINS,
  CONTENT_WRITERS,
  CONTENT_READERS,
  CRM_USERS,
  SEARCH_USERS,
  PUBLISHERS,
} from './roles'
export type { Role } from './roles'
