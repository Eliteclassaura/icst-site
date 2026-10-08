import { describe, expect, it } from 'vitest'
import { ALERT_MAX, dedupeAddresses, parseAddressList, parseOneAddress } from '../routing-parse'

describe('ALERTS-1 address parsing', () => {
  it('accepts one per line, comma or semicolon; lowercases; dedupes', () => {
    expect(parseAddressList('A@Example.com\nb@example.com; a@example.com, c@example.com', 'x')).toEqual({ ok: true, list: ['a@example.com', 'b@example.com', 'c@example.com'] })
    expect(parseAddressList('', 'x')).toEqual({ ok: true, list: [] })
    expect(parseAddressList(undefined, 'x')).toEqual({ ok: true, list: [] })
  })
  it('refuses display names, links, script and spaces', () => {
    for (const bad of ['Jo <jo@example.com>', 'http://example.com', 'https://example.com/a@b.co', 'www.example.com', 'jo@example', 'jo @example.com', 'javascript:alert(1)', 'a@b.co/evil', '<b>@example.com', 'jo@example.com?x=1'])
      expect(parseAddressList(bad, 'x').ok, bad).toBe(false)
  })
  it('allows at most 10', () => {
    expect(parseAddressList(Array.from({ length: ALERT_MAX }, (_, i) => `p${i}@example.com`).join('\n'), 'x').ok).toBe(true)
    expect(parseAddressList(Array.from({ length: ALERT_MAX + 1 }, (_, i) => `p${i}@example.com`).join('\n'), 'x')).toMatchObject({ ok: false, code: 'ROUTING_LIST_TOO_MANY' })
  })
  it('one address: empty means default; two is refused', () => {
    expect(parseOneAddress('  ', 'x')).toEqual({ ok: true, value: null })
    expect(parseOneAddress('Sales@Example.com', 'x')).toEqual({ ok: true, value: 'sales@example.com' })
    expect(parseOneAddress('a@example.com, b@example.com', 'x').ok).toBe(false)
  })
  it('dedupes across lists, keeping order', () => {
    expect(dedupeAddresses([['a@example.com', 'b@example.com'], ['B@example.com', 'c@example.com']])).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
  })
})
