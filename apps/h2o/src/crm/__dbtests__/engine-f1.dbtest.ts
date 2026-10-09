import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { activateSequence, ensureSeedSequences, publishVersion } from '../ers/admin'
import { enrollFromPreview, previewEnrollment } from '../ers/enroll'
import { pauseOne, stopOne } from '../ers/control'
import { onSequenceRowTerminal, runEnrollment } from '../ers/engine'
import { isolationLevel, transition, withRfqLock } from '../ers/transition'
import { ensureReplyToken } from '../reply'
import { ensureSystemTask } from '../tasks'
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



let S: CrmSession
const live = async (id: unknown) => (await p.findByID({ collection: 'crm-enrollments', id: String(id), ...srv })) as unknown as Doc
/** Sequence emails only (intake also queues its own alert and acknowledgement rows). */
const outboxCount = async () => (await p.count({ collection: 'crm-email-outbox', where: { kind: { equals: 'SEQUENCE_EMAIL' } } as never, overrideAccess: true })).totalDocs

beforeAll(async () => {
  S = crmSessionFor(p, sales.user)!
})

/** One enrollment sitting on its first EMAIL step, due now, owned by the sales user. Returns the (soon stale) snapshot. */
async function dueAtEmail(): Promise<Doc> {
  const seq = await start('ICS_RFQ_QUALIFICATION_FOLLOWUP')
  const rfq = await newRfq({ first: 'Avery' })
  await enrollRfq(seq, rfq)
  const e = (await enrollments())[0]!
  await p.update({ collection: 'crm-enrollments', id: String(e.id), data: { owner: sales.user.id, current_step: 1, next_action_at: new Date(Date.now() - 1000).toISOString() } as never, ...srv, context: { crmServer: {} } })
  return live(e.id)
}

describe('F1: a stale tick cannot revive a Pause or Stop', () => {
  // The stale snapshot is what a tick holds after reading its due list; a person acts; the tick then runs from the snapshot.
  it('pause between find and run: nothing is queued and it stays paused', async () => {
    const snapshot = await dueAtEmail()
    expect(await pauseOne(S, String(snapshot.id))).toMatchObject({ ok: true })
    const result = await runEnrollment(p, await ersSettings(p), snapshot, new Date())
    expect(result).toBe('SKIPPED')
    expect((await live(snapshot.id)).status).toBe('PAUSED')
    expect(await outboxCount()).toBe(0)
  })

  it('stop between find and run: nothing is queued and it stays stopped', async () => {
    const snapshot = await dueAtEmail()
    expect(await stopOne(S, String(snapshot.id))).toMatchObject({ ok: true })
    const result = await runEnrollment(p, await ersSettings(p), snapshot, new Date())
    expect(result).toBe('SKIPPED')
    expect((await live(snapshot.id)).status).toBe('EXITED')
    expect(await outboxCount()).toBe(0)
  })

  it('a paused enrollment whose in-flight email reports SENT stays paused', async () => {
    const snapshot = await dueAtEmail()
    await pauseOne(S, String(snapshot.id))
    await onSequenceRowTerminal(p, { id: 'row-1', enrollment: String(snapshot.id), step_key: 'QUALIFY_COMMERCIAL_MOTION' }, 'SENT', null, new Date())
    expect((await live(snapshot.id)).status).toBe('PAUSED')
  })

  it('two ticks on one enrollment queue exactly one email', async () => {
    const snapshot = await dueAtEmail()
    const s = await ersSettings(p)
    // Today the second run can throw on a unique reply-token insert (tick catches and logs it). After the F1 mechanism the
    // row lock serialises the two runs and the loser returns SKIPPED. Either way exactly one email is queued.
    const out = await Promise.allSettled([runEnrollment(p, s, snapshot, new Date()), runEnrollment(p, s, snapshot, new Date())])
    expect(out.filter((x) => x.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)
    expect(await outboxCount()).toBe(1)
  })
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('F1: the row lock, with two real connections (R4)', () => {
  it('the adapter runs READ COMMITTED', async () => {
    expect((await isolationLevel(p)).toLowerCase()).toBe('read committed')
  })

  /** Holds the enrollment's row lock inside a transaction until `release()` is called. */
  async function holdLock(id: string) {
    let release!: () => void
    let locked!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const lockedP = new Promise<void>((r) => (locked = r))
    const holder = transition(p, id, {
      from: ['ACTIVE'],
      to: 'AWAITING_SEND',
      data: { status: 'AWAITING_SEND', next_action_at: null },
      work: async () => {
        locked()
        await gate
      },
    })
    await lockedP
    return { holder, release }
  }

  it('a Stop while the engine holds the lock waits, then sees AWAITING_SEND and ends it', async () => {
    const snapshot = await dueAtEmail()
    const { holder, release } = await holdLock(String(snapshot.id))
    let done = false
    const stop = stopOne(S, String(snapshot.id)).then((r) => ((done = true), r))
    await sleep(400)
    expect(done, 'the Stop must wait for the lock').toBe(false)
    release()
    expect(await holder).toMatchObject({ ok: true, from: 'ACTIVE' })
    expect(await stop).toMatchObject({ ok: true })
    expect((await live(snapshot.id)).status).toBe('EXITED')
  })

  it('a Pause while the engine holds the lock waits, then finds it is no longer ACTIVE and changes nothing', async () => {
    const snapshot = await dueAtEmail()
    const { holder, release } = await holdLock(String(snapshot.id))
    let done = false
    const pause = pauseOne(S, String(snapshot.id)).then((r) => ((done = true), r))
    await sleep(400)
    expect(done).toBe(false)
    release()
    await holder
    expect(await pause).toMatchObject({ ok: false, code: 'CHANGED' })
    expect((await live(snapshot.id)).status).toBe('AWAITING_SEND')
  })
})

describe('F1: legal transitions only', () => {
  it('EXITED and COMPLETED are immovable; DEAD_LETTER moves only for an admin', async () => {
    const snapshot = await dueAtEmail()
    const id = String(snapshot.id)
    const set = (status: string) => p.update({ collection: 'crm-enrollments', id, data: { status } as never, ...srv, context: { crmServer: {} } })
    await set('EXITED')
    expect(await transition(p, id, { from: ['EXITED'], to: 'ACTIVE', data: { status: 'ACTIVE' } })).toMatchObject({ ok: false, code: 'ILLEGAL' })
    await set('COMPLETED')
    expect(await transition(p, id, { from: ['COMPLETED'], to: 'ACTIVE', data: { status: 'ACTIVE' } })).toMatchObject({ ok: false, code: 'ILLEGAL' })
    await set('DEAD_LETTER')
    expect(await transition(p, id, { from: ['DEAD_LETTER'], to: 'ACTIVE', data: { status: 'ACTIVE' } })).toMatchObject({ ok: false, code: 'NOT_ADMIN' })
    expect(await transition(p, id, { from: ['DEAD_LETTER'], to: 'ACTIVE', byAdmin: true, data: { status: 'ACTIVE' } })).toMatchObject({ ok: true, from: 'DEAD_LETTER' })
    // An unexpected current status is a lost race, not a write.
    expect(await transition(p, id, { from: ['PAUSED'], to: 'ACTIVE', data: { status: 'ACTIVE' } })).toMatchObject({ ok: false, code: 'LOST_RACE' })
    expect(await transition(p, '00000000-0000-4000-8000-000000000042', { from: ['ACTIVE'], to: 'PAUSED', data: {} })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('a rolled-back transition leaves no task behind (the side effect and the status commit together)', async () => {
    const snapshot = await dueAtEmail()
    const key = `rollback-probe:${String(snapshot.id)}`
    const tasks = async () => (await p.count({ collection: 'crm-tasks', where: { idempotency_key: { equals: key } } as never, overrideAccess: true })).totalDocs
    await expect(
      transition(p, String(snapshot.id), {
        from: ['ACTIVE'],
        to: 'AWAITING_SEND',
        data: { status: 'AWAITING_SEND' },
        work: async ({ req }) => {
          await ensureSystemTask(req, { kind: 'SEQUENCE_REVIEW', title: 'probe', priority: 'NORMAL', idempotency_key: key, source_rule: 'ERS:PROBE', assignee: sales.user.id as string, rfq: String(snapshot.rfq) })
          expect(await tasks()).toBe(0) // not visible to other connections until commit
          throw new Error('boom')
        },
      }),
    ).rejects.toThrow('boom')
    expect(await tasks()).toBe(0)
    expect((await live(snapshot.id)).status).toBe('ACTIVE')
  })
})

/** ENGINE-SCOPE-1a.1 (Auditor N1): the reply token is made in the staff order (RFQ, then token), never while an enrollment is held. */
describe('N1: the reply token and the enrollment lock never wait on each other', () => {
  const tokens = async (rfq: unknown) => (await p.find({ collection: 'crm-reply-tokens', where: { rfq: { equals: String(rfq) } } as never, ...srv })).docs as unknown as Doc[]

  it('two enrollments creating the first token on one RFQ at once get the same token and one row', async () => {
    const rfq = await newRfq({ first: 'Avery' })
    await p.delete({ collection: 'crm-reply-tokens', where: { rfq: { equals: String(rfq.id) } } as never, ...srv })
    const make = () => withRfqLock(p, String(rfq.id), (req) => ensureReplyToken(req, String(rfq.id), new Date()))
    const got = await Promise.all([make(), make(), make()])
    expect(new Set(got).size).toBe(1)
    expect(await tokens(rfq.id)).toHaveLength(1)
  })

  it('while a staff reply holds the RFQ, a queueing enrollment waits WITHOUT holding its own row, so a Pause is immediate', async () => {
    const snapshot = await dueAtEmail()
    const rfqId = String((snapshot.rfq as Doc | string | null) && typeof snapshot.rfq === 'object' ? (snapshot.rfq as Doc).id : snapshot.rfq)
    let release!: () => void
    let held!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const heldP = new Promise<void>((r) => (held = r))
    const staff = withRfqLock(p, rfqId, async () => {
      held()
      await gate
    })
    await heldP
    const s = await ersSettings(p)
    const run = runEnrollment(p, s, snapshot, new Date())
    await sleep(400)
    // The queueing run is blocked on the RFQ, so the enrollment row is free: the Pause commits while the RFQ is still held
    // (its activity note waits for the RFQ afterwards, which is why the call itself is awaited only after the release).
    const pause = pauseOne(S, String(snapshot.id))
    await sleep(400)
    expect((await live(snapshot.id)).status, 'the Pause must not wait behind the token').toBe('PAUSED')
    release()
    await staff
    expect(await pause).toMatchObject({ ok: true })
    expect(await run).toBe('SKIPPED')
    expect((await live(snapshot.id)).status).toBe('PAUSED')
    expect(await outboxCount()).toBe(0)
  })
})
