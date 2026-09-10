import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  typoSuggestion,
  isDisposable,
  maskEmail,
  scoreSpam,
  SPAM_THRESHOLD,
  briefSchema,
  pickSelects,
  scoreLead,
  toCrmPayload,
  MockCrmProvider,
  clientIp,
  trustedProxyMode,
  UNTRUSTED_BUCKET,
} from '../src/intake/index'

describe('email hygiene', () => {
  it('normalises gmail dots and plus tags; other providers keep dots', () => {
    expect(normalizeEmail('First.Last+tag@Gmail.com')).toBe('firstlast@gmail.com')
    expect(normalizeEmail('a.b+c@example.test')).toBe('a.b@example.test')
  })
  it('suggests the corrected domain for known typos only', () => {
    expect(typoSuggestion('x@gmial.com')).toBe('x@gmail.com')
    expect(typoSuggestion('x@example.test')).toBeNull()
  })
  it('flags disposable domains and masks addresses', () => {
    expect(isDisposable('a@yopmail.com')).toBe(true)
    expect(isDisposable('a@example.test')).toBe(false)
    expect(maskEmail('someone@example.test')).toBe('s***@example.test')
  })
})

describe('spam score', () => {
  it('lets a real brief through and blocks a link farm', () => {
    const real = scoreSpam({
      brief: 'Our category pages lost AI citations after the redesign; we want an audit and a plan.',
      email: 'a@example.test',
      dwellSeconds: 40,
    })
    expect(real.score).toBeLessThan(SPAM_THRESHOLD)
    const junk = scoreSpam({
      brief: 'buy followers http://a.x http://b.x http://c.x increase your ranking',
      email: 'x@example.test',
      dwellSeconds: 1,
    })
    expect(junk.score).toBeGreaterThanOrEqual(SPAM_THRESHOLD)
    expect(junk.reasons.join()).toContain('links:3')
  })
})

describe('schema and selects', () => {
  it('strips protocol from site and bounds lengths', () => {
    const r = briefSchema.parse({
      name: 'A',
      email: 'a@example.test',
      brief: 'ok ok ok ok',
      site: 'https://example.test/',
    })
    expect(r.site).toBe('example.test')
    expect(() => briefSchema.parse({ name: 'A', email: 'not-an-email', brief: 'x' })).toThrow()
  })
  it('accepts only offered options', () => {
    const { values, errors } = pickSelects({ budget: '$25,000+', timeline: 'Yesterday' }, [
      { name: 'budget', options: ['$25,000+'] },
      { name: 'timeline', options: ['Starting now'] },
    ])
    expect(values).toEqual({ budget: '$25,000+' })
    expect(errors).toEqual(['timeline-invalid'])
  })
})

describe('lead score', () => {
  it('is deterministic, supports regex rules and clamps to 0–100', () => {
    const rules = [
      { name: 'r1', factor: 'budget', field: 'budget', match: '$25,000+', points: 60 },
      { name: 'r2', factor: 'engagement', field: 'site', match: '/\\./', points: 60 },
      { name: 'r3', factor: 'negative', field: 'timeline', match: 'Just researching', points: -10 },
    ]
    const a = scoreLead({ budget: '$25,000+', site: 'example.test', timeline: 'Now' }, rules)
    expect(a.total).toBe(100)
    expect(a.components.map((c) => c.rule)).toEqual(['r1', 'r2'])
    const b = scoreLead({ timeline: 'Just researching' }, rules)
    expect(b.total).toBe(0)
    expect(b.components[0]!.points).toBe(-10)
  })
})

describe('CRM payload allow-list and mock provider', () => {
  it('never carries anything outside the allow-list and filters utm keys', () => {
    const p = toCrmPayload({
      email: 'a@example.test',
      name: 'A',
      source: 'form',
      utm: { utm_source: 'x', evil: 'y', utm_medium: 1 },
      marketing: null,
    })
    expect(p).toEqual({
      email: 'a@example.test',
      name: 'A',
      company: undefined,
      website: undefined,
      source: 'form',
      landingPage: undefined,
      utm: { utm_source: 'x' },
      consentMarketing: false,
    })
    expect(Object.keys(p)).not.toContain('ipHash')
  })
  it('mock upsert is idempotent on the key and stable per email', async () => {
    const m = new MockCrmProvider()
    const a = await m.upsertContact(
      { email: 'a@example.test', source: 'form', consentMarketing: false },
      { idempotencyKey: 'k1' },
    )
    const b = await m.upsertContact(
      { email: 'a@example.test', source: 'form', consentMarketing: false },
      { idempotencyKey: 'k1' },
    )
    const c = await m.upsertContact(
      { email: 'a@example.test', source: 'form', consentMarketing: false },
      { idempotencyKey: 'k2' },
    )
    expect(a.ok && b.ok && c.ok).toBe(true)
    if (a.ok && b.ok && c.ok) {
      expect(a.created).toBe(true)
      expect(b.externalId).toBe(a.externalId)
      expect(c.created).toBe(false)
    }
  })
})

describe('trusted client address (C8)', () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null })

  it('trusts nothing by default: a caller cannot mint a fresh rate-limit bucket with a header', () => {
    const headers = h({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '5.6.7.8' })
    expect(clientIp(headers, {} as unknown as NodeJS.ProcessEnv)).toBe(UNTRUSTED_BUCKET)
    expect(trustedProxyMode({} as unknown as NodeJS.ProcessEnv)).toBe('none')
    // Two different spoofed headers still land in the same bucket.
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9' }), {} as unknown as NodeJS.ProcessEnv)).toBe(
      clientIp(headers, {} as unknown as NodeJS.ProcessEnv),
    )
  })

  it('cloudflare mode uses cf-connecting-ip and ignores x-forwarded-for entirely', () => {
    const env = { TRUSTED_PROXY: 'cloudflare' } as unknown as NodeJS.ProcessEnv
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.1.1.1' }), env)).toBe(
      '203.0.113.5',
    )
    // Header absent (a request that did not come through the edge) is not a free bucket.
    expect(clientIp(h({ 'x-forwarded-for': '1.1.1.1' }), env)).toBe(UNTRUSTED_BUCKET)
  })

  it('xff modes pick the overwriting or the nearest hop as configured', () => {
    const headers = h({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' })
    expect(clientIp(headers, { TRUSTED_PROXY: 'xff' } as unknown as NodeJS.ProcessEnv)).toBe('203.0.113.5')
    expect(clientIp(headers, { TRUSTED_PROXY: 'xff-last' } as unknown as NodeJS.ProcessEnv)).toBe(
      '150.172.238.178',
    )
  })

  it('refuses values that are not plausible addresses, so a header cannot smuggle a key separator', () => {
    const env = { TRUSTED_PROXY: 'xff' } as unknown as NodeJS.ProcessEnv
    for (const bad of ['not-an-ip', '1.2.3.4 OR 1=1', 'a'.repeat(60), '', '../../etc']) {
      expect(clientIp(h({ 'x-forwarded-for': bad }), env)).toBe(UNTRUSTED_BUCKET)
    }
    expect(clientIp(h({ 'x-forwarded-for': '2001:db8::1' }), env)).toBe('2001:db8::1')
  })
})
