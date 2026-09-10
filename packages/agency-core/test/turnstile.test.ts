import { describe, it, expect } from 'vitest'
import { turnstileReadiness } from '../src/cms/security'

describe('Turnstile launch gate (R38, ADR-023)', () => {
  it('both configured → enabled', () => {
    expect(turnstileReadiness({ siteKey: '0x4AAA', secret: 's', nodeEnv: 'production' })).toEqual({
      ok: true,
      enabled: true,
    })
  })
  it('site key without secret is a failure everywhere', () => {
    expect(turnstileReadiness({ siteKey: '0x4AAA', secret: '', nodeEnv: 'development' }).ok).toBe(false)
    expect(turnstileReadiness({ siteKey: '0x4AAA', nodeEnv: 'production' })).toMatchObject({
      reason: 'site-key-without-secret',
    })
  })
  it('secret without site key is a failure everywhere', () => {
    expect(turnstileReadiness({ secret: 's', nodeEnv: 'production' })).toMatchObject({
      reason: 'secret-without-site-key',
    })
  })
  it('neither configured: off in development, blocked in production', () => {
    expect(turnstileReadiness({ nodeEnv: 'development' })).toEqual({ ok: true, enabled: false })
    expect(turnstileReadiness({ nodeEnv: 'production' })).toMatchObject({
      ok: false,
      reason: 'required-in-production',
    })
    expect(turnstileReadiness({ nodeEnv: 'production', requiredInProduction: false })).toEqual({
      ok: true,
      enabled: false,
    })
  })
  it('whitespace-only values count as unset', () => {
    expect(turnstileReadiness({ siteKey: '  ', secret: ' ', nodeEnv: 'development' })).toEqual({
      ok: true,
      enabled: false,
    })
  })
})
