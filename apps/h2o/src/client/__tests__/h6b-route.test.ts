import { describe, expect, it } from 'vitest'
import { clientRewritePath } from '../site/route'

describe('H6b client routing', () => {
  it('leaves the default client untouched', () => {
    for (const p of ['/', '/about/', '/crm/', '/robots.txt', '/brand/logo.png']) expect(clientRewritePath(p, true)).toBeNull()
  })
  it('rewrites a non-default client\'s public paths into the client route group', () => {
    expect(clientRewritePath('/', false)).toBe('/client-preview/')
    expect(clientRewritePath('/about/', false)).toBe('/client-preview/about/')
  })
  it('keeps platform paths (api, admin, crm, next internals, the group itself) out of the rewrite', () => {
    for (const p of ['/api/x', '/admin/', '/crm/rfqs/', '/_next/static/a.js', '/client-preview/', '/client-media/a.png']) expect(clientRewritePath(p, false)).toBeNull()
  })
  it('fails closed: another client never gets the default client\'s robots, sitemap, favicon or brand files', () => {
    for (const p of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/icon.svg', '/site.webmanifest', '/brand/ics-logo-original.webp']) expect(clientRewritePath(p, false)?.startsWith('/client-preview/')).toBe(true)
  })
})
