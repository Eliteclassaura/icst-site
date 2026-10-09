import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { activateSequence, ensureSeedSequences, publishVersion } from '../ers/admin'
import { enrollFromPreview, previewEnrollment } from '../ers/enroll'
import { importLibrary } from '../library/import'
import { changeApprovalMode } from '../library/service'
import { changeSequenceApprovalMode } from '../seq/approval'
import { markReady } from '../seq/activate'
import { createFromPrebuilt } from '../seq/build'
import { activationGates } from '../seq/gates'
import { recordReplyCheck, setReplyMode } from '../seq/reply'
import { runRules } from '../seq/rules'
import { ensureTriggers } from '../seq/triggers'
import { ensureTemplates } from '../settings/templates'
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
const seqByKey = async (key: string) => (await p.find({ collection: 'crm-sequences', where: { key: { equals: key } }, ...srv })).docs[0] as unknown as Doc
const enrollments = async () => (await p.find({ collection: 'crm-enrollments', ...srv, limit: 50 })).docs as unknown as Doc[]

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





const SID = 'sid-1c'
const grant = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: new Date().toISOString() } } as never, ...srv })
const revoke = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...srv })
const outboxSeq = async () => (await p.count({ collection: 'crm-email-outbox', where: { kind: { equals: 'SEQUENCE_EMAIL' } } as never, overrideAccess: true })).totalDocs
const seqUpdate = (id: unknown, data: Doc) => p.update({ collection: 'crm-sequences', id: String(id), data: data as never, ...srv, context: { crmServer: {} } })
const live = async (id: unknown) => (await p.findByID({ collection: 'crm-enrollments', id: String(id), ...srv })) as unknown as Doc
async function contactOf(first: string, email: string): Promise<{ contact: string; rfq: Doc }> {
  const rfq = await newRfq({ first, email })
  return { contact: String(((rfq.contact as Doc) ?? {}).id ?? rfq.contact), rfq }
}
beforeEach(async () => {
  await revoke()
})

describe('a live program never switches approval mode silently', () => {
  it('a fresh program is AUTO; with no live work it can be set directly; with live work only through the admin door', async () => {
    await ensureSeedSequences(p)
    const seq = await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    expect(seq.approval_mode).toBe('AUTO')
    await seqUpdate(seq.id, { approval_mode: 'REQUIRED' }) // nothing is running: allowed
    await seqUpdate(seq.id, { approval_mode: 'AUTO' })
    const started = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await enrollRfq(started, await newRfq({ first: 'Avery' }))
    await expect(seqUpdate(started.id, { approval_mode: 'REQUIRED' })).rejects.toThrow(/does not change silently/i)
    expect((await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP')).approval_mode).toBe('AUTO')
  })

  it('the door is admin + step-up + a reason; it is audited with the actor and from → to, and says what it affects', async () => {
    const started = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await enrollRfq(started, await newRfq({ first: 'Avery' }))
    const input = { sequenceId: String(started.id), mode: 'REQUIRED', reason: 'owner asked for review' }
    expect(await changeSequenceApprovalMode(crmSessionFor(p, sales.user)!, SID, input)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    // STEP-UP-1: switching TO automatic sending needs the step-up; going to "approval required" does not.
    expect(await changeSequenceApprovalMode(A, SID, { ...input, mode: 'AUTO' })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await changeSequenceApprovalMode(A, SID, { ...input, reason: 'x' })).toMatchObject({ ok: false, code: 'SEQUENCE_MODE_REASON' })
    await grant()
    expect(await changeSequenceApprovalMode(A, SID, { ...input, reason: 'x' })).toMatchObject({ ok: false, code: 'SEQUENCE_MODE_REASON' })
    expect(await changeSequenceApprovalMode(A, SID, { ...input, mode: 'AUTO' })).toMatchObject({ ok: false, code: 'SEQUENCE_MODE_SAME' })
    const out = await changeSequenceApprovalMode(A, SID, input)
    expect(out).toMatchObject({ ok: true })
    expect((out as { message: string }).message).toMatch(/1 enrollment in progress/)
    expect((await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP')).approval_mode).toBe('REQUIRED')
    const audit = (await p.find({ collection: 'audit-log' as never, where: { and: [{ collection: { equals: 'crm-sequences' } }, { docId: { equals: String(started.id) } }, { action: { equals: 'update' } }] } as never, ...srv, limit: 20 })).docs as unknown as Doc[]
    const row = audit.find((a) => JSON.stringify(a).includes('REQUIRED'))
    expect(row, 'an audit row for the change').toBeTruthy()
    expect(String(row!.actor)).toBe(String(admin.id))
    expect(JSON.stringify(row)).toContain('AUTO')
  })

  it('changing the Library default does not touch a live program', async () => {
    await ensureTemplates(p)
    await importLibrary(p)
    const started = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await enrollRfq(started, await newRfq({ first: 'Avery' }))
    await grant()
    const row = (await p.find({ collection: 'crm-email-library' as never, where: { and: [{ type: { equals: 'EMAIL' } }, { status: { equals: 'IMPORTED_EXACT' } }] } as never, limit: 1, ...srv })).docs[0] as unknown as Doc
    expect(await changeApprovalMode(A, SID, { id: String(row.id), mode: 'REQUIRED', reason: 'owner asked for review' })).toMatchObject({ ok: true })
    expect((await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP')).approval_mode).toBe('AUTO')
  })
})

describe('manual reply mode', () => {
  const COVER = { days: 'EVERY_DAY', startHour: 0, endHour: 24, zone: 'UTC' }
  async function manual(batch = 2) {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await grant()
    const out = await setReplyMode(A, SID, { sequenceId: String(seq.id), mode: 'MANUAL', ownerId: admin.id, ...COVER, initialBatch: batch })
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true })
    return seq
  }
  const dueAt = async (n: number, step: number): Promise<string[]> => {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const { rfq } = await contactOf(`P${i}`, `p${i}.synthetic@northwind.example.com`)
      await enrollRfq(await seqByKey('ICS_RFQ_QUALIFICATION_FOLLOWUP'), rfq)
    }
    for (const e of await enrollments()) {
      await p.update({ collection: 'crm-enrollments', id: String(e.id), data: { current_step: step, next_action_at: new Date(Date.now() - 1000).toISOString() } as never, ...srv, context: { crmServer: {} } })
      ids.push(String(e.id))
    }
    return ids
  }

  it('setting it needs an admin and every field (no step-up: it starts and sends nothing); not set runs nothing while replies are not monitored', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const base = { sequenceId: String(seq.id), mode: 'MANUAL', ownerId: admin.id, ...COVER, initialBatch: 2 }
    expect(await setReplyMode(crmSessionFor(p, sales.user)!, SID, base)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    await revoke()
    expect(await setReplyMode(A, SID, { ...base, ownerId: undefined })).toMatchObject({ ok: false, code: 'REPLY_OWNER' }) // validation answers; the step-up is not asked
    await grant()
    expect(await setReplyMode(A, SID, { ...base, ownerId: undefined })).toMatchObject({ ok: false, code: 'REPLY_OWNER' })
    expect(await setReplyMode(A, SID, { ...base, zone: 'Not/AZone' })).toMatchObject({ ok: false, code: 'REPLY_COVERAGE' })
    expect(await setReplyMode(A, SID, { ...base, initialBatch: 0 })).toMatchObject({ ok: false, code: 'REPLY_BATCH' })
    // Not set: with reply detection not live, the engine runs nothing (today's rule).
    const [id] = await dueAt(1, 1)
    expect(await tick(p, { inboundOk: false })).toMatchObject({ ran: false, reason: 'INBOUND_STALE' })
    expect((await live(id)).status).toBe('ACTIVE')
    expect(await outboxSeq()).toBe(0)
  })

  it('releases only the first batch of first emails; the rest wait; the batch never overshoots', async () => {
    await manual(2)
    await dueAt(3, 1) // three enrollments due at the first email
    const t = await tick(p, { inboundOk: false })
    expect(t).toMatchObject({ ran: true })
    expect(t.results).toEqual({ QUEUED: 2, HELD: 1 })
    expect(await outboxSeq()).toBe(2)
    const held = (await enrollments()).filter((e) => e.hold_code === 'BATCH_FULL')
    expect(held).toHaveLength(1)
    expect(held[0]!.status).toBe('ACTIVE') // still running, just not due yet; it releases itself
    expect(new Date(String(held[0]!.next_action_at)).getTime()).toBeGreaterThan(Date.now())
  })

  it('holds every follow-up until the owner records a reply check; a lapse re-holds them', async () => {
    const seq = await manual(5)
    await dueAt(1, 3) // due at the second email (a reply-dependent follow-up)
    expect(await outboxSeq()).toBe(0)
    let t = await tick(p, { inboundOk: false })
    expect(t.results).toEqual({ HELD: 1 })
    expect((await enrollments())[0]).toMatchObject({ hold_code: 'REPLY_REVIEW', status: 'ACTIVE' })
    // The owner records a check (one confirmation), and the follow-up goes.
    expect(await recordReplyCheck(A, { sequenceId: String(seq.id) })).toMatchObject({ ok: false, code: 'REPLY_CONFIRM' })
    expect(await recordReplyCheck(crmSessionFor(p, sales.user)!, { sequenceId: String(seq.id), confirmed: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await recordReplyCheck(A, { sequenceId: String(seq.id), confirmed: true })).toMatchObject({ ok: true })
    const [e] = await enrollments()
    await p.update({ collection: 'crm-enrollments', id: String(e!.id), data: { next_action_at: new Date(Date.now() - 1000).toISOString() } as never, ...srv, context: { crmServer: {} } })
    t = await tick(p, { inboundOk: false })
    expect(t.results).toEqual({ QUEUED: 1 })
    expect(await outboxSeq()).toBe(1)
  })

  it('re-holds when the check is old, the owner is outside coverage, or inbound mail is waiting', async () => {
    const seq = await manual(5)
    await grant()
    const [id] = await dueAt(1, 3)
    const due = () => p.update({ collection: 'crm-enrollments', id: String(id), data: { next_action_at: new Date(Date.now() - 1000).toISOString(), hold_code: null } as never, ...srv, context: { crmServer: {} } })
    // Old check.
    await seqUpdate(seq.id, { reply_last_check_at: new Date(Date.now() - 3 * 86400_000).toISOString(), reply_last_check_by: admin.id })
    await due()
    expect((await tick(p, { inboundOk: false })).results).toEqual({ HELD: 1 })
    // Fresh check, but the owner is outside coverage (hours that exclude every hour).
    await seqUpdate(seq.id, { reply_last_check_at: new Date().toISOString(), reply_coverage: { days: 'EVERY_DAY', start_hour: 0, end_hour: 1, zone: 'UTC' } })
    const hourNow = new Date().getUTCHours()
    if (hourNow === 0) await seqUpdate(seq.id, { reply_coverage: { days: 'EVERY_DAY', start_hour: 5, end_hour: 6, zone: 'UTC' } })
    await due()
    expect((await tick(p, { inboundOk: false })).results).toEqual({ HELD: 1 })
    // Fresh check, in coverage, but inbound mail is waiting unprocessed.
    await seqUpdate(seq.id, { reply_coverage: { days: 'EVERY_DAY', start_hour: 0, end_hour: 24, zone: 'UTC' } })
    await p.create({ collection: 'crm-email-review', data: { reason: 'PROCESSING_FAILED', state: 'OPEN', source_ref: `probe-${Date.now()}`, received_at: new Date().toISOString() } as never, ...srv, context: { crmServer: {} } })
    await due()
    expect((await tick(p, { inboundOk: false })).results).toEqual({ HELD: 1 })
    expect(await outboxSeq()).toBe(0)
  })

  it('the activation gate reports each state in words, and is Met only while the check is good', async () => {
    const seq = await manual(2)
    await settings({ inbound_last_ok_at: new Date(Date.now() - 60 * 60_000).toISOString() }) // reply detection is not live
    const gate = async () => (await activationGates(A, { sequenceId: String(seq.id) })).blocks.find((b) => b.key === 'program')!.gates.find((x) => x.key === 'replies')!
    let g = await gate()
    expect(g).toMatchObject({ status: 'NOT_MET' })
    expect(g.reason).toMatch(/waiting for the owner to check replies/i)
    await recordReplyCheck(A, { sequenceId: String(seq.id), confirmed: true })
    g = await gate()
    expect(g).toMatchObject({ status: 'MET' })
    expect(g.reason).toMatch(/Owner .* covers every day 0:00–24:00 UTC · last check/)
    await seqUpdate(seq.id, { reply_mode: 'NOT_SET' })
    g = await gate()
    expect(g.status).toBe('NOT_MET')
    expect(g.reason).toMatch(/not monitored in the CRM yet/i)
  })
})

describe('the rule runner', () => {
  async function ruleSetup() {
    await ensureTemplates(p)
    await importLibrary(p)
    await grant()
    const built = (await createFromPrebuilt(A, SID, { code: 'ICS_RFQ_RECEIPT_FIRST_RESPONSE' })) as { sequenceId: string }
    await markReady(A, { sequenceId: built.sequenceId })
    await settings({ inbound_last_ok_at: new Date().toISOString() })
    await activateSequence(A, built.sequenceId)
    await ensureTriggers(p)
    const rule = (await p.find({ collection: 'crm-sequence-triggers', where: { key: { equals: 'RFQ_RECEIVED' } } as never, limit: 1, ...srv })).docs[0] as unknown as Doc
    await p.update({ collection: 'crm-sequence-triggers', id: String(rule.id), data: { enabled: true, sequence: built.sequenceId } as never, ...srv, context: { crmServer: {} } })
    return { seqId: built.sequenceId, ruleId: String(rule.id) }
  }

  it('is inert while the engine is off: nothing is read or written even with a rule on', async () => {
    const { seqId } = await ruleSetup()
    await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    await settings({ enabled: false })
    expect(await runRules(p, { engineOn: false })).toMatchObject({ ran: false, reason: 'ERS_OFF', created: 0 })
    expect(await tick(p, { inboundOk: true })).toMatchObject({ ran: false, reason: 'ERS_OFF' })
    expect((await p.count({ collection: 'crm-enrollments', where: { sequence: { equals: seqId } } as never, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('enrolls exactly the matches with the same identity as a manual enrollment; a second pass enrolls nobody', async () => {
    const { seqId } = await ruleSetup()
    const a = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const b = await contactOf('Blake', 'blake.synthetic@northwind.example.com')
    const first = await runRules(p, { engineOn: true })
    expect(first).toMatchObject({ ran: true, created: 2 })
    const rows = (await p.find({ collection: 'crm-enrollments', where: { sequence: { equals: seqId } } as never, limit: 10, ...srv })).docs as unknown as Doc[]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.enrolled_via === 'RULE' && r.purpose === 'RFQ_RESPONSE' && r.status === 'ACTIVE')).toBe(true)
    expect(rows.map((r) => r.coalesce_key).sort()).toEqual([
      `${rfqIdentityKey(seqId, a.contact, String(a.rfq.id))}:1`,
      `${rfqIdentityKey(seqId, b.contact, String(b.rfq.id))}:1`,
    ].sort())
    expect(await runRules(p, { engineOn: true })).toMatchObject({ ran: true, created: 0 }) // replay
    expect((await p.count({ collection: 'crm-enrollments', where: { sequence: { equals: seqId } } as never, overrideAccess: true })).totalDocs).toBe(2)
    const acts = (await p.find({ collection: 'crm-activities', where: { type: { equals: 'SEQUENCE_EVENT' } } as never, limit: 50, ...srv })).docs as unknown as Doc[]
    expect(acts.filter((x) => x.summary === 'Enrolled by a rule' && x.actor_kind === 'SYSTEM')).toHaveLength(2)
  })

  it('skips a contact already in another sequence, and stops the moment the rule is turned off; it runs inside the tick', async () => {
    const { seqId, ruleId } = await ruleSetup()
    const busy = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const a = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    await enrollRfq(busy, a.rfq) // Avery is live in the qualification sequence
    await contactOf('Blake', 'blake.synthetic@northwind.example.com')
    const t = await tick(p, { inboundOk: true })
    expect(t.rules).toMatchObject({ created: 1 })
    const rows = (await p.find({ collection: 'crm-enrollments', where: { sequence: { equals: seqId } } as never, limit: 10, ...srv })).docs as unknown as Doc[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.contact).not.toBe(a.contact)
    await p.update({ collection: 'crm-sequence-triggers', id: ruleId, data: { enabled: false } as never, ...srv, context: { crmServer: {} } })
    await contactOf('Casey', 'casey.synthetic@northwind.example.com')
    expect(await runRules(p, { engineOn: true })).toMatchObject({ created: 0 })
  })

  it('never enrolls a contact whose inquiry is closed (the same exit checks as a manual enrollment)', async () => {
    const { seqId } = await ruleSetup()
    const a = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    await p.update({ collection: 'crm-rfqs', id: String(a.rfq.id), data: { status: 'CLOSED', status_reason: 'test: closed' } as never, ...srv, context: { crmServer: {} } })
    expect(await runRules(p, { engineOn: true })).toMatchObject({ created: 0 })
    expect((await p.count({ collection: 'crm-enrollments', where: { sequence: { equals: seqId } } as never, overrideAccess: true })).totalDocs).toBe(0)
  })
})

const rfqIdentityKey = (seq: string, contact: string, rfq: string) => `${seq}:${contact}:RFQ_RESPONSE:RFQ:${rfq}`
