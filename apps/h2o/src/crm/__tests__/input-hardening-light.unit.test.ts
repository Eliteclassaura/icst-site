import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { cleanDeep, MAX_DEPTH, PayloadTooDeepError } from '../intake/clean'
import { stripControls } from '../../rfq-native/flow'
import { likeTerm } from '../workspace/directory'
import { nulRoute } from '../../proxy'

const NUL = '\u0000'
const LONE_HIGH = '\uD83D'
const LONE_LOW = '\uDE00'

describe('input hardening (1.3c-8, subset): NUL and lone surrogates never reach the database', () => {
  it('stripControls removes NUL and any unpaired surrogate, and keeps a valid pair (an emoji)', () => {
    expect(stripControls(`Acme${NUL}Co`)).toBe('AcmeCo')
    expect(stripControls(`x${LONE_HIGH}y`)).toBe('xy')
    expect(stripControls(`x${LONE_LOW}y`)).toBe('xy')
    expect(stripControls('ok 😀 ok')).toBe('ok 😀 ok')
  })

  it('cleanDeep cleans every string and key; a value nested too deeply is refused, never passed on', () => {
    expect(cleanDeep({ [`k${NUL}`]: [`a${LONE_HIGH}`, { b: `c${NUL}` }] })).toEqual({ k: ['a', { b: 'c' }] })
    let deep: unknown = 'x'
    for (let i = 0; i < MAX_DEPTH + 1; i++) deep = { n: deep }
    expect(() => cleanDeep(deep)).toThrow(PayloadTooDeepError)
  })

  it('a search term with a NUL or a lone surrogate is cleaned before the LIKE pattern', () => {
    expect(likeTerm(`Acme${NUL}Co`)).toBe('AcmeCo')
    expect(likeTerm(`a${NUL}%b_c`)).toBe('a b c')
    expect(likeTerm(`x${LONE_LOW}`)).toBe('x')
  })

  it('nulRoute answers a NUL in a URL with a plain 400, and leaves look-alike addresses alone', () => {
    const req = (u: string) => new NextRequest(new URL(u, 'http://localhost:3210'))
    for (const u of ['/%00', '/a/%00b/', '/crm/contacts/?q=a%00b']) {
      const r = nulRoute(req(u))
      expect(r?.status).toBe(400)
      expect(r?.headers.get('cache-control')).toBe('no-store')
    }
    for (const u of ['/', '/cooling-towers/', '/%2500/', '/crm/contacts/?q=a%2500b']) expect(nulRoute(req(u))).toBeNull()
  })
})
