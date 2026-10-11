import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { POST as UNSUBSCRIBE, GET as UNSUBSCRIBE_PAGE } from '../../app/(intake)/api/ers/unsubscribe/route'
import { readEmailConfig } from '../../email/config'
import { drainOutbox } from '../../email/outbox-worker'
import type { MailMessage, MailTransport } from '../../email/transport'
import { activateSequence, duplicateVersion, ensureSeedSequences, pauseSequence, publishVersion, saveDraftSteps } from '../ers/admin'
import { enrollFromPreview, previewEnrollment, resumeEnrollment, stopEnrollment } from '../ers/enroll'
import { tick } from '../ers/engine'
import { checkHealth, resumeHealth } from '../ers/feedback'
import { sequenceReport } from '../ers/report'
import { invalidateErsSettings } from '../ers/settings'
import { unsubscribeToken } from '../ers/unsubscribe'
import { SYNTHETIC_FIELD_MAP, SYNTHETIC_FORM_ID, SYNTHETIC_SECRET, signed, typeformDelivery } from '../fixtures/synthetic'
import { ingestInbound } from '../inbound'
import { invalidateOfficeSettings } from '../officeSettings'
import { activeFromLedger, evaluateTransactionalSend, ledgerFor } from '../suppression'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * Revenue Engine slice 1 against Postgres — the E1.1 qualification and missing-information sequences end to end
 * (enroll → wait → email → wait → email → wait → task), every exit, the suppression floor, one-click unsubscribe,
 * the outbox admission (switch, health, reply detection, caps, mode), lint and render holds, hard bounces at send and
 * by DSN, auto-pause, and the report. Synthetic only; the transport is a recorder (nothing leaves the process).
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
let A: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const CUSTOMER = 'avery.synthetic@northwind.example.com'
const DAY = 24 * 3600_000
const ENV: Record<string, string | undefined> = {
  // SEND-FIX-1a: these tests cover the post-launch paths (replies, sequences), so every outbox kind is allowed here
  H2O_EMAIL_ALLOWED_KINDS: 'RFQ_SALES_ALERT,RFQ_CUSTOMER_ACK,RFQ_REPLY,SEQUENCE_EMAIL',
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
  H2O_EMAIL_MODE: 'allowlist',
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
const tasks = async (kind: string) => (await p.find({ collection: 'crm-tasks', where: { kind: { equals: kind } }, ...srv, limit: 50 })).docs as unknown as Doc[]

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

describe('sequences: seeds, frozen versions, activation', () => {
  it('seeds both E1.1 sequences as drafts; publishing freezes a hashed version; duplicate-to-edit makes v2', async () => {
    await ensureSeedSequences(p)
    await ensureSeedSequences(p)
    const all = (await p.find({ collection: 'crm-sequences', sort: 'key', ...srv })).docs as unknown as Doc[]
    expect(all.map((s) => [s.key, s.run_state, s.approval_mode])).toEqual([
      ['ICS_MISSING_INFORMATION', 'DRAFT', 'AUTO'],
      ['ICS_RFQ_QUALIFICATION_FOLLOWUP', 'DRAFT', 'AUTO'],
    ])
    const seq = all[1]!
    const v1 = (await p.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } }, ...srv })).docs[0] as unknown as Doc
    expect((v1.steps as Doc[]).map((s) => s.type)).toEqual(['WAIT', 'EMAIL', 'WAIT', 'EMAIL', 'WAIT', 'TASK'])
    expect(await publishVersion(await crmSessionFor(p, sales.user)!, String(v1.id))).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await publishVersion(A, String(v1.id))).toMatchObject({ ok: true })
    const pub = (await p.findByID({ collection: 'crm-sequence-versions', id: String(v1.id), ...srv })) as unknown as Doc
    expect(pub).toMatchObject({ state: 'PUBLISHED', definition_hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect((pub.steps as Doc[]).filter((s) => s.type === 'EMAIL').every((s) => /^[0-9a-f]{64}$/.test(String(s.template_hash)))).toBe(true)
    // Frozen: no change except retirement.
    await expect(p.update({ collection: 'crm-sequence-versions', id: String(v1.id), data: { steps: [] } as never, ...srv })).rejects.toThrow(/cannot change/)
    const d = await duplicateVersion(A, String(seq.id))
    expect(d).toMatchObject({ ok: true })
    expect(await duplicateVersion(A, String(seq.id))).toMatchObject({ ok: false, code: 'DRAFT_EXISTS' })
    expect(await saveDraftSteps(A, (d as { id: string }).id, 'WAIT 2\nEMAIL E11_QUAL_1\nTASK 1 Call the customer')).toMatchObject({ ok: true })
    expect(await saveDraftSteps(A, (d as { id: string }).id, 'EMAIL T2')).toMatchObject({ ok: false, code: 'STEP_TEMPLATE' }) // not a sequence template
    expect(await publishVersion(A, (d as { id: string }).id)).toMatchObject({ ok: true })
    expect(((await p.findByID({ collection: 'crm-sequence-versions', id: String(v1.id), ...srv })) as unknown as Doc).state).toBe('RETIRED')
  })

  it('a sequence cannot start while reply detection is not live (CT ruling 3); pause stops every step', async () => {
    await ensureSeedSequences(p)
    const seq = await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const v = (await p.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } }, ...srv })).docs[0] as unknown as Doc
    await publishVersion(A, String(v.id))
    await settings({ inbound_last_ok_at: new Date(Date.now() - 20 * 60_000).toISOString() })
    expect(await activateSequence(A, String(seq.id))).toMatchObject({ ok: false, code: 'INBOUND_NOT_LIVE' })
    await settings({ inbound_last_ok_at: new Date().toISOString() })
    expect(await activateSequence(A, String(seq.id))).toMatchObject({ ok: true })
    const rfq = await newRfq()
    await enrollRfq(await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP'), rfq)
    expect(await pauseSequence(A, String(seq.id))).toMatchObject({ ok: true })
    const r = await tick(p, { now: new Date(Date.now() + 10 * DAY), inboundOk: true })
    expect(r.results).toEqual({ SKIPPED: 1 })
    // And the engine does nothing at all without reply detection or with the switch off.
    expect(await tick(p, { inboundOk: false })).toMatchObject({ ran: false, reason: 'INBOUND_STALE' })
    await settings({ enabled: false })
    expect(await tick(p, { inboundOk: true })).toMatchObject({ ran: false, reason: 'ERS_OFF' })
  })
})

describe('the qualification sequence end to end', () => {
  it('enroll once (cohort hash), wait 1 bd, email with the owner signature + unsubscribe + address, wait, email, wait, task, complete', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq({ first: 'Avery' })
    const t0 = new Date()
    const pv = await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) } }, t0)
    expect(pv).toMatchObject({ counts: { ENROLL: 1 }, samples: [expect.objectContaining({ subject: 'One RFQ question' })] })
    expect(await enrollFromPreview(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) }, cohortHash: 'f'.repeat(64) }, t0)).toMatchObject({ ok: false, code: 'STALE' })
    expect(await enrollFromPreview(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) }, cohortHash: (pv as { cohortHash: string }).cohortHash }, t0)).toMatchObject({ ok: true, enrolled: 1 })
    const again = await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) } }, t0)
    expect(again).toMatchObject({ counts: { ENROLL: 0, ALREADY_ENROLLED: 1 } })

    // Step 1 WAIT 1 business day.
    expect((await tick(p, { now: t0, inboundOk: true })).results).toEqual({ WAITED: 1 })
    let [e] = await enrollments()
    expect(e).toMatchObject({ status: 'ACTIVE', current_step: 1 })
    const due1 = new Date(String(e!.next_action_at))
    expect(due1.getTime()).toBeGreaterThan(t0.getTime())
    expect(await tick(p, { now: new Date(due1.getTime() - 60_000), inboundOk: true })).toMatchObject({ processed: 0 })
    // Step 2 EMAIL: one row, rendered, linted, AUTO-authorized; the enrollment waits for it.
    expect((await tick(p, { now: due1, inboundOk: true })).results).toEqual({ QUEUED: 1 })
    ;[e] = await enrollments()
    expect(e).toMatchObject({ status: 'AWAITING_SEND' })
    const [row] = await seqRows()
    expect(row).toMatchObject({ status: 'PENDING', step_key: 'QUALIFY_COMMERCIAL_MOTION', approval_decision: 'AUTO_AUTHORIZED', recipient_domain: 'northwind.example.com', subject: 'One RFQ question' })
    expect((row!.lint as Doc).decision).toBe('PASS')
    const body = String(row!.body_text)
    expect(body).toMatch(/^Hi Avery, I am reviewing RFQ-/)
    // SIGNATURES-1: the standard signature (seeded by the migration) replaces the settings lines. The office phones and a postal address ARE set in this fixture
    // (and the stored address toggle is on), and still neither appears.
    expect(body).toContain('ICS Sales Team\nIndustrial Cooling Solutions')
    expect(body).not.toMatch(/555 0100|Synthetic Way|Example City/)
    expect(body).not.toMatch(/Rhonda/)
    expect(body).toContain('unsubscribe here: http')
    // Idempotent: another tick does not queue a second row.
    await tick(p, { now: due1, inboundOk: true })
    expect(await seqRows()).toHaveLength(1)
    // The worker sends it through the gate, with one-click unsubscribe and the RFQ reply address.
    const t = recorder()
    expect(await drain(t, due1)).toMatchObject({ sent: 1 })
    expect(t.sent[0]).toMatchObject({ to: CUSTOMER, replyTo: expect.stringMatching(/^sales\+h2ocrm\.[a-z2-7]{26}@example\.test$/) })
    expect(t.sent[0]!.headers).toMatchObject({ 'List-Unsubscribe': expect.stringMatching(/^<http.*\/api\/ers\/unsubscribe\/\?t=/), 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(t.sent[0]!.headers?.['Auto-Submitted']).toBeUndefined()
    ;[e] = await enrollments()
    expect(e).toMatchObject({ status: 'ACTIVE', current_step: 2 })
    // WAIT 3, EMAIL, WAIT 4, TASK, then completed.
    let now = due1
    for (let i = 0; i < 12 && (await enrollments())[0]!.status !== 'COMPLETED'; i++) {
      now = new Date(Math.max(now.getTime(), new Date(String((await enrollments())[0]!.next_action_at ?? now.toISOString())).getTime()))
      await tick(p, { now, inboundOk: true })
      await drain(t, now)
    }
    ;[e] = await enrollments()
    expect(e).toMatchObject({ status: 'COMPLETED', current_step: 6 })
    expect(t.sent.map((m) => m.subject)).toEqual(['One RFQ question', 'RFQ routing follow-up'])
    expect((await tasks('SEQUENCE_STEP')).map((x) => x.title)).toEqual([expect.stringMatching(/^Human review: classify/)])
    const timeline = (await p.find({ collection: 'crm-activities', where: { type: { equals: 'SEQUENCE_EVENT' } }, ...srv, limit: 50 })).docs.length
    expect(timeline).toBeGreaterThanOrEqual(5)
    const report = (await sequenceReport(p)).find((r) => r.key === 'ICS_RFQ_QUALIFICATION_FOLLOWUP')!
    expect(report).toMatchObject({ enrolled: 1, sent: 2, completed: 1, replied: 0, replyPct: 0 })
  })
})

describe('exits and the floor', () => {
  it('a reply on the RFQ thread stops the sequence before the next step, with a task (SIM04)', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq()
    await enrollRfq(seq, rfq)
    const t0 = new Date()
    await tick(p, { now: t0, inboundOk: true })
    const due = new Date(String((await enrollments())[0]!.next_action_at))
    await tick(p, { now: due, inboundOk: true })
    const t = recorder()
    await drain(t, due)
    await ingestInbound(p, { id: 'ers-reply-1', messageId: ['ers-reply-1@northwind.example.com'], from: [{ email: CUSTOMER }], to: [{ email: t.sent[0]!.replyTo! }], subject: 'Re: One RFQ question', receivedAt: new Date().toISOString(), textBody: [{ partId: '1', type: 'text/plain' }], bodyValues: { '1': { value: 'It is a rebuild.' } } }, { roleLocal: 'sales', domain: 'example.test' })
    const later = new Date(due.getTime() + 30 * DAY)
    expect((await tick(p, { now: later, inboundOk: true })).results).toEqual({ EXITED: 1 })
    expect((await enrollments())[0]).toMatchObject({ status: 'EXITED', exit_reason: 'REPLIED' })
    expect(await seqRows()).toHaveLength(1)
    expect((await tasks('SEQUENCE_REVIEW')).map((x) => x.priority)).toEqual(['HIGH'])
  })

  it('a qualified or closed RFQ, a human reply on it, or a new RFQ stops the sequence; previews skip them', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq()
    await p.update({ collection: 'crm-rfqs', id: String(rfq.id), data: { qualification_state: 'COMPLETE' } as never, ...srv, context: { crmServer: {} } })
    expect(await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) } })).toMatchObject({ counts: { ENROLL: 0, RFQ_QUALIFIED: 1 } })
    await p.update({ collection: 'crm-rfqs', id: String(rfq.id), data: { qualification_state: 'UNKNOWN', status: 'CLOSED', status_reason: 'Synthetic test: closed' } as never, ...srv, context: { crmServer: {} } })
    expect(await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) } })).toMatchObject({ counts: { ENROLL: 0, NO_OPEN_RFQ: 1 } })
    // A person answered on the RFQ (follow-up state) → OWNER_RESPONDED.
    const rfq2 = await newRfq({ email: 'owner.reply.synthetic@eastfield.example.com', company: 'Eastfield (synthetic)' })
    await p.update({ collection: 'crm-rfqs', id: String(rfq2.id), data: { follow_up_state: 'HUMAN_RESPONDED' } as never, ...srv, context: { crmServer: {} } })
    expect(await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq2.id) } })).toMatchObject({ counts: { ENROLL: 0, OWNER_RESPONDED: 1 } })
    // Enrolled, then the same contact sends a newer RFQ → RFQ_SUBMITTED at the next step.
    const rfq3 = await newRfq({ email: 'newer.synthetic@southport.example.com', company: 'Southport (synthetic)' })
    await enrollRfq(seq, rfq3)
    await new Promise((r) => setTimeout(r, 20))
    await newRfq({ email: 'newer.synthetic@southport.example.com', company: 'Southport (synthetic)', message: 'A second, newer synthetic request.' })
    expect((await tick(p, { now: new Date(Date.now() + 5 * DAY), inboundOk: true })).results).toEqual({ EXITED: 1 })
    expect((await enrollments()).find((e) => String(e.rfq) === String(rfq3.id))).toMatchObject({ exit_reason: 'RFQ_SUBMITTED' })
  })

  it('suppressions stop live enrollments at once (hook): hard bounce (SIM08), complaint pauses sending', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq()
    await enrollRfq(seq, rfq)
    await p.create({ collection: 'crm-suppressions', data: { address: CUSTOMER, action: 'APPLY', reason: 'HARD_BOUNCE', source: 'PROVIDER_EVENT', source_event_id: 'test:hb' } as never, ...srv, context: { crmServer: {} } })
    expect((await enrollments())[0]).toMatchObject({ status: 'EXITED', exit_reason: 'BOUNCED' })
    const rfq2 = await newRfq({ email: 'morgan.synthetic@westbrook.example.com', company: 'Westbrook (synthetic)' })
    setEnv({ H2O_EMAIL_ALLOWLIST: `${CUSTOMER},morgan.synthetic@westbrook.example.com` })
    await enrollRfq(seq, rfq2)
    await p.create({ collection: 'crm-suppressions', data: { address: 'morgan.synthetic@westbrook.example.com', action: 'APPLY', reason: 'COMPLAINT', source: 'MANUAL' } as never, ...srv, context: { crmServer: {} } })
    expect((await enrollments()).find((e) => e.exit_reason === 'COMPLAINT')).toBeTruthy()
    const g = (await p.findGlobal({ slug: 'crm-ers-settings' as never, ...srv })) as unknown as Doc
    expect(g.health).toMatchObject({ state: 'PAUSED', reason: 'COMPLAINT' })
    expect(await resumeHealth(crmSessionFor(p, sales.user)!)).toMatchObject({ ok: false })
    expect(await resumeHealth(A)).toMatchObject({ ok: true })
  })

  it('one-click unsubscribe (RFC 8058): persists before 200, idempotent, stops the sequence, transactional mail still allowed', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq()
    await enrollRfq(seq, rfq)
    const [e] = await enrollments()
    const url = `http://127.0.0.1:3200/api/ers/unsubscribe/?t=${encodeURIComponent(unsubscribeToken(String(e!.id)))}`
    const page = await UNSUBSCRIBE_PAGE(new Request(url))
    expect(page.status).toBe(200)
    expect(await page.text()).not.toContain(CUSTOMER)
    expect((await enrollments())[0]!.status).toBe('ACTIVE') // GET never unsubscribes (link scanners)
    const one = () => UNSUBSCRIBE(new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }))
    expect((await one()).status).toBe(200)
    expect((await one()).status).toBe(200)
    const rows = (await p.find({ collection: 'crm-suppressions', where: { reason: { equals: 'UNSUBSCRIBED' } }, ...srv })).docs as unknown as Doc[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ scope: 'MARKETING_EMAIL', source: 'RFC8058_ENDPOINT' })
    expect((await enrollments())[0]).toMatchObject({ status: 'EXITED', exit_reason: 'UNSUBSCRIBED' })
    expect(evaluateTransactionalSend(await ledgerFor({ payload: p } as never, String(rows[0]!.email_match_key)), true)).toEqual({ allowed: true })
    expect((await UNSUBSCRIBE(new Request(`${url}x`, { method: 'POST' }))).status).toBe(400)
    // A manual stop works too.
    const rfq2 = await newRfq({ email: 'riley.synthetic@eastfield.example.com', company: 'Eastfield (synthetic)' })
    await enrollRfq(await start('ICS_RFQ_QUALIFICATION_FOLLOWUP').catch(() => seq), rfq2)
    const live = (await enrollments()).find((x) => x.status === 'ACTIVE')!
    expect(await stopEnrollment(A, String(live.id))).toMatchObject({ ok: true })
    expect((await enrollments()).find((x) => String(x.id) === String(live.id))).toMatchObject({ status: 'EXITED', exit_reason: 'MANUAL_STOP' })
  })

  it('SEC-CRM-1: after an admin clears an unsubscribe, the same link unsubscribes again (a new active suppression)', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await enrollRfq(seq, await newRfq())
    const [e] = await enrollments()
    const url = `http://127.0.0.1:3200/api/ers/unsubscribe/?t=${encodeURIComponent(unsubscribeToken(String(e!.id)))}`
    const post = () => UNSUBSCRIBE(new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }))
    expect((await post()).status).toBe(200)
    const first = (await p.find({ collection: 'crm-suppressions', where: { reason: { equals: 'UNSUBSCRIBED' } }, ...srv })).docs[0] as unknown as Doc
    const key = String(first.email_match_key)
    // The person asks to hear from us again; an admin clears it with re-consent evidence.
    await p.create({ collection: 'crm-suppressions', data: { address: CUSTOMER, action: 'CLEAR', clears: first.id, reason_note: 'Customer asked to resume (synthetic)', evidence_ref: 'synthetic-reconsent-1' } as never, depth: 0, overrideAccess: false, user: (await p.findByID({ collection: 'users', id: A.user.id, depth: 0, overrideAccess: true })) as never })
    expect(activeFromLedger(await ledgerFor({ payload: p } as never, key)).some((r) => r.reason === 'UNSUBSCRIBED')).toBe(false)
    // The old link clicked again records a NEW active suppression (it used to answer "already" and record nothing).
    expect((await post()).status).toBe(200)
    expect(activeFromLedger(await ledgerFor({ payload: p } as never, key)).some((r) => r.reason === 'UNSUBSCRIBED')).toBe(true)
    // And a third click is idempotent again.
    expect((await post()).status).toBe(200)
    expect((await p.find({ collection: 'crm-suppressions', where: { and: [{ reason: { equals: 'UNSUBSCRIBED' } }, { action: { equals: 'APPLY' } }] }, ...srv })).docs).toHaveLength(2)
  })

  it('SEC-CRM-1: the unsubscribe POST checks the token first and never reads a large body', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await enrollRfq(seq, await newRfq())
    const [e] = await enrollments()
    const good = `http://127.0.0.1:3200/api/ers/unsubscribe/?t=${encodeURIComponent(unsubscribeToken(String(e!.id)))}`
    const big = 'x'.repeat(5 * 1024 * 1024)
    let pulled = 0
    const tracked = () =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          pulled++
          if (pulled > 200) return c.close()
          c.enqueue(new TextEncoder().encode('List-Unsubscribe=One-Click&'.repeat(1000)))
        },
      })
    // A bad token: refused before any body is read.
    const badReq = new Request(`${good}x`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tracked(), duplex: 'half' } as RequestInit)
    const bad = await UNSUBSCRIBE(badReq)
    expect(bad.status).toBe(400)
    expect(badReq.bodyUsed).toBe(false) // never read (a stream pre-buffers one chunk on its own; nothing consumed it)
    pulled = 0
    // A good token with a declared large body: 413, nothing recorded.
    const declared = await UNSUBSCRIBE(new Request(good, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(big.length) }, body: big }))
    expect(declared.status).toBe(413)
    // A good token with an undeclared (streamed) large body: the read stops after 1 KB, 413.
    const streamed = await UNSUBSCRIBE(new Request(good, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tracked(), duplex: 'half' } as RequestInit))
    expect(streamed.status).toBe(413)
    expect(pulled).toBeLessThan(5)
    expect((await p.find({ collection: 'crm-suppressions', where: { reason: { equals: 'UNSUBSCRIBED' } }, ...srv })).docs).toHaveLength(0)
  })
})

describe('admission at send time', () => {
  async function queued(): Promise<Date> {
    const seq = await start('ICS_MISSING_INFORMATION')
    const rfq = await newRfq()
    await enrollRfq(seq, rfq, ['DESIGN_SPECIFICATION', 'PROJECT_SCHEDULE'])
    const t0 = new Date()
    await tick(p, { now: t0, inboundOk: true })
    return t0
  }
  it('the missing-information email lists exactly the picked items (SIM02)', async () => {
    await queued()
    const [row] = await seqRows()
    expect(String(row!.body_text)).toContain('The only items still needed on our side are the current design specification and the requested project schedule.')
  })
  it('switch off, health paused, reply detection stale, email off: the row waits (deferred, not failed, not sent)', async () => {
    const t0 = await queued()
    const t = recorder()
    await settings({ enabled: false })
    expect(await drain(t, t0)).toMatchObject({ deferred: 1, sent: 0 })
    let [row] = await seqRows()
    expect(row).toMatchObject({ status: 'PENDING', last_error_code: 'ERS_OFF', attempts: 0 })
    await settings({ enabled: true, health: { state: 'PAUSED', reason: 'ADMIN', changed_at: null } })
    expect(await drain(t, new Date(t0.getTime() + 2 * 3600_000))).toMatchObject({ deferred: 1 })
    await settings({ health: { state: 'ACTIVE', reason: null, changed_at: null } })
    expect(await drain(t, new Date(t0.getTime() + 4 * 3600_000), false)).toMatchObject({ deferred: 1 })
    ;[row] = await seqRows()
    expect(row!.last_error_code).toBe('INBOUND_STALE')
    setEnv({ H2O_EMAIL_MODE: 'off' })
    expect(await drain(t, new Date(t0.getTime() + 6 * 3600_000))).toMatchObject({ deferred: 1 })
    setEnv({ H2O_EMAIL_MODE: 'allowlist' })
    expect(await drain(t, new Date(t0.getTime() + 8 * 3600_000))).toMatchObject({ sent: 1 })
    expect(t.sent).toHaveLength(1)
  })
  it('caps: the daily cap and the per-domain cap defer; transactional mail is not counted', async () => {
    const t0 = await queued()
    await settings({ daily_cap: 1 })
    await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'seq:prior', kind: 'SEQUENCE_EMAIL', status: 'SENT', recipient_ref: 'x', recipient_domain: 'other.example.com', sent_at: new Date(t0.getTime() - 3600_000).toISOString() } as never, ...srv, context: { crmServer: {} } })
    expect(await drain(recorder(), t0)).toMatchObject({ deferred: 1 })
    expect((await seqRows()).find((r) => r.step_key)!.last_error_code).toBe('DAILY_CAP')
    await settings({ daily_cap: 55, domain_hourly_cap: 1 })
    await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'seq:prior2', kind: 'SEQUENCE_EMAIL', status: 'SENT', recipient_ref: 'y', recipient_domain: 'northwind.example.com', sent_at: new Date(t0.getTime() + 20 * 60_000).toISOString() } as never, ...srv, context: { crmServer: {} } })
    expect(await drain(recorder(), new Date(t0.getTime() + 3600_000 - 1))).toMatchObject({ deferred: 1 })
    expect((await seqRows()).find((r) => r.step_key)!.last_error_code).toBe('DOMAIN_HOURLY_CAP')
  })
  it('allowlist mode and an address not on the list: not sent, the enrollment is held (resumable)', async () => {
    const t0 = await queued()
    setEnv({ H2O_EMAIL_ALLOWLIST: 'someone.else@example.test' })
    expect(await drain(recorder(), t0)).toMatchObject({ suppressed: 1 })
    expect((await enrollments())[0]).toMatchObject({ status: 'PAUSED', hold_code: 'MODE_ALLOWLIST' })
  })
  it('SEND-FIX-1a: a replayed step never resets a row that was handed over (SUBMITTING) or may have been delivered (UNCERTAIN)', async () => {
    const t0 = await queued()
    const [row] = await seqRows()
    const enr = (await enrollments())[0]!
    for (const status of ['UNCERTAIN', 'SUBMITTING']) {
      await p.update({ collection: 'crm-email-outbox', id: String(row!.id), data: { status, lease_until: null } as never, ...srv, context: { crmServer: {} } })
      // the same step comes due again (a resumed hold, a re-run tick): the engine finds the existing row
      await p.update({ collection: 'crm-enrollments', id: String(enr.id), data: { status: 'ACTIVE', next_action_at: t0.toISOString() } as never, ...srv, context: { crmServer: {} } })
      await tick(p, { now: t0, inboundOk: true })
      expect((await seqRows()).map((r) => r.status)).toEqual([status])
    }
    const t = recorder()
    await drain(t, new Date(t0.getTime() + 3600_000))
    expect(t.sent).toHaveLength(0)
  })
  it('a definitive address refusal at send is a hard bounce: suppression, row dead, enrollment bounced', async () => {
    const t0 = await queued()
    const t = recorder(() => Object.assign(new Error('rcpt'), { responseCode: 550, response: '550 5.1.1 The email account that you tried to reach does not exist', command: 'RCPT TO' }))
    expect(await drain(t, t0)).toMatchObject({ dead: 1 })
    expect((await seqRows())[0]).toMatchObject({ status: 'DEAD', last_error_code: 'HARD_BOUNCE', bounced_at: expect.any(String) })
    expect((await enrollments())[0]).toMatchObject({ status: 'EXITED', exit_reason: 'BOUNCED' })
    expect((await p.find({ collection: 'crm-suppressions', where: { reason: { equals: 'HARD_BOUNCE' } }, ...srv })).docs).toHaveLength(1)
  })
  it('a DSN arriving later records the hard bounce and marks the row', async () => {
    const t0 = await queued()
    await drain(recorder(), t0)
    // SEC-CRM-1: the report names the message we sent (In-Reply-To = its Message-ID), as real bounce reports do.
    const sentId = String((await seqRows())[0]!.message_id).replace(/^<|>$/g, '')
    await ingestInbound(
      p,
      { id: 'dsn-1', inReplyTo: [sentId], from: [{ email: 'mailer-daemon@example.test' }], to: [{ email: 'sales@example.test' }], subject: 'Delivery Status Notification (Failure)', receivedAt: new Date().toISOString(), 'header:Auto-Submitted:asText': 'auto-replied', deliveryStatus: `Reporting-MTA: dns; mx.example.test\n\nFinal-Recipient: rfc822; ${CUSTOMER}\nAction: failed\nStatus: 5.1.1` },
      { roleLocal: 'sales', domain: 'example.test' },
    )
    expect((await seqRows())[0]!.bounced_at).toEqual(expect.any(String))
    expect((await enrollments())[0]).toMatchObject({ status: 'EXITED', exit_reason: 'BOUNCED' })
  })
})

describe('the floor before enrolment, and pinned copy', () => {
  it('an address already on the suppression list is never enrolled (the floor, not only the hook)', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq()
    await p.create({ collection: 'crm-suppressions', data: { address: CUSTOMER, action: 'APPLY', reason: 'UNSUBSCRIBED', source: 'MANUAL' } as never, ...srv, context: { crmServer: {} } })
    expect(await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(rfq.id) } })).toMatchObject({ counts: { ENROLL: 0, UNSUBSCRIBED: 1 } })
  })
  it('a template re-approved with different words after publishing is not sent under the old version (TEMPLATE_CHANGED)', async () => {
    const seq = await start('ICS_MISSING_INFORMATION')
    await enrollRfq(seq, await newRfq(), ['DRAWINGS'])
    const tpl = (await p.find({ collection: 'crm-email-templates', where: { code: { equals: 'E11_MISS_1' } }, ...srv })).docs[0] as unknown as Doc
    const { saveTemplate, setTemplateApproved } = await import('../settings/templates')
    expect(await saveTemplate(A, { id: String(tpl.id), name: String(tpl.name), subject: String(tpl.subject), body: `${String(tpl.body)}\n\nP.S. synthetic edit`, purpose: 'SEQUENCE' })).toMatchObject({ ok: true })
    expect(await setTemplateApproved(A, String(tpl.id), true)).toMatchObject({ ok: true })
    expect((await tick(p, { inboundOk: true })).results).toEqual({ DEAD: 1 })
    expect((await enrollments())[0]).toMatchObject({ status: 'DEAD_LETTER', hold_code: 'TEMPLATE_CHANGED' })
    expect(await seqRows()).toHaveLength(0)
  })
})

describe('holds and health', () => {
  it('a merge value that trips the copy-risk check holds the step with a task (SIM10); fixed and resumed, it queues', async () => {
    const seq = await start('ICS_MISSING_INFORMATION')
    const rfq = await newRfq({ first: 'Guaranteed Performance' })
    await enrollRfq(seq, rfq, ['DRAWINGS'])
    expect((await tick(p, { inboundOk: true })).results).toEqual({ HELD: 1 })
    expect((await enrollments())[0]).toMatchObject({ status: 'PAUSED', pause_reason: 'LINT_HOLD', hold_code: expect.stringMatching(/^LINT_/) })
    expect(await seqRows()).toHaveLength(0)
    expect((await tasks('SEQUENCE_REVIEW')).length).toBe(1)
    await p.update({ collection: 'crm-contacts', id: String(rfq.contact), data: { first_name: 'Avery' } as never, ...srv, context: { crmServer: {} } })
    expect(await resumeEnrollment(A, String((await enrollments())[0]!.id))).toMatchObject({ ok: true })
    expect((await tick(p, { inboundOk: true })).results).toEqual({ QUEUED: 1 })
  })
  it('owner rule 2026-10-06: no office phone and no postal address set: the step is admitted, queued and renders clean', async () => {
    await p.updateGlobal({ slug: 'crm-office-settings' as never, data: { phones: { US: null, TH: null } } as never, ...srv })
    invalidateOfficeSettings()
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { postal_address: '', compliance: { address_footer: true } } as never, ...srv })
    invalidateErsSettings()
    const seq = await start('ICS_MISSING_INFORMATION')
    await enrollRfq(seq, await newRfq(), ['DRAWINGS'])
    expect((await tick(p, { inboundOk: true })).results).toEqual({ QUEUED: 1 })
    expect((await enrollments())[0]).toMatchObject({ status: 'AWAITING_SEND' })
    const body = String((await seqRows())[0]!.body_text)
    expect(body).toContain('ICS Sales Team\nIndustrial Cooling Solutions')
    expect(body).toContain('unsubscribe here: http')
    expect(body.trim().split('\n').pop()).toMatch(/^If you’d rather not receive these follow-ups, unsubscribe here: http/) // nothing after it
  })
  it('auto-pause: more than 5% hard bounces over the last sends (minimum 20) pauses sending', async () => {
    const now = new Date()
    for (let i = 0; i < 20; i++)
      await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: `seq:h${i}`, kind: 'SEQUENCE_EMAIL', status: i < 2 ? 'DEAD' : 'SENT', last_error_code: i < 2 ? 'HARD_BOUNCE' : null, recipient_ref: `r${i}`, sent_at: i < 2 ? null : now.toISOString() } as never, ...srv, context: { crmServer: {} } })
    const h = await checkHealth(p, now)
    expect(h).toMatchObject({ total: 20, bounced: 2, warn: true, pause: true })
    expect(((await p.findGlobal({ slug: 'crm-ers-settings' as never, ...srv })) as unknown as Doc).health).toMatchObject({ state: 'PAUSED', reason: 'HARD_BOUNCE_RATE' })
  })
})
