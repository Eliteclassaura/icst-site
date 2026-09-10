/**
 * Roles (master prompt §Security). Least privilege; CRM/search/email actions are scoped
 * separately from content editing.
 */
export const ROLES = [
  'platform-admin',
  'client-admin',
  'editor',
  'search-analyst',
  'sales',
  'viewer',
] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  'platform-admin': 'Platform administrator (agency)',
  'client-admin': 'Client administrator',
  editor: 'Editor',
  'search-analyst': 'SEO / search analyst',
  sales: 'Sales',
  viewer: 'Read-only viewer',
}

/** Role groups used by access rules. */
export const ADMINS: Role[] = ['platform-admin', 'client-admin']
export const CONTENT_WRITERS: Role[] = [...ADMINS, 'editor']
export const CONTENT_READERS: Role[] = [...CONTENT_WRITERS, 'search-analyst', 'sales', 'viewer']
export const CRM_USERS: Role[] = [...ADMINS, 'sales']
export const SEARCH_USERS: Role[] = [...ADMINS, 'search-analyst']
export const PUBLISHERS: Role[] = [...ADMINS, 'editor']
