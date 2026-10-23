/**
 * Request proxy of the client site (fork of the default site's proxy, pruned to what a client needs): the two-factor routing for the
 * admin and the CRM, the CRM's own nonce policy, and a per-request nonce policy for the public pages. Everything specific to the
 * default site (legacy image redirects, publication ledger, verification files, sitemap headers, Typeform allowance, translate widget,
 * private-staging media) is deliberately not here: the build must not be able to carry it (see PORTING_LEDGER.md).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { MFA_COOKIE, mfaCookieValid } from './auth/mfa/keys'
import { client } from './client'
import { loadRedirects, redirectFor } from './client/site/redirects'

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

/** Public pages are rendered per request: a nonce with strict-dynamic, no unsafe-inline script, no wildcard origin, no framing. */
export const publicPolicy = (nonce: string): string =>
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

const PRIVATE_SURFACE = /^\/(admin|api|crm)(\/|$)/
const productionIndexing = (): boolean => process.env.H2O_INDEXING_POLICY === 'production'

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
/**
 * M1b (port of 1.3c-8/S1 bind-address class): an absolute Location must never name the server's bind address (the standalone server
 * reports 0.0.0.0 or ::). Such a request is answered with the configured public origin instead.
 */
export function redirectOrigin(req: NextRequest): string {
  const host = req.nextUrl.hostname
  if (host === '0.0.0.0' || host === '::' || host === '[::]') {
    return new URL(process.env.NEXT_PUBLIC_SERVER_URL || client().origin).origin
  }
  return req.nextUrl.origin
}

export function mfaRoute(req: NextRequest): NextResponse | null {
  const path = req.nextUrl.pathname
  if (!MFA_GUARDED.test(path) || MFA_OPEN.test(path)) return null
  const token = req.cookies.get('payload-token')?.value
  const sid = token ? sidOf(token) : null
  if (!sid || mfaCookieValid(req.cookies.get(MFA_COOKIE)?.value, sid)) return null
  const target = new URL('/crm/mfa/', redirectOrigin(req))
  if (SAFE_NEXT.test(path) && !path.includes('//') && !path.includes('..')) target.searchParams.set('next', path)
  // R2.5a (CT 2026-10-05): a protected-surface response is noindex in every policy and carries the standard security headers,
  // the two-factor redirect included (it is returned before the payload/static branches).
  const res = securityHeaders(NextResponse.redirect(target, 303), "default-src 'none'; frame-ancestors 'none'", 'noindex, nofollow')
  res.headers.set('Cache-Control', 'no-store')
  return res
}

/**
 * 1.3c-8: a NUL in a URL (`%00`, also in the query string) is never a real address. The database refuses it, and the error it raises
 * carries the SQL and the bound text, so it is answered here with a plain 400 before anything reads it. `%2500` (an encoded percent
 * sign followed by "00") is not a NUL and is left alone.
 */
export function nulRoute(req: NextRequest): NextResponse | null {
  const raw = `${req.nextUrl.pathname}${req.nextUrl.search}`
  if (!/%00/i.test(raw.replace(/%25/gi, '')) && !raw.includes('\u0000')) return null
  return new NextResponse('Bad request', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

/**
 * 1.3b login routing: the bare Payload login (what logout lands on, or a typed address) goes to the CRM sign-in; a link that carries its
 * own `redirect` is left alone, so admins still reach /admin.
 */
const CRM_LOGIN_PATH = '/admin/login/?redirect=%2Fcrm%2F'
const BARE_LOGIN = /^\/admin\/login\/?$/
export function loginRoute(req: NextRequest): NextResponse | null {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !BARE_LOGIN.test(req.nextUrl.pathname) || req.nextUrl.searchParams.has('redirect')) return null
  const target = new URL(CRM_LOGIN_PATH, redirectOrigin(req))
  const res = securityHeaders(NextResponse.redirect(target, 307), "default-src 'none'; frame-ancestors 'none'", 'noindex, nofollow')
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export function proxy(req: NextRequest): NextResponse {
  const nul = nulRoute(req)
  if (nul) return nul
  const mfa = mfaRoute(req)
  if (mfa) return mfa
  const login = loginRoute(req)
  if (login) return login
  const path = req.nextUrl.pathname
  if (/^\/_next\//.test(path)) return NextResponse.next()
  // The client's redirect ledger, before any routing: one hop to the final page, or 410. Never for platform paths.
  const hop = redirectFor(path, loadRedirects(client().slug))
  if (hop) {
    if (hop.status === 410) return securityHeaders(new NextResponse('Gone', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }), "default-src 'none'", 'noindex')
    const res = securityHeaders(NextResponse.redirect(new URL(hop.to, productionIndexing() ? client().origin : redirectOrigin(req)), 301), "default-src 'none'", null)
    res.headers.set('Cache-Control', 'public, max-age=3600')
    return res
  }
  if (CRM_PATH.test(path)) return crmResponse(req)
  // Admin and API keep their own handling; they are never indexed.
  if (PRIVATE_SURFACE.test(path)) return securityHeaders(NextResponse.next(), "default-src 'self'", 'noindex, nofollow')
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const csp = publicPolicy(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  return securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp, productionIndexing() ? null : 'noindex, nofollow')
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
