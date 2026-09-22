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

export function proxy(req: NextRequest): NextResponse {
  if (EXCLUDED.test(req.nextUrl.pathname)) return NextResponse.next()

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
