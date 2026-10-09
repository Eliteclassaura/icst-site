import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { templateHash } from '../../email/templates'
import { ensureSeedSequences } from '../ers/admin'
import { invalidateErsSettings } from '../ers/settings'
import { SYNTHETIC_FIELD_MAP, SYNTHETIC_FORM_ID, SYNTHETIC_SECRET, signed, typeformDelivery } from '../fixtures/synthetic'
import { importLibrary } from '../library/import'
import { activateGated, markReady } from '../seq/activate'
import { catalogue } from '../seq/catalogue'
import { createFromPrebuilt, templateCode } from '../seq/build'
import { activationGates } from '../seq/gates'
import { approveSimulation } from '../seq/review'
import { simulate } from '../seq/simulate'
import { evaluateRules, listTriggers, setTriggerEnabled } from '../seq/triggers'
import { ensureTemplates } from '../settings/templates'
import { textOf } from '../settings/templates'
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
const outboxCount = async () => (await p.count({ collection: 'crm-email-outbox', overrideAccess: true })).totalDocs

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
const SID = 'sid-seq-build'
const grant = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: { sid: SID, at: new Date().toISOString() } } as never, ...srv })
const revoke = () => p.update({ collection: 'users', id: admin.id, data: { mfa_stepup: null } as never, ...srv })
const seqByKey2 = async (key: string) => (await p.find({ collection: 'crm-sequences', where: { key: { equals: key } } as never, limit: 1, ...srv })).docs[0] as unknown as Doc
const tpl = async (code: string) => (await p.find({ collection: 'crm-email-templates', where: { code: { equals: code } } as never, limit: 1, ...srv })).docs[0] as unknown as Doc
const ENV_GATES = { H2O_ERS_GATES_PASSED: 'SAFETY_SUITE,FEEDBACK_SUPPRESSION' }
const COUNTED = ['crm-enrollments', 'crm-email-outbox', 'crm-activities', 'crm-tasks', 'crm-ers-simulations', 'crm-sequence-triggers', 'crm-sequences', 'crm-sequence-versions', 'crm-email-templates'] as const
const snapshot = async () => Object.fromEntries(await Promise.all(COUNTED.map(async (c) => [c, (await p.count({ collection: c as never, overrideAccess: true })).totalDocs])))

beforeAll(async () => {
  S = crmSessionFor(p, sales.user)!
})
beforeEach(async () => {
  await revoke()
  setEnv({ ...ENV_GATES })
})
afterAll(() => {
  delete process.env.H2O_ERS_GATES_PASSED
})

async function built(code = 'ICS_RFQ_QUALIFICATION_FOLLOWUP') {
  await ensureTemplates(p)
  await importLibrary(p)
  await grant()
  const out = await createFromPrebuilt(A, SID, { code })
  expect(out, JSON.stringify(out)).toMatchObject({ ok: true })
  return out as { sequenceId: string; versionId: string }
}

describe('prebuilt catalogue', () => {
  it('lists every Library sequence; only those whose merge fields and timings the engine supports are buildable, the rest say why', async () => {
    await importLibrary(p)
    const rows = await catalogue(A)
    expect(rows).toHaveLength(22)
    expect(rows.slice(0, 3).map((r) => r.code)).toEqual(['ICS_RFQ_RECEIPT_FIRST_RESPONSE', 'ICS_RFQ_QUALIFICATION_FOLLOWUP', 'ICS_MISSING_INFORMATION'])
    expect(rows.filter((r) => r.buildable).map((r) => r.code).sort()).toEqual(['ICS_MISSING_INFORMATION', 'ICS_RFQ_QUALIFICATION_FOLLOWUP', 'ICS_RFQ_RECEIPT_FIRST_RESPONSE'])
    const quote = rows.find((r) => r.code === 'ICS_QUOTE_PROPOSAL_FOLLOWUP')!
    expect(quote.buildable).toBe(false)
    expect(quote.missingFields).toEqual(expect.arrayContaining(['quote_reference', 'verified_scope_label']))
    const e2 = rows.find((r) => r.program === 'E2')!
    expect(e2).toMatchObject({ buildable: false, emails: 24 })
    expect(e2.blockers[0]).toMatch(/skeleton/i)
    // Nothing invented: every blocked row names a reason.
    expect(rows.filter((r) => !r.buildable).every((r) => r.blockers.length > 0)).toBe(true)
  })
})

describe('create from a prebuilt sequence', () => {
  it('admin + step-up only; a blocked sequence is refused', async () => {
    await ensureTemplates(p)
    await importLibrary(p)
    expect(await createFromPrebuilt(S, SID, { code: 'ICS_RFQ_QUALIFICATION_FOLLOWUP' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await createFromPrebuilt(A, SID, { code: 'ICS_RFQ_QUALIFICATION_FOLLOWUP' })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    await grant()
    expect(await createFromPrebuilt(A, SID, { code: 'ICS_QUOTE_PROPOSAL_FOLLOWUP' })).toMatchObject({ ok: false, code: 'PREBUILT_BLOCKED' })
    expect(await createFromPrebuilt(A, SID, { code: 'NOPE' })).toMatchObject({ ok: false, code: 'PREBUILT_UNKNOWN' })
  })

  it('assembles a draft with the contract delays and the Library wording exactly; nothing is sent', async () => {
    const before = await outboxCount()
    const { versionId, sequenceId } = await built()
    const v = (await p.findByID({ collection: 'crm-sequence-versions', id: versionId, ...srv })) as unknown as Doc
    expect(v.state).toBe('DRAFT')
    expect((v.steps as Doc[]).map((x) => `${x.type}${x.business_days ? x.business_days : ''}`)).toEqual(['WAIT1', 'EMAIL', 'WAIT3', 'EMAIL', 'WAIT4', 'TASK'])
    const lib = (await p.find({ collection: 'crm-email-library' as never, where: { and: [{ sequence_code: { equals: 'ICS_RFQ_QUALIFICATION_FOLLOWUP' } }, { step: { equals: 1 } }] } as never, limit: 1, ...srv })).docs[0] as unknown as Doc
    const t1 = await tpl(templateCode('ICS_RFQ_QUALIFICATION_FOLLOWUP', 1))
    expect(t1.subject).toBe((lib.subject_variants as string[])[0])
    expect(t1.body).toBe((lib.copy_variants as string[])[0])
    expect(String(t1.body)).toContain('- Rhonda') // the owner's exact sign-off, not the seeded {{sequence_signature}}
    expect(t1.approved).toBe(true)
    expect(t1.approved_hash).toBe(templateHash(textOf(t1)))
    const seq = (await p.findByID({ collection: 'crm-sequences', id: sequenceId, ...srv })) as unknown as Doc
    expect(seq).toMatchObject({ run_state: 'DRAFT', readiness: 'NOT_READY', approval_mode: 'AUTO' })
    expect(JSON.stringify(seq.library_source)).toContain('source_hash')
    expect(await outboxCount()).toBe(before)
  })

  it('re-creating reuses the templates and the draft; the other buildable sequences build too', async () => {
    const a = await built()
    const t1 = await tpl(templateCode('ICS_RFQ_QUALIFICATION_FOLLOWUP', 1))
    const again = (await createFromPrebuilt(A, SID, { code: 'ICS_RFQ_QUALIFICATION_FOLLOWUP' })) as { versionId: string }
    expect(again.versionId).toBe(a.versionId)
    expect((await tpl(templateCode('ICS_RFQ_QUALIFICATION_FOLLOWUP', 1))).id).toBe(t1.id)
    for (const code of ['ICS_RFQ_RECEIPT_FIRST_RESPONSE', 'ICS_MISSING_INFORMATION'])
      expect(await createFromPrebuilt(A, SID, { code })).toMatchObject({ ok: true })
    const miss = (await p.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String((await seqByKey2('ICS_MISSING_INFORMATION')).id) } } as never, ...srv })).docs[0] as unknown as Doc
    expect((miss.steps as Doc[]).map((x) => x.type)).toEqual(['EMAIL', 'WAIT', 'EMAIL', 'WAIT', 'TASK'])
    expect((await seqByKey2('ICS_MISSING_INFORMATION')).needs_missing_items).toBe(true)
  })
})

describe('Mark as Ready, simulation and gated activation', () => {
  it('Mark as Ready is admin only, publishes the draft, starts nothing and is audited with the actor', async () => {
    const { sequenceId } = await built()
    expect(await markReady(S, { sequenceId })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await markReady(A, { sequenceId })).toMatchObject({ ok: true })
    const seq = (await p.findByID({ collection: 'crm-sequences', id: sequenceId, ...srv })) as unknown as Doc
    expect(seq).toMatchObject({ readiness: 'READY', run_state: 'DRAFT' })
    expect(seq.published_version).toBeTruthy()
    expect((await p.count({ collection: 'crm-enrollments', overrideAccess: true })).totalDocs).toBe(0)
    const audit = (await p.find({ collection: 'audit-log' as never, where: { and: [{ collection: { equals: 'crm-sequences' } }, { docId: { equals: sequenceId } }] } as never, ...srv, limit: 20 })).docs as unknown as Doc[]
    expect(audit.some((a) => String(a.actor) === String(admin.id))).toBe(true)
  })

  it('a simulation writes nothing, mirrors the exclusions, and needs an admin to approve; the approval goes stale when the sequence changes', async () => {
    const { sequenceId } = await built()
    await markReady(A, { sequenceId })
    await newRfq({ first: 'Avery' })
    await newRfq({ first: 'Blake', email: 'blake.synthetic@northwind.example.com' })
    const before = await snapshot()
    const sim = await simulate(A, { sequenceId })
    expect(await snapshot()).toEqual(before) // nothing written, nothing counted
    expect(sim).toMatchObject({ ok: true, counts: { candidates: 2, wouldEnter: 2, excluded: 0 } })
    if (!('snapshotHash' in sim)) throw new Error('no simulation')
    expect(sim.counts.SEND).toBe(2) // AUTO: sends without review once live
    expect(sim.timeline).toEqual([{ day: 1, send: 2, review: 0 }])
    // REQUIRED turns every predicted send into a review.
    await p.update({ collection: 'crm-sequences', id: sequenceId, data: { approval_mode: 'REQUIRED' } as never, ...srv, context: { crmServer: {} } })
    const req = await simulate(A, { sequenceId })
    expect(req).toMatchObject({ counts: { SEND: 0, REVIEW: 2 } })
    await p.update({ collection: 'crm-sequences', id: sequenceId, data: { approval_mode: 'AUTO' } as never, ...srv, context: { crmServer: {} } })
    expect(await approveSimulation(S, { sequenceId, snapshotHash: sim.snapshotHash })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await approveSimulation(A, { sequenceId, snapshotHash: 'f'.repeat(64) })).toMatchObject({ ok: false, code: 'STALE' })
    expect(await approveSimulation(A, { sequenceId, snapshotHash: sim.snapshotHash })).toMatchObject({ ok: true })
    expect(((await activationGates(A, { sequenceId })).blocks.find((b) => b.key === 'program')!.gates.find((x) => x.key === 'simulation'))!.status).toBe('MET')
    await p.update({ collection: 'crm-sequences', id: sequenceId, data: { approval_mode: 'REQUIRED' } as never, ...srv, context: { crmServer: {} } })
    expect(((await activationGates(A, { sequenceId })).blocks.find((b) => b.key === 'program')!.gates.find((x) => x.key === 'simulation'))!.status).toBe('NOT_MET')
  })

  it('HARD STOP: with the engine off nothing can be activated, whatever the approval mode', async () => {
    const { sequenceId } = await built()
    await markReady(A, { sequenceId })
    await settings({ enabled: false, inbound_last_ok_at: new Date().toISOString() })
    for (const mode of ['AUTO', 'REQUIRED']) {
      await p.update({ collection: 'crm-sequences', id: sequenceId, data: { approval_mode: mode } as never, ...srv, context: { crmServer: {} } })
      await grant()
      const out = await activateGated(A, SID, { sequenceId })
      expect(out).toMatchObject({ ok: false, code: 'GATES_UNMET' })
      expect(out.gates!.unmet.map((g) => g.key)).toContain('engine')
      expect((await seqByKey2('ICS_RFQ_QUALIFICATION_FOLLOWUP')).run_state).toBe('DRAFT')
    }
    expect(await outboxCount()).toBe(0)
  })

  it('HARD STOP: a copy-check BLOCK holds activation even in AUTO with every other gate met', async () => {
    const { sequenceId } = await built()
    await markReady(A, { sequenceId })
    await settings({ enabled: true, inbound_last_ok_at: new Date().toISOString() })
    const sim = await simulate(A, { sequenceId })
    if (!('snapshotHash' in sim)) throw new Error('no simulation')
    await approveSimulation(A, { sequenceId, snapshotHash: sim.snapshotHash })
    const ok = await activationGates(A, { sequenceId })
    expect(ok.unmet.map((g) => g.key)).not.toContain('copy_check')
    // A phone number is a BLOCK in the owner rules. Force it onto an approved template (as an attacker or a bad edit might).
    const t1 = await tpl(templateCode('ICS_RFQ_QUALIFICATION_FOLLOWUP', 1))
    const body = `${String(t1.body)} Call +1 555 123 4567.`
    await p.update({ collection: 'crm-email-templates', id: String(t1.id), data: { body, approved: true, approved_hash: templateHash({ subject: String(t1.subject), body, purpose: 'SEQUENCE' }) } as never, ...srv, context: { crmServer: {} } })
    await p.update({ collection: 'crm-sequences', id: sequenceId, data: { approval_mode: 'AUTO' } as never, ...srv, context: { crmServer: {} } })
    await grant()
    const out = await activateGated(A, SID, { sequenceId })
    expect(out).toMatchObject({ ok: false, code: 'GATES_UNMET' })
    expect(out.gates!.unmet.map((g) => g.key)).toContain('copy_check')
    expect((await seqByKey2('ICS_RFQ_QUALIFICATION_FOLLOWUP')).run_state).toBe('DRAFT')
  })

  it('every gate met: admin + step-up activates, and the safety sign-offs are the owner’s, not a button', async () => {
    const { sequenceId } = await built()
    await markReady(A, { sequenceId })
    await settings({ enabled: true, inbound_last_ok_at: new Date().toISOString() })
    const sim = await simulate(A, { sequenceId })
    if (!('snapshotHash' in sim)) throw new Error('no simulation')
    await approveSimulation(A, { sequenceId, snapshotHash: sim.snapshotHash })
    // Without the owner's sign-off the safety gates stay unmet.
    delete process.env.H2O_ERS_GATES_PASSED
    await grant()
    const no = await activateGated(A, SID, { sequenceId })
    expect(no.gates!.unmet.map((g) => g.key)).toEqual(expect.arrayContaining(['safety_suite', 'feedback']))
    setEnv({ ...ENV_GATES })
    expect(await activateGated(S, SID, { sequenceId })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    await revoke()
    expect(await activateGated(A, SID, { sequenceId })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    await grant()
    const yes = await activateGated(A, SID, { sequenceId })
    expect(yes, JSON.stringify(yes)).toMatchObject({ ok: true })
    expect((await seqByKey2('ICS_RFQ_QUALIFICATION_FOLLOWUP')).run_state).toBe('ACTIVE')
  })
})

describe('trigger rules', () => {
  it('four rules, all off; enabling needs admin + step-up and every gate; with the engine off nothing can be on; off is never gated', async () => {
    await ensureSeedSequences(p)
    const rows = await listTriggers(A)
    expect(rows.map((r) => r.key)).toEqual(['RFQ_RECEIVED', 'RFQ_NEEDS_INFO', 'DEAL_QUOTE_SENT', 'NO_ACTIVITY'])
    expect(rows.every((r) => r.enabled === false)).toBe(true)
    expect(await setTriggerEnabled(S, SID, { key: 'RFQ_RECEIVED', enabled: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await setTriggerEnabled(A, SID, { key: 'RFQ_RECEIVED', enabled: true })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    await grant()
    await settings({ enabled: false })
    // The target sequence of RFQ_RECEIVED does not exist yet (not built): nothing to turn on.
    expect(await setTriggerEnabled(A, SID, { key: 'RFQ_RECEIVED', enabled: true })).toMatchObject({ ok: false })
    expect(await setTriggerEnabled(A, SID, { key: 'NO_ACTIVITY', enabled: true })).toMatchObject({ ok: false })
    expect((await listTriggers(A)).every((r) => r.enabled === false)).toBe(true)
    await revoke()
    expect(await setTriggerEnabled(A, SID, { key: 'RFQ_RECEIVED', enabled: false })).toMatchObject({ ok: true }) // off needs no step-up
  })

  it('with every gate met an admin with step-up can turn a rule on; off needs no step-up; the runner is inert while the engine is off', async () => {
    const { sequenceId } = await built('ICS_RFQ_RECEIPT_FIRST_RESPONSE')
    await markReady(A, { sequenceId })
    await settings({ enabled: true, inbound_last_ok_at: new Date().toISOString() })
    const sim = await simulate(A, { sequenceId })
    if (!('snapshotHash' in sim)) throw new Error('no simulation')
    await approveSimulation(A, { sequenceId, snapshotHash: sim.snapshotHash })
    await listTriggers(A)
    await grant()
    const on = await setTriggerEnabled(A, SID, { key: 'RFQ_RECEIVED', enabled: true })
    expect(on, JSON.stringify(on)).toMatchObject({ ok: true })
    expect((await listTriggers(A)).find((r) => r.key === 'RFQ_RECEIVED')!.enabled).toBe(true)
    await revoke()
    expect(await setTriggerEnabled(A, SID, { key: 'RFQ_RECEIVED', enabled: false })).toMatchObject({ ok: true })
    const before = await snapshot()
    expect(await evaluateRules(p, { engineOn: false })).toEqual({ ran: false, reason: 'ERS_OFF', matched: 0 })
    await listTriggers(A) // "would match today" is a read
    expect(await snapshot()).toEqual(before)
  })
})
