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

/**
 * SITEMAP-PREVIEW-1: the request's own origin, named by the proxy (it sets this header itself on sitemap addresses and removes it from every
 * other payload-mode request, like the file header). Only the private review host is honoured (sitemap-response SITEMAP_PREVIEW_ORIGINS).
 */
export const SITEMAP_ORIGIN_HEADER = 'x-h2o-sitemap-origin'

/**
 * SITEMAP-PREVIEW-1.1 (Security Auditor C1, CT 2026-10-09): the public origin of a request, from the headers the edge proxy sets, not from
 * `nextUrl.origin` (the standalone server reports its own bind address there, e.g. http://0.0.0.0:3000, which is never the review host).
 * Host: the first `x-forwarded-host` value, else `host`; scheme: the first `x-forwarded-proto` value when it is http or https, else https
 * (the public edge is TLS only). Lower-cased, default port dropped, anything that is not a plain host[:port] is ignored. With no host
 * header at all the framework's own origin is returned. The result is only ever compared EXACTLY to SITEMAP_PREVIEW_ORIGINS, so a
 * client-supplied value can at most name the review host itself.
 */
export function requestOrigin(headers: Pick<Headers, 'get'>, fallback: string): string {
  const first = (name: string): string => (headers.get(name) ?? '').split(',')[0]!.trim().toLowerCase()
  const raw = first('x-forwarded-host') || first('host')
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(raw)) return fallback
  const proto = first('x-forwarded-proto')
  const scheme = proto === 'http' || proto === 'https' ? proto : 'https'
  const host = raw.replace(scheme === 'https' ? /:443$/ : /:80$/, '')
  return `${scheme}://${host}`
}
