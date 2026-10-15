import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { crmPolicy, proxy, publicPolicy } from '../proxy'

const req = (p: string) => new NextRequest(`https://icsthailand.co.th${p}`)
const csp = (p: string) => proxy(req(p)).headers.get('content-security-policy') ?? ''

describe('client-site proxy CSP', () => {
  it('public pages get a per-request nonce with strict-dynamic: no unsafe-inline or unsafe-eval script, no wildcard, no framing', () => {
    const a = csp('/')
    const b = csp('/about/')
    expect(a).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'/)
    expect(a).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(a).not.toMatch(/\*/)
    expect(a).toContain("frame-ancestors 'none'")
    expect(a).toContain("object-src 'none'")
    expect(a.match(/nonce-([^']+)/)![1]).not.toBe(b.match(/nonce-([^']+)/)![1])
  })

  it('the nonce reaches the request headers so Next can stamp it on its own bootstrap scripts', () => {
    const res = proxy(req('/'))
    const forwarded = res.headers.get('x-middleware-request-x-nonce') ?? ''
    expect(forwarded).toBe((res.headers.get('content-security-policy') ?? '').match(/nonce-([^']+)/)![1])
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(res.headers.get('content-security-policy'))
  })

  it('stays out of the index unless the production policy is set; CRM and admin are always noindex', () => {
    expect(proxy(req('/')).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(proxy(req('/crm/')).headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(proxy(req('/admin/')).headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('security headers on every response; the policies never widen to remote fonts or scripts', () => {
    const res = proxy(req('/'))
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    for (const p of [publicPolicy('n'), crmPolicy('n')]) {
      expect(p).toContain("font-src 'self'")
      expect(p).not.toMatch(/https?:/)
    }
  })
})
