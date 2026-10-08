import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry, setRegistrySourceForTests } from '../../rfq-native/registry'
import { registryReply, submitReply } from '../intake/native/handlers'
import { issueFormToken } from '../intake/native/token'
import { payload, resetCrm } from './harness'

/**
 * FORM-NOTICE-1.1 (Auditor N1): a missing or corrupt notice file must not take quote SUBMISSIONS down. The registry degrades to
 * the copy table's privacy.note, a code is logged, and the request is accepted as before.
 */
type Doc = Record<string, unknown>
const T0 = new Date('2026-10-07T03:00:00Z')
let seq = 0
const uuid = () => `0194${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`
const disk = (rel: string) => readFileSync(path.join(process.cwd(), rel))
const swap = (notice: () => Buffer) => setRegistrySourceForTests((rel) => (rel.endsWith('form-notice-source.md') ? notice() : disk(rel)))

function submit(ip: string) {
  const reg = fixtureRegistry()
  return new Request('http://localhost:3210/api/rfq/submit/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': ip },
    body: JSON.stringify({ submissionId: uuid(), source: 'NATIVE_CHAT', registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'parts', parts_part: 'Fan blades', parts_qty: '4', name: 'Ana Ruiz', company: 'Northwind Thermal (synthetic)', email: `ana.${Date.now()}@example.test`, country: 'TH' }, context: { page_path: '/contact-us/', cta_placement: 'form', context_type: 'page' }, attribution: {}, antiAbuse: { formToken: issueFormToken(new Date(T0.getTime() - 20_000)).formToken, hp: '' } }),
  })
}

beforeAll(() => {
  process.env.TRUSTED_PROXY = 'cloudflare'
})
beforeEach(async () => {
  process.env.H2O_NATIVE_INTAKE = 'on'
  await resetCrm()
})
afterEach(() => {
  setRegistrySourceForTests()
  vi.restoreAllMocks()
})

describe('FORM-NOTICE-1.1: the notice file never takes the form down', () => {
  for (const [name, notice] of [
    ['missing', () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) }],
    ['corrupt', () => Buffer.from('garbage, no sections\n')],
  ] as const) {
    it(`a ${name} notice file: the registry is still served (fallback notice) and a submission is accepted`, async () => {
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      swap(notice)
      const p = await payload()
      const reg = registryReply(new Request('http://localhost/api/rfq/registry/?locale=en'), process.env, 'sales@example.test')
      expect(reg.status).toBe(200)
      const strings = (reg.body as { strings: Record<string, string> }).strings
      expect(strings['privacy.note']).toContain('{{privacy_policy_link}}')
      expect(strings['privacy.details.items']).toBeUndefined()
      const r = await submitReply(p, submit('192.0.2.88'), T0)
      expect(r.status).toBe(200)
      expect((r.body as Doc).rfqNumber).toMatch(/^RFQ-/)
      expect(err.mock.calls.map((c) => String(c[0])).join('')).toContain('FORM_NOTICE_FALLBACK')
    })
  }
})
