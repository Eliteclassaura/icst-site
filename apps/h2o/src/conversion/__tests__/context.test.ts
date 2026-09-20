import { describe, expect, it } from 'vitest'
import { buildSafeContext, MAX_TOTAL_CONTEXT_BYTES, SAFE_CONTEXT_KEYS } from '../context'

const reasonFor = (input: Record<string, unknown>, key: string): string | undefined =>
  buildSafeContext(input).dropped.find((d) => d.key === key)?.reason

describe('safe-context contract — allowlist', () => {
  it('forwards a well-formed product-page context in allowlist order', () => {
    const { dropped, fields } = buildSafeContext({
      cta_placement: 'product-hero',
      page_path: '/products/amarillo-cf83-425x/',
      product_id: '4711',
      product_path: '/products/amarillo-cf83-425x/',
      product_slug: 'amarillo-cf83-425x',
      product_title: 'Amarillo CF83-425X Drive Shaft',
      utm_campaign: 'cooling-towers-q3',
      utm_medium: 'cpc',
      utm_source: 'google',
    })
    expect(dropped).toEqual([])
    expect(fields.map(([k]) => k)).toEqual([
      'product_id',
      'product_slug',
      'product_path',
      'product_title',
      'page_path',
      'cta_placement',
      'utm_source',
      'utm_medium',
      'utm_campaign',
    ])
  })

  it('carries only page context for a general-page CTA', () => {
    const { fields } = buildSafeContext({ cta_placement: 'site-footer', page_path: '/contact/' })
    expect(fields).toEqual([
      ['page_path', '/contact/'],
      ['cta_placement', 'site-footer'],
    ])
  })

  it.each([
    ['name', 'Jane Buyer'],
    ['email', 'jane@example.com'],
    ['phone', '+1 555 123 4567'],
    ['customer_id', '99'],
    ['file', 'spec.pdf'],
    ['token', 'abc'],
    ['api_key', 'abc'],
    ['redirect', 'https://evil.example'],
    ['__proto__', 'polluted'],
    ['price', '1200'],
  ])('drops the non-allowlisted key %s', (key, value) => {
    const { dropped, fields } = buildSafeContext({ [key]: value, page_path: '/x/' })
    expect(fields.map(([k]) => k)).toEqual(['page_path'])
    expect(dropped).toContainEqual({ key, reason: 'KEY_NOT_ALLOWLISTED' })
  })

  it('never lets an unknown key survive, whatever the input shape', () => {
    const { fields } = buildSafeContext({ anything: 'x', else: 'y', whatever: 'z' })
    expect(fields).toEqual([])
    for (const [key] of fields) expect(SAFE_CONTEXT_KEYS).toContain(key)
  })
})

describe('safe-context contract — sensitive-value injection into allowlisted keys', () => {
  it.each([
    ['email in the title', 'product_title', 'Pump sales@h2ocooling.example'],
    ['phone in the title', 'product_title', 'Pump, call 555 123 4567'],
    ['card-like number', 'product_title', 'Order 4111 1111 1111 1111'],
    ['credential keyword', 'product_title', 'Bearer aaaabbbbcccc'],
    ['api token', 'utm_campaign', 'sk-abcdefghijklmnop'],
  ])('refuses %s', (_label, key, value) => {
    expect(reasonFor({ [key]: value }, key)).toBe('SENSITIVE_VALUE')
  })

  it('refuses rather than masking, so nothing partially sensitive is forwarded', () => {
    const { fields } = buildSafeContext({ product_title: 'Pump jane@example.com' })
    expect(fields).toEqual([])
  })
})

describe('safe-context contract — malicious and malformed values', () => {
  it.each([
    ['absolute url as a path', 'product_path', 'https://evil.example/x'],
    ['protocol-relative path', 'product_path', '//evil.example/x'],
    ['traversal', 'page_path', '/a/../../etc/passwd'],
    ['backslash', 'page_path', '\\evil.example'],
    ['no leading slash', 'page_path', 'products/x'],
    ['query in a path', 'page_path', '/x/?next=https://evil.example'],
    ['fragment in a path', 'page_path', '/x/#https://evil.example'],
  ])('refuses %s', (_label, key, value) => {
    expect(reasonFor({ [key]: value }, key)).toBe('PATH_NOT_SITE_RELATIVE')
  })

  it.each([
    ['script tag in the title', 'product_title', '<script>alert(1)</script>'],
    ['scheme in the title', 'product_title', 'Pump javascript://x'],
    ['ampersand in an identifier', 'product_slug', 'a&utm_source=evil'],
    ['space in an identifier', 'cta_placement', 'hero button'],
    ['quote in an identifier', 'utm_source', "g'oogle"],
  ])('refuses %s', (_label, key, value) => {
    expect(reasonFor({ [key]: value }, key)).toBe('UNSAFE_CHARACTERS')
  })

  it('refuses control characters that would split a URL or a log line', () => {
    const crlf = `x${String.fromCharCode(13)}${String.fromCharCode(10)}Set-Cookie: a=b`
    expect(reasonFor({ product_slug: crlf }, 'product_slug')).toBe('UNSAFE_CHARACTERS')
    expect(reasonFor({ product_title: `Pump${String.fromCharCode(0)}` }, 'product_title')).toBe(
      'UNSAFE_CHARACTERS',
    )
  })

  it('refuses a non-string value rather than coercing it', () => {
    expect(reasonFor({ product_id: 4711 }, 'product_id')).toBe('NOT_A_STRING')
    expect(reasonFor({ product_slug: { toString: () => 'x' } }, 'product_slug')).toBe('NOT_A_STRING')
  })

  it('drops an empty value with a reason instead of forwarding a blank field', () => {
    expect(reasonFor({ product_slug: '   ' }, 'product_slug')).toBe('EMPTY')
  })
})

describe('safe-context contract — length', () => {
  it('refuses an overlength value rather than truncating it', () => {
    expect(reasonFor({ product_slug: 'a'.repeat(129) }, 'product_slug')).toBe('TOO_LONG')
    expect(reasonFor({ product_title: 'a'.repeat(161) }, 'product_title')).toBe('TOO_LONG')
    expect(reasonFor({ page_path: `/${'a'.repeat(512)}` }, 'page_path')).toBe('TOO_LONG')
  })

  it('never forwards a truncated identifier', () => {
    const { fields } = buildSafeContext({ product_id: 'a'.repeat(65) })
    expect(fields).toEqual([])
  })

  it('enforces a total budget so many short values cannot add up to a long URL', () => {
    const long = (n: number) => 'a'.repeat(n)
    const { dropped, fields } = buildSafeContext({
      cta_placement: long(64),
      page_path: `/${long(500)}`,
      product_id: long(64),
      product_path: `/${long(500)}`,
      product_slug: long(128),
      product_title: long(160),
      utm_campaign: long(128),
      utm_content: long(128),
      utm_medium: long(64),
      utm_source: long(64),
      utm_term: long(128),
    })
    const total = fields.reduce((n, [k, v]) => n + k.length + encodeURIComponent(v).length + 2, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CONTEXT_BYTES)
    expect(dropped.some((d) => d.reason === 'TOO_LONG')).toBe(true)
  })
})
