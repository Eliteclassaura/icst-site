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
    // RFQ-FIX-1.1: first and last name are asked separately
    const req = base({ purpose: 'parts', parts_part: 'Gearbox', parts_qty: '12', first_name: 'Ngozi', last_name: 'Okafor-Phạm', company: 'Delta Cooling (synthetic)', email: 'n@example.test', country: 'VN' })
    expect(validateAnswers(reg, req)).toEqual({})
    const { delivery } = toDelivery(reg, req, T)
    expect(delivery).toMatchObject({ eventId: `native:${req.submissionId}`, formId: 'native', sourceSystem: 'NATIVE_CHAT', fieldMapPresent: true })
    expect(delivery.mapped).toMatchObject({ first_name: 'Ngozi', last_name: 'Okafor-Phạm', country_code: 'VN', requested_quantity: 12, requested_scope: 'Parts' })
    expect(delivery.mapped.other).toMatchObject({ interest: 'Parts', parts_part: 'Gearbox' })
    expect(delivery.mapped.message).toContain('Gearbox')
    expect(toDelivery(reg, { ...req, answers: { ...req.answers, parts_qty: 'one set per cell' } }, T).delivery.mapped.requested_quantity).toBeNull()
    // a page loaded before the split still sends one `name`: the envelope reads it as first + last name
    const legacy = parseEnvelope({ ...req, answers: { purpose: 'parts', parts_part: 'Gearbox', name: 'Ngozi Okafor-Phạm', company: 'Delta Cooling (synthetic)', email: 'n@example.test', country: 'VN' } })!
    expect(validateAnswers(reg, legacy)).toEqual({})
    expect(toDelivery(reg, legacy, T).delivery.mapped).toMatchObject({ first_name: 'Ngozi', last_name: 'Okafor-Phạm', full_name: 'Ngozi Okafor-Phạm' })
  })
})

describe('CHAT-FLOW-1: the corner chat is read against its own questions (synthetic)', () => {
  const reg = fixtureRegistry()
  const chat = (answers: Record<string, string>, extra: Partial<NativeRequest> = {}) => base(answers, { registryVersion: reg.registryVersion, ...extra })
  it('owner 2026-10-09: email, names and the service are required (the part too, for parts); a request with only those is valid and maps with empty optional fields', () => {
    const req = chat({ email: 'casey.lim.synthetic@gmail.com', first_name: 'Casey', last_name: 'Lim', purpose: 'repair' })
    expect(validateAnswers(reg, req)).toEqual({})
    const { delivery } = toDelivery(reg, req, T)
    expect(delivery.mapped).toMatchObject({ email: 'casey.lim.synthetic@gmail.com', first_name: 'Casey', last_name: 'Lim', company: null, country_code: null, phone: null, requested_scope: reg.strings['purpose.chip.repair'] })
    // an email-only request (allowed by the first draft of CHAT-FLOW-1) is refused now, naming the chat's missing fields
    expect(validateAnswers(reg, chat({ email: 'casey.lim.synthetic@gmail.com' }))).toMatchObject({ first_name: 'err.required', last_name: 'err.required', purpose: 'err.required' })
    expect(validateAnswers(reg, chat({ email: 'a@example.test', first_name: 'A', last_name: 'B', purpose: 'parts' }))).toEqual({ parts_part: 'err.required' })
    expect(validateAnswers(reg, chat({ first_name: 'Ana', last_name: 'B', purpose: 'repair' }))).toEqual({ email: 'err.required' })
  })
  it('a parts request: the message lists each detail under the question as the visitor read it; interest and other fields as the CRM knows them', () => {
    const req = chat({ email: 'buyer@northwind.example.test', first_name: 'Avery', last_name: 'Quinn', company: 'Northwind Thermal (synthetic)', purpose: 'parts', parts_part: 'fans', details: 'Model 3000, 12 ft', urgent: 'yes', phone: '+1 303 555 0100', country: 'US', notes: 'Please call first' })
    expect(validateAnswers(reg, req)).toEqual({})
    const { delivery } = toDelivery(reg, req, T)
    const m = delivery.mapped
    expect(m).toMatchObject({ first_name: 'Avery', last_name: 'Quinn', company: 'Northwind Thermal (synthetic)', country_code: 'US', requested_scope: reg.strings['purpose.chip.parts'] })
    expect(m.other).toMatchObject({ interest: reg.strings['purpose.chip.parts'], native_purpose: 'parts', parts_part: 'Fans', details: 'Model 3000, 12 ft', urgent: 'Yes', notes: 'Please call first' })
    expect(m.message).toContain('What part are you looking for?\nFans')
    expect(m.message).toContain('Please provide any information you have on Fans, below, so we can quote accurately\nModel 3000, 12 ft')
    expect(m.message).toContain('Is this an urgent part request?\nYes')
    expect(m.message).toContain("Anything else you'd like us to know?\nPlease call first")
  })
  it('a chip outside the chat\'s choices, a parts-only answer on another purpose, or a stray key is refused', () => {
    expect(validateAnswers(reg, chat({ email: 'a@example.test', purpose: 'inspection' }))).toMatchObject({ purpose: expect.any(String) })
    expect(validateAnswers(reg, chat({ email: 'a@example.test', purpose: 'repair', urgent: 'yes' }))).toMatchObject({ urgent: 'err.server' })
    expect(validateAnswers(reg, chat({ email: 'a@example.test', mystery: 'x' }))).toMatchObject({ mystery: 'err.server' })
  })
  it('a chat page loaded before the deploy (the old chat\'s answers) is still accepted and mapped as before', () => {
    const old = chat({ purpose: 'parts', parts_part: 'Fan blades', parts_model: 'M-3000', first_name: 'Ana', company: 'B (synthetic)', email: 'a@example.test', country: 'TH' })
    expect(validateAnswers(reg, old)).toEqual({})
    const { delivery } = toDelivery(reg, old, T)
    expect(delivery.mapped.other).toMatchObject({ parts_part: 'Fan blades', parts_model: 'M-3000' })
    expect(delivery.mapped.message).toContain(`${reg.strings['parts.part.q']}\nFan blades`)
  })
  it('noticeVersion is kept in its exact shape and dropped otherwise (never refused)', () => {
    const ok = parseEnvelope({ ...chat({ email: 'a@example.test' }), noticeVersion: 'notice-0a1b2c3d' })!
    expect(ok.noticeVersion).toBe('notice-0a1b2c3d')
    const bad = parseEnvelope({ ...chat({ email: 'a@example.test' }), noticeVersion: 'whatever <script>' })!
    expect(bad).not.toBeNull()
    expect(bad.noticeVersion).toBeUndefined()
  })
})
