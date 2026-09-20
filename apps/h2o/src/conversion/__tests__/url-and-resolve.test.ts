import { describe, expect, it } from 'vitest'
import { buildSafeContext } from '../context'
import { resolveQuoteCta } from '../resolve'
import { baseFormUrl, buildFormUrl, MAX_FORM_URL_LENGTH, resolveFormUrl } from '../url'

const CONFIG = { formId: 'aB3xY9Qz', origin: 'https://form.typeform.com' }
const ENV = {
  H2O_TYPEFORM_FORM_ID: CONFIG.formId,
  H2O_TYPEFORM_ORIGIN: CONFIG.origin,
} as unknown as NodeJS.ProcessEnv

describe('form URL construction', () => {
  it('puts context in the fragment, not the query string', () => {
    const context = buildSafeContext({ product_slug: 'amarillo-cf83-425x' })
    const built = buildFormUrl(CONFIG, context)
    expect(built).toEqual({
      ok: true,
      url: 'https://form.typeform.com/to/aB3xY9Qz#product_slug=amarillo-cf83-425x',
    })
    expect(built.ok && built.url.includes('?')).toBe(false)
  })

  it('builds the bare form URL when there is no context', () => {
    expect(buildFormUrl(CONFIG, buildSafeContext({}))).toEqual({
      ok: true,
      url: 'https://form.typeform.com/to/aB3xY9Qz',
    })
  })

  it('percent-encodes values so a value cannot add a field', () => {
    const context = buildSafeContext({ product_title: 'Pump A & B = one' })
    const built = buildFormUrl(CONFIG, context)
    expect(built.ok && built.url).toContain('product_title=Pump%20A%20%26%20B%20%3D%20one')
    expect(built.ok && built.url.split('#')[1]?.split('&').length).toBe(1)
  })

  /**
   * The ceiling is defence in depth: the context budget already keeps allowlisted input well under
   * it, so the only way to reach it is to hand `buildFormUrl` a context the allowlist did not
   * build. A discrimination run caught that the original suite never exercised it — removing the
   * ceiling left every test green — so the ceiling is asserted directly here.
   */
  it('refuses, rather than truncates, a context that would exceed the URL ceiling', () => {
    const oversized = {
      dropped: [],
      fields: [['product_title', 'a'.repeat(MAX_FORM_URL_LENGTH)]] as Array<['product_title', string]>,
    }
    expect(buildFormUrl(CONFIG, oversized)).toEqual({ ok: false, reason: 'CONTEXT_TOO_LONG' })
  })

  it('falls back to the bare form URL when the context cannot fit', () => {
    const oversized = {
      dropped: [],
      fields: [['product_title', 'a'.repeat(MAX_FORM_URL_LENGTH)]] as Array<['product_title', string]>,
    }
    const resolved = resolveFormUrl(CONFIG, oversized)
    expect(resolved).toEqual({ contextIncluded: false, url: baseFormUrl(CONFIG) })
    expect(resolved.url.length).toBeLessThanOrEqual(MAX_FORM_URL_LENGTH)
  })

  it('never exceeds the URL ceiling', () => {
    const context = buildSafeContext({
      page_path: `/${'a'.repeat(500)}`,
      product_path: `/${'b'.repeat(500)}`,
    })
    const { contextIncluded, url } = resolveFormUrl(CONFIG, context)
    expect(url.length).toBeLessThanOrEqual(MAX_FORM_URL_LENGTH)
    if (!contextIncluded) expect(url).toBe(baseFormUrl(CONFIG))
  })

  it('always targets the configured origin and form id, never anything from the context', () => {
    const context = buildSafeContext({
      product_slug: 'x',
      redirect: 'https://evil.example',
      return_to: 'https://evil.example',
    } as Record<string, unknown>)
    const built = buildFormUrl(CONFIG, context)
    expect(built.ok && built.url.startsWith('https://form.typeform.com/to/aB3xY9Qz')).toBe(true)
    expect(built.ok && built.url).not.toContain('evil.example')
  })
})

describe('server-side resolution', () => {
  it('is unavailable, with a reason, when configuration is absent', () => {
    expect(resolveQuoteCta({}, {} as NodeJS.ProcessEnv)).toEqual({
      available: false,
      reason: 'FORM_ID_MISSING',
    })
  })

  it('is unavailable when the origin is not approved — no partial CTA', () => {
    const result = resolveQuoteCta(
      {},
      { H2O_TYPEFORM_FORM_ID: CONFIG.formId, H2O_TYPEFORM_ORIGIN: 'https://evil.example' } as unknown as NodeJS.ProcessEnv,
    )
    expect(result).toEqual({ available: false, reason: 'ORIGIN_NOT_APPROVED' })
    expect(JSON.stringify(result)).not.toContain('evil.example')
  })

  it('carries accurate product context for a product page', () => {
    const result = resolveQuoteCta(
      {
        cta_placement: 'product-hero',
        page_path: '/products/amarillo-cf83-425x/',
        product_id: '4711',
        product_path: '/products/amarillo-cf83-425x/',
        product_slug: 'amarillo-cf83-425x',
        product_title: 'Amarillo CF83-425X Drive Shaft',
      },
      ENV,
    )
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.dropped).toEqual([])
    expect(result.contextIncluded).toBe(true)
    expect(result.formUrl).toContain('product_id=4711')
    expect(result.formUrl).toContain('product_slug=amarillo-cf83-425x')
    expect(result.formUrl).toContain('product_path=%2Fproducts%2Famarillo-cf83-425x%2F')
    expect(result.origin).toBe(CONFIG.origin)
  })

  it('does not leak configuration to the caller beyond the finished URL and origin', () => {
    const result = resolveQuoteCta({}, ENV)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(Object.keys(result).sort()).toEqual([
      'available',
      'contextIncluded',
      'dropped',
      'formUrl',
      'origin',
    ])
  })

  it('reports every refusal instead of silently dropping it', () => {
    const result = resolveQuoteCta({ email: 'jane@example.com', page_path: '/x/' }, ENV)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.dropped).toEqual([{ key: 'email', reason: 'KEY_NOT_ALLOWLISTED' }])
    expect(result.formUrl).not.toContain('jane')
    expect(result.formUrl).not.toContain('example.com')
  })
})
