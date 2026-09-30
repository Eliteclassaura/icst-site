/**
 * Route identities the accepted templates dereference directly (by literal route id, or the six English
 * services the service component requires). An editor may edit their content and republish, but may not
 * withdraw them; `structural.test.ts` keeps this list equal to the literals in `src/site` and `src/app`.
 */
export const STRUCTURAL_ROUTE_IDS = new Set<string>([
  'SALMON-pages-48', 'SALMON-pages-411', 'SALMON-pages-1230', 'SALMON-pages-1353', 'SALMON-pages-1446',
  'SALMON-pages-1534', 'SALMON-pages-1555', 'SALMON-pages-1572', 'SALMON-pages-1668', 'SALMON-pages-1722',
  'SALMON-pages-1761', 'SALMON-pages-1797', 'SALMON-pages-1870', 'SALMON-pages-1875', 'SALMON-pages-1891',
  'SALMON-pages-1931', 'SALMON-pages-2301', 'SALMON-pages-5792', 'SALMON-posts-3221', 'SALMON-posts-3815',
  'SALMON-product-4779', 'SALMON-product-999999', 'RELEASE-SEARCH',
])
/**
 * Cohort-bound records. The accepted templates enforce frozen cohort accounting as integrity gates
 * (Main Factory authority): exactly 183 active products (Wave 3 / home parts catalog), exactly 177 matched
 * Wave 4 articles plus the live posts and the authorised retrofit article in the article directory, the
 * product categories the home parts catalog links, exactly six English services, and the /resources/ alias.
 * Withdrawing one of these would make a template refuse to render, so it is not an editorial action: an
 * editor may edit and republish them; withdrawal needs a reviewed template/cohort change first.
 */
export type StructuralInput = {
  routeId: string
  family?: string | null
  routeClass?: string | null
  disposition?: { matchedArticle?: boolean | null; releaseOverride?: string | null } | null
}
export const isStructural = (r: StructuralInput): boolean =>
  STRUCTURAL_ROUTE_IDS.has(r.routeId) ||
  r.family === 'english-service' ||
  r.family === 'alias' ||
  r.family === 'search' ||
  /^SALMON-product-[0-9]+$/.test(r.routeId) ||
  r.routeClass === 'product_cat' ||
  Boolean(r.disposition?.matchedArticle) ||
  Boolean(r.disposition?.releaseOverride) ||
  (r.family === 'live' && r.routeClass === 'posts')
