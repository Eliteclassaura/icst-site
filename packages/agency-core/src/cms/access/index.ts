import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'
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
