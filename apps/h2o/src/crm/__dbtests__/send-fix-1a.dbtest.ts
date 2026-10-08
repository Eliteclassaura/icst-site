import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SALES_ADDRESS, readEmailConfig } from '../../email/config'
import { claimBatch, drainOutbox, processRow } from '../../email/outbox-worker'
import type { MailMessage, MailTransport } from '../../email/transport'
import { fixtureRegistry } from '../../rfq-native/registry'
import { submitReply } from '../intake/native/handlers'
import { sweepStrandedIntake } from '../intake/native/sweep'
import { issueFormToken } from '../intake/native/token'
import { composeReply, replyReadiness } from '../reply'
import { ensureTemplates } from '../settings/templates'
import { crmSessionFor } from '../workspace/session'
import { payload, resetCrm, user } from './harness'

/**
 * SEND-FIX-1a (review R2-02, R2-03; owner 2026-10-08): only the launch kinds go out, checked at queue time and right
 * before the mail server; accepted mail is never handed over twice; an ambiguous hand-over is held as UNCERTAIN; the
 * worker lease is fenced; every attempt records its transport identity; T1's Reply-To is the monitored sales mailbox.
 * Synthetic only: example.test addresses, a fake transport, documentation IPs.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const CUSTOMER = 'avery.send1a@northwind.example.test'
const ALERTS = 'sales.alerts@example.test'
const MAIL: Record<string, string> = {
  H2O_NATIVE_INTAKE: 'on',
  NEXT_PUBLIC_SERVER_URL: 'http://localhost:3215',
  TRUSTED_PROXY: 'cloudflare',
  H2O_EMAIL_MODE: 'allowlist',
  H2O_EMAIL_ALLOWLIST: `${ALERTS},${CUSTOMER}`,
  H2O_SALES_ALERT_TO: ALERTS,
  H2O_EMAIL_FROM: '"ICS Sales Team" <rfq@example.test>',
  H2O_EMAIL_CUSTOMER_ACK: 'on',
  H2O_EMAIL_INBOUND: 'off',
  H2O_SMTP_HOST: 'smtp.example.test',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'rfq@example.test',
  H2O_SMTP_PASS: 'synthetic-submission-password',
  H2O_SMTP_TLS_SERVERNAME: 'smtp.example.test',
}
const KEYS = [...Object.keys(MAIL), 'H2O_EMAIL_ALLOWED_KINDS', 'H2O_RFQ_SALES_EMAIL']
let saved: Record<string, string | undefined> = {}
let p: Payload
let seq = 0

const db = () => (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows?: Doc[] }> } }).drizzle
const rows = async (kind?: string) => (await p.find({ collection: 'crm-email-outbox', where: kind ? { kind: { equals: kind } } : {}, sort: 'createdAt', ...sys })).docs as unknown as Doc[]
const events = async (outbox: string) => ((await p.find({ collection: 'crm-email-events', where: { outbox: { equals: outbox } }, sort: 'occurred_at', limit: 50, ...sys })).docs as unknown as Doc[]).map((e) => e.event)
const later = (min: number) => new Date(Date.now() + min * 60_000)

/** A fake mail server: records every hand-over; `fail` decides per call (return an error to throw it). */
function server(fail: (n: number, m: MailMessage) => unknown = () => null) {
  const sent: MailMessage[] = []
  const t: MailTransport = {
    send: async (m) => {
      const e = fail(sent.length + 1, m)
      sent.push(m)
      if (e) throw e
      return { messageId: m.messageId ?? null, accepted: 1, response: `250 2.0.0 OK queued for <${m.to}>` }
    },
    close: () => undefined,
  }
  return { t, sent }
}

/** One synthetic native RFQ (queues the sales alert and, with the acknowledgement on, T1). */
async function newRfq(): Promise<string> {
  const now = new Date()
  const b = {
    submissionId: `0194${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`,
    source: 'NATIVE_FORM',
    registryVersion: fixtureRegistry().registryVersion,
    locale: 'en',
    answers: { purpose: 'parts', parts_part: 'Fan blades', first_name: 'Avery', last_name: 'Synthetic', company: 'Northwind Thermal (synthetic)', email: CUSTOMER, country: 'US' },
    context: { page_path: '/contact-us/', cta_placement: 'contact_form', context_type: 'page' },
    attribution: {},
    antiAbuse: { formToken: issueFormToken(new Date(now.getTime() - 20_000)).formToken, hp: '' },
  }
  const r = await submitReply(p, new Request('http://localhost:3210/api/rfq/submit/', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': `192.0.2.${60 + seq}` }, body: JSON.stringify(b) }), now)
  expect(r.status).toBe(200)
  const rfq = (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: (r.body as { rfqNumber: string }).rfqNumber } }, ...sys })).docs[0] as unknown as Doc
  return String(rfq.id)
}

beforeAll(async () => {
  p = await payload()
})
beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(MAIL)) process.env[k] = v
  delete process.env.H2O_EMAIL_ALLOWED_KINDS
  delete process.env.H2O_RFQ_SALES_EMAIL
  await resetCrm()
  await ensureTemplates(p)
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('R2-02: the launch allowlist — RFQ alert and T1 only', () => {
  it('alert and T1 go out; T1 replies reach the monitored sales mailbox (inbound off), Auto-Submitted', async () => {
    await newRfq()
    const s = server()
    const r = await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })
    expect(r).toMatchObject({ sent: 2, uncertain: 0 })
    const ack = s.sent.find((m) => m.to === CUSTOMER)!
    expect(ack.replyTo).toBe(DEFAULT_SALES_ADDRESS)
    expect(ack.headers).toMatchObject({ 'Auto-Submitted': 'auto-generated' })
    process.env.H2O_RFQ_SALES_EMAIL = 'quotes@example.test'
    await newRfq()
    const s2 = server()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s2.t, now: later(1) })
    expect(s2.sent.find((m) => m.to === CUSTOMER)!.replyTo).toBe('quotes@example.test')
  })
  it('a manual reply is refused at queue time with the plain note, and the panel shows it (no composer)', async () => {
    const rfqId = await newRfq()
    const sales = await user('sales')
    const S = crmSessionFor(p, sales.user)!
    const rfq = (await p.findByID({ collection: 'crm-rfqs', id: rfqId, ...sys })) as unknown as Doc
    expect(await replyReadiness(S, rfq)).toMatchObject({ state: 'REPLIES_OFF' })
    const out = await composeReply(S, { rfqId, subject: 'Your request', body: 'Hello', token: 'x' })
    expect(out).toMatchObject({ ok: false, code: 'REPLIES_OFF', message: 'Reply from your email for now; CRM sending turns on after launch.' })
    expect(await rows('RFQ_REPLY')).toHaveLength(0)
    expect((await p.count({ collection: 'crm-email-messages', overrideAccess: true })).totalDocs).toBe(0)
  })
  it('a reply queued before the switch never reaches the mail server; the queue-time backstop refuses a new one', async () => {
    process.env.H2O_EMAIL_ALLOWED_KINDS = 'RFQ_SALES_ALERT,RFQ_CUSTOMER_ACK,RFQ_REPLY'
    const rfqId = await newRfq()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: server().t, now: later(1) })
    const admin = await user('platform-admin')
    const queued = await composeReply(crmSessionFor(p, admin.user)!, { rfqId, subject: 'Your request', body: 'Hello', token: crypto.randomUUID() })
    expect(queued.ok).toBe(true)
    expect((await rows('RFQ_REPLY'))[0]).toMatchObject({ status: 'PENDING' })
    delete process.env.H2O_EMAIL_ALLOWED_KINDS // the launch set again
    const s = server()
    const r = await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(2) })
    expect(s.sent).toHaveLength(0)
    expect(r.suppressed).toBe(1)
    expect((await rows('RFQ_REPLY'))[0]).toMatchObject({ status: 'SUPPRESSED_BY_MODE', last_error_code: 'KIND_NOT_ALLOWED' })
    await expect(
      p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'backstop-1', kind: 'RFQ_REPLY', status: 'PENDING', recipient_ref: 'r_x', attempts: 0 } as never, context: { crmServer: {} }, ...sys }),
    ).rejects.toThrow(/switched off/)
    // a suppressed record of an off kind is still writable (the audit trail)
    await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'backstop-2', kind: 'SEQUENCE_EMAIL', status: 'SUPPRESSED_BY_MODE', recipient_ref: 'r_x', attempts: 0 } as never, context: { crmServer: {} }, ...sys })
  })
  it('a misconfigured kind list fails closed (mode off), and alerts removed from the list never roll back the RFQ', async () => {
    process.env.H2O_EMAIL_ALLOWED_KINDS = 'RFQ_SALES_ALERT,BLAST'
    expect(readEmailConfig()).toMatchObject({ mode: 'off' })
    expect(readEmailConfig().errors).toContain('EMAIL_ALLOWED_KINDS_INVALID')
    process.env.H2O_EMAIL_ALLOWED_KINDS = 'RFQ_CUSTOMER_ACK'
    await newRfq()
    expect((await rows('RFQ_SALES_ALERT')).map((r) => [r.status, r.last_error_code])).toEqual([['SUPPRESSED_BY_MODE', 'KIND_NOT_ALLOWED']])
  })
})

describe('owner launch requirement: the internal new-RFQ alert', () => {
  it('one message to the whole team list, Reply-To the customer, every submitted field, the page, routing, time and link', async () => {
    process.env.H2O_SALES_ALERT_TO = `${ALERTS}, team.two@example.test`
    process.env.H2O_EMAIL_ALLOWLIST = `${ALERTS},team.two@example.test,${CUSTOMER}`
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    const rfqId = await newRfq()
    const s = server()
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })).toMatchObject({ sent: 1 })
    expect(s.sent).toHaveLength(1)
    const m = s.sent[0]!
    expect(m.to).toBe(`${ALERTS}, team.two@example.test`)
    expect(m.replyTo).toBe(CUSTOMER)
    expect(m.subject).toBe('New quote request — Northwind Thermal (synthetic) — Parts')
    const rfq = (await p.findByID({ collection: 'crm-rfqs', id: rfqId, ...sys })) as unknown as Doc
    for (const line of [
      `Email: ${CUSTOMER}`, 'First name: Avery', 'Last name: Synthetic', 'Company: Northwind Thermal (synthetic)', 'Interest: Parts',
      'Country of destination: United States', 'Message:\n', 'Fan blades', `RFQ number: ${String(rfq.rfq_number)}`,
      'Page: http://localhost:3215/contact-us/', 'Routed to: US office (US)', '(America/Denver)', `Open it in the CRM: http://localhost:3215/crm/rfqs/${rfqId}/`,
    ])
      expect(m.text, line).toContain(line)
    expect(await rows('RFQ_SALES_ALERT')).toHaveLength(1)
    // a second drain (or a crash replay) never sends it again
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(30) })
    expect(s.sent).toHaveLength(1)
  })
})

describe('the team alert is gated again at send time', () => {
  it('an address taken off the allowlist after the alert was queued is not sent to; the others are', async () => {
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    const SECOND = 'second.alerts@example.test'
    process.env.H2O_SALES_ALERT_TO = `${ALERTS},${SECOND}`
    process.env.H2O_EMAIL_ALLOWLIST = `${ALERTS},${SECOND},${CUSTOMER}`
    await newRfq()
    expect(String((await rows('RFQ_SALES_ALERT'))[0]!.to_address)).toContain(SECOND)
    process.env.H2O_EMAIL_ALLOWLIST = `${ALERTS},${CUSTOMER}`
    const s = server()
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })).toMatchObject({ sent: 1 })
    expect(s.sent).toHaveLength(1)
    expect(String(s.sent[0]!.to)).toContain(ALERTS)
    expect(String(s.sent[0]!.to)).not.toContain(SECOND)
  })
})

describe('auditor notes on RFQ-FIX-1.1: a lost lead is never silent; the sweeper cannot starve', () => {
  /** A stored native request in the given sweeper state (synthetic). */
  async function intakeEvent(n: number, state: string, extra: Record<string, unknown> = {}) {
    const r = { submissionId: `0196${n.toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}` }
    return (await p.create({
      collection: 'crm-intake-events',
      data: { source_system: 'NATIVE_FORM', source_event_id: `native:${r.submissionId}`, source_event_type: 'native_form', source_form_id: 'native', signature_state: 'FORM_TOKEN_VERIFIED', raw_payload_hash: `h${n}`, raw_payload: { source: 'NATIVE_FORM', answers: { email: 'not-an-email' } } as never, received_at: new Date(Date.now() - 3600_000).toISOString(), processing_state: state, replay_count: 0, ...extra } as never,
      context: { crmServer: {} },
      ...sys,
    })) as unknown as { id: string; source_event_id: string }
  }
  it('giving up queues ONE internal alert to the team list (no customer data), which goes out through the outbox once', async () => {
    process.env.H2O_SALES_ALERT_TO = `${ALERTS}, team.two@example.test`
    process.env.H2O_EMAIL_ALLOWLIST = `${ALERTS},team.two@example.test`
    const ev = await intakeEvent(1, 'FAILED_RETRYABLE', { sweep_attempts: 10 })
    const r = await sweepStrandedIntake(p, later(1))
    expect(r.gaveUp).toBe(1)
    const [row] = await rows('INTAKE_FAILED_ALERT')
    expect(row).toMatchObject({ status: 'PENDING', to_address: `${ALERTS}, team.two@example.test` })
    await sweepStrandedIntake(p, later(120)) // never a second alert for the same event
    expect(await rows('INTAKE_FAILED_ALERT')).toHaveLength(1)
    const s = server()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(2) })
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]).toMatchObject({ to: `${ALERTS}, team.two@example.test`, subject: 'A quote request could not be processed' })
    expect(s.sent[0]!.text).toContain('A quote request could not be processed: check CRM → overview.')
    expect(s.sent[0]!.text).toContain(ev.source_event_id)
    expect(s.sent[0]!.text).not.toContain('not-an-email')
  })
  it('quarantined spam is pruned at most once an hour', async () => {
    await sweepStrandedIntake(p, later(300))
    await intakeEvent(50, 'QUARANTINED_SPAM', { received_at: new Date(Date.now() - 40 * 86_400_000).toISOString() })
    expect((await sweepStrandedIntake(p, later(310))).prunedSpam).toBe(0)
    expect((await sweepStrandedIntake(p, later(361))).prunedSpam).toBe(1)
  })
  it('the backoff is in the query: 25 events backing off never hide one that is due', async () => {
    for (let i = 0; i < 25; i++) await intakeEvent(10 + i, 'FAILED_RETRYABLE', { sweep_attempts: 5, last_sweep_at: later(0).toISOString() })
    const due = await intakeEvent(99, 'FAILED_RETRYABLE')
    const r = await sweepStrandedIntake(p, later(1))
    expect(r.found).toBe(1)
    const doc = (await p.findByID({ collection: 'crm-intake-events', id: due.id, ...sys })) as unknown as Doc
    expect(Number(doc.sweep_attempts)).toBe(1)
  })
})

describe('R2-03: accepted mail is never handed over twice; ambiguity is held', () => {
  it('every attempt records its transport identity (no secret) and the server\'s acceptance', async () => {
    await newRfq()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: server().t, now: later(1) })
    const alert = (await rows('RFQ_SALES_ALERT'))[0]!
    expect(alert).toMatchObject({ status: 'SENT' })
    expect(alert.attempt_identity).toMatchObject({ lane: 'TRANSACTIONAL', host: 'smtp.example.test', port: 587, account: 'rfq@example.test', tls_servername: 'smtp.example.test', envelope_from: 'rfq@example.test', from: '"ICS Sales Team" <rfq@example.test>' })
    expect(JSON.stringify(alert.attempt_identity)).not.toContain('synthetic-submission-password')
    expect(String(alert.accepted_response)).toMatch(/^250 2\.0\.0 OK queued for <addr> · </)
    expect(alert.submitted_at).toBeTruthy()
    expect(await events(String(alert.id))).toEqual(['QUEUED', 'SUBMITTED', 'SENT'])
  })
  it('accepted, then the database fails to record it: held as UNCERTAIN, never sent again', async () => {
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const exec = db().execute.bind(db())
    let failNext = false
    db().execute = async (q: unknown) => {
      if (failNext) {
        failNext = false
        throw new Error('synthetic database outage')
      }
      return exec(q)
    }
    const s = server(() => {
      failNext = true // the write right after the 250 fails
      return null
    })
    try {
      const r = await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })
      expect(r).toMatchObject({ sent: 0, uncertain: 1 })
    } finally {
      db().execute = exec
    }
    expect(s.sent).toHaveLength(1)
    const id = String((await rows('RFQ_SALES_ALERT'))[0]!.id)
    expect((await rows('RFQ_SALES_ALERT'))[0]).toMatchObject({ status: 'SUBMITTING' })
    // inside the lease: nothing happens; after it: UNCERTAIN, never handed over again
    const s2 = server()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s2.t, now: later(2) })
    const r3 = await drainOutbox(p, { cfg: readEmailConfig(), transport: s2.t, now: later(10) })
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s2.t, now: later(600) })
    expect(r3.uncertain).toBe(1)
    expect(s2.sent).toHaveLength(0)
    expect((await rows('RFQ_SALES_ALERT'))[0]).toMatchObject({ status: 'UNCERTAIN', last_error_code: 'SUBMISSION_INTERRUPTED' })
    expect(await events(id)).toEqual(['QUEUED', 'SUBMITTED', 'UNCERTAIN'])
    const timeline = (await p.find({ collection: 'crm-activities', where: { summary: { like: 'Sales alert delivery unconfirmed' } }, ...sys })).docs
    expect(timeline.map((a) => (a as unknown as Doc).summary)).toEqual(['Sales alert delivery unconfirmed — not automatically retried'])
  })
  it('a timeout after DATA (no reply) is UNCERTAIN at once; a refusal before DATA or with an SMTP reply is retried', async () => {
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const s = server(() => Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT', command: 'DATA' }))
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })).toMatchObject({ uncertain: 1, retried: 0 })
    expect((await rows('RFQ_SALES_ALERT'))[0]).toMatchObject({ status: 'UNCERTAIN', last_error_code: 'UNCERTAIN_ETIMEDOUT' })
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(600) })
    expect(s.sent).toHaveLength(1)
    // the same message refused with a reply (421 at end of DATA) or before DATA: known not accepted → RETRY
    await resetCrm()
    await ensureTemplates(p)
    await newRfq()
    const r421 = server(() => Object.assign(new Error('try later'), { code: 'EMESSAGE', responseCode: 421, command: 'DATA' }))
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: r421.t, now: later(1) })).toMatchObject({ retried: 1, uncertain: 0 })
    const conn = server(() => Object.assign(new Error('refused'), { code: 'ESOCKET', command: 'CONN' }))
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: conn.t, now: later(3) })).toMatchObject({ retried: 1, uncertain: 0 })
    const ok = server()
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: ok.t, now: later(30) })).toMatchObject({ sent: 1 })
  })
  it('a crash while SUBMITTING (the process died around final acceptance) is held, never re-sent', async () => {
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const id = String((await rows('RFQ_SALES_ALERT'))[0]!.id)
    await db().execute(sql`UPDATE crm_email_outbox SET status = 'SUBMITTING', lease_until = ${later(-1).toISOString()}, attempts = 1 WHERE id = ${id}`)
    // a racing worker that claims before anyone reconciles the row never takes it: an expired SUBMITTING row may have
    // been accepted, so it is reconciled (held), never claimed and resent
    expect(await claimBatch(p, later(1), 10, 'racing-worker')).toEqual([])
    expect((await rows('RFQ_SALES_ALERT'))[0]).toMatchObject({ status: 'SUBMITTING' })
    const s = server()
    const r = await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })
    expect(r).toMatchObject({ uncertain: 1, claimed: 0 })
    expect(s.sent).toHaveLength(0)
    expect((await rows('RFQ_SALES_ALERT'))[0]).toMatchObject({ status: 'UNCERTAIN' })
  })
  it('lease fencing: a worker whose lease expired and was re-claimed hands nothing over; the new owner sends once', async () => {
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const cfg = readEmailConfig()
    const t0 = later(1)
    const [id] = await claimBatch(p, t0, 10, 'worker-a')
    // worker A stalls past its lease; worker B claims the same row
    const [again] = await claimBatch(p, new Date(t0.getTime() + 6 * 60_000), 10, 'worker-b')
    expect(again).toBe(id)
    const a = server()
    expect(await processRow(p, id!, cfg, a.t, new Date(t0.getTime() + 6 * 60_000 + 1000), undefined, undefined, { owner: 'worker-a' })).toBe('deferred')
    expect(a.sent).toHaveLength(0)
    const b = server()
    expect(await processRow(p, id!, cfg, b.t, new Date(t0.getTime() + 6 * 60_000 + 2000), undefined, undefined, { owner: 'worker-b' })).toBe('sent')
    expect(b.sent).toHaveLength(1)
    // a late duplicate drain finds nothing to send
    const c = server()
    await drainOutbox(p, { cfg, transport: c.t, now: later(30) })
    expect(c.sent).toHaveLength(0)
  })
})

/**
 * ER-07 (external review round 3): the crash/replay demonstration for the two kinds that send at launch. Each case kills
 * the send at one point, then expires every lease and drains twice more. The server must accept each message at most
 * once; work whose acceptance is unknown stays UNCERTAIN (held), never handed over again.
 */
describe('ER-07: crash and replay around acceptance — RFQ alert and T1 acknowledgement', () => {
  type Kill = 'BEFORE_DATA' | 'AFTER_DATA_NO_REPLY' | 'ACCEPTED_DB_WRITE_FAILS' | 'ACCEPTED_HISTORY_FAILS' | 'DIED_WHILE_SUBMITTING'
  const expected: Record<Kill, { status: string; accepted: number }> = {
    BEFORE_DATA: { status: 'SENT', accepted: 1 }, // known not accepted: retried, then accepted once
    AFTER_DATA_NO_REPLY: { status: 'UNCERTAIN', accepted: 0 },
    ACCEPTED_DB_WRITE_FAILS: { status: 'UNCERTAIN', accepted: 1 },
    ACCEPTED_HISTORY_FAILS: { status: 'SENT', accepted: 1 },
    DIED_WHILE_SUBMITTING: { status: 'UNCERTAIN', accepted: 0 },
  }
  const kinds = [['RFQ_SALES_ALERT', ALERTS], ['RFQ_CUSTOMER_ACK', CUSTOMER]] as const
  for (const [kind, address] of kinds)
    for (const kill of Object.keys(expected) as Kill[])
      it(`${kind} · ${kill}: accepted at most once, then ${expected[kill].status}`, async () => {
        await newRfq()
        const row = () => rows(kind).then((r) => r[0]!)
        let accepted = 0
        let armed = true
        const ours = (m: MailMessage) => m.to.includes(address)
        const exec = db().execute.bind(db())
        const create = p.create.bind(p)
        let failDbNext = false
        db().execute = async (q: unknown) => {
          if (failDbNext) {
            failDbNext = false
            throw new Error('synthetic database outage after acceptance')
          }
          return exec(q)
        }
        ;(p as unknown as { create: unknown }).create = async (a: { collection: string; data: Doc }) => {
          if (armed && kill === 'ACCEPTED_HISTORY_FAILS' && a.collection === 'crm-email-events' && a.data.event === 'SENT' && String(a.data.kind) === kind) {
            armed = false
            throw new Error('synthetic history failure after acceptance')
          }
          return create(a as never)
        }
        if (kill === 'DIED_WHILE_SUBMITTING') {
          await db().execute(sql`UPDATE crm_email_outbox SET status = 'SUBMITTING', lease_until = ${later(-1).toISOString()}, attempts = 1 WHERE kind = ${kind}`)
        }
        const t: MailTransport = {
          send: async (m) => {
            if (ours(m) && armed) {
              if (kill === 'BEFORE_DATA') { armed = false; throw Object.assign(new Error('refused'), { code: 'ECONNECTION', command: 'CONN' }) }
              if (kill === 'AFTER_DATA_NO_REPLY') { armed = false; throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', command: 'DATA' }) }
              if (kill === 'ACCEPTED_DB_WRITE_FAILS') { armed = false; failDbNext = true }
            }
            if (ours(m)) accepted++
            return { messageId: m.messageId ?? null, accepted: 1 }
          },
          close: () => undefined,
        }
        try {
          // the attempt, then every lease expired and two more drains (a restart, then a duplicate worker)
          for (const at of [1, 10, 20, 400]) await drainOutbox(p, { cfg: readEmailConfig(), transport: t, now: later(at) }).catch(() => undefined)
        } finally {
          db().execute = exec
          ;(p as unknown as { create: unknown }).create = create
        }
        expect(accepted, 'times the server accepted it').toBe(expected[kill].accepted)
        expect((await row()).status).toBe(expected[kill].status)
      })
})

describe('ER-07: a team alert keeps each recipient\'s outcome', () => {
  it('one address refused at RCPT TO: recorded per address, the others accepted once and never re-sent; Reply-To kept', async () => {
    process.env.H2O_SALES_ALERT_TO = `${ALERTS}, team.two@example.test`
    process.env.H2O_EMAIL_ALLOWLIST = `${ALERTS},team.two@example.test,${CUSTOMER}`
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const sent: MailMessage[] = []
    const t: MailTransport = {
      send: async (m) => (sent.push(m), { messageId: m.messageId ?? null, accepted: 1, acceptedAddresses: [ALERTS], rejectedAddresses: ['team.two@example.test'], response: '250 2.0.0 OK' }),
      close: () => undefined,
    }
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t, now: later(1) })
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t, now: later(400) })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.replyTo).toBe(CUSTOMER)
    const [alert] = await rows('RFQ_SALES_ALERT')
    expect(alert).toMatchObject({ status: 'SENT', last_error_code: 'RCPT_REJECTED_1' })
    // no reply code given: not known to be temporary, so it is not tried again
    expect(alert!.recipient_results).toEqual([{ address: ALERTS, outcome: 'ACCEPTED' }, { address: 'team.two@example.test', outcome: 'REJECTED', retryable: false }])
    expect(await rows('RFQ_SALES_ALERT')).toHaveLength(1)
    const ev = (await p.find({ collection: 'crm-email-events', where: { outbox: { equals: String(alert!.id) } }, sort: 'occurred_at', ...sys })).docs as unknown as Doc[]
    expect(ev.map((e) => [e.event, e.code ?? null])).toEqual([['QUEUED', null], ['SUBMITTED', null], ['ATTEMPT_FAILED', 'RCPT_REJECTED'], ['SENT', 'RCPT_REJECTED_1']])
  })
})

describe('R4-03: permanent refusals are classified; only an invalid mailbox suppresses an address', () => {
  const t1Refusal = async (e: unknown) => {
    await newRfq()
    const s = server((_, m) => (m.to === CUSTOMER ? e : null))
    await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })
    const ack = (await rows('RFQ_CUSTOMER_ACK'))[0]!
    const suppressed = (await p.count({ collection: 'crm-suppressions', where: { reason: { equals: 'HARD_BOUNCE' } }, overrideAccess: true })).totalDocs
    return { ack, suppressed }
  }
  it('T1 to an invalid mailbox (5.1.1 at RCPT TO): DEAD, hard bounce, the address is suppressed', async () => {
    const r = await t1Refusal(Object.assign(new Error('user unknown'), { code: 'EENVELOPE', responseCode: 550, response: '550 5.1.1 user unknown', command: 'RCPT TO' }))
    expect(r.ack).toMatchObject({ status: 'DEAD', last_error_code: 'HARD_BOUNCE' })
    expect(r.suppressed).toBe(1)
  })
  it('T1 refused by policy (5.7.1) or for size (5.3.4): DEAD for review with its class; no suppression', async () => {
    const policy = await t1Refusal(Object.assign(new Error('policy'), { code: 'EMESSAGE', responseCode: 550, response: '550 5.7.1 refused by policy', command: 'DATA' }))
    expect(policy.ack.status).toBe('DEAD')
    expect(String(policy.ack.last_error_code)).toMatch(/^POLICY:SMTP_550/)
    expect(policy.suppressed).toBe(0)
    await resetCrm()
    await ensureTemplates(p)
    const size = await t1Refusal(Object.assign(new Error('too big'), { code: 'EMESSAGE', responseCode: 552, response: '552 5.3.4 message too big', command: 'DATA' }))
    expect(String(size.ack.last_error_code)).toMatch(/^SIZE:SMTP_552/)
    expect(size.suppressed).toBe(0)
  })
  it('our login failing (535) is ours to fix: the alert waits and retries, never dead-lettered on the first try', async () => {
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const s = server(() => Object.assign(new Error('auth'), { code: 'EAUTH', responseCode: 535, response: '535 5.7.8 authentication failed', command: 'AUTH PLAIN' }))
    expect(await drainOutbox(p, { cfg: readEmailConfig(), transport: s.t, now: later(1) })).toMatchObject({ retried: 1, dead: 0 })
    expect((await rows('RFQ_SALES_ALERT'))[0]).toMatchObject({ status: 'RETRY' })
    expect(String((await rows('RFQ_SALES_ALERT'))[0]!.last_error_code)).toMatch(/^AUTH:/)
  })
})

describe('review Q2: a team address refused for now (4xx) is tried again alone', () => {
  it('the accepted address is never re-sent; the temporarily refused one gets its own later message', async () => {
    process.env.H2O_SALES_ALERT_TO = `${ALERTS}, team.two@example.test`
    process.env.H2O_EMAIL_ALLOWLIST = `${ALERTS},team.two@example.test,${CUSTOMER}`
    process.env.H2O_EMAIL_CUSTOMER_ACK = 'off'
    await newRfq()
    const sent: MailMessage[] = []
    let first = true
    const t: MailTransport = {
      send: async (m) => {
        sent.push(m)
        if (first) {
          first = false
          return { messageId: m.messageId ?? null, accepted: 1, acceptedAddresses: [ALERTS], rejectedAddresses: ['team.two@example.test'], rejectedCodes: { 'team.two@example.test': 452 } }
        }
        return { messageId: m.messageId ?? null, accepted: 1, acceptedAddresses: m.to.split(', ') }
      },
      close: () => undefined,
    }
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t, now: later(1) })
    const alerts = await rows('RFQ_SALES_ALERT')
    expect(alerts.map((a) => [a.status, a.to_address])).toEqual([['SENT', `${ALERTS}, team.two@example.test`], ['RETRY', 'team.two@example.test']])
    expect(alerts[0]!.recipient_results).toEqual([{ address: ALERTS, outcome: 'ACCEPTED' }, { address: 'team.two@example.test', outcome: 'REJECTED', code: 452, retryable: true }])
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t, now: later(30) })
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t, now: later(400) })
    expect(sent.map((m) => m.to)).toEqual([`${ALERTS}, team.two@example.test`, 'team.two@example.test'])
    expect(sent[1]!.replyTo).toBe(CUSTOMER)
  })
})
