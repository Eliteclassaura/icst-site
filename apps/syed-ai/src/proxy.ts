import { NextResponse, type NextRequest } from 'next/server'
import staticMap from '../content/redirects.json'

// Public-route policy (legacy parity, A14; security headers from the legacy .htaccess §2; C5):
//   1. host canonicalisation (www → apex, http → https) when SITE_HOST is set
//   2. gone paths and active redirects from the redirect map (ADR-028 §7); /index.html → directory URL; trailing slash on public routes
//   3. security headers + CSP on public HTML; Payload /api and /admin (incl. /api/health and /api/live) are excluded from redirects and CSP
const EXCLUDED =
  /^\/(api|admin|_next|favicon\.ico|robots\.txt|sitemap[^/]*\.xml|llms\.txt|site\.webmanifest)(\/|$)/

type RedirectMap = {
  redirects: Record<string, { to: string | null; status: number }>
  gone: Record<string, number>
}

/**
 * Redirect map (ADR-028 §7). Starts from the build-time `content/redirects.json` (blueprint redirects + legacy
 * `gone` paths) and refreshes from `/api/redirects-map` — active CMS rows only — every REFRESH_MS. Payload
 * itself is never loaded in the proxy. A failed refresh keeps the last good map.
 */
const REFRESH_MS = 30_000
let liveMap: RedirectMap = staticMap as RedirectMap
let fetchedAt = 0
let inflight: Promise<void> | null = null
function refreshMap(origin: string) {
  if (Date.now() - fetchedAt < REFRESH_MS || inflight) return
  inflight = fetch(`${origin}/api/redirects-map`, { headers: { accept: 'application/json' } })
    .then(async (r) => {
      if (r.ok) {
        const m = (await r.json()) as RedirectMap
        if (m && m.redirects) liveMap = { redirects: m.redirects, gone: m.gone ?? staticMap.gone }
      }
    })
    .catch(() => undefined)
    .finally(() => {
      fetchedAt = Date.now()
      inflight = null
    })
}

/** Nonce-based CSP. Next reads the CSP from the *request* headers to nonce its own inline runtime; JSON-LD is data (application/ld+json), not governed by script-src. */
function cspFor(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

function securityHeaders(res: NextResponse, csp: string) {
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  if (process.env.NODE_ENV === 'production')
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  res.headers.delete('x-powered-by')
  return res
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // 1. Host canonicalisation (production only, when the canonical host is known)
  const canonicalHost = process.env.SITE_HOST
  const host = req.headers.get('host') ?? ''
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  if (canonicalHost && host && (host !== canonicalHost || proto !== 'https') && !EXCLUDED.test(pathname)) {
    return NextResponse.redirect(`https://${canonicalHost}${pathname}${search}`, 308)
  }

  if (EXCLUDED.test(pathname)) return NextResponse.next()

  // Gone paths (legacy endpoints) and active redirects, one hop, declared status.
  refreshMap(req.nextUrl.origin)
  const gone = liveMap.gone[pathname]
  if (gone) return new NextResponse(null, { status: gone })
  const hit = liveMap.redirects[pathname] ?? liveMap.redirects[pathname.replace(/\/$/, '') + '/']
  if (hit) {
    if (hit.status === 410 || !hit.to) return new NextResponse(null, { status: 410 })
    const target = hit.to.startsWith('http') ? hit.to : new URL(hit.to + search, req.url)
    return NextResponse.redirect(target, hit.status === 301 ? 301 : 308)
  }

  // 2. /index.html and /x/index.html → canonical directory URL (checked before the file rule)
  if (pathname === '/index.html' || pathname.endsWith('/index.html')) {
    const target = pathname.slice(0, -'index.html'.length) || '/'
    return NextResponse.redirect(new URL(target + search, req.url), 308)
  }
  // Other file-like paths (have an extension) are left alone.
  if (/\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next()

  if (pathname !== '/' && !pathname.endsWith('/')) {
    // Build from a string, not nextUrl.clone(): the clone normalises the slash away.
    return NextResponse.redirect(new URL(pathname + '/' + search, req.url), 308)
  }

  // 3. Public HTML: per-request nonce for Next's inline runtime + security headers
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
  const csp = cspFor(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  return securityHeaders(res, csp)
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
