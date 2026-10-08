import { sql } from '@payloadcms/db-postgres'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readEmailConfig } from '../../email/config'
import { drainOutbox } from '../../email/outbox-worker'
import { fixtureRegistry } from '../../rfq-native/registry'
import { submitReply } from '../intake/native/handlers'
import { storedPayload, parseEnvelope, contentHash } from '../intake/native/normalize'
import { countStranded, sweepStrandedIntake } from '../intake/native/sweep'
import { issueFormToken } from '../intake/native/token'
import { loadOverview } from '../overview'
import { label, SOURCE_LABEL } from '../workspace/labels'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * RFQ-FIX-1 (quote-form audit R1): the honeypot audit trail (R5), the stranded-request sweeper (R6) and its counts, and a
 * lead that survives a failing mail server (R19 / test gap 7). Synthetic data only: example.test addresses, documentation
 * IPs, a fake mail transport.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const T0 = new Date('2026-10-08T03:00:00Z')
let seq = 0
const uuid = () => `0193${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`
const answers = (n: number) => ({ purpose: 'parts', parts_part: 'Fan blades', name: `Ana Ruiz${n}`, company: 'Northwind Thermal (synthetic)', email: `ana.fix.${n}.${Date.now()}@example.test`, country: 'TH' })
const body = (a: Record<string, string>, hp = '') => ({
  submissionId: uuid(),
  source: 'NATIVE_FORM',
  registryVersion: fixtureRegistry().registryVersion,
  locale: 'en',
  answers: a,
  context: { page_path: '/contact-us/', cta_placement: 'contact_form', context_type: 'page' },
  attribution: {},
  antiAbuse: { formToken: issueFormToken(new Date(T0.getTime() - 20_000)).formToken, hp },
})
const send = async (b: unknown, ip = '192.0.2.40', now = T0) =>
  submitReply(await payload(), new Request('http://localhost:3210/api/rfq/submit/', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': ip }, body: JSON.stringify(b) }), now)
const count = async (collection: string, where: Doc = {}) => (await (await payload()).count({ collection: collection as never, where: where as never, overrideAccess: true })).totalDocs

/** A native request stored but never finished: what a crash right after the intake insert leaves behind. */
async function stranded(state: 'PROCESSING' | 'FAILED_RETRYABLE', leaseUntil: Date | null, n: number) {
  const b = body(answers(n))
  const r = parseEnvelope(b)!
  const p = await payload()
  return (await p.create({
    collection: 'crm-intake-events',
    data: {
      source_system: 'NATIVE_FORM',
      source_event_id: `native:${r.submissionId}`,
      source_event_type: 'native_form',
      source_form_id: 'native',
      signature_state: 'FORM_TOKEN_VERIFIED',
      raw_payload_hash: contentHash(r),
      raw_payload: storedPayload(r) as never,
      received_at: T0.toISOString(),
      processing_state: state,
      processing_lease_until: leaseUntil?.toISOString() ?? null,
      replay_count: 0,
    } as never,
    context: { crmServer: {} },
    ...sys,
  })) as unknown as Doc & { id: string; source_event_id: string }
}
const eventById = async (id: string) => (await (await payload()).findByID({ collection: 'crm-intake-events', id, ...sys })) as unknown as Doc

beforeAll(() => {
  process.env.TRUSTED_PROXY = 'cloudflare'
})
beforeEach(async () => {
  process.env.H2O_NATIVE_INTAKE = 'on'
  await resetCrm()
})

describe('R5: a filled honeypot is kept for an admin, never dropped and never an RFQ', () => {
  it('stored once as QUARANTINED_SPAM with the request (admin-only raw payload); no RFQ, no email; the sender sees the usual reply', async () => {
    const b = body(answers(1), 'https://spam.example')
    const r = await send(b)
    expect(r).toMatchObject({ status: 200, body: { ok: true, rfqNumber: null } })
    expect(await send(b)).toMatchObject({ status: 200, body: { ok: true, rfqNumber: null } })
    const events = (await (await payload()).find({ collection: 'crm-intake-events', ...sys })).docs as unknown as Doc[]
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ processing_state: 'QUARANTINED_SPAM', failure_code: 'HONEYPOT', source_system: 'NATIVE_FORM', rfq: null })
    expect((events[0]!.raw_payload as { answers: Doc }).answers.company).toBe('Northwind Thermal (synthetic)')
    expect(JSON.stringify(events[0]!.raw_payload)).not.toContain('spam.example')
    expect(await count('crm-rfqs')).toBe(0)
    expect(await count('crm-email-outbox')).toBe(0)
  })
  it('sales cannot read the raw request; the overview shows admins the day\'s count and sales nothing', async () => {
    await send(body(answers(2), 'x'))
    const [admin, sales]: TestUser[] = [await user('platform-admin'), await user('sales')]
    const p = await payload()
    const asSales = (await p.find({ collection: 'crm-intake-events', overrideAccess: false, user: sales.user, depth: 0 })).docs[0] as unknown as Doc | undefined
    expect(asSales?.raw_payload).toBeUndefined()
    const req = (u: TestUser) => ({ payload: p, user: u.user }) as never
    expect((await loadOverview(req(admin), T0))!.intake).toEqual({ stranded: 0, spam24h: 1, failedPermanent: 0 })
    expect((await loadOverview(req(admin), new Date(T0.getTime() + 25 * 3600_000)))!.intake!.spam24h).toBe(0)
    expect((await loadOverview(req(sales), T0))!.intake).toBeNull()
  })
})

describe('R6: stranded native requests are finished by the sweeper', () => {
  it('a crash after the insert (expired lease) and a failed attempt both become one RFQ each, with one alert; a second sweep does nothing', async () => {
    const crashed = await stranded('PROCESSING', new Date(T0.getTime() - 60_000), 3)
    const failed = await stranded('FAILED_RETRYABLE', null, 4)
    const later = new Date(T0.getTime() + 10 * 60_000)
    expect(await countStranded(await payload(), later)).toBe(2)
    const first = await sweepStrandedIntake(await payload(), later)
    expect(first).toMatchObject({ found: 2, finished: 2, skipped: 0, failed: 0 })
    for (const e of [crashed, failed]) {
      const ev = await eventById(e.id)
      expect(ev.processing_state).toBe('PROCESSED')
      expect(ev.rfq).toBeTruthy()
      const rfq = (await (await payload()).findByID({ collection: 'crm-rfqs', id: String(ev.rfq), ...sys })) as unknown as Doc
      // the RFQ keeps the time the visitor sent it, not the sweep time
      expect(new Date(String(rfq.received_at ?? rfq.createdAt)).getTime()).toBeLessThanOrEqual(later.getTime())
    }
    expect(await count('crm-rfqs')).toBe(2)
    expect(await count('crm-email-outbox', { kind: { equals: 'RFQ_SALES_ALERT' } })).toBeLessThanOrEqual(2)
    const alerts = await count('crm-email-outbox', { kind: { equals: 'RFQ_SALES_ALERT' } })
    expect(await sweepStrandedIntake(await payload(), later)).toMatchObject({ found: 0, finished: 0, skipped: 0, failed: 0 })
    expect(await count('crm-rfqs')).toBe(2)
    expect(await count('crm-email-outbox', { kind: { equals: 'RFQ_SALES_ALERT' } })).toBe(alerts)
    expect(await countStranded(await payload(), later)).toBe(0)
  })
  it('a worker still inside its lease is left alone; two sweeps at once still make exactly one RFQ', async () => {
    const live = await stranded('PROCESSING', new Date(T0.getTime() + 5 * 60_000), 5)
    expect(await sweepStrandedIntake(await payload(), new Date(T0.getTime() + 60_000))).toMatchObject({ found: 0 })
    expect((await eventById(live.id)).processing_state).toBe('PROCESSING')
    const after = new Date(T0.getTime() + 6 * 60_000)
    const [a, b] = await Promise.all([sweepStrandedIntake(await payload(), after), sweepStrandedIntake(await payload(), after)])
    expect(a.finished + b.finished).toBe(1)
    expect(await count('crm-rfqs')).toBe(1)
  })
  it('a visitor\'s own retry while the first attempt still holds its lease does not take it over (no second worker)', async () => {
    const b = body(answers(9))
    const r = parseEnvelope(b)!
    const p = await payload()
    const live = (await p.create({
      collection: 'crm-intake-events',
      data: { source_system: 'NATIVE_FORM', source_event_id: `native:${r.submissionId}`, source_event_type: 'native_form', source_form_id: 'native', signature_state: 'FORM_TOKEN_VERIFIED', raw_payload_hash: contentHash(r), raw_payload: storedPayload(r) as never, received_at: T0.toISOString(), processing_state: 'PROCESSING', processing_lease_until: new Date(T0.getTime() + 5 * 60_000).toISOString(), replay_count: 0 } as never,
      context: { crmServer: {} },
      ...sys,
    })) as unknown as { id: string }
    await send(b)
    expect((await eventById(live.id)).processing_state).toBe('PROCESSING')
    expect(await count('crm-rfqs')).toBe(0)
  })
  it('a stored request that no longer validates is skipped and stays visible as stranded for an admin', async () => {
    const e = await stranded('FAILED_RETRYABLE', null, 6)
    const p = await payload()
    await (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle.execute(sql`UPDATE crm_intake_events SET raw_payload = jsonb_set(raw_payload, '{answers,email}', '"not-an-email"') WHERE id = ${String(e.id)}`)
    expect(await sweepStrandedIntake(p, new Date(T0.getTime() + 60_000))).toMatchObject({ found: 1, finished: 0, skipped: 1, failed: 0 })
    expect(await count('crm-rfqs')).toBe(0)
    expect(await countStranded(p, new Date(T0.getTime() + 60_000))).toBe(1)
    const admin = await user('platform-admin')
    expect((await loadOverview({ payload: p, user: admin.user } as never, T0))!.intake!.stranded).toBe(1)
  })
})

describe('SEC-CRM-1 auditor note (a): a flood naming an address cannot keep it locked', () => {
  it('refused requests are not counted against the email; the address is free again one hour after its last admitted request', async () => {
    const email = `victim.${Date.now()}@example.test`
    const at = (min: number) => new Date(T0.getTime() + min * 60_000)
    const withToken = (b: ReturnType<typeof body>, now: Date) => ({ ...b, antiAbuse: { ...b.antiAbuse, formToken: issueFormToken(new Date(now.getTime() - 20_000)).formToken } })
    for (let i = 0; i < 3; i++) expect((await send(body({ ...answers(40 + i), email }), `192.0.2.${50 + i}`)).status).toBe(200)
    for (let i = 0; i < 12; i++) expect((await send(withToken(body({ ...answers(60 + i), email }), at(30)), `198.51.100.${i + 1}`, at(30))).status).toBe(429)
    expect((await send(withToken(body({ ...answers(80), email }), at(61)), '203.0.113.9', at(61))).status).toBe(200)
  })
})

describe('R19 / test gap 7: the lead survives a failing mail server', () => {
  const MAIL = { H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: 'sales.alerts@example.test', H2O_SALES_ALERT_TO: 'sales.alerts@example.test', H2O_EMAIL_FROM: 'ICS Sales Team <sales@example.test>' }
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => { for (const [k, v] of Object.entries(MAIL)) { saved[k] = process.env[k]; process.env[k] = v } })
  afterEach(() => { for (const k of Object.keys(MAIL)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
  it('the RFQ is stored and answered 200 whatever the mail server does; the alert waits in the outbox to retry', async () => {
    const r = await send(body(answers(7)))
    expect(r.status).toBe(200)
    const rfqNumber = (r.body as { rfqNumber: string }).rfqNumber
    const p = await payload()
    let attempts = 0
    const failing = { send: async () => { attempts++; throw Object.assign(new Error('synthetic 421 try later'), { responseCode: 421 }) }, close: () => undefined }
    await drainOutbox(p, { cfg: readEmailConfig(), transport: failing, now: new Date(Date.now() + 60_000) })
    expect(attempts).toBe(1)
    expect(await count('crm-rfqs', { rfq_number: { equals: rfqNumber } })).toBe(1)
    // QA CRM pass: a native row is labelled as the website form, never "(Typeform)"
    const rfq = (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: rfqNumber } }, ...sys })).docs[0] as unknown as Doc
    expect([rfq.source_system, label(SOURCE_LABEL, rfq.source_system)]).toEqual(['NATIVE_FORM', 'Website form'])
    const alerts = (await p.find({ collection: 'crm-email-outbox', where: { kind: { equals: 'RFQ_SALES_ALERT' } }, ...sys })).docs as unknown as Doc[]
    expect(alerts.map((a) => a.status)).toEqual(['RETRY'])
  })
})
