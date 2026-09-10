import { NextResponse, type NextRequest } from 'next/server'

// Enforce trailing-slash canonical URLs on PUBLIC routes only (legacy parity, A14).
// Payload's /api and /admin are excluded so REST/GraphQL/admin never get redirected.
const EXCLUDED = /^\/(api|admin|_next|favicon\.ico|robots\.txt|sitemap[^/]*\.xml|llms\.txt|site\.webmanifest)(\/|$)/

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (EXCLUDED.test(pathname)) return NextResponse.next()

  // /index.html and /x/index.html → canonical directory URL (checked before the file rule)
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
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] }
