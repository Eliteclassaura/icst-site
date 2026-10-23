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

/**
 * 1.3b login routing: where a person goes once sign-in (including the second step) is done. A CRM-only account always
 * lands in the CRM; an account with a CMS role keeps the admin or CRM path it asked for (the `redirect` parameter),
 * and a missing or unsafe one means the CRM.
 */
export function signInDestination(user: unknown, requested: string): string {
  return adminRouteDestination(user, undefined) ?? requested
}
