import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { readEmailConfig } from '../../email/config'
import { drainOutbox } from '../../email/outbox-worker'
import type { MailMessage, MailTransport } from '../../email/transport'
import { activateSequence, ensureSeedSequences, publishVersion } from '../ers/admin'
import { enrollFromPreview, previewEnrollment } from '../ers/enroll'
import { pauseOne, resumeOne, stopOne } from '../ers/control'
import { funnel, overview, panel, enrolled, history } from '../ers/hub'
import { tick } from '../ers/engine'
import { invalidateErsSettings } from '../ers/settings'
import { SYNTHETIC_FIELD_MAP, SYNTHETIC_FORM_ID, SYNTHETIC_SECRET, signed, typeformDelivery } from '../fixtures/synthetic'
import { invalidateOfficeSettings } from '../officeSettings'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * ERS-HUB-1 against Postgres: per-enrollment Pause / Resume / Stop (roles, audit, nothing sends while the engine is off),
 * the Overview funnel (unknown is never zero), and the sequence panel. Synthetic only.
 * (Set-up copied from ers.dbtest.ts: the revenue engine slice 1 against Postgres — the E1.1 qualification and missing-information sequences end to end
 * (enroll → wait → email → wait → email → wait → task), every exit, the suppression floor, one-click unsubscribe,
 * the outbox admission (switch, health, reply detection, caps, mode), lint and render holds, hard bounces at send and
 * by DSN, auto-pause, and the report.)
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
let A: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const CUSTOMER = 'avery.synthetic@northwind.example.com'
const DAY = 24 * 3600_000
const ENV: Record<string, string | undefined> = {
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
  H2O_EMAIL_MODE: 'allowlist',
  H2O_EMAIL_ALLOWED_KINDS: 'RFQ_SALES_ALERT,RFQ_CUSTOMER_ACK,RFQ_REPLY,SEQUENCE_EMAIL', // SEND-FIX-1a: sequence email is queued only when allowed
  H2O_EMAIL_ALLOWLIST: CUSTOMER,
  H2O_EMAIL_FROM: 'H2O Sales <sales@example.test>',
  H2O_SALES_ALERT_TO: '',
  H2O_EMAIL_CUSTOMER_ACK: 'off',
  H2O_SMTP_HOST: 'stalwart',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'sales@example.test',
  H2O_SMTP_PASS: 'synthetic-submission-password',
  H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
  H2O_EMAIL_INBOUND: 'on',
  H2O_SETTINGS_KEY: undefined,
  H2O_REPLY_TAG: 'h2ocrm', // T-R3: sequence replies use the tagged token address
}
const saved: Record<string, string | undefined> = {}
const setEnv = (env: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(env)) {
    if (!(k in saved)) saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
const settings = async (data: Doc) => {
  await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: data as never, ...srv, context: { crmServer: {} } })
  invalidateErsSettings()
}
const BASE_SETTINGS = {
  enabled: true,
  daily_cap: 55,
  domain_daily_cap: 5,
  domain_hourly_cap: 2,
  warmup_started_on: null,
  compliance: { address_footer: true, business_hours: false, warmup: false },
  postal_address: 'Industrial Cooling Solutions, 100 Synthetic Way, Example City',
  signature: { signer: 'ICS Sales Team', include_office_phone: true, email: 'sales@example.test' },
  health: { state: 'ACTIVE', reason: null, changed_at: null },
  inbound_last_ok_at: null,
}

async function newRfq(spec: Parameters<typeof typeformDelivery>[0] = {}): Promise<Doc> {
  const s = signed(typeformDelivery(spec), SYNTHETIC_SECRET)
  const res = await (POST as never as (r: Request, c: { params: Promise<{ slug: string[] }> }) => Promise<Response>)(
    new Request(new URL('/api/crm/intake/typeform/', 'http://127.0.0.1:3200'), { method: 'POST', headers: { 'content-type': 'application/json', 'typeform-signature': s.signature }, body: s.raw }),
    { params: Promise.resolve({ slug: ['crm', 'intake', 'typeform'] }) },
  )
  const number = ((await res.json()) as Doc).rfq_number
  return (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: number } }, ...srv })).docs[0] as unknown as Doc
}
const recorder = (fail?: () => unknown): MailTransport & { sent: MailMessage[] } => {
  const t = {
    sent: [] as MailMessage[],
    send: async (m: MailMessage) => {
      const f = fail?.()
      if (f) throw f
      t.sent.push(m)
      return { messageId: m.messageId ?? null, accepted: 1 }
    },
    close: () => undefined,
  }
  return t
}
const drain = (t: MailTransport, now: Date, inboundOk = true) => drainOutbox(p, { cfg: readEmailConfig(), transport: t, now, ersInboundOk: inboundOk })
const seqByKey = async (key: string) => (await p.find({ collection: 'crm-sequences', where: { key: { equals: key } }, ...srv })).docs[0] as unknown as Doc
const enrollments = async () => (await p.find({ collection: 'crm-enrollments', ...srv, limit: 50 })).docs as unknown as Doc[]
const seqRows = async () => (await p.find({ collection: 'crm-email-outbox', where: { kind: { equals: 'SEQUENCE_EMAIL' } }, sort: 'createdAt', ...srv, limit: 50 })).docs as unknown as Doc[]

/** Publish v1 of a seeded sequence and start it (reply detection live). */
async function start(key: string): Promise<Doc> {
  await ensureSeedSequences(p)
  const seq = await seqByKey(key)
  const v = (await p.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } }, ...srv })).docs[0] as unknown as Doc
  expect(await publishVersion(A, String(v.id))).toMatchObject({ ok: true })
  await settings({ inbound_last_ok_at: new Date().toISOString() })
  expect(await activateSequence(A, String(seq.id))).toMatchObject({ ok: true })
  return seqByKey(key)
}
async function enrollRfq(seq: Doc, rfq: Doc, items: string[] = [], now = new Date()) {
  const pv = await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) }, missingItems: items }, now)
  expect('rows' in pv, JSON.stringify(pv)).toBe(true)
  if (!('rows' in pv)) throw new Error('preview failed')
  return { pv, out: await enrollFromPreview(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) }, missingItems: items, cohortHash: pv.cohortHash }, now) }
}

beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  A = crmSessionFor(p, admin.user)!
})
beforeEach(async () => {
  await resetCrm()
  setEnv(ENV)
  await settings(BASE_SETTINGS)
  await p.updateGlobal({ slug: 'crm-office-settings' as never, data: { phones: { US: '+1 555 0100', TH: '+66 2 555 0100' } } as never, ...srv })
  invalidateOfficeSettings()
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved))
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
})


let S: CrmSession
const live = async (id: unknown) => (await p.findByID({ collection: 'crm-enrollments', id: String(id), ...srv })) as unknown as Doc
async function oneEnrollment(): Promise<Doc> {
  const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
  const rfq = await newRfq({ first: 'Avery' })
  await enrollRfq(seq, rfq)
  const e = (await enrollments())[0]!
  // The sales user owns this one.
  await p.update({ collection: 'crm-enrollments', id: String(e.id), data: { owner: sales.user.id } as never, ...srv, context: { crmServer: {} } })
  return live(e.id)
}
beforeAll(async () => {
  S = crmSessionFor(p, sales.user)!
})
const asObj = (v: unknown) => v as Doc

describe('per-enrollment Pause / Resume / Stop', () => {
  it('pause holds the enrollment; the engine does nothing for it; resume puts it back; every change is on the timeline', async () => {
    const e = await oneEnrollment()
    expect(await pauseOne(S, String(e.id))).toMatchObject({ ok: true })
    expect(await live(e.id)).toMatchObject({ status: 'PAUSED', pause_reason: 'MANUAL', next_action_at: null })
    const r = await tick(p, { now: new Date(Date.now() + 10 * DAY), inboundOk: true })
    expect(r.processed).toBe(0)
    expect(await seqRows()).toHaveLength(0)
    expect(await pauseOne(S, String(e.id))).toMatchObject({ ok: false, code: 'NOT_RUNNING' })
    expect(await resumeOne(S, String(e.id))).toMatchObject({ ok: true })
    expect(await live(e.id)).toMatchObject({ status: 'ACTIVE', pause_reason: null })
    const acts = (await p.find({ collection: 'crm-activities', where: { type: { equals: 'SEQUENCE_EVENT' } } as never, ...srv, limit: 50 })).docs as unknown as Doc[]
    const mine = acts.filter((a) => asObj(a.detail).enrollment === String(e.id) && asObj(a.detail).by === S.userId)
    expect(mine.map((a) => asObj(a.detail).action).sort()).toEqual(['paused', 'resumed'])
    expect(mine.every((a) => a.actor_kind === 'USER')).toBe(true)
  })

  it('stop ends it for good and is audited; a stopped enrollment cannot be paused or resumed', async () => {
    const e = await oneEnrollment()
    expect(await stopOne(S, String(e.id))).toMatchObject({ ok: true })
    expect(await live(e.id)).toMatchObject({ status: 'EXITED', exit_reason: 'MANUAL_STOP' })
    expect(await stopOne(S, String(e.id))).toMatchObject({ ok: false, code: 'NOT_LIVE' })
    expect(await pauseOne(S, String(e.id))).toMatchObject({ ok: false })
    expect(await resumeOne(A, String(e.id))).toMatchObject({ ok: false, code: 'NOT_PAUSED' })
    // The audit row for the stop names the person and shows from → to (F2).
    const audit = (await p.find({ collection: 'audit-log' as never, where: { and: [{ collection: { equals: 'crm-enrollments' } }, { docId: { equals: String(e.id) } }, { action: { equals: 'update' } }] } as never, ...srv, limit: 50 })).docs as unknown as Doc[]
    const stop = audit.find((a) => JSON.stringify(a).includes('EXITED'))
    expect(stop, 'a stop audit row').toBeTruthy()
    expect(String(stop!.actor)).toBe(S.userId)
    expect(JSON.stringify(stop)).toContain('ACTIVE')
  })

  it('an enrollment whose email is already being sent cannot be paused, only stopped', async () => {
    const e = await oneEnrollment()
    await p.update({ collection: 'crm-enrollments', id: String(e.id), data: { status: 'AWAITING_SEND' } as never, ...srv, context: { crmServer: {} } })
    expect(await pauseOne(S, String(e.id))).toMatchObject({ ok: false, code: 'SENDING_NOW' })
    expect(((await enrolled(S, String(asObj(e.sequence).id ?? e.sequence)))[0])).toMatchObject({ canPause: false, canStop: true })
    expect(await stopOne(S, String(e.id))).toMatchObject({ ok: true })
  })

  it('role rules: sales resumes only their own person-made pause; a check hold or another owner is admin only', async () => {
    const e = await oneEnrollment()
    await pauseOne(A, String(e.id))
    // Owned by the sales user and paused by a person: sales may resume.
    expect(await resumeOne(S, String(e.id))).toMatchObject({ ok: true })
    // A hold from a check: admin only.
    await p.update({ collection: 'crm-enrollments', id: String(e.id), data: { status: 'PAUSED', pause_reason: 'LINT_HOLD', hold_code: 'X' } as never, ...srv, context: { crmServer: {} } })
    expect(await resumeOne(S, String(e.id))).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    // Owned by someone else: sales cannot resume, even a person's pause.
    await p.update({ collection: 'crm-enrollments', id: String(e.id), data: { pause_reason: 'MANUAL', owner: admin.user.id } as never, ...srv, context: { crmServer: {} } })
    expect(await resumeOne(S, String(e.id))).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await resumeOne(A, String(e.id))).toMatchObject({ ok: true })
    // Unknown id.
    expect(await pauseOne(S, '00000000-0000-4000-8000-000000000099')).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await pauseOne(S, undefined)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('sending stays impossible while the engine is off: resume queues nothing and the engine does not run', async () => {
    const e = await oneEnrollment()
    await pauseOne(S, String(e.id))
    await settings({ enabled: false })
    expect(await resumeOne(S, String(e.id))).toMatchObject({ ok: true })
    const r = await tick(p, { now: new Date(Date.now() + 10 * DAY), inboundOk: true })
    expect(r).toMatchObject({ ran: false, reason: 'ERS_OFF' })
    expect(await seqRows()).toHaveLength(0)
    const t = recorder()
    await drain(t, new Date(Date.now() + 10 * DAY))
    expect(t.sent).toHaveLength(0)
  })
})

describe('Overview data', () => {
  it('the funnel counts what exists; revenue is per currency and never a default; unknown is not zero', async () => {
    const e = await oneEnrollment()
    void e
    const f = await funnel(p)
    expect(f.map((r) => r.key)).toEqual(['contacted', 'replies', 'qualified', 'won', 'revenue'])
    const rev = f.find((r) => r.key === 'revenue')!
    expect(rev.money).toEqual([])
    expect(rev.side).toMatchObject({ unknown: 0, awaiting: 0, unattributed: 0 })
    const o = await overview(S)
    expect(o.sequences.length).toBeGreaterThan(0)
    expect(o.funnel).toHaveLength(5)
  })

  it('enrolled rows say what the viewer may do; the panel and history read the same enrollment', async () => {
    const e = await oneEnrollment()
    const seqId = String(asObj(e.sequence).id ?? e.sequence)
    const rows = await enrolled(S, seqId)
    expect(rows[0]).toMatchObject({ canPause: true, canStop: true, canResume: false })
    // N1: the contact's name and what happens next, not a bare link.
    expect(rows[0]!.contactName).toMatch(/\S/)
    expect(rows[0]!.contactName).not.toBe('Contact')
    expect(rows[0]!.nextAction).toMatch(/^Wait 1 business day$/)
    await pauseOne(S, String(e.id))
    expect((await enrolled(S, seqId))[0]).toMatchObject({ canPause: false, canResume: true })
    expect((await enrolled(A, seqId))[0]).toMatchObject({ canResume: true })
    const pn = await panel(S, { contactId: String(asObj(e.contact).id ?? e.contact) })
    expect(pn[0]).toMatchObject({ status: 'PAUSED', canResume: true })
    const h = await history(S, seqId)
    // The timeline names the contact, the sequence and who did it.
    expect(h.some((x) => /^.+ paused in .+ by .+$/.test(x.summary))).toBe(true)
    expect((await overview(S)).recent.some((x) => /paused in .+ by /.test(x.summary))).toBe(true)
  })
})
