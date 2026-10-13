import type { PayloadRequest } from 'payload'
import { ADMINS, hasRole, type Role } from '@factory/agency-core/cms/kernel'

const CMS_ADMIN_ROLES: Role[] = [...ADMINS, 'editor', 'viewer']

/** The Payload login is shared with CRM; a sales account without an admin role stays in CRM. */
export const adminUiAccess = ({ req }: { req: PayloadRequest }): boolean =>
  Boolean(req.user) && hasRole(req, CMS_ADMIN_ROLES)

/** Covers custom admin views as well as the ordinary Payload dashboard and collection routes. */
export function adminRouteDestination(user: unknown, segments: readonly string[] | undefined): string | null {
  if (!user) return null
  const req = { user } as PayloadRequest
  if (hasRole(req, CMS_ADMIN_ROLES) || (segments?.length === 1 && segments[0] === 'logout')) return null
  return '/crm/'
}
