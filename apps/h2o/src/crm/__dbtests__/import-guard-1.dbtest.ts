import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureRegistry } from '../../rfq-native/registry'
import { submitReply } from '../intake/native/handlers'
import { issueFormToken } from '../intake/native/token'
import { invalidateErsSettings } from '../ers/settings'
import { OperatorError, apply, dryRun, reachTiedToFile, sendingOff, sha256Hex } from '../import/operator'
import { applyTypeform, planTypeform } from '../import/typeform'
import { runAsImport } from '../import/scope'
import { ensureSeedSequences } from '../ers/admin'
import { payload, resetCrm, user, userEmail } from './harness'

/**
 * IMPORT-GUARD-1 (Security Auditor item 8, GO contract): the CRM imports run with email mode ON, native intake ON, sales alerts and customer ACK ON,
 * the Revenue Engine, inbound mail and every trigger rule OFF, and real RFQs arriving. Synthetic files only (example.test), no network.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
const T0 = new Date('2026-10-07T03:00:00Z')
const MAIL = {
  H2O_EMAIL_MODE: 'live',
  H2O_EMAIL_FROM: 'ICS Sales Team <sales@example.test>',
  H2O_SALES_ALERT_TO: 'alerts.synthetic@example.test',
  H2O_EMAIL_CUSTOMER_ACK: 'on',
  H2O_SMTP_HOST: 'stalwart',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'notifications',
  H2O_SMTP_PASS: 'synthetic-submission-password',
  H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
  H2O_SALES_ADDRESS_DOMAINS: 'example.test',
  H2O_NATIVE_INTAKE: 'on',
  H2O_EMAIL_INBOUND: 'off',
  TRUSTED_PROXY: 'cloudflare',
} as Record<string, string>
const KEYS = [...Object.keys(MAIL), 'H2O_OWN_EMAIL_DOMAINS', 'H2O_IMPORT_PAUSE_MS', 'H2O_IMPORT_MIN_FREE_MB']
let saved: Record<string, string | undefined> = {}

const HEADER = 'email,first_name,last_name,primary_phone,mobile_phone,company_name,unused_column'
const rows = (n: number) => Array.from({ length: n }, (_, i) => `person${i}.synthetic@northwind-${i % 7}.example.test,Pat${i},Lee${i},303555${String(1000 + i)},,Northwind ${i % 7} (synthetic),x`)
const file = (n = 4) => Buffer.from(`${HEADER}\n${rows(n).join('\n')}\n`)
const count = async (collection: string, where: Doc = {}) => (await (await payload()).count({ collection: collection as never, where: where as never, overrideAccess: true })).totalDocs
const refused = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof OperatorError ? e.code : `UNEXPECTED_${String((e as Error).name)}`
  }
  return 'NOT_REFUSED'
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let seq = 0
const uuid = () => `0192${(++seq).toString(16).padStart(4, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`
const rfqBody = (n: number) => ({
  submissionId: uuid(),
  source: 'NATIVE_CHAT',
  registryVersion: fixtureRegistry().registryVersion,
  locale: 'en',
  answers: { purpose: 'parts', parts_part: 'Fan blades', parts_qty: '4', name: `Ana Ruiz${n}`, company: 'Concurrent Thermal (synthetic)', email: `ana.concurrent.${n}.${Date.now()}@example.test`, country: 'US' },
  context: { page_path: '/cooling-tower-parts/', cta_placement: 'launcher', context_type: 'page' },
  attribution: { landing_page: '/cooling-tower-parts/' },
  antiAbuse: { formToken: issueFormToken(new Date(T0.getTime() - 20_000)).formToken, hp: '' },
})
const sendRfq = async (n: number, ip: string) =>
  submitReply(
    await payload(),
    new Request('http://localhost:3210/api/rfq/submit/', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': ip }, body: JSON.stringify(rfqBody(n)) }),
    T0,
  )

let adminEmail = ''
beforeAll(async () => {
  await Promise.all([user('platform-admin'), user('sales')])
  adminEmail = userEmail('platform-admin')
})
beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  Object.assign(process.env, MAIL, { H2O_OWN_EMAIL_DOMAINS: 'ics-synthetic.example.test', H2O_IMPORT_PAUSE_MS: '0', H2O_IMPORT_MIN_FREE_MB: '0' })
  await resetCrm()
  await (await payload()).updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, overrideAccess: true })
  invalidateErsSettings()
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]
  else process.env[k] = v
})

describe('1. the guard: engine, inbound and ANY trigger rule must be OFF; email mode may be ON', () => {
  it('email mode live + native intake + ACK on + engine/inbound/triggers off: sendingOff is ok and the apply runs', async () => {
    const p = await payload()
    const off = await sendingOff(p, process.env)
    expect(off).toMatchObject({ ok: true, mode: 'live', engine: false, inbound: false, triggers: 0 })
    const f = file()
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    const r = await apply(p, f, sha, adminEmail, dry.approval!, process.env, 'IMPORT-GUARD-1 (synthetic)')
    expect(r.summary.create).toBe(4)
    expect(r.after).toEqual({ enrollments: 0, outbox: 0 })
  })
  it('refuses when the Revenue Engine is ON', async () => {
    const p = await payload()
    const f = file()
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: true } as never, overrideAccess: true })
    invalidateErsSettings()
    expect(await refused(apply(p, f, sha, adminEmail, dry.approval!, process.env))).toBe('SENDING_NOT_OFF_ENGINE')
    expect(await count('crm-contacts')).toBe(0)
  })
  it('refuses when inbound mail is ON', async () => {
    const p = await payload()
    const f = file()
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    const env = { ...process.env, H2O_EMAIL_INBOUND: 'on' } as unknown as NodeJS.ProcessEnv
    expect(await refused(apply(p, f, sha, adminEmail, dry.approval!, env))).toMatch(/^SENDING_NOT_OFF_INBOUND/)
    expect(await count('crm-contacts')).toBe(0)
  })
  it('refuses when ANY trigger rule is ON (one rule is enough)', async () => {
    const p = await payload()
    const f = file()
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    await p.create({ collection: 'crm-sequence-triggers' as never, data: { key: 'RFQ_RECEIVED', enabled: true } as never, overrideAccess: true, context: { crmServer: {} } })
    expect(await refused(apply(p, f, sha, adminEmail, dry.approval!, process.env))).toMatch(/^SENDING_NOT_OFF_TRIGGERS/)
    expect(await count('crm-contacts')).toBe(0)
  })
})

describe('3. the approval token still binds the file hash and the dry-run counts; there is no bypass', () => {
  it('a token from another file, or from a changed plan, is refused; the operator module takes no override flag', async () => {
    const p = await payload()
    const f = file(4)
    const other = file(5)
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    const dryOther = await dryRun(p, other, sha256Hex(other), adminEmail)
    expect(dry.approval).not.toBe(dryOther.approval)
    expect(await refused(apply(p, f, sha, adminEmail, dryOther.approval!, process.env))).toMatch(/STALE|APPROVAL|TOKEN|PLAN/i)
    expect(await refused(apply(p, f, '0'.repeat(64), adminEmail, dry.approval!, process.env))).toBe('SHA_MISMATCH')
    expect(await count('crm-contacts')).toBe(0)
  })
})

describe('the import cannot queue or enroll (code assertion, any email mode)', () => {
  it('inside an import run an outbox create and an enrollment create are refused; outside it the same create is allowed', async () => {
    const p = await payload()
    const row = (key: string) => ({ idempotency_key: key, kind: 'RFQ_SALES_ALERT', status: 'SENT', recipient_ref: 'x' })
    await expect(runAsImport(() => p.create({ collection: 'crm-email-outbox', data: row('guard:inside') as never, ...sys, context: { crmServer: {} } }))).rejects.toThrow(/IMPORT_MAY_NOT_QUEUE/)
    await expect(runAsImport(() => p.create({ collection: 'crm-enrollments' as never, data: { coalesce_key: 'guard:inside' } as never, ...sys, context: { crmServer: {} } }))).rejects.toThrow(/IMPORT_MAY_NOT_QUEUE/)
    expect(await count('crm-email-outbox')).toBe(0)
    await p.create({ collection: 'crm-email-outbox', data: row('guard:outside') as never, ...sys, context: { crmServer: {} } })
    expect(await count('crm-email-outbox')).toBe(1)
  })
})

describe('2/4. concurrent real RFQs: counts scoped to the file, never the whole table', () => {
  it('real RFQs arriving DURING apply (alert + ACK rows queued by them): the import still passes, and ZERO outbox rows or enrollments are tied to it', async () => {
    const p = await payload()
    // a row that already exists before the run (an earlier alert): table totals must not matter
    await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'guard:prior', kind: 'RFQ_SALES_ALERT', status: 'SENT', recipient_ref: 'x' } as never, ...sys, context: { crmServer: {} } })
    const f = file(60)
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    const started = Date.now()
    const importRun = apply(p, f, sha, adminEmail, dry.approval!, process.env, 'IMPORT-GUARD-1 concurrent (synthetic)').then((r) => ({ r, done: Date.now() }))
    // three real RFQs, staggered, while the import is writing (their own request chains: no import store)
    const rfqs = [0, 1, 2].map(async (n) => {
      await sleep(40 + n * 120)
      return { res: await sendRfq(n, `192.0.2.${60 + n}`), at: Date.now() }
    })
    const [{ r, done }, ...sent] = await Promise.all([importRun, ...rfqs])
    for (const s of sent) expect(s.res.status).toBe(200)
    // overlap is real: at least one RFQ was accepted before the import finished
    expect(sent.some((s) => s.at < done)).toBe(true)
    expect(done).toBeGreaterThan(started)
    expect(await count('crm-rfqs')).toBe(3)
    // the real RFQs queued their own email: the table grew, but never because of the import
    const outboxTotal = await count('crm-email-outbox')
    expect(outboxTotal).toBeGreaterThan(1)
    expect(await count('crm-email-outbox', { rfq: { exists: false } })).toBe(1) // only the pre-existing row has no RFQ
    expect(r.before).toEqual({ enrollments: 0, outbox: 0 })
    expect(r.after).toEqual({ enrollments: 0, outbox: 0 })
    expect(await reachTiedToFile(p, sha)).toEqual({ enrollments: 0, outbox: 0 })
    expect(await count('crm-contacts', { 'provenance.source_system': { equals: 'LEGACY_IMPORT' } })).toBe(60)
  }, 60_000)

  it('the proof reads rows TIED to the file: an enrollment and an email row for a contact this file created are counted (and only for this file)', async () => {
    const p = await payload()
    const f = file()
    const sha = sha256Hex(f)
    const dry = await dryRun(p, f, sha, adminEmail)
    await apply(p, f, sha, adminEmail, dry.approval!, process.env)
    const contact = (await p.find({ collection: 'crm-contacts', where: { 'provenance.source_system': { equals: 'LEGACY_IMPORT' } } as never, limit: 1, ...sys })).docs[0] as unknown as Doc
    await ensureSeedSequences(p)
    const seq = (await p.find({ collection: 'crm-sequences', limit: 1, ...sys })).docs[0] as unknown as Doc
    const ver = (await p.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } }, limit: 1, ...sys })).docs[0] as unknown as Doc
    const enroll = async (key: string, extra: Doc = {}) =>
      (await p.create({ collection: 'crm-enrollments', data: { coalesce_key: key, identity_base: key, purpose: 'RELATIONSHIP', sequence: seq.id, version: ver.id, contact: contact.id, enrolled_via: 'MANUAL', status: 'ACTIVE', enrolled_at: new Date().toISOString(), ...extra } as never, ...sys, context: { crmServer: {} } })) as unknown as Doc
    expect(await reachTiedToFile(p, sha)).toEqual({ enrollments: 0, outbox: 0 })
    const tied = await enroll('guard:tied')
    await p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'guard:tied-mail', kind: 'SEQUENCE_EMAIL', status: 'SENT', recipient_ref: 'x', enrollment: tied.id } as never, ...sys, context: { crmServer: {} } })
    expect(await reachTiedToFile(p, sha)).toEqual({ enrollments: 1, outbox: 1 })
    // a table-wide count would have moved for any row; a row for another file's contact does not move this file's count
    expect(await reachTiedToFile(p, 'a'.repeat(64))).toEqual({ enrollments: 0, outbox: 0 })
  })
})

describe('5. the Typeform import has the same rules', () => {
  const H = ['What is your email address?', 'Can I get your first name?', 'And your last name?', 'Great {{field:abc}}. What company are you with?', 'Awesome, {{field:abc}}. What are you interested in:', 'What Part are you interested in? ', 'Please provide any information you have on {{field:def}} (model, size, etc.)', 'Is this Urgent Part Quote Request?', 'Upload any relevant files, PDFs only (If needed)', 'Please let us know your phone number', 'Can you please let us know the Country of Destination?', "Anything else you'd like us to know?", 'Submitted At', 'Token']
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`
  const tf = (n: number) =>
    Buffer.from(`${H.map(q).join(',')}\n${Array.from({ length: n }, (_, i) => [`tf.person${i}@northwind-${i % 5}.example.test`, `Tia${i}`, `Roe${i}`, `Northwind ${i % 5} (synthetic)`, 'Parts', 'Fan blades', `Model ${i}`, 'No', '', `30355510${String(i).padStart(2, '0')}`, 'United States', '', '3/14/2025 9:00:00', `tokGuard${String(i).padStart(8, '0')}`].map(q).join(',')).join('\n')}\n`)
  it('refused by the same three conditions (engine here), with the same codes', async () => {
    const p = await payload()
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: true } as never, overrideAccess: true })
    invalidateErsSettings()
    const b = tf(3)
    expect(await refused(applyTypeform(p, b, sha256Hex(b), adminEmail, 'f'.repeat(64), process.env))).toBe('SENDING_NOT_OFF_ENGINE')
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { enabled: false } as never, overrideAccess: true })
    invalidateErsSettings()
    await p.create({ collection: 'crm-sequence-triggers' as never, data: { key: 'NO_ACTIVITY', enabled: true } as never, overrideAccess: true, context: { crmServer: {} } })
    expect(await refused(applyTypeform(p, b, sha256Hex(b), adminEmail, 'f'.repeat(64), process.env))).toMatch(/^SENDING_NOT_OFF_TRIGGERS/)
  })
  it('email mode ON with real RFQs arriving DURING the Typeform apply: passes, inquiries written, zero outbox rows or enrollments tied to the file', async () => {
    const p = await payload()
    const b = tf(40)
    const sha = sha256Hex(b)
    const plan = await planTypeform(p, b, sha, adminEmail)
    const importRun = applyTypeform(p, b, sha, adminEmail, plan.approval!, process.env, 'IMPORT-GUARD-1 typeform (synthetic)').then((r) => ({ r, done: Date.now() }))
    const rfqs = [0, 1, 2].map(async (n) => {
      await sleep(40 + n * 120)
      return { res: await sendRfq(10 + n, `192.0.2.${90 + n}`), at: Date.now() }
    })
    const [{ r, done }, ...sent] = await Promise.all([importRun, ...rfqs])
    for (const s of sent) expect(s.res.status).toBe(200)
    expect(sent.some((s) => s.at < done)).toBe(true)
    expect(r.inquiries.created).toBe(40)
    expect(r.before).toEqual({ enrollments: 0, outbox: 0 })
    expect(r.after).toEqual({ enrollments: 0, outbox: 0 })
    expect(await count('crm-rfqs')).toBe(3) // only the real ones: the import writes no RFQ
    expect(await count('crm-email-outbox')).toBeGreaterThan(0) // the real RFQs queued their alerts
    expect(await count('crm-email-outbox', { rfq: { exists: false } })).toBe(0)
  }, 60_000)
  it('inside the Typeform run the same create refusal applies (the whole apply is wrapped)', async () => {
    const p = await payload()
    await expect(runAsImport(() => p.create({ collection: 'crm-email-outbox', data: { idempotency_key: 'tf:inside', kind: 'T1', status: 'PENDING', recipient_ref: 'x' } as never, ...sys, context: { crmServer: {} } }))).rejects.toThrow(/IMPORT_MAY_NOT_QUEUE/)
  })
})
