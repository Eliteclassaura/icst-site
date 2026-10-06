import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureRegistry } from '../../rfq-native/registry'
import { registryReply, submitReply, tokenReply } from '../intake/native/handlers'
import { issueFormToken } from '../intake/native/token'
import { captureLogs, payload, resetCrm } from './harness'

/**
 * Native RFQ intake adapter (contract H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1) against the isolated synthetic database:
 * the real handlers, driven with Request objects. Everything synthetic: example.test addresses, documentation IPs.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const T0 = new Date('2026-10-07T03:00:00Z') // Wed 10:00 Bangkok / Tue 21:00 Denver
let seq = 0
const uuid = () => `0192${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`

function submitRequest(body: unknown, opts: { ip?: string; site?: string; raw?: string } = {}) {
  return new Request('http://localhost:3210/api/rfq/submit/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': opts.site ?? 'same-origin', 'cf-connecting-ip': opts.ip ?? '192.0.2.10' },
    body: opts.raw ?? JSON.stringify(body),
  })
}
const token = (at = new Date(T0.getTime() - 20_000)) => issueFormToken(at).formToken
const partsTH = (n: number) => ({ purpose: 'parts', parts_part: 'Fan blades', parts_qty: '4', name: `Ana Ruiz${n}`, company: 'Northwind Thermal (synthetic)', email: `ana.${n}.${Date.now()}@example.test`, country: 'TH' })
function body(answers: Record<string, string>, extra: Doc = {}) {
  return {
    submissionId: uuid(),
    source: 'NATIVE_CHAT',
    registryVersion: fixtureRegistry().registryVersion,
    locale: 'en',
    answers,
    context: { page_path: '/cooling-tower-parts/', cta_placement: 'launcher', context_type: 'page' },
    attribution: { utm_source: 'google', utm_medium: 'cpc', gclid: 'Cj0KCQjw-synthetic_1', landing_page: '/cooling-tower-parts/', referrer: 'https://www.google.com/search?q=x' },
    antiAbuse: { formToken: token(), hp: '' },
    ...extra,
  }
}
const send = async (b: unknown, opts: { ip?: string; site?: string; raw?: string } = {}, now = T0) => submitReply(await payload(), submitRequest(b, opts), now)
const rfqFor = async (n: string) => (await (await payload()).find({ collection: 'crm-rfqs', where: { rfq_number: { equals: n } }, ...sys })).docs[0] as unknown as Doc
const count = async (collection: 'crm-rfqs' | 'crm-intake-events' | 'crm-intake-rate') => (await (await payload()).count({ collection: collection as never, overrideAccess: true })).totalDocs

beforeAll(() => {
  process.env.TRUSTED_PROXY = 'cloudflare'
})
beforeEach(async () => {
  process.env.H2O_NATIVE_INTAKE = 'on'
  await resetCrm()
})

describe('registry and token', () => {
  it('serves Main\'s registry (same version), EN, the switch, the response-time line; an unchanged copy is a 304', () => {
    process.env.H2O_NATIVE_INTAKE = 'off'
    const off = registryReply(new Request('http://localhost/api/rfq/registry/?locale=th'))
    expect(off.status).toBe(200)
    expect(off.body).toMatchObject({ enabled: false, locale: 'en', registryVersion: fixtureRegistry().registryVersion })
    process.env.H2O_NATIVE_INTAKE = 'on'
    const on = registryReply(new Request('http://localhost/api/rfq/registry/?locale=en'))
    expect(on.body).toMatchObject({ enabled: true, strings: { 'confirm.response_time': "We'll respond within one business day." } })
    expect(on.headers?.['cache-control']).toMatch(/public, max-age=300/)
    expect(registryReply(new Request('http://localhost/api/rfq/registry/', { headers: { 'if-none-match': on.headers!.etag! } })).status).toBe(304)
  })
  it('issues a signed token (no-store), refuses when off, and rate-limits per client', async () => {
    const p = await payload()
    const ok = await tokenReply(p, new Request('http://localhost/api/rfq/token/', { headers: { 'cf-connecting-ip': '192.0.2.50' } }), T0)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ formToken: expect.stringMatching(/^v1\./) })
    expect(ok.headers?.['cache-control']).toBe('no-store')
    process.env.H2O_NATIVE_INTAKE = 'off'
    expect((await tokenReply(p, new Request('http://localhost/api/rfq/token/'), T0)).status).toBe(503)
  })
})

describe('submit: the canonical path', () => {
  it('chat, parts, Thailand: one RFQ on the native source, routed to TH, typed PARTS, with attribution and an alert row', async () => {
    const b = body(partsTH(1))
    const r = await send(b)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, rfqNumber: expect.stringMatching(/^RFQ-\d{8}-[0-9A-Z]{8}$/), replay: false })
    const rfq = await rfqFor((r.body as Doc).rfqNumber as string)
    expect(rfq).toMatchObject({ source_system: 'NATIVE_CHAT', country_code: 'TH', country_source: 'SUBMITTED', office: 'TH', inquiry_type: 'PARTS' })
    expect(rfq.attribution).toMatchObject({ page_path: '/cooling-tower-parts/', cta_placement: 'launcher', utm_source: 'google', gclid: 'Cj0KCQjw-synthetic_1', landing_page: '/cooling-tower-parts/', referrer: 'https://www.google.com/search' })
    expect((rfq.submitted as Doc).message).toContain('Fan blades')
    expect(((rfq.submitted as Doc).other_answers as Doc)).toMatchObject({ interest: 'Parts', native_purpose: 'parts', parts_part: 'Fan blades', context_type: 'page' })
    const p = await payload()
    const event = (await p.find({ collection: 'crm-intake-events', where: { source_event_id: { equals: `native:${b.submissionId}` } }, ...sys })).docs[0] as unknown as Doc
    expect(event).toMatchObject({ source_system: 'NATIVE_CHAT', signature_state: 'FORM_TOKEN_VERIFIED', processing_state: expect.stringMatching(/^PROCESSED/) })
    expect(JSON.stringify(event.raw_payload)).not.toContain('formToken')
    const contact = (await p.find({ collection: 'crm-contacts', where: { email_match_key: { equals: b.answers.email.toLowerCase() } }, ...sys })).docs[0] as unknown as Doc
    expect((contact.provenance as Doc).source_system).toBe('NATIVE_CHAT')
    const alerts = await p.find({ collection: 'crm-email-outbox', where: { and: [{ rfq: { equals: rfq.id } }, { kind: { equals: 'RFQ_SALES_ALERT' } }] }, ...sys })
    expect(alerts.totalDocs + (await p.count({ collection: 'crm-email-events', where: { kind: { equals: 'RFQ_SALES_ALERT' } }, overrideAccess: true })).totalDocs).toBeGreaterThan(0)
  })

  it('form, upgrade (towers + the optional improvement question), Germany: NATIVE_FORM, US queue, repair/service', async () => {
    const r = await send(body({ purpose: 'upgrade', towers_type: 'counterflow', service_issue_upgrade: 'More capacity', name: 'Ben Ode', company: 'Rhein Kühlung (synthetic)', email: `ben.${Date.now()}@example.test`, country: 'DE' }, { source: 'NATIVE_FORM' }), { ip: '192.0.2.11' })
    expect(r.status).toBe(200)
    const rfq = await rfqFor((r.body as Doc).rfqNumber as string)
    expect(rfq).toMatchObject({ source_system: 'NATIVE_FORM', office: 'US', inquiry_type: 'REPAIR_SERVICE' })
  })

  it('a double submit returns the same RFQ (replay) and creates nothing new; different answers under the same id are refused', async () => {
    const b = body(partsTH(2))
    const first = await send(b, { ip: '192.0.2.12' })
    const again = await send(b, { ip: '192.0.2.12' })
    expect(again.body).toMatchObject({ ok: true, rfqNumber: (first.body as Doc).rfqNumber, replay: true })
    expect(await count('crm-rfqs')).toBe(1)
    const conflict = await send({ ...b, answers: { ...b.answers, parts_part: 'Gearbox' } }, { ip: '192.0.2.12' })
    expect(conflict).toMatchObject({ status: 409, body: { ok: false, code: 'SUBMISSION_CONFLICT' } })
    expect(await count('crm-rfqs')).toBe(1)
  })
})

describe('submit: refusals', () => {
  it('honeypot: "accepted" with no RFQ number, and nothing stored', async () => {
    const r = await send(body(partsTH(3), { antiAbuse: { formToken: token(), hp: 'https://spam.example' } }), { ip: '192.0.2.13' })
    expect(r).toMatchObject({ status: 200, body: { ok: true, rfqNumber: null } })
    expect(await count('crm-rfqs')).toBe(0)
    expect(await count('crm-intake-events')).toBe(0)
  })

  it('form token: missing, too fast, expired or tampered → 409 TOKEN_INVALID', async () => {
    const ip = { ip: '192.0.2.14' }
    for (const t of ['', token(new Date(T0.getTime() - 1000)), token(new Date(T0.getTime() - 3 * 3600_000)), `${token()}x`])
      expect((await send(body(partsTH(4), { antiAbuse: { formToken: t, hp: '' } }), ip)).body).toMatchObject({ code: 'TOKEN_INVALID' })
    expect(await count('crm-rfqs')).toBe(0)
  })

  it('validation answers with keys only: required (form/chat wording), email, chip, another branch', async () => {
    const chat = await send(body({ ...partsTH(5), company: '', email: 'not-an-email' }), { ip: '192.0.2.15' })
    expect(chat).toMatchObject({ status: 422, body: { code: 'VALIDATION', fields: { company: 'err.required', email: 'err.email' } } })
    const form = await send(body({ ...partsTH(5), company: '' }, { source: 'NATIVE_FORM' }), { ip: '192.0.2.15' })
    expect((form.body as Doc).fields).toMatchObject({ company: 'err.required.form' })
    const branch = await send(body({ ...partsTH(5), towers_type: 'crossflow' }), { ip: '192.0.2.15' })
    expect((branch.body as Doc).fields).toMatchObject({ towers_type: 'err.server' })
    const chip = await send(body({ purpose: 'teleport', name: 'A B', company: 'C', email: `x${Date.now()}@example.test`, country: 'TH' }), { ip: '192.0.2.15' })
    expect((chip.body as Doc).fields).toMatchObject({ purpose: 'err.required' })
    expect(JSON.stringify(chat.body)).not.toContain('not-an-email')
    expect(await count('crm-rfqs')).toBe(0)
  })

  it('rate limits: 5 per IP in 10 minutes, 3 per email per hour — a replay never counts', async () => {
    const firstBody = body(partsTH(10))
    expect((await send(firstBody, { ip: '192.0.2.20' })).status).toBe(200)
    for (let i = 1; i < 5; i++) expect((await send(body(partsTH(10 + i)), { ip: '192.0.2.20' })).status).toBe(200)
    // At the limit, the visitor's own retry of a sent request still gets its RFQ back (a replay is never counted).
    expect((await send(firstBody, { ip: '192.0.2.20' })).body).toMatchObject({ ok: true, replay: true })
    const sixth = await send(body(partsTH(16)), { ip: '192.0.2.20' })
    expect(sixth).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } })
    expect(Number(sixth.headers?.['retry-after'])).toBeGreaterThan(0)
    const email = `same.${Date.now()}@example.test`
    for (let i = 0; i < 3; i++) expect((await send(body({ ...partsTH(20 + i), email }), { ip: `192.0.2.${30 + i}` })).status).toBe(200)
    expect((await send(body({ ...partsTH(24), email }), { ip: '192.0.2.40' })).status).toBe(429)
    // Buckets are keyed HMACs: no IP and no address is stored.
    const rows = JSON.stringify((await (await payload()).find({ collection: 'crm-intake-rate' as never, limit: 100, ...sys })).docs)
    expect(rows).not.toContain('192.0.2')
    expect(rows).not.toContain('example.test')
  })

  it('off → 503; cross-site → 403; oversize → 413; not JSON → 422', async () => {
    process.env.H2O_NATIVE_INTAKE = 'off'
    expect((await send(body(partsTH(30)))).status).toBe(503)
    process.env.H2O_NATIVE_INTAKE = 'on'
    expect((await send(body(partsTH(30)), { site: 'cross-site' })).status).toBe(403)
    expect((await send(null, { raw: JSON.stringify(body({ ...partsTH(30), notes: 'x'.repeat(17000) })) })).status).toBe(413)
    expect((await send(null, { raw: '{not json' })).status).toBe(422)
  })

  it('logs carry codes only — no answer, address, name, IP or token', async () => {
    const p = await payload()
    const logs = captureLogs(p)
    try {
      const b = body(partsTH(40))
      await send(b, { ip: '192.0.2.77' })
      await send({ ...b, answers: { ...b.answers, parts_part: 'Other part' } }, { ip: '192.0.2.77' })
      const text = logs.lines.join('\n')
      for (const secret of [b.answers.email, 'Ana Ruiz40', 'Fan blades', '192.0.2.77', b.antiAbuse.formToken]) expect(text).not.toContain(secret)
      expect(text).toContain('crm.intake.native')
    } finally {
      logs.restore()
    }
  })
})
