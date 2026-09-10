# `packages/agency-core/src/cms/access/roles.ts` — add `automation`

```ts
export const ROLES = [
  'platform-admin',
  'client-admin',
  'editor',
  'search-analyst',
  'sales',
  'viewer',
  'automation',            // + machine role for OGCS service accounts (ADR-026)
] as const

export const ROLE_LABELS: Record<Role, string> = {
  // …existing…
  automation: 'Automation (OGCS service account)',
}

// Groups — `automation` is deliberately absent from ADMINS, CRM_USERS, SEARCH_USERS, PUBLISHERS.
export const AUTOMATION_WRITERS: Role[] = [...CONTENT_WRITERS, 'automation']
```

# `packages/agency-core/src/cms/access/index.ts` — accessors

```ts
export const isAutomation: Access = ({ req }) => req.user?.collection === 'service-accounts'
export const canWriteContentOrAutomation: Access = ({ req }) => hasRole(req, AUTOMATION_WRITERS)
```

Apply `canWriteContentOrAutomation` to **create/update only** on: `pages`, `posts`, `media`, `faqs`, `glossary-terms`, `schema-entities`, `citations`, `redirects` (with the `source: 'automation'` constraint in a hook). Leave `delete` rules unchanged everywhere (automation never deletes). `hasRole` must read roles from `req.user.roles` regardless of `req.user.collection` — verify it does not assume the `users` collection.
