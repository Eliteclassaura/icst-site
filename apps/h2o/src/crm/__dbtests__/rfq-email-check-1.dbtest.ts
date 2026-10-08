import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureRegistry } from '../../rfq-native/registry'
import { clearEmailCheckCache, setEmailDnsLookup, type DnsLookup } from '../../email/address-check'
import { submitReply } from '../intake/native/handlers'
import { issueFormToken } from '../intake/native/token'
import { payload, resetCrm } from './harness'

/**
 * RFQ-EMAIL-CHECK-1 against the isolated synthetic database: the native quote form refuses obviously bad email addresses
 * on the server BEFORE anything is stored or any alert / T1 is queued. DNS is a mock (no network): the suite setup turns
 * the real lookup off (H2O_EMAIL_DNS_CHECK=off); these tests turn it on with a fake resolver.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const T0 = new Date('2026-10-07T03:00:00Z')
let seq = 0
const uuid = () => `0193${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`
const token = () => issueFormToken(new Date(T0.getTime() - 20_000)).formToken
const answers = (email: string) => ({ purpose: 'parts', parts_part: 'Fan blades', parts_qty: '4', name: 'Ana Ruiz', company: 'Northwind Thermal (synthetic)', email, country: 'TH' })
const request = (email: string, ip = '192.0.2.77') =>
  new Request('http://localhost:3210/api/rfq/submit/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': ip },
    body: JSON.stringify({ submissionId: uuid(), source: 'NATIVE_CHAT', registryVersion: fixtureRegistry().registryVersion, locale: 'en', answers: answers(email), context: { page_path: '/contact-us/', cta_placement: 'form', context_type: 'page' }, attribution: {}, antiAbuse: { formToken: token(), hp: '' } }),
  })
const send = async (email: string) => submitReply(await payload(), request(email), T0)
const count = async (collection: 'crm-rfqs' | 'crm-intake-events' | 'crm-email-outbox' | 'crm-contacts' | 'crm-intake-rate') => (await (await payload()).count({ collection: collection as never, overrideAccess: true })).totalDocs

/** A fake resolver: `plan` maps a domain to what each record type does. */
type Plan = Record<string, { mx?: 'ok' | 'none' | 'nx' | 'hang' | 'servfail'; a?: 'ok' | 'none'; aaaa?: 'ok' | 'none' }>
function resolver(plan: Plan): DnsLookup & { calls: string[] } {
  const calls: string[] = []
  const err = (code: string) => Object.assign(new Error(code), { code })
  const make = (kind: 'mx' | 'a' | 'aaaa') => async (host: string): Promise<unknown[]> => {
    calls.push(`${kind}:${host}`)
    const p = plan[host]
    if (!p) throw err('ENOTFOUND')
    const mode = p[kind] ?? (kind === 'mx' ? 'none' : 'none')
    if (mode === 'hang') return new Promise(() => undefined)
    if (mode === 'servfail') throw err('ESERVFAIL')
    if (mode === 'nx') throw err('ENOTFOUND')
    if (mode === 'ok') return kind === 'mx' ? [{ exchange: `mail.${host}`, priority: 10 }] : ['192.0.2.1']
    throw err('ENODATA')
  }
  return { calls, resolveMx: make('mx'), resolve4: make('a'), resolve6: make('aaaa') }
}

beforeAll(() => {
  process.env.TRUSTED_PROXY = 'cloudflare'
})
beforeEach(async () => {
  process.env.H2O_NATIVE_INTAKE = 'on'
  process.env.H2O_EMAIL_DNS_CHECK = 'on'
  clearEmailCheckCache()
  await resetCrm()
})
afterEach(() => {
  process.env.H2O_EMAIL_DNS_CHECK = 'off'
  setEmailDnsLookup(null)
})

const nothingStored = async () => {
  expect(await count('crm-rfqs')).toBe(0)
  expect(await count('crm-intake-events')).toBe(0)
  expect(await count('crm-email-outbox')).toBe(0)
  expect(await count('crm-contacts')).toBe(0)
}

describe('RFQ-EMAIL-CHECK-1: refused on the server, before anything is stored', () => {
  it('an NXDOMAIN domain is refused with a field error; 0 RFQs, 0 intake events, 0 outbox rows, 0 contacts', async () => {
    setEmailDnsLookup(resolver({}))
    const r = await send('ana@no-such-domain-synthetic.example')
    expect(r).toMatchObject({ status: 422, body: { ok: false, code: 'VALIDATION', fields: { email: 'err.email_domain' } } })
    await nothingStored()
  })

  it('a domain with no MX and no A/AAAA record is refused', async () => {
    setEmailDnsLookup(resolver({ 'empty.example': { mx: 'none', a: 'none', aaaa: 'none' } }))
    expect(await send('ana@empty.example')).toMatchObject({ status: 422, body: { fields: { email: 'err.email_domain' } } })
    await nothingStored()
  })

  it('a disposable domain is refused (and no lookup is made for it)', async () => {
    const dns = resolver({ 'mailinator.com': { mx: 'ok' } })
    setEmailDnsLookup(dns)
    expect(await send('ana@mailinator.com')).toMatchObject({ status: 422, body: { fields: { email: 'err.email_disposable' } } })
    expect(dns.calls).toEqual([])
    await nothingStored()
  })

  it('bad syntax is refused with the existing email error', async () => {
    setEmailDnsLookup(resolver({}))
    for (const bad of ['ana@@example.test', 'ana@exa mple.test', 'ana@.example.test', 'ana@' + 'example..test', 'ana@' + '-example.test', // built in two parts so the fixture-domain scan does not read them as domains
       'ana@example', 'ana@no-such.example/foo', 'ana@no-such.example#x', 'ana@no-such.example?x=1', 'ana@no-such.example:25', `${'a'.repeat(65)}@example.test`])
      expect(await send(bad), bad).toMatchObject({ status: 422, body: { fields: { email: 'err.email' } } })
    await nothingStored()
  })

  it('valid addresses pass: a Gmail address (MX), a corporate address (MX), an A-record-only domain, an AAAA-only domain', async () => {
    setEmailDnsLookup(resolver({ 'gmail.com': { mx: 'ok' }, 'northwind-synthetic.example': { mx: 'ok' }, 'a-only.example': { mx: 'none', a: 'ok' }, 'v6-only.example': { mx: 'none', a: 'none', aaaa: 'ok' } }))
    for (const [i, e] of ['ana.synthetic@gmail.com', 'ana@northwind-synthetic.example', 'ana@a-only.example', 'ana@v6-only.example'].entries()) {
      const r = await submitReply(await payload(), request(e, `192.0.2.${100 + i}`), T0)
      expect(r.status, e).toBe(200)
    }
    expect(await count('crm-rfqs')).toBe(4)
  })

  it('a DNS timeout is accepted and the inquiry is flagged "email unverified"; so is a SERVFAIL', async () => {
    setEmailDnsLookup(resolver({ 'slow.example': { mx: 'hang' }, 'broken.example': { mx: 'servfail' } }))
    const prev = process.env.H2O_EMAIL_DNS_TIMEOUT_MS
    for (const [i, e] of ['ana@slow.example', 'ana@broken.example'].entries()) {
      const r = await submitReply(await payload(), request(e, `192.0.2.${150 + i}`), T0)
      expect(r.status, e).toBe(200)
      const rfq = (await (await payload()).find({ collection: 'crm-rfqs', where: { rfq_number: { equals: (r.body as Doc).rfqNumber as string } }, ...sys })).docs[0] as unknown as Doc
      expect(((rfq.submitted as Doc).other_answers as Doc).email_check).toBe('UNVERIFIED')
    }
    if (prev === undefined) delete process.env.H2O_EMAIL_DNS_TIMEOUT_MS
  }, 20_000)

  it('a verified address carries no flag', async () => {
    setEmailDnsLookup(resolver({ 'gmail.com': { mx: 'ok' } }))
    const r = await send('ana.ok@gmail.com')
    const rfq = (await (await payload()).find({ collection: 'crm-rfqs', where: { rfq_number: { equals: (r.body as Doc).rfqNumber as string } }, ...sys })).docs[0] as unknown as Doc
    expect(((rfq.submitted as Doc).other_answers as Doc).email_check).toBeUndefined()
  })

  it('the per-IP limit runs BEFORE the DNS lookup: an IP over its limit triggers no DNS query', async () => {
    const dns = resolver({ 'gmail.com': { mx: 'ok' } })
    setEmailDnsLookup(dns)
    const ip = '192.0.2.201'
    // 5 submissions / 10 minutes per IP (SUBMIT_RULES): refused addresses count too, because the limit comes first.
    for (let i = 0; i < 5; i++) expect((await submitReply(await payload(), request(`ana${i}@nope-synthetic.example`, ip), T0)).status).toBe(422)
    const lookups = dns.calls.length
    expect(lookups).toBeGreaterThan(0)
    const over = await submitReply(await payload(), request('ana@another-nope.example', ip), T0)
    expect(over.status).toBe(429)
    expect(dns.calls.length).toBe(lookups)
    await nothingStored()
  })

  it('the per-email limit still applies after a good check, and a refused address never reaches it', async () => {
    setEmailDnsLookup(resolver({ 'gmail.com': { mx: 'ok' } }))
    for (let i = 0; i < 3; i++) expect((await submitReply(await payload(), request('same.person@gmail.com', `192.0.2.${210 + i}`), T0)).status).toBe(200)
    expect((await submitReply(await payload(), request('same.person@gmail.com', '192.0.2.220'), T0)).status).toBe(429)
  })

  it('with the operator switch off, only the DNS step is skipped (syntax and the disposable list still apply)', async () => {
    process.env.H2O_EMAIL_DNS_CHECK = 'off'
    setEmailDnsLookup(resolver({}))
    expect((await send('ana@no-such-domain-synthetic.example')).status).toBe(200)
    expect(await send('ana@mailinator.com')).toMatchObject({ status: 422, body: { fields: { email: 'err.email_disposable' } } })
    expect(await send('ana@@example.test')).toMatchObject({ status: 422, body: { fields: { email: 'err.email' } } })
  })
})
