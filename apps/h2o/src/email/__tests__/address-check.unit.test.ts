import { beforeEach, describe, expect, it } from 'vitest'
import { checkEmailAddress, clearEmailCheckCache, strictDomainOf, type DnsLookup } from '../address-check'

const err = (code: string) => Object.assign(new Error(code), { code })
type Mode = 'ok' | 'none' | 'servfail' | 'hang'
function fake(m: { mx?: Mode; a?: Mode; aaaa?: Mode }, calls: string[] = []): DnsLookup {
  const make = (kind: 'mx' | 'a' | 'aaaa') => async (h: string): Promise<unknown[]> => {
    calls.push(`${kind}:${h}`)
    const mode = m[kind] ?? 'none'
    if (mode === 'hang') return new Promise(() => undefined)
    if (mode === 'servfail') throw err('ESERVFAIL')
    if (mode === 'ok') return ['x']
    throw err('ENOTFOUND')
  }
  return { resolveMx: make('mx'), resolve4: make('a'), resolve6: make('aaaa') }
}

beforeEach(() => clearEmailCheckCache())

describe('RFQ-EMAIL-CHECK-1 strict syntax', () => {
  it('accepts ordinary addresses and lower-cases the domain', () => {
    expect(strictDomainOf('Ana.Ruiz+rfq@Example.COM')).toBe('example.com')
    expect(strictDomainOf('a@sub.example.co.uk')).toBe('sub.example.co.uk')
    expect(strictDomainOf('a@bücher.example')).toBe('xn--bcher-kva.example')
  })
  it('refuses the usual shapes', () => {
    for (const bad of ['', 'a', 'a@b', 'a@@b.com', '@b.com', 'a@', 'a b@c.com', 'a@b .com', 'a@.b.com', 'a@b..com', 'a@-b.com', 'a@b-.com', 'a@b.c', 'a@b.123', '.a@b.com', 'a.@b.com', 'a..b@c.com', `${'x'.repeat(65)}@b.com`, `a@${'x'.repeat(64)}.com`, `a@${'x'.repeat(250)}.com`, 'a@b.com\nbcc:x@y.com', 'a@b.com;c@d.com', 'a@b/c.com', 'a@b:80.com'])
      expect(strictDomainOf(bad), JSON.stringify(bad)).toBeNull()
  })
})

describe('CRM-B-4C-FIX note E: the raw domain is checked before any URL parsing', () => {
  it('refuses anything that could be read as a path, port, query, fragment, escape or userinfo in the domain', () => {
    for (const bad of ['x@evil.com/foo', 'x@evil.com\\foo', 'x@evil.com?q=1', 'x@evil.com#frag', 'x@evil.com%2Ffoo', 'x@evil.com:8080', 'x@evil.com/', 'x@a.com,b.com', 'x@a.com;b.com', 'x@a.com<b', 'x@evil.com(c)', 'x@ev il.com', 'x@evil.com\u0000', 'x@evil.com\n.org', 'x@evil.com|b.org', 'x@evil.com=', 'x@@evil.com', 'x@evil.com@evil.org'])
      expect(strictDomainOf(bad), JSON.stringify(bad)).toBeNull()
  })
  it('still accepts ordinary and internationalised domains', () => {
    expect(strictDomainOf('x@evil-corp.com')).toBe('evil-corp.com')
    expect(strictDomainOf('x@Sub.Evil-Corp.CO.UK.')).toBe('sub.evil-corp.co.uk')
    expect(strictDomainOf('x@münchen.example')).toBe('xn--mnchen-3ya.example')
  })
})

describe('RFQ-EMAIL-CHECK-1 DNS', () => {
  it('MX, or A, or AAAA is enough', async () => {
    expect(await checkEmailAddress('a@mx.example', { lookup: fake({ mx: 'ok' }) })).toEqual({ status: 'OK' })
    expect(await checkEmailAddress('a@a.example', { lookup: fake({ a: 'ok' }) })).toEqual({ status: 'OK' })
    expect(await checkEmailAddress('a@v6.example', { lookup: fake({ aaaa: 'ok' }) })).toEqual({ status: 'OK' })
  })
  it('NXDOMAIN and "no records" are refused', async () => {
    expect(await checkEmailAddress('a@gone.example', { lookup: fake({}) })).toEqual({ status: 'REJECT', key: 'err.email_domain' })
  })
  it('a timeout or a server failure fails open (unverified)', async () => {
    expect(await checkEmailAddress('a@slow.example', { lookup: fake({ mx: 'hang' }), timeoutMs: 25 })).toEqual({ status: 'UNVERIFIED', reason: 'DNS_TIMEOUT' })
    expect(await checkEmailAddress('a@broken.example', { lookup: fake({ mx: 'servfail' }) })).toEqual({ status: 'UNVERIFIED', reason: 'DNS_ERROR' })
  })
  it('a disposable domain is refused without any lookup', async () => {
    const calls: string[] = []
    expect(await checkEmailAddress('a@yopmail.com', { lookup: fake({ mx: 'ok' }, calls) })).toEqual({ status: 'REJECT', key: 'err.email_disposable' })
    expect(calls).toEqual([])
  })
  it('caches a found domain and a missing one, but never a timeout or an error', async () => {
    const calls: string[] = []
    const l = fake({ mx: 'ok' }, calls)
    await checkEmailAddress('a@cached.example', { lookup: l })
    await checkEmailAddress('b@cached.example', { lookup: l })
    expect(calls.sort()).toEqual(['a:cached.example', 'aaaa:cached.example', 'mx:cached.example']) // asked together, once
    const calls2: string[] = []
    await checkEmailAddress('a@missing.example', { lookup: fake({}, calls2) })
    await checkEmailAddress('a@missing.example', { lookup: fake({}, calls2) })
    expect(calls2).toHaveLength(3) // mx, a, aaaa once (the second check came from the cache)
    const calls3: string[] = []
    await checkEmailAddress('a@flaky.example', { lookup: fake({ mx: 'servfail' }, calls3) })
    await checkEmailAddress('a@flaky.example', { lookup: fake({ mx: 'servfail' }, calls3) })
    expect(calls3.filter((c) => c.startsWith('mx:'))).toEqual(['mx:flaky.example', 'mx:flaky.example']) // asked again: not cached
  })
  it('refuses anything that is not a string', async () => {
    expect(await checkEmailAddress(undefined, { lookup: fake({ mx: 'ok' }) })).toEqual({ status: 'REJECT', key: 'err.email' })
  })
  it('CRM-B-4C-FIX note F: MX, A and AAAA are asked together under ONE deadline; a hung resolver costs about one deadline, not three', async () => {
    const t0 = Date.now()
    const out = await checkEmailAddress('a@slowest.example', { lookup: fake({ mx: 'hang', a: 'hang', aaaa: 'hang' }), timeoutMs: 120 })
    const took = Date.now() - t0
    expect(out).toEqual({ status: 'UNVERIFIED', reason: 'DNS_TIMEOUT' })
    expect(took).toBeLessThan(120 * 2) // sequential lookups would have taken ~3 x 120
  })
  it('a record found by one type wins at once even when the others hang', async () => {
    const t0 = Date.now()
    expect(await checkEmailAddress('a@fast.example', { lookup: fake({ mx: 'hang', a: 'ok', aaaa: 'hang' }), timeoutMs: 2000 })).toEqual({ status: 'OK' })
    expect(Date.now() - t0).toBeLessThan(500)
  })
  it('an error on one type is not an answer if another type says "no records"; a clean "none" from all three is a refusal', async () => {
    expect(await checkEmailAddress('a@mixed.example', { lookup: fake({ mx: 'servfail', a: 'none', aaaa: 'none' }) })).toEqual({ status: 'UNVERIFIED', reason: 'DNS_ERROR' })
    expect(await checkEmailAddress('a@none.example', { lookup: fake({}) })).toEqual({ status: 'REJECT', key: 'err.email_domain' })
  })
})
