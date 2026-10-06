import { beforeAll, describe, expect, it } from 'vitest'
import { fixtureRegistry } from '../../rfq-native/registry'
import { bucketFor, requestIp, UNTRUSTED_BUCKET } from '../intake/native/limits'
import { contentHash, parseEnvelope, toDelivery, validateAnswers, type NativeRequest } from '../intake/native/normalize'
import { checkFormToken, issueFormToken } from '../intake/native/token'

/** Native RFQ intake adapter — pure logic. End to end: __dbtests__/native-intake.dbtest.ts. */
beforeAll(() => {
  process.env.PAYLOAD_SECRET ??= 'unit-test-only-synthetic-secret-0000000000'
})
const T = new Date('2026-10-07T03:00:00Z')
const base = (answers: Record<string, string>, extra: Partial<NativeRequest> = {}): NativeRequest => ({
  submissionId: '01920000-0000-4000-8000-000000000001',
  source: 'NATIVE_CHAT',
  registryVersion: 'x',
  locale: 'en',
  answers,
  context: {},
  attribution: {},
  antiAbuse: { formToken: '', hp: '' },
  ...extra,
})

describe('form token', () => {
  it('is valid between 3 seconds and 2 hours after issue, and only with its own signature', () => {
    const { formToken } = issueFormToken(T)
    expect(checkFormToken(formToken, new Date(T.getTime() + 5_000))).toBe('OK')
    expect(checkFormToken(formToken, new Date(T.getTime() + 1_000))).toBe('TOO_FAST')
    expect(checkFormToken(formToken, new Date(T.getTime() + 2 * 3600_000 + 1))).toBe('EXPIRED')
    expect(checkFormToken(`${formToken.slice(0, -1)}${formToken.endsWith('A') ? 'B' : 'A'}`, new Date(T.getTime() + 5_000))).toBe('BAD_SIGNATURE')
    expect(checkFormToken('', T)).toBe('MISSING')
    expect(checkFormToken('v1.zz', T)).toBe('MALFORMED')
    expect(formToken).not.toMatch(/@|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
  })
})

describe('client address and buckets', () => {
  const h = (o: Record<string, string>) => new Headers(o)
  it('trusts only the configured proxy header; without one, everyone shares a bucket', () => {
    expect(requestIp(h({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.9' }), { TRUSTED_PROXY: 'cloudflare' })).toBe('198.51.100.7')
    expect(requestIp(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), { TRUSTED_PROXY: 'xff' })).toBe('203.0.113.9')
    expect(requestIp(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), { TRUSTED_PROXY: 'xff-last' })).toBe('10.0.0.1')
    expect(requestIp(h({ 'cf-connecting-ip': '198.51.100.7' }), {})).toBe(UNTRUSTED_BUCKET)
    expect(requestIp(h({ 'cf-connecting-ip': 'evil:key|space' }), { TRUSTED_PROXY: 'cloudflare' })).toBe(UNTRUSTED_BUCKET)
  })
  it('buckets are keyed HMACs that never contain the value', () => {
    const b = bucketFor('ip', '198.51.100.7')
    expect(b).toMatch(/^ip:[A-Za-z0-9_-]{32}$/)
    expect(b).not.toContain('198')
    expect(bucketFor('email', 'pat@example.test')).not.toBe(bucketFor('ip', 'pat@example.test'))
  })
})

describe('envelope, validation, mapping', () => {
  it('refuses a malformed envelope', () => {
    expect(parseEnvelope(null)).toBeNull()
    expect(parseEnvelope({ ...base({}), submissionId: 'not-a-uuid' })).toBeNull()
    expect(parseEnvelope({ ...base({}), source: 'TYPEFORM' })).toBeNull()
    expect(parseEnvelope({ ...base({}), answers: { a: 1 } })).toBeNull()
    expect(parseEnvelope(base({ purpose: 'parts' }))).not.toBeNull()
  })
  it('the content hash ignores key order and the anti-abuse fields, but not the answers', () => {
    const a = base({ purpose: 'parts', name: 'A' })
    const b = base({ name: 'A', purpose: 'parts' }, { antiAbuse: { formToken: 'other', hp: '' } })
    expect(contentHash(a)).toBe(contentHash(b))
    expect(contentHash(a)).not.toBe(contentHash(base({ purpose: 'parts', name: 'B' })))
  })
  it('maps to the canonical delivery: name split, interest, numeric quantity, message, country', () => {
    const reg = fixtureRegistry()
    const req = base({ purpose: 'parts', parts_part: 'Gearbox', parts_qty: '12', name: 'Ngozi Okafor-Phạm', company: 'Delta Cooling (synthetic)', email: 'n@example.test', country: 'VN' })
    expect(validateAnswers(reg, req)).toEqual({})
    const { delivery } = toDelivery(reg, req, T)
    expect(delivery).toMatchObject({ eventId: `native:${req.submissionId}`, formId: 'native', sourceSystem: 'NATIVE_CHAT', fieldMapPresent: true })
    expect(delivery.mapped).toMatchObject({ first_name: 'Ngozi', last_name: 'Okafor-Phạm', country_code: 'VN', requested_quantity: 12, requested_scope: 'Parts' })
    expect(delivery.mapped.other).toMatchObject({ interest: 'Parts', parts_part: 'Gearbox' })
    expect(delivery.mapped.message).toContain('Gearbox')
    expect(toDelivery(reg, { ...req, answers: { ...req.answers, parts_qty: 'one set per cell' } }, T).delivery.mapped.requested_quantity).toBeNull()
  })
})
