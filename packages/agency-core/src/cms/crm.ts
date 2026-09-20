/**
 * Operations / CRM entry.
 *
 * `makeSlugRedirectHook` lives here rather than with the other content hooks because it finds and creates
 * `redirects` documents, and `redirects` is a member of this layer.
 *
 * Registering this layer today also requires the editorial `industries`, which `companies.industry`
 * relates to. That edge is recorded rather than hidden; removing it is a taxonomy question, not a
 * boundary question, and is not in scope for this increment.
 */
export * from './collections/crm'
export * from './hooks/slug-redirect'
