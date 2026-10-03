/**
 * H2O Phase 2D — security headers and CSP for the public estate.
 *
 * H2O had no header layer; this is its first. It carries the standard header set and adds the
 * Typeform allowance through the **accepted adapter's own** `mergeTypeformCsp`, rather than by
 * editing the policy string here.
 *
 * `script-src` is hash-based rather than nonce-based. The accepted `apps/syed-ai/src/proxy.ts`
 * pattern uses a per-request nonce with `'strict-dynamic'`, which is correct for a dynamically
 * rendered estate; H2O's 29 cohort routes are statically prerendered, and a per-request nonce can
 * never appear in HTML written once at build time. Private Preview R1 measured the consequence in a
 * real browser: every Next script refused, on every route. `src/site/csp-hashes.ts` explains the
 * replacement — the digests of the exact inline scripts each prerendered page contains, with
 * `'self'` for the same-origin chunks, no `'strict-dynamic'` and no `'unsafe-inline'`.
 *
 * That matters. `mergeTypeformCsp` only ever adds a source to a directive: it refuses a wildcard,
 * `'unsafe-inline'`, `'unsafe-eval'` and `data:` outright, it is idempotent, and it seeds a missing
 * `frame-src` from `default-src` so the effective policy stays explicit. If the merge ever refuses,
 * this module keeps the base policy rather than shipping a weakened one — the RFQ mount is gated
 * shut anyway, so a missing `frame-src` costs nothing and a widened policy would cost a great deal.
 *
 * The whole allowance is one directive, `frame-src https://form.typeform.com`, because the accepted
 * adapter loads no Typeform SDK: it renders its own iframe and validates `postMessage` itself, so
 * nothing is added to `script-src` or `connect-src`.
 *
 * Payload's admin and API are excluded: the admin needs its own policy and is not part of the
 * public estate.
 *
 * `X-Robots-Tag` is not set here as a constant. It is read from the accepted publication gate for
 * the requested path, so the header and the page's own metadata are one decision rather than two
 * that happen to agree while nothing is publication-ready.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { scriptHashesFor } from './site/csp-hashes'
import { xRobotsTagForPath } from './site/robots'
import { mergeTypeformCsp } from './conversion/csp'
import { NOINDEX_FOLLOW_PATHS } from './content/config'
import { isPayloadContent, snapshotJson } from './content/runtime-read'

const EXCLUDED = /^\/(api|admin|_next|favicon\.ico|robots\.txt|sitemap[^/]*\.xml|brand)(\/|$)/

/**
 * The base policy, before the accepted Typeform allowance is merged in.
 *
 * `scriptHashes` are the SHA-256 digests of the executable inline scripts in the prerendered page
 * being served. `'self'` covers the same-origin chunk files. There is no nonce and no
 * `'strict-dynamic'`: both are incompatible with statically prerendered HTML, which is what Private
 * Preview R1 measured in a real browser. Passing no hashes yields `script-src 'self'` alone, which
 * is stricter still — the policy has no path that widens itself.
 */
export const basePolicy = (scriptHashes: readonly string[] = []): string =>
  [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

/**
 * The policy actually sent: the base policy plus the accepted adapter's allowance.
 *
 * Exported so the tests can assert both the addition and the refusal behaviour without a request.
 */
export const policyFor = (scriptHashes: readonly string[] = []): { merged: boolean; policy: string } => {
  const base = basePolicy(scriptHashes)
  const merged = mergeTypeformCsp(base)
  // Fail closed: a refused merge keeps the stricter base rather than shipping something widened.
  return merged.ok ? { merged: true, policy: merged.policy } : { merged: false, policy: base }
}

const securityHeaders = (res: NextResponse, csp: string, robots: string | null): NextResponse => {
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  // The header is the same reading as the page's own metadata, not a second hardcoded fact: it
  // comes from `xRobotsTagForPath`, which asks the accepted publication gate. Nothing in this build
  // is publication-ready, so every path is kept out of every index — but the day a route is ready,
  // the header opens with the metadata rather than silently contradicting it.
  if (robots !== null) res.headers.set('X-Robots-Tag', robots)
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  res.headers.delete('x-powered-by')
  return res
}

/**
 * CRM UI-1 — the internal Sales Workspace (`/crm/*`) is not part of the public estate.
 *
 * Its pages are dynamic (rendered per request for a signed-in user), so the public hash-based policy —
 * built from prerendered bytes — cannot describe them and would refuse every Next inline script (the
 * workspace would never hydrate). They get their own policy instead: a per-request nonce with
 * `'strict-dynamic'`, the accepted `apps/syed-ai` pattern for dynamic pages. Next reads the policy from the
 * *request* headers and stamps the nonce on its own scripts. No Typeform allowance (the workspace embeds
 * nothing), no framing, and always `noindex, nofollow`. The public branch below is unchanged.
 */
const CRM_PATH = /^\/crm(\/|$)/

export const crmPolicy = (nonce: string): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

function crmResponse(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const csp = crmPolicy(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  // The workspace gate's return path; always overwritten here, so a client cannot supply its own.
  requestHeaders.set('x-crm-path', req.nextUrl.pathname)
  const res = securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp, 'noindex, nofollow')
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

/**
 * Payload runtime public surface (H2O_CONTENT_SOURCE=payload). Public pages are rendered per request from
 * Payload's published state, so the immutable inline-hash registry (built from prerendered bytes) cannot
 * describe them. They get a per-request nonce with `'strict-dynamic'` instead — never `'unsafe-inline'` for
 * scripts, never a wildcard origin — plus the accepted Typeform `frame-src` allowance, merged by the same
 * adapter as the static policy. `/search/` and its `/pagefind/` worker additionally allow `'wasm-unsafe-eval'`
 * (Pagefind's WebAssembly matcher); nothing else gets it.
 *
 * Redirects come from the published snapshot (Payload `public-redirects`), not from build-time JSON, so a
 * reviewed redirect change takes effect without a redeploy. The sitemap and robots.txt are served from the
 * published state too. A draft-mode (preview) request is `private, no-store` and noindex; the page itself
 * re-checks that the viewer is an editorial user.
 */
export const payloadPublicPolicy = (nonce: string, pathname: string): string => {
  // Pagefind compiles its WebAssembly matcher in the search page and in its worker (whose own response CSP
  // applies), so exactly /search/ and the /pagefind/ assets get 'wasm-unsafe-eval'.
  const wasm = pathname === '/search/' || pathname.startsWith('/pagefind/') ? " 'wasm-unsafe-eval'" : ''
  const base = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${wasm}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
  const merged = mergeTypeformCsp(base)
  return merged.ok ? merged.policy : base
}

type Ledger = { routes: Array<{ path: string; indexable?: boolean; state: string; sitemap?: boolean; canonical?: string | null }>; redirects: Array<{ source: string; destination: string; status: number }> }
const pathKeyOf = (p: string) => {
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}
function publishedLedger(): Ledger | null {
  try {
    return snapshotJson<Ledger>('ledger.json')
  } catch {
    return null
  }
}

const xmlEscape = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
/**
 * /sitemap.xml from the published ledger: only published, PUBLIC, approved-`sitemap` routes, and only under
 * the production indexing policy. Private surfaces (staging, previews) publish an empty sitemap.
 */
export function sitemapResponse(revoked: ReadonlySet<string> = new Set()): NextResponse {
  const ledger = publishedLedger()
  if (!ledger) return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const production = process.env.H2O_INDEXING_POLICY === 'production'
  const urls = production ? ledger.routes.filter((r) => r.state === 'PUBLIC' && r.sitemap && !revoked.has(r.path) && !NOINDEX_FOLLOW_PATHS.has(r.path)).map((r) => r.canonical || `https://h2ocooling.com${r.path}`) : []
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xmlEscape(u)}</loc></url>`).join('\n')}${urls.length ? '\n' : ''}</urlset>\n`
  return new NextResponse(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' } })
}
/** /robots.txt: private policy disallows everything; production policy is the accepted release robots. */
export function robotsResponse(): NextResponse {
  const production = process.env.H2O_INDEXING_POLICY === 'production'
  const body = production
    ? 'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /crm/\nDisallow: /private/\nSitemap: https://h2ocooling.com/sitemap.xml\n'
    : 'User-agent: *\nDisallow: /\n'
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
}

function payloadPublic(req: NextRequest): NextResponse {
  const pathname = req.nextUrl.pathname
  // R1B: /sitemap.xml is answered by an internal route handler (it subtracts withdrawals the release does not
  // reflect yet, which needs the database); the proxy rewrites to it.
  if (pathname === '/sitemap.xml') return NextResponse.rewrite(new URL('/api/public-sitemap/', req.url))
  if (pathname === '/robots.txt') return robotsResponse()
  if (EXCLUDED.test(pathname)) return NextResponse.next()
  if (CRM_PATH.test(pathname)) return crmResponse(req)
  const ledger = publishedLedger()
  const redirect = ledger?.redirects.find((r) => pathKeyOf(r.source) === pathKeyOf(pathname))
  if (redirect) {
    const target = req.nextUrl.clone()
    target.pathname = redirect.destination
    return NextResponse.redirect(target, redirect.status === 301 ? 301 : 308)
  }
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const csp = payloadPublicPolicy(nonce, pathname)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const preview = req.cookies.has('__prerender_bypass')
  const production = process.env.H2O_INDEXING_POLICY === 'production'
  const row = ledger?.routes.find((r) => pathKeyOf(r.path) === pathKeyOf(pathname))
  const published = !preview && production && row?.state === 'PUBLIC'
  const robots = published && NOINDEX_FOLLOW_PATHS.has(row.path) ? 'noindex, follow' : published && row.indexable ? null : 'noindex, nofollow'
  if (pathname === '/' && req.nextUrl.searchParams.has('s')) {
    const target = req.nextUrl.clone()
    target.pathname = '/search/'
    target.search = ''
    target.searchParams.set('q', req.nextUrl.searchParams.get('s') ?? '')
    return securityHeaders(NextResponse.redirect(target, 307), csp, robots)
  }
  const res = securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp, robots)
  if (preview) res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export function proxy(req: NextRequest): NextResponse {
  if (isPayloadContent()) return payloadPublic(req)
  if (EXCLUDED.test(req.nextUrl.pathname)) return NextResponse.next()
  if (CRM_PATH.test(req.nextUrl.pathname)) return crmResponse(req)

  // The hashes come from the prerendered bytes this path will be served, so the policy and the
  // page cannot disagree. Nothing is injected into the request: the previous nonce header existed
  // only so Next could stamp a nonce it never reached a prerendered page with.
  const { policy } = policyFor(scriptHashesFor(req.nextUrl.pathname))
  const robots = xRobotsTagForPath(req.nextUrl.pathname)

  if (req.nextUrl.pathname === '/' && req.nextUrl.searchParams.has('s')) {
    const target = req.nextUrl.clone()
    target.pathname = '/search/'
    target.search = ''
    target.searchParams.set('q', req.nextUrl.searchParams.get('s') ?? '')
    return securityHeaders(NextResponse.redirect(target, 307), policy, robots)
  }

  return securityHeaders(NextResponse.next(), policy, robots)
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
