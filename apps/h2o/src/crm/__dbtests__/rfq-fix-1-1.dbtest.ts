import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureRegistry } from '../../rfq-native/registry'
import { SPAM_PAYLOAD_BYTES, submitReply } from '../intake/native/handlers'
import { contentHash, parseEnvelope, storedPayload } from '../intake/native/normalize'
import { SPAM_KEEP_DAYS, SWEEP_MAX_ATTEMPTS, sweepBackoffMs, sweepStrandedIntake } from '../intake/native/sweep'
import { issueFormToken } from '../intake/native/token'
import { loadOverview } from '../overview'
import { payload, resetCrm, user } from './harness'

/**
 * RFQ-FIX-1.1 (Security Auditor note on RFQ-FIX-1_R17): honeypot storage is rate-limited and size-capped; quarantined
 * spam expires; the sweeper backs off and gives up (FAILED_PERMANENT) instead of retrying forever. Synthetic only.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const T0 = new Date('2026-10-08T06:00:00Z')
let seq = 0
const uuid = () => `0195${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`
const body = (answers: Record<string, string>, hp = '', at = T0) => ({
  submissionId: uuid(),
  source: 'NATIVE_FORM',
  registryVersion: fixtureRegistry().registryVersion,
  locale: 'en',
  answers,
  context: { page_path: '/contact-us/', cta_placement: 'contact_form', context_type: 'page' },
  attribution: {},
  antiAbuse: { formToken: issueFormToken(new Date(at.getTime() - 20_000)).formToken, hp },
})
const answers = (n: number, extra: Record<string, string> = {}) => ({ purpose: 'parts', parts_part: 'Fan blades', name: `Ana Ruiz${n}`, company: 'Northwind Thermal (synthetic)', email: `ana.r11.${n}.${Date.now()}@example.test`, country: 'TH', ...extra })
const send = async (b: unknown, ip: string, now = T0) =>
  submitReply(await payload(), new Request('http://localhost:3210/api/rfq/submit/', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': ip }, body: JSON.stringify(b) }), now)
const spamRows = async () => (await (await payload()).find({ collection: 'crm-intake-events', where: { processing_state: { equals: 'QUARANTINED_SPAM' } }, limit: 100, ...sys })).docs as unknown as Doc[]

beforeAll(() => {
  process.env.TRUSTED_PROXY = 'cloudflare'
})
beforeEach(async () => {
  process.env.H2O_NATIVE_INTAKE = 'on'
  await resetCrm()
})

describe('honeypot storage is bounded', () => {
  it('N honeypot requests from one IP store at most the per-IP limit; every sender still sees 200 with no number', async () => {
    for (let i = 0; i < 12; i++) expect(await send(body(answers(i), 'https://spam.example'), '192.0.2.77')).toMatchObject({ status: 200, body: { ok: true, rfqNumber: null } })
    expect((await spamRows()).length).toBe(5) // SUBMIT_RULES: 5 per IP per 10 minutes
    // the same IP is throttled for real requests too: the honeypot flood counted against it
    expect((await send(body(answers(99)), '192.0.2.77')).status).toBe(429)
    expect((await (await payload()).count({ collection: 'crm-rfqs', overrideAccess: true })).totalDocs).toBe(0)
  })
  it('a quarantined request keeps at most 2 KB of its payload (and the full content hash)', async () => {
    const b = body(answers(1, { parts_part: 'ก'.repeat(200), notes: 'ข'.repeat(2000), parts_model: 'ค'.repeat(120) }), 'x')
    await send(b, '192.0.2.78')
    const [row] = await spamRows()
    expect(Buffer.byteLength(JSON.stringify(row!.raw_payload), 'utf8')).toBeLessThanOrEqual(SPAM_PAYLOAD_BYTES)
    expect(row!.raw_payload).toMatchObject({ truncated: true })
    expect(row!.raw_payload_hash).toBe(contentHash(parseEnvelope(b)!))
    // a short request is kept whole
    await send(body(answers(2), 'x'), '192.0.2.79')
    const small = (await spamRows()).find((r) => !(r.raw_payload as Doc).truncated)!
    expect(small.raw_payload).toMatchObject({ source: 'NATIVE_FORM', answers: { first_name: 'Ana', last_name: 'Ruiz2', company: 'Northwind Thermal (synthetic)' } })
  })
  it('quarantined spam older than 30 days is removed by the sweeper; newer spam stays', async () => {
    await send(body(answers(3), 'x'), '192.0.2.80')
    await send(body(answers(4), 'x', new Date(T0.getTime() + 20 * 86_400_000)), '192.0.2.81', new Date(T0.getTime() + 20 * 86_400_000))
    const r = await sweepStrandedIntake(await payload(), new Date(T0.getTime() + (SPAM_KEEP_DAYS + 1) * 86_400_000))
    expect(r.prunedSpam).toBe(1)
    expect((await spamRows()).length).toBe(1)
  })
})

describe('the sweeper backs off and gives up', () => {
  it('a payload that never processes is tried with growing gaps, then FAILED_PERMANENT after the cap, shown to admins', async () => {
    const b = body(answers(5))
    const r = parseEnvelope(b)!
    const p = await payload()
    const ev = (await p.create({
      collection: 'crm-intake-events',
      data: { source_system: 'NATIVE_FORM', source_event_id: `native:${r.submissionId}`, source_event_type: 'native_form', source_form_id: 'native', signature_state: 'FORM_TOKEN_VERIFIED', raw_payload_hash: contentHash(r), raw_payload: { ...storedPayload(r), answers: { ...r.answers, email: 'not-an-email' } } as never, received_at: T0.toISOString(), processing_state: 'FAILED_RETRYABLE', replay_count: 0 } as never,
      context: { crmServer: {} },
      ...sys,
    })) as unknown as { id: string }
    let now = T0.getTime() + 60_000
    let tried = 0
    expect((await sweepStrandedIntake(p, new Date(now))).found).toBe(1)
    tried++
    // inside the backoff window nothing is retried
    expect((await sweepStrandedIntake(p, new Date(now + sweepBackoffMs(1) - 1000))).found).toBe(0)
    for (let i = 0; i < 20 && tried < SWEEP_MAX_ATTEMPTS + 1; i++) {
      now += 61 * 60_000 // past the longest gap
      const res = await sweepStrandedIntake(p, new Date(now))
      tried += res.found
    }
    const doc = (await p.findByID({ collection: 'crm-intake-events', id: ev.id, ...sys })) as unknown as Doc
    expect([doc.processing_state, doc.failure_code, Number(doc.sweep_attempts)]).toEqual(['FAILED_PERMANENT', 'SWEEP_GAVE_UP', SWEEP_MAX_ATTEMPTS])
    expect((await sweepStrandedIntake(p, new Date(now + 3 * 3600_000))).found).toBe(0)
    const admin = await user('platform-admin')
    expect((await loadOverview({ payload: p, user: admin.user } as never, new Date(now)))!.intake).toMatchObject({ stranded: 0, failedPermanent: 1 })
  })
})
