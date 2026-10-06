/**
 * R3.3 (Control Tower hotfix 2026-10-05; Commander Round 2 hold): which sitemap file the internal handler answers.
 *
 * The proxy rewrites /page-sitemap.xml (and every other sitemap address) to /api/public-sitemap/?file=<name>. The standalone
 * runtime, bound as in the image (HOSTNAME=0.0.0.0), does not pass that rewrite's query to the route handler, so every child
 * answered the index. The proxy therefore also names the file in a request header it sets itself; it overwrites a
 * client-supplied value on sitemap addresses and removes it from every other request in payload content mode.
 */
import { SITEMAP_FILE } from './sitemap'

export const SITEMAP_FILE_HEADER = 'x-h2o-sitemap-file'

/** The requested sitemap name (header, else `?file=`, else the index), or null when it is not a sitemap name. */
export function requestedSitemapFile(request: Request): string | null {
  const name = request.headers.get(SITEMAP_FILE_HEADER) ?? new URL(request.url).searchParams.get('file') ?? 'sitemap_index.xml'
  return SITEMAP_FILE.test(`/${name}`) ? name : null
}
