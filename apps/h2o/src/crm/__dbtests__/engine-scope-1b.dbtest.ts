import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { activateSequence, ensureSeedSequences, publishVersion } from '../ers/admin'
import { enrollFromPreview } from '../ers/enroll'
import { sql } from '@payloadcms/db-postgres'
import { createEnrollment } from '../ers/create'
import { identityBase } from '../ers/identity'
import { enrollPublicationSlot } from '../ers/publication'
import { transition } from '../ers/transition'
import { activationGates } from '../seq/gates'
import { BACKFILL_SQL } from '../../migrations/20261009_100200_ers_engine_scope_1b'
import { previewEnrollment } from '../ers/enroll'
import { runEnrollment, tick } from '../ers/engine'
import { ersSettings, invalidateErsSettings } from '../ers/settings'
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
let admin: TestUser, _sales: TestUser
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
  ;[admin, _sales] = await Promise.all([user('platform-admin'), user('sales')])
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




const seqOf = async (key = 'ICS_RFQ_QUALIFICATION_FOLLOWUP') => seqByKey(key)
const rowsFor = async (base: string) => (await p.find({ collection: 'crm-enrollments', where: { identity_base: { equals: base } } as never, limit: 50, sort: 'cycle', ...srv })).docs as unknown as Doc[]
const outboxSeq = async () => (await p.count({ collection: 'crm-email-outbox', where: { kind: { equals: 'SEQUENCE_EMAIL' } } as never, overrideAccess: true })).totalDocs
async function contactOf(first: string, email: string): Promise<string> {
  const rfq = await newRfq({ first, email })
  return String(((rfq.contact as Doc) ?? {}).id ?? rfq.contact)
}
const cohort = (seqId: string, contactId: string) => ({ sequenceId: seqId, contactId, purpose: 'COHORT' as const, scopeKind: 'LIST' as const, scopeRef: 'list-1' })
const baseData = (seq: Doc, ver: string) => ({ sequence: String(seq.id), version: ver, contact: '', status: 'ACTIVE', current_step: 0, next_action_at: new Date(Date.now() - 1000).toISOString(), enrolled_at: new Date().toISOString(), enrolled_via: 'MANUAL' })
const versionOf = async (seq: Doc) => String(typeof seq.published_version === 'object' ? (seq.published_version as Doc).id : seq.published_version)

describe('RFQ optional, except for response and quote follow-up', () => {
  it('a response without an inquiry is refused; a cohort without one is created', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const c = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const v = await versionOf(seq)
    expect(await createEnrollment(p, { identity: { ...cohort(String(seq.id), c), purpose: 'RFQ_RESPONSE', scopeKind: 'RFQ', scopeRef: 'x' }, eventRef: 'e1', data: { ...baseData(seq, v), contact: c } })).toMatchObject({ ok: false, code: 'RFQ_REQUIRED' })
    expect(await createEnrollment(p, { identity: { ...cohort(String(seq.id), c), purpose: 'QUOTE_FOLLOWUP', scopeKind: 'DEAL', scopeRef: 'd' }, eventRef: 'e1', data: { ...baseData(seq, v), contact: c } })).toMatchObject({ ok: false, code: 'RFQ_REQUIRED' })
    // The collection refuses it too, even with a direct write (defence in depth).
    await expect(p.create({ collection: 'crm-enrollments', data: { ...baseData(seq, v), contact: c, coalesce_key: 'direct-1', purpose: 'RFQ_RESPONSE' } as never, ...srv, context: { crmServer: {} } })).rejects.toThrow(/needs an inquiry/i)
    const ok = await createEnrollment(p, { identity: cohort(String(seq.id), c), eventRef: 'cohort-a', data: { ...baseData(seq, v), contact: c } })
    expect(ok).toMatchObject({ ok: true, cycle: 1 })
    expect(((ok as { doc: Doc }).doc).coalesce_key).toBe(`${String(seq.id)}:${c}:COHORT:LIST:list-1:1`)
    expect((ok as { doc: Doc }).doc.rfq ?? null).toBeNull()
  })
})

describe('replay dedupes, a genuine new cycle re-enters', () => {
  it('the same event twice, and six at once, create exactly one enrollment', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const c = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const v = await versionOf(seq)
    const make = () => createEnrollment(p, { identity: cohort(String(seq.id), c), eventRef: 'cohort-a', data: { ...baseData(seq, v), contact: c } })
    const first = await make()
    expect(first).toMatchObject({ ok: true })
    expect(await make()).toMatchObject({ ok: false, code: 'REPLAY' })
    const base = identityBase(cohort(String(seq.id), c))
    // Concurrent workers on a fresh identity: exactly one wins.
    const c2 = await contactOf('Blake', 'blake.synthetic@northwind.example.com')
    const burst = await Promise.all(Array.from({ length: 6 }, () => createEnrollment(p, { identity: cohort(String(seq.id), c2), eventRef: 'cohort-a', data: { ...baseData(seq, v), contact: c2 } })))
    expect(burst.filter((r) => r.ok)).toHaveLength(1)
    expect(burst.filter((r) => !r.ok && (r.code === 'REPLAY' || r.code === 'ACTIVE_EXISTS'))).toHaveLength(5)
    expect(await rowsFor(base)).toHaveLength(1)
    expect(await rowsFor(identityBase(cohort(String(seq.id), c2)))).toHaveLength(1)
  })

  it('a new event re-enters only after the earlier enrollment ended, as cycle 2; replays of either event create nothing', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const c = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const v = await versionOf(seq)
    const id = cohort(String(seq.id), c)
    const mk = (event: string) => createEnrollment(p, { identity: id, eventRef: event, data: { ...baseData(seq, v), contact: c } })
    const one = (await mk('quote-v1')) as { doc: Doc }
    expect(await mk('quote-v2')).toMatchObject({ ok: false, code: 'ACTIVE_EXISTS' }) // still live: no second cycle yet
    await transition(p, String(one.doc.id), { from: ['ACTIVE'], to: 'EXITED', data: { status: 'EXITED', exit_reason: 'MANUAL_STOP' } })
    expect(await mk('quote-v1')).toMatchObject({ ok: false, code: 'REPLAY' }) // the same event again is not a new cycle
    const two = await mk('quote-v2')
    expect(two).toMatchObject({ ok: true, cycle: 2 })
    expect(((two as { doc: Doc }).doc).coalesce_key).toBe(`${identityBase(id)}:2`)
    expect(await mk('quote-v2')).toMatchObject({ ok: false, code: 'REPLAY' })
    expect((await rowsFor(identityBase(id))).map((r) => Number(r.cycle))).toEqual([1, 2])
  })

  it('the same contact and sequence with another inquiry is its own identity (a response is about an inquiry)', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const a = await newRfq({ first: 'Avery' })
    const b = await newRfq({ first: 'Avery' }) // same contact, a second inquiry
    await enrollRfq(seq, a)
    const second = await enrollRfq(seq, b)
    expect(second.out).toMatchObject({ ok: true })
    const rows = (await p.find({ collection: 'crm-enrollments', limit: 10, ...srv })).docs as unknown as Doc[]
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.coalesce_key)).size).toBe(2)
    expect(rows.every((r) => r.purpose === 'RFQ_RESPONSE' && r.scope_kind === 'RFQ' && Number(r.cycle) === 1)).toBe(true)
    // Enrolling the first inquiry again is a replay.
    const again = await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(a.id) } })
    expect(again).toMatchObject({ counts: { ENROLL: 0, ALREADY_ENROLLED: 1 } })
  })

  it('a program that is not started from an inquiry is refused by the manual flow, plainly', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    await p.update({ collection: 'crm-sequences', id: String(seq.id), data: { purpose: 'COHORT' } as never, ...srv, context: { crmServer: {} } })
    const a = await newRfq({ first: 'Avery' })
    expect(await previewEnrollment(A, { sequenceId: String(seq.id), source: { rfqId: String(a.id) } })).toMatchObject({ ok: false, code: 'PURPOSE_NOT_MANUAL' })
    void enrollFromPreview
  })
})

describe('E2: an explicit publication slot, no catch-up', () => {
  const day = 86400_000
  it('inside its window it is due; before it opens it waits; after it closes it is MISSED and never sent', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const c = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const v = await versionOf(seq)
    const now = new Date()
    const slot = (n: number, from: number, to: number) => enrollPublicationSlot(p, { sequenceId: String(seq.id), versionId: v, versionHash: 'h', contactId: c, program: 'E2', slot: n, publicationId: `pub-${n}`, windowStart: new Date(now.getTime() + from * day), windowEnd: new Date(now.getTime() + to * day), now })
    const open = await slot(1, -1, 5)
    expect(open).toMatchObject({ ok: true, missed: false })
    expect((open as { doc: Doc }).doc).toMatchObject({ status: 'ACTIVE', purpose: 'PUBLICATION', scope_kind: 'PUBLICATION_SLOT', scope_ref: 'E2:1:pub-1' })
    const future = await slot(2, 10, 15)
    expect(new Date(String(((future as { doc: Doc }).doc).next_action_at)).getTime()).toBeGreaterThanOrEqual(now.getTime() + 10 * day - 1000)
    const late = await slot(0, -20, -10)
    expect(late).toMatchObject({ ok: true, missed: true })
    expect((late as { doc: Doc }).doc).toMatchObject({ status: 'EXITED', exit_reason: 'MISSED', next_action_at: null })
    expect(await slot(0, -20, -10)).toMatchObject({ ok: false, code: 'REPLAY' }) // idempotent
    expect(await outboxSeq()).toBe(0)
  })

  it('a subscriber added after three slots gets no past slot; the engine never sends the missed ones', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const c = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const v = await versionOf(seq)
    const now = new Date()
    for (const n of [1, 2, 3]) await enrollPublicationSlot(p, { sequenceId: String(seq.id), versionId: v, versionHash: 'h', contactId: c, program: 'E2', slot: n, publicationId: `pub-${n}`, windowStart: new Date(now.getTime() - (40 - n * 10) * day), windowEnd: new Date(now.getTime() - (35 - n * 10) * day), now })
    const rows = (await p.find({ collection: 'crm-enrollments', where: { contact: { equals: c } } as never, limit: 20, ...srv })).docs as unknown as Doc[]
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.status === 'EXITED' && r.exit_reason === 'MISSED')).toBe(true)
    const t = await tick(p, { inboundOk: true, now: new Date(now.getTime() + 60 * day) })
    expect(t.results).toEqual({})
    expect(await outboxSeq()).toBe(0)
  })
})

describe('an enrollment with no inquiry in the engine', () => {
  it('waits and tasks run; an email step is held (no reply address yet) and nothing is queued', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const c = await contactOf('Avery', 'avery.synthetic@northwind.example.com')
    const v = await versionOf(seq)
    const made = (await createEnrollment(p, { identity: cohort(String(seq.id), c), eventRef: 'a', data: { ...baseData(seq, v), contact: c } })) as { doc: Doc }
    const s = await ersSettings(p)
    const live = async () => (await p.findByID({ collection: 'crm-enrollments', id: String(made.doc.id), ...srv })) as unknown as Doc
    expect(await runEnrollment(p, s, await live(), new Date())).toBe('WAITED') // step 0 is a wait
    expect(await runEnrollment(p, s, await live(), new Date())).toBe('HELD') // step 1 is an email
    expect(await live()).toMatchObject({ status: 'PAUSED', pause_reason: 'RENDER_HOLD', hold_code: 'NO_REPLY_ANCHOR' })
    expect(await outboxSeq()).toBe(0)
  })

  it('the activation gate says why such a program cannot run: replies have no address to come back to', async () => {
    await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const seq = await seqOf()
    await p.update({ collection: 'crm-sequences', id: String(seq.id), data: { purpose: 'RELATIONSHIP' } as never, ...srv, context: { crmServer: {} } })
    const g = await activationGates(A, { sequenceId: String(seq.id) })
    const gate = g.blocks.find((b) => b.key === 'program')!.gates.find((x) => x.key === 'reply_anchor')!
    expect(gate).toMatchObject({ status: 'NOT_MET', hard: true })
    expect(gate.reason).toMatch(/no inbox address/i)
    await p.update({ collection: 'crm-sequences', id: String(seq.id), data: { purpose: 'RFQ_RESPONSE' } as never, ...srv, context: { crmServer: {} } })
    expect((await activationGates(A, { sequenceId: String(seq.id) })).blocks.find((b) => b.key === 'program')!.gates.some((x) => x.key === 'reply_anchor')).toBe(false)
  })
})

describe('the migration backfill', () => {
  it('rewrites a legacy row (identity and key from sequence, contact and inquiry) and is safe to run twice', async () => {
    const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
    const rfq = await newRfq({ first: 'Avery' })
    await enrollRfq(seq, rfq)
    const row = (await enrollments())[0]!
    const c = String(((row.contact as Doc) ?? {}).id ?? row.contact)
    const legacyKey = `${String(seq.id)}:${c}`
    const exec = (q: string) => (p.db as unknown as { drizzle: { execute: (x: unknown) => Promise<unknown> } }).drizzle.execute(sql.raw(q))
    // Make the row look like it did before this change.
    await exec(`UPDATE "crm_enrollments" SET "identity_base" = NULL, "scope_kind" = NULL, "scope_ref" = NULL, "scope_event_ref" = NULL, "content_version" = NULL, "coalesce_key" = '${legacyKey}' WHERE "id" = '${String(row.id)}'`)
    await exec(BACKFILL_SQL)
    await exec(BACKFILL_SQL) // idempotent
    const after = (await p.findByID({ collection: 'crm-enrollments', id: String(row.id), ...srv })) as unknown as Doc
    expect(after).toMatchObject({ purpose: 'RFQ_RESPONSE', scope_kind: 'RFQ', scope_ref: String(rfq.id), scope_event_ref: String(rfq.id), cycle: 1, status: row.status })
    expect(after.coalesce_key).toBe(`${legacyKey}:RFQ_RESPONSE:RFQ:${String(rfq.id)}:1`)
    expect(after.identity_base).toBe(`${legacyKey}:RFQ_RESPONSE:RFQ:${String(rfq.id)}`)
    expect(String(after.content_version)).toMatch(/^[0-9a-f]{64}$/)
  })
})
