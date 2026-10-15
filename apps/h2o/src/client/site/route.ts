/**
 * KIT-0 H6b: where a public request goes for a non-default client. Pure, so the proxy stays a two-line edit and the rule is tested.
 *
 * For the default client nothing changes (returns null). For any other client every path is rewritten into the `(client)` route
 * group EXCEPT the paths that belong to the platform itself (API, admin, CRM, Next internals, the route group's own URL space).
 * Fail closed: robots.txt, sitemaps, favicons and `/brand/*` are NOT passed through, so the default client's files can never be
 * served for another client; until the client has its own, they 404.
 */
export const CLIENT_ROUTE_PREFIX = '/client-preview'
const PLATFORM = /^\/(api|admin|_next|crm|client-preview|client-media)(\/|$)/

export function clientRewritePath(pathname: string, isDefaultClient: boolean): string | null {
  if (isDefaultClient) return null
  if (PLATFORM.test(pathname)) return null
  return `${CLIENT_ROUTE_PREFIX}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}
