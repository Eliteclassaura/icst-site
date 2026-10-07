import type { NextRequest } from 'next/server'

/**
 * R3.2 (Control Tower 2026-10-05): a ledger redirect's Location is its approved target, byte-exact. `NextURL.clone()`
 * re-formats the path with the *request's* trailing-slash state: under `trailingSlash: true` a file-extension source
 * (`/content/uploads/x.jpg`) has none, so `/x.jpg → /guide/` went out as `/guide` and cost a 308 hop. A plain URL keeps the
 * target as written: its path and trailing slash, its query, its percent-escapes (case included). The request's own query
 * is carried only when the target has none, as before; the origin is the request's, as before.
 */
export function redirectLocation(destination: string, req: Pick<NextRequest, 'nextUrl'>): string {
  const target = new URL(destination, req.nextUrl.origin)
  // SEC-MAIN-1 (security audit R1, redirect.backslash-open-redirect): a ledger redirect never leaves the site. A target
  // that resolves to another origin ("/" + backslash + "evil.example") goes to the home page instead.
  if (target.origin !== req.nextUrl.origin) return new URL('/', req.nextUrl.origin).href
  if (!destination.includes('?')) target.search = req.nextUrl.search
  return target.href
}
