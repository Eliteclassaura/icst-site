/**
 * H2O Phase 2D — one robots decision, read by three surfaces.
 *
 * Page metadata, the `X-Robots-Tag` response header and the private-preview notice were three
 * separate facts in R2, and all three happened to say "not published". They agreed by coincidence:
 * two of them were hardcoded, so the day a route became publication-ready the page metadata would
 * have opened and the header would have kept it shut.
 *
 * This module is the single reading. `robotsFor` answers for one route, `xRobotsTagForPath` answers
 * for one request path, and both call `isIndexable` — the same function the page metadata uses.
 * A route that is not in the cohort has nothing publishable behind it and is kept out of every
 * index, which is also what a crawler should be told about the admin, the API and the static
 * asset paths this build never publishes.
 */
import { cohort, type CohortPage } from './cohort'
import { isIndexable } from './gate'

export type RobotsDirective = {
  follow: boolean
  index: boolean
  /** The header form, or null when nothing needs to be said because the page is indexable. */
  header: string | null
}

export const INDEXABLE: RobotsDirective = { follow: true, header: null, index: true }
export const NOT_INDEXABLE: RobotsDirective = {
  follow: false,
  header: 'noindex, nofollow',
  index: false,
}

/** The robots decision for one accepted route. */
export const robotsFor = (page: CohortPage): RobotsDirective =>
  isIndexable(page) ? INDEXABLE : NOT_INDEXABLE

/** Normalise a request path to the accepted canonical form: rooted, with a trailing slash. */
export const canonicalise = (pathname: string): string => {
  const rooted = pathname.startsWith('/') ? pathname : `/${pathname}`
  return rooted.endsWith('/') ? rooted : `${rooted}/`
}

/**
 * The `X-Robots-Tag` value for a request path, or null when none should be sent.
 *
 * Null is returned only for a cohort route that is genuinely indexable. Everything else — a route
 * that is not publication-ready, and any path that is not an accepted route at all — is kept out of
 * every index at the header level as well as in the page's own metadata.
 */
export const xRobotsTagForPath = (pathname: string, pages: CohortPage[] = cohort()): string | null => {
  const wanted = canonicalise(pathname)
  const page = pages.find((candidate) => candidate.canonicalPath === wanted) ?? null
  return page === null ? NOT_INDEXABLE.header : robotsFor(page).header
}
