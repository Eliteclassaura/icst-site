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
import { existsSync } from 'node:fs'
import path from 'node:path'
import { verificationFileFor } from './content/verification-files'
import { privateRobotsBody } from './content/robots-allow'
import { NextResponse, type NextRequest } from 'next/server'
import { redirectLocation } from './redirect-location'
import { SITEMAP_FILE_HEADER } from './content/sitemap-request'
import { scriptHashesFor } from './site/csp-hashes'
import { xRobotsTagForPath } from './site/robots'
import { mergeTypeformCsp } from './conversion/csp'
import { GONE_PATHS, NOINDEX_FOLLOW_PATHS } from './content/config'
import { isPayloadContent, snapshotJson } from './content/runtime-read'
import { SITEMAP_FILE } from './content/sitemap'
import { LANGUAGE_HEADER, languageFor } from './content/locale-language'
import { MFA_COOKIE, mfaCookieValid } from './auth/mfa/keys'

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

/** R3.3: only the proxy sets the sitemap-file header; a client-supplied one never reaches a handler. */
const passThrough = (req: NextRequest): NextResponse => {
  if (!req.headers.has(SITEMAP_FILE_HEADER)) return NextResponse.next()
  const headers = new Headers(req.headers)
  headers.delete(SITEMAP_FILE_HEADER)
  return NextResponse.next({ request: { headers } })
}

function crmResponse(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const csp = crmPolicy(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  // The workspace gate's return path; always overwritten here, so a client cannot supply its own.
  requestHeaders.set('x-crm-path', req.nextUrl.pathname)
  requestHeaders.delete(SITEMAP_FILE_HEADER)
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

type Ledger = { routes: Array<{ path: string; indexable?: boolean; state: string }>; redirects: Array<{ source: string; destination: string; status: number }> }
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

/**
 * R3.4 (owner request, CT 2026-10-05): a site-verification file from H2O_VERIFICATION_FILES (./content/verification-files),
 * at its exact root path, read at runtime: 200, no-store, `noindex, nofollow`. It never shadows anything that answers there
 * already — robots.txt, a sitemap address, a published route or redirect, a file in public/ — so those keep their behaviour.
 */
function verificationResponse(pathname: string): NextResponse | null {
  const file = verificationFileFor(pathname)
  if (!file || pathname === '/robots.txt' || SITEMAP_FILE.test(pathname)) return null
  const ledger = publishedLedger()
  if (ledger?.routes.some((r) => pathKeyOf(r.path) === pathKeyOf(pathname)) || ledger?.redirects.some((r) => pathKeyOf(r.source) === pathKeyOf(pathname))) return null
  if (existsSync(path.join(process.cwd(), 'public', pathname.slice(1)))) return null
  return new NextResponse(file.body, { status: 200, headers: { 'Content-Type': file.contentType, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' } })
}

/** /robots.txt: private policy disallows everything; production policy is the accepted release robots. */
export function robotsResponse(): NextResponse {
  const production = process.env.H2O_INDEXING_POLICY === 'production'
  const body = production
    ? 'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /crm/\nDisallow: /private/\nSitemap: https://h2ocooling.com/sitemap_index.xml\n'
    : privateRobotsBody() // R3.6: named audit crawlers (H2O_ROBOTS_ALLOW_AGENTS) first; everyone else disallowed
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
}

/**
 * R2.5 (CT 2026-10-05, launch indexing contract): the X-Robots-Tag decision in payload runtime, made per request from
 * H2O_INDEXING_POLICY. Fail closed: unless the policy is exactly "production", every response is `noindex, nofollow`. In
 * production the page's own decision applies (per route, below). The admin, the API and the CRM are noindex in every policy.
 */
const PRIVATE_SURFACE = /^\/(admin|api|crm)(\/|$)/
const productionIndexing = (): boolean => process.env.H2O_INDEXING_POLICY === 'production'
const withRobots = (res: NextResponse, value: string | null): NextResponse => {
  if (value !== null) res.headers.set('X-Robots-Tag', value)
  return res
}
/** The policy floor for a response that has no page decision of its own (rewrites, redirects, files, robots.txt). */
const policyFloor = (pathname: string): string | null => (PRIVATE_SURFACE.test(pathname) || !productionIndexing() ? 'noindex, nofollow' : null)

function payloadPublic(req: NextRequest): NextResponse {
  const pathname = req.nextUrl.pathname
  // R1B: the sitemap is answered by an internal route handler (it subtracts withdrawals the release does not
  // reflect yet and reads each document's updatedAt, which needs the database); the proxy rewrites to it. The index
  // answers at /sitemap_index.xml (the Yoast address Search Console holds) and at /sitemap.xml, with the children.
  const verification = verificationResponse(pathname)
  if (verification) return verification
  if (SITEMAP_FILE.test(pathname)) {
    const target = new URL('/api/public-sitemap/', req.url)
    target.search = ''
    target.searchParams.set('file', pathname.slice(1))
    // R3.3: the standalone runtime does not pass the rewrite's query to the handler; the name also travels in a request
    // header the proxy sets itself (a client-supplied value is overwritten).
    const headers = new Headers(req.headers)
    headers.set(SITEMAP_FILE_HEADER, pathname.slice(1))
    return withRobots(NextResponse.rewrite(target, { request: { headers } }), policyFloor(pathname))
  }
  if (pathname === '/robots.txt') return withRobots(robotsResponse(), policyFloor(pathname))
  if (EXCLUDED.test(pathname)) return withRobots(passThrough(req), policyFloor(pathname))
  if (CRM_PATH.test(pathname)) return crmResponse(req)
  if (GONE_PATHS.has(pathKeyOf(pathname)))
    return new NextResponse('Gone', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-cache' } })
  const ledger = publishedLedger()
  const redirect = ledger?.redirects.find((r) => pathKeyOf(r.source) === pathKeyOf(pathname))
  // R2.4 (CT 2026-10-05, SEO Checker item k): every published redirect — ledger consolidations and withdrawals — is a
  // 301, whatever the stored status (imported records default to 308; the batch normalises them too).
  if (redirect) return withRobots(NextResponse.redirect(redirectLocation(redirect.destination, req), 301), policyFloor(pathname))
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const csp = payloadPublicPolicy(nonce, pathname)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  // Locale Part B: the page language reaches the layout's <html lang> (preserved locale pages; English otherwise).
  requestHeaders.set(LANGUAGE_HEADER, languageFor(pathname))
  const preview = req.cookies.has('__prerender_bypass')
  const production = productionIndexing()
  const row = ledger?.routes.find((r) => pathKeyOf(r.path) === pathKeyOf(pathname))
  const published = !preview && production && row?.state === 'PUBLIC'
  const robots = published && NOINDEX_FOLLOW_PATHS.has(row.path) ? 'noindex, follow' : published && row.indexable ? null : 'noindex, nofollow'
  if (pathname === '/' && req.nextUrl.searchParams.has('s')) {
    const target = new URL('/search/', req.nextUrl.origin)
    target.searchParams.set('q', req.nextUrl.searchParams.get('s') ?? '')
    return securityHeaders(NextResponse.redirect(target, 307), csp, robots)
  }
  requestHeaders.delete(SITEMAP_FILE_HEADER)
  const res = securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp, robots)
  if (preview) res.headers.set('Cache-Control', 'private, no-store')
  return res
}

/**
 * Patch L2 routing: a signed-in session that has not passed two-factor is sent to /crm/mfa/ from the admin and the CRM.
 * UX only — the server-side guard (src/auth/mfa/guard.ts) is the enforcement: without it this cookie would mean
 * nothing, and with it a forged cookie gains nothing. The login, logout and password pages stay reachable.
 */
const MFA_GUARDED = /^\/(admin|crm)(\/|$)/
const MFA_OPEN = /^\/(admin\/(login|logout|forgot|reset|create-first-user|unauthorized)|crm\/mfa)(\/|$)/
const SAFE_NEXT = /^\/(admin|crm)(\/[A-Za-z0-9_\-./]*)?$/
function sidOf(token: string): string | null {
  try {
    const sid = (JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sid?: unknown }).sid
    return typeof sid === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(sid) ? sid : null
  } catch {
    return null
  }
}
export function mfaRoute(req: NextRequest): NextResponse | null {
  const path = req.nextUrl.pathname
  if (!MFA_GUARDED.test(path) || MFA_OPEN.test(path)) return null
  const token = req.cookies.get('payload-token')?.value
  const sid = token ? sidOf(token) : null
  if (!sid || mfaCookieValid(req.cookies.get(MFA_COOKIE)?.value, sid)) return null
  const target = new URL('/crm/mfa/', req.nextUrl.origin)
  if (SAFE_NEXT.test(path) && !path.includes('//') && !path.includes('..')) target.searchParams.set('next', path)
  const res = NextResponse.redirect(target, 303)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export function proxy(req: NextRequest): NextResponse {
  const mfa = mfaRoute(req)
  if (mfa) return mfa
  if (isPayloadContent()) return payloadPublic(req)
  if (EXCLUDED.test(req.nextUrl.pathname)) return NextResponse.next()
  if (CRM_PATH.test(req.nextUrl.pathname)) return crmResponse(req)

  // The hashes come from the prerendered bytes this path will be served, so the policy and the
  // page cannot disagree. Nothing is injected into the request: the previous nonce header existed
  // only so Next could stamp a nonce it never reached a prerendered page with.
  const { policy } = policyFor(scriptHashesFor(req.nextUrl.pathname))
  const robots = xRobotsTagForPath(req.nextUrl.pathname)

  if (req.nextUrl.pathname === '/' && req.nextUrl.searchParams.has('s')) {
    const target = new URL('/search/', req.nextUrl.origin)
    target.searchParams.set('q', req.nextUrl.searchParams.get('s') ?? '')
    return securityHeaders(NextResponse.redirect(target, 307), policy, robots)
  }

  return securityHeaders(NextResponse.next(), policy, robots)
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
