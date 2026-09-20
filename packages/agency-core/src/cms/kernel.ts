/**
 * CMS kernel — everything that needs no collection to exist.
 *
 * Access helpers, roles, security defaults, revalidation and publish-time verification. Nothing here
 * references a collection slug, so importing this entry contributes **zero** members to an app's
 * `CollectionSlug` union. An app that only needs `securityDefaults` or `ROLES` pays nothing for the
 * content model — which is the whole point of the entry existing.
 */
export * from './access/index'
export * from './hooks/revalidate'
export * from './hooks/verification'
export { securityDefaults, turnstileReadiness } from './security'
export type { TurnstileReadiness } from './security'
