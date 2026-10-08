import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { confirmStepUp, loadMfaUser } from '../../auth/mfa/service'
import { totpCode } from '../../auth/mfa/totp'
import { readEmailConfig, type InboundSettings } from '../../email/config'
import { dbCursorStore } from '../../email/imap-cursor'
import { imapMailbox } from '../../email/imap'
import { pollInbound } from '../../email/inbound-poller'
import { drainOutbox } from '../../email/outbox-worker'
import { emailReadiness, invalidateProfiles, resolveSending } from '../../email/profiles'
import * as sending from '../../email/sending-settings'
import { SEED_TEMPLATES, templateHash } from '../../email/templates'
import type { MailMessage, MailTransport } from '../../email/transport'
import { fakeServer, msg, type Box } from '../../email/__tests__/fake-imap'
import { SYNTHETIC_FIELD_MAP, SYNTHETIC_FORM_ID, SYNTHETIC_SECRET, signed, typeformDelivery } from '../fixtures/synthetic'
import { uuidv7 } from '../ids'
import { invalidateOfficeSettings } from '../officeSettings'
import { invalidateErsSettings } from '../ers/settings'
import { composeReply } from '../reply'
import { composerTemplates, ensureTemplates, listTemplates, saveTemplate, setTemplateApproved, templateByCode } from '../settings/templates'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { HARNESS_TOTP_SECRET, payload, resetCrm, rest, user, type TestUser } from './harness'

/**
 * Patch C against Postgres — sending profiles (step-up, sealed write-only password, check, activation, test send,
 * the worker's transport resolution), templates (seeds, T1 owner approval, approval tied to the wording, the composer,
 * the acknowledgement path), and the IMAP inbound mode end to end (in-memory IMAP server → poller → stored rows →
 * cursor). Synthetic only; no network: DNS answers and the SMTP check/send are injected.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
const srv = { overrideAccess: true as const, depth: 0 }
const CUSTOMER = 'avery.synthetic@northwind.example.com'
const ADMIN_ADDR = 'platform-admin.user@example.test'
const KEY = 'db-test-settings-key-000000000000000000000'
const PUBLIC = async () => [{ address: '142.250.4.108' }]
const ENV: Record<string, string | undefined> = {
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
  H2O_EMAIL_MODE: 'allowlist',
  H2O_EMAIL_ALLOWLIST: `${CUSTOMER},${ADMIN_ADDR}`,
  H2O_EMAIL_FROM: 'H2O RFQ Desk <rfq@example.test>',
  H2O_SALES_ALERT_TO: '',
  H2O_EMAIL_CUSTOMER_ACK: 'off',
  H2O_SMTP_HOST: undefined,
  H2O_SMTP_PORT: undefined,
  H2O_SMTP_USER: undefined,
  H2O_SMTP_PASS: undefined,
  H2O_SMTP_TLS_SERVERNAME: undefined,
  H2O_SETTINGS_KEY: KEY,
  H2O_EMAIL_SENDER_DOMAINS: 'example.test,h2ocooling.org',
}
const saved: Record<string, string | undefined> = {}
const setEnv = (env: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(env)) {
    if (!(k in saved)) saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

/** A clock that moves 10 minutes per call, so every app code is in a new time step (no replay refusals). */
let clock = Date.now() + 60 * 60_000
const later = () => new Date((clock += 10 * 60_000))
const sidOf = (token: string) => String((JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sid: string }).sid)
const session = async (u: TestUser): Promise<CrmSession> => crmSessionFor(p, await p.findByID({ collection: 'users', id: u.id, depth: 0, overrideAccess: true }))!
/** Pass the step-up with a real app code at `at` (the harness user's synthetic secret). */
async function stepUpAt(u: TestUser, at: Date) {
  const mu = (await loadMfaUser(p, u.id))!
  const out = await confirmStepUp(p, mu, sidOf(u.token), totpCode(HARNESS_TOTP_SECRET, at), at)
  expect(out.ok).toBe(true)
}
const GMAIL = { name: 'Workspace', preset: 'GMAIL', use: 'TRANSACTIONAL', username: 'rfq@example.test', password: 'abcd efgh ijkl mnop', from_address: 'rfq@example.test', from_name: 'ICS Sales Team' }

async function newRfq(spec: Parameters<typeof typeformDelivery>[0] = {}): Promise<Doc> {
  const s = signed(typeformDelivery(spec), SYNTHETIC_SECRET)
  const res = await (POST as never as (r: Request, c: { params: Promise<{ slug: string[] }> }) => Promise<Response>)(
    new Request(new URL('/api/crm/intake/typeform/', 'http://127.0.0.1:3200'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'typeform-signature': s.signature },
      body: s.raw,
    }),
    { params: Promise.resolve({ slug: ['crm', 'intake', 'typeform'] }) },
  )
  const number = ((await res.json()) as Doc).rfq_number
  return (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: number } }, ...srv })).docs[0] as unknown as Doc
}
const recorder = (): MailTransport & { sent: MailMessage[] } => {
  const t = { sent: [] as MailMessage[], send: async (m: MailMessage) => (t.sent.push(m), { messageId: m.messageId ?? null, accepted: 1 }), close: () => undefined }
  return t
}
const outbox = async () => (await p.find({ collection: 'crm-email-outbox', ...srv, limit: 50, sort: 'createdAt' })).docs as unknown as Doc[]

beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
})
beforeEach(async () => {
  await resetCrm()
  setEnv(ENV)
  invalidateProfiles()
  // Two-factor state from earlier runs (last accepted step, failures) must not turn this run's codes into replays.
  for (const u of [admin, sales]) await p.update({ collection: 'users', id: u.id, data: { mfa_last_step: null, mfa_failures: 0, mfa_locked_until: null, mfa_stepup: null } as never, ...srv, showHiddenFields: true })
  await p.update({ collection: 'users', id: admin.id, data: { crm_title: null } as never, ...srv })
  await p.updateGlobal({ slug: 'crm-office-settings' as never, data: { phones: { US: null, TH: null } } as never, ...srv })
  invalidateOfficeSettings()
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved))
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
})

describe('sending profiles: step-up, sealed password, access', () => {
  it('every change needs a fresh code in this session (5 minutes); a code from another session or an old one does not count', async () => {
    const A = await session(admin)
    const sid = sidOf(admin.token)
    const t0 = later()
    expect(await sending.saveProfile(A, sid, GMAIL, { now: t0 })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    await stepUpAt(admin, t0)
    expect(await sending.saveProfile(A, sid, GMAIL, { now: new Date(t0.getTime() + 4 * 60_000) })).toMatchObject({ ok: true })
    expect(await sending.saveProfile(A, sid, { ...GMAIL, name: 'x' }, { now: new Date(t0.getTime() + 6 * 60_000) })).toMatchObject({ code: 'STEP_UP_REQUIRED' })
    expect(await sending.saveProfile(A, 'another-session-id', GMAIL, { now: t0 })).toMatchObject({ code: 'STEP_UP_REQUIRED' })
    // A wrong code is refused and counted; a recovery-code-shaped value is not accepted for a step-up.
    const wrong = await sending.confirmSettingsStepUp(A, sid, '000000')
    expect(wrong.ok).toBe(false)
    expect(await sending.confirmSettingsStepUp(A, sid, 'ABCD-EFGH')).toMatchObject({ ok: false, code: 'STEP_UP_FORMAT' })
    // Sales: not an admin, whatever the code.
    expect(await sending.saveProfile(await session(sales), sidOf(sales.token), GMAIL)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('the password is sealed and write-only: never in the API, never plain in the database; the API cannot write profiles', async () => {
    const A = await session(admin)
    const t = later()
    await stepUpAt(admin, t)
    const out = await sending.saveProfile(A, sidOf(admin.token), GMAIL, { now: t })
    expect(out.ok).toBe(true)
    const id = (out as { id: string }).id
    const raw = (await (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle.execute(sql`SELECT password_sealed, password_set, host, port FROM crm_sending_profiles`)).rows[0]!
    expect(String(raw.password_sealed)).toMatch(/^s1\./)
    expect(String(raw.password_sealed)).not.toMatch(/abcd|efgh/)
    expect(raw).toMatchObject({ password_set: true, host: 'smtp.gmail.com', port: '587' })
    const got = await rest.get(`crm-sending-profiles/${id}`, admin.token)
    expect(got.status).toBe(200)
    expect(JSON.stringify(got.body)).not.toMatch(/password_sealed|s1\./)
    expect((await rest.get(`crm-sending-profiles/${id}`, sales.token)).status).toBe(403)
    expect((await rest.post('crm-sending-profiles', admin.token, { ...GMAIL, host: 'smtp.gmail.com', port: 587, tls_servername: 'smtp.gmail.com' })).status).toBe(403)
    expect((await rest.patch(`crm-sending-profiles/${id}`, admin.token, { active: true })).status).toBe(403)
    // Audit: who changed which fields and the state transitions; never a host, user name, sender or password.
    const audit = (await p.find({ collection: 'audit-log', where: { collection: { equals: 'crm-sending-profiles' } }, ...srv, limit: 20 })).docs
    expect(audit.length).toBeGreaterThan(0)
    expect(JSON.stringify(audit)).not.toMatch(/gmail|rfq@example|abcd|s1\./)
  })

  it('activation needs a passing check; checks record codes; one active profile per use; the active one is what sends', async () => {
    const A = await session(admin)
    const sid = sidOf(admin.token)
    const t = later()
    await stepUpAt(admin, t)
    const id = ((await sending.saveProfile(A, sid, GMAIL, { now: t })) as { id: string }).id
    expect(await sending.setProfileActive(A, sid, id, true, { now: t })).toMatchObject({ ok: false, code: 'PROFILE_NOT_CHECKED' })
    const fail = await sending.checkProfile(A, sid, id, { now: t, resolve: PUBLIC, verify: async () => Promise.reject(Object.assign(new Error('535 5.7.8 secret banner text'), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' })) })
    expect(fail).toMatchObject({ ok: false, code: 'SMTP_535_AUTH_PLAIN' })
    expect((fail as { message: string }).message).toMatch(/app password/)
    expect((fail as { message: string }).message).not.toContain('banner')
    const seen: Doc[] = []
    expect(await sending.checkProfile(A, sid, id, { now: t, resolve: PUBLIC, verify: async (s) => void seen.push(s as never) })).toMatchObject({ ok: true })
    // Connected to the checked address, TLS verified against the configured name, app-password spaces removed.
    expect(seen[0]).toEqual({ host: '142.250.4.108', port: 587, user: 'rfq@example.test', pass: 'abcdefghijklmnop', servername: 'smtp.gmail.com' })
    expect(await sending.setProfileActive(A, sid, id, true, { now: t })).toMatchObject({ ok: true })
    const r = await resolveSending(p, readEmailConfig(), 'TRANSACTIONAL', Date.now(), { resolve: PUBLIC })
    expect(r).toMatchObject({ ok: true, source: 'profile', profileId: id, fromAddress: 'rfq@example.test', smtp: { host: '142.250.4.108' } })
    // REVENUE has no profile of its own: it uses the TRANSACTIONAL one.
    invalidateProfiles()
    expect(await resolveSending(p, readEmailConfig(), 'REVENUE', Date.now(), { resolve: PUBLIC })).toMatchObject({ ok: true, profileId: id })
    // A second profile for the same use replaces the first.
    const id2 = ((await sending.saveProfile(A, sid, { ...GMAIL, name: 'Second' }, { now: t })) as { id: string }).id
    await sending.checkProfile(A, sid, id2, { now: t, resolve: PUBLIC, verify: async () => undefined })
    await sending.setProfileActive(A, sid, id2, true, { now: t })
    const rows = (await p.find({ collection: 'crm-sending-profiles' as never, ...srv, limit: 10 })).docs as unknown as Doc[]
    expect(rows.filter((x) => x.active === true).map((x) => x.id)).toEqual([id2])
    // An active profile can't be deleted.
    expect(await sending.deleteProfile(A, sid, id2, { now: t })).toMatchObject({ ok: false, code: 'PROFILE_ACTIVE' })
    // Editing the connection (SEC-CRM-1: with the password entered again) clears the check and turns the profile off.
    await sending.saveProfile(A, sid, { ...GMAIL, id: id2, name: 'Second', username: 'other@example.test' }, { now: t })
    expect((await p.findByID({ collection: 'crm-sending-profiles' as never, id: id2, ...srv }) as unknown as Doc)).toMatchObject({ last_check_state: null, active: false })
    expect(await sending.deleteProfile(A, sid, id, { now: t })).toMatchObject({ ok: true })
  })

  it('refuses hosts that point inside the network and senders outside the allowed domains', async () => {
    const A = await session(admin)
    const sid = sidOf(admin.token)
    const t = later()
    await stepUpAt(admin, t)
    expect(await sending.saveProfile(A, sid, { ...GMAIL, from_address: 'x@elsewhere.example' }, { now: t })).toMatchObject({ code: 'PROFILE_FROM_DOMAIN_NOT_ALLOWED' })
    expect(await sending.saveProfile(A, sid, { ...GMAIL, preset: 'CUSTOM', host: '169.254.169.254', tls_servername: 'x.example.test' }, { now: t })).toMatchObject({ code: 'PROFILE_HOST_INVALID' })
    const id = ((await sending.saveProfile(A, sid, { ...GMAIL, preset: 'CUSTOM', host: 'mail.example.test', tls_servername: 'mail.example.test' }, { now: t })) as { id: string }).id
    let verified = false
    const out = await sending.checkProfile(A, sid, id, { now: t, resolve: async () => [{ address: '10.0.0.7' }], verify: async () => void (verified = true) })
    expect(out).toMatchObject({ ok: false, code: 'HOST_PRIVATE_ADDRESS' })
    expect(verified).toBe(false) // no connection was attempted
  })

  it('test send: to the admin’s own address only, through the mode gate, rate-limited; recorded by reference', async () => {
    const A = await session(admin)
    const sid = sidOf(admin.token)
    const t = later()
    await stepUpAt(admin, t)
    const id = ((await sending.saveProfile(A, sid, GMAIL, { now: t })) as { id: string }).id
    const sent: MailMessage[] = []
    const send = async (_s: unknown, m: MailMessage) => void sent.push(m)
    setEnv({ H2O_EMAIL_MODE: 'off' })
    expect(await sending.testSendProfile(A, sid, id, { now: t, resolve: PUBLIC, send })).toMatchObject({ ok: false, code: 'MODE_BLOCKS_TEST' })
    setEnv({ H2O_EMAIL_MODE: 'allowlist' })
    for (let i = 0; i < 3; i++) expect(await sending.testSendProfile(A, sid, id, { now: t, resolve: PUBLIC, send })).toMatchObject({ ok: true })
    expect(await sending.testSendProfile(A, sid, id, { now: t, resolve: PUBLIC, send })).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(sent.map((m) => m.to)).toEqual([ADMIN_ADDR, ADMIN_ADDR, ADMIN_ADDR])
    expect(sent[0]!.from).toBe('"ICS Sales Team" <rfq@example.test>')
    const ev = (await p.find({ collection: 'crm-email-events', where: { kind: { equals: 'PROFILE_TEST' } }, ...srv })).docs as unknown as Doc[]
    expect(ev.map((e) => e.event)).toEqual(['DIRECT_SENT', 'DIRECT_SENT', 'DIRECT_SENT'])
    expect(JSON.stringify(ev)).not.toContain(ADMIN_ADDR)
  })
})

describe('the worker’s transport: active profile, environment fallback, fail closed', () => {
  it('no profile and no environment transport: queued mail waits (RETRY NO_TRANSPORT) instead of being dropped; readiness fails', async () => {
    await newRfq() // sales alerts are off here; the acknowledgement is queued for the allowlisted customer
    setEnv({ H2O_EMAIL_CUSTOMER_ACK: 'on' })
    await newRfq()
    const queued = (await outbox()).filter((r) => r.status === 'PENDING')
    expect(queued.length).toBe(1)
    const res = await drainOutbox(p, { now: new Date() })
    expect(res).toMatchObject({ claimed: 1, retried: 1, sent: 0 })
    expect((await outbox()).find((r) => r.id === queued[0]!.id)).toMatchObject({ status: 'RETRY', last_error_code: 'NO_TRANSPORT' })
    expect(await emailReadiness(p, readEmailConfig())).toBe('fail')
  })

  it('an active profile that cannot be opened fails closed (no fallback to the environment transport)', async () => {
    const A = await session(admin)
    const sid = sidOf(admin.token)
    const t = later()
    await stepUpAt(admin, t)
    const id = ((await sending.saveProfile(A, sid, GMAIL, { now: t })) as { id: string }).id
    await sending.checkProfile(A, sid, id, { now: t, resolve: PUBLIC, verify: async () => undefined })
    await sending.setProfileActive(A, sid, id, true, { now: t })
    setEnv({ H2O_SETTINGS_KEY: undefined, H2O_SMTP_HOST: 'stalwart', H2O_SMTP_USER: 'u', H2O_SMTP_PASS: 'p', H2O_SMTP_TLS_SERVERNAME: 'mail.example.test', H2O_EMAIL_CUSTOMER_ACK: 'on' })
    invalidateProfiles()
    expect(await resolveSending(p, readEmailConfig())).toMatchObject({ ok: false, source: 'profile', code: 'SETTINGS_KEY_MISSING' })
    await newRfq()
    invalidateProfiles()
    expect(await drainOutbox(p, { now: new Date() })).toMatchObject({ retried: 1, sent: 0 })
    expect((await outbox()).find((r) => r.kind === 'RFQ_CUSTOMER_ACK')).toMatchObject({ status: 'RETRY', last_error_code: 'SETTINGS_KEY_MISSING' })
    // With the profile off, the environment transport is used again.
    setEnv({ H2O_SETTINGS_KEY: KEY })
    await sending.setProfileActive(A, sid, id, false, { now: t })
    expect(await resolveSending(p, readEmailConfig())).toMatchObject({ ok: true, source: 'env' })
  })
})

describe('templates T1–T6', () => {
  it('seeds once: T1 approved (2026-10-05) and T2–T6 approved (T-R1, 2026-10-06), each for its exact wording; reads for CRM users, writes for nobody via the API', async () => {
    await ensureTemplates(p)
    await ensureTemplates(p)
    // T1–T6 (the ERS slice-1 sequence templates E11_* are seeded alongside; see ers.dbtest.ts).
    const all = (await listTemplates(p)).filter((t) => /^T\d$/.test(String(t.code)))
    expect(all.map((t) => t.code)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
    const t1 = all[0]!
    expect(t1).toMatchObject({ approved: true, approved_hash: templateHash(SEED_TEMPLATES[0]!), version: 1 })
    for (const t of all.slice(1)) expect(t, String(t.code)).toMatchObject({ approved: true, approved_hash: templateHash(SEED_TEMPLATES.find((x) => x.code === t.code)!), version: 1 })
    expect((await rest.get(`crm-email-templates/${String(t1.id)}`, sales.token)).status).toBe(200)
    expect((await rest.patch(`crm-email-templates/${String(t1.id)}`, admin.token, { body: 'changed' })).status).toBe(403)
    expect((await rest.post('crm-email-templates', admin.token, { code: 'T9', name: 'x', subject: 's', body: 'b', purpose: 'TRANSACTIONAL' })).status).toBe(403)
  })

  it('approval is tied to the wording: approve, edit (version +1, approval withdrawn), stale approvals refused; sales cannot edit', async () => {
    const A = await session(admin)
    const t2 = (await templateByCode(p, 'T2'))!
    const hash = templateHash({ subject: String(t2.subject), body: String(t2.body), purpose: 'TRANSACTIONAL' })
    expect(await setTemplateApproved(A, String(t2.id), true, 'stale-hash')).toMatchObject({ ok: false, code: 'STALE' })
    expect(await setTemplateApproved(A, String(t2.id), true, hash)).toMatchObject({ ok: true })
    expect(await templateByCode(p, 'T2')).toMatchObject({ approved: true, approved_by: admin.id })
    expect(await saveTemplate(A, { id: String(t2.id), name: 'T2', subject: String(t2.subject), body: `${String(t2.body)}\n\nP.S. synthetic edit`, purpose: 'TRANSACTIONAL' })).toMatchObject({ ok: true })
    expect(await templateByCode(p, 'T2')).toMatchObject({ approved: false, approved_hash: null, version: 2 })
    expect(await saveTemplate(A, { id: String(t2.id), subject: 'x', body: 'Hi {{firstname}}', purpose: 'TRANSACTIONAL' })).toMatchObject({ ok: false, code: 'TEMPLATE_UNKNOWN_FIELD' })
    const t1 = (await templateByCode(p, 'T1'))!
    expect(await saveTemplate(A, { id: String(t1.id), subject: String(t1.subject), body: `${String(t1.body)} {{unsubscribe_url}}`, purpose: 'MARKETING' })).toMatchObject({ code: 'TEMPLATE_T1_TRANSACTIONAL' })
    expect(await saveTemplate(await session(sales), { id: String(t2.id), subject: 'x', body: 'y' })).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('T1 sends the owner-approved acknowledgement; withdrawn, the acknowledgement is not sent (SUPPRESSED_TEMPLATE)', async () => {
    setEnv({ H2O_EMAIL_CUSTOMER_ACK: 'on' })
    await ensureTemplates(p)
    await newRfq({ first: 'Avery' })
    const t = recorder()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t })
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]!.subject).toMatch(/^We received your request: RFQ RFQ-/)
    expect(t.sent[0]!.text).toMatch(/^Hi Avery,\n\nThank you for contacting Industrial Cooling Solutions\./)
    expect(t.sent[0]!.text).toContain('A member of our team will review it and respond within one business day.')
    expect(t.sent[0]!.text.trimEnd().endsWith('The ICS team\nIndustrial Cooling Solutions (ICS)')).toBe(true)
    const A = await session(admin)
    await setTemplateApproved(A, String((await templateByCode(p, 'T1'))!.id), false)
    await newRfq()
    const t2 = recorder()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t2 })
    expect(t2.sent).toHaveLength(0)
    expect((await outbox()).at(-1)).toMatchObject({ kind: 'RFQ_CUSTOMER_ACK', status: 'SUPPRESSED_TEMPLATE', last_error_code: 'T1_NOT_APPROVED', body_text: null })
  })

  it('the composer offers approved T2–T6 only, and fills a template only when every required value exists', async () => {
    const rfq = await newRfq({ company: 'Northwind Thermal (synthetic)' })
    const A = await session(admin)
    // T-R1: T2–T6 are seeded approved (owner, 2026-10-06), so the composer offers all five; T1 is automatic only.
    expect((await composerTemplates(A, rfq, { choices: [] })).options.map((o) => o.code)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6'])
    const t5 = (await templateByCode(p, 'T5'))!
    await setTemplateApproved(A, String(t5.id), true)
    // Owner rule 2026-10-06: the team signature only ("ICS Sales Team" + the sales address, from the Revenue Engine
    // settings). No office phone is set and the sender has no job title: neither is needed, nothing is held.
    await p.updateGlobal({ slug: 'crm-ers-settings' as never, data: { signature: { signer: 'ICS Sales Team', email: 'sales@example.test' } } as never, ...srv })
    invalidateErsSettings()
    let c = await composerTemplates(A, rfq, { code: 'T5', choices: ['site visit'] })
    expect(c.options.map((o) => [o.code, o.choices])).toContainEqual(['T5', [['call', 'site visit']]])
    expect(c.picked?.result).toMatchObject({ ok: true, subject: `Scheduling a site visit for RFQ ${String(rfq.rfq_number)}` })
    expect((c.picked?.result as { body: string }).body).toContain('Best regards,\nICS Sales Team\nsales@example.test')
    // A phone set in the office settings is still never put in an email.
    await p.updateGlobal({ slug: 'crm-office-settings' as never, data: { phones: { US: '+1 555 0100', TH: null } } as never, ...srv })
    invalidateOfficeSettings()
    c = await composerTemplates(await session(admin), rfq, { code: 'T5', choices: ['site visit'] })
    expect((c.picked?.result as { body: string }).body).not.toMatch(/555 0100/)
    // A linked account's name wins over what the customer typed.
    const acct = (await p.create({ collection: 'crm-accounts', data: { canonical_name: 'Westbrook Utilities (synthetic)', provenance: { source_system: 'MANUAL_ENTRY' } } as never, ...srv, context: { crmServer: {} } })) as unknown as Doc
    c = await composerTemplates(await session(admin), { ...rfq, account: acct.id }, { code: 'T5', choices: ['call'] })
    expect((c.picked?.result as { body: string }).body).toContain('a call with your team at Westbrook Utilities (synthetic).')
    // T1 (automatic) and unapproved templates can't be picked, even by URL.
    await setTemplateApproved(A, String((await templateByCode(p, 'T2'))!.id), false)
    expect((await composerTemplates(A, rfq, { code: 'T1', choices: [] })).picked).toBeNull()
    expect((await composerTemplates(A, rfq, { code: 'T2', choices: [] })).picked).toBeNull()
    expect(await p.updateGlobal({ slug: 'crm-office-settings' as never, data: { phones: { US: 'call me <maybe>' } } as never, ...srv }).catch((e: Error) => e.message)).toMatch(/phone number/)
  })
})

describe('IMAP inbound (Google Workspace mode) end to end', () => {
  it('starts from now, links a reply to its RFQ by token, sends unknown mail to review, never twice; the cursor is in the database', async () => {
    const rfq = await newRfq()
    const S = await session(sales)
    await composeReply(S, { rfqId: String(rfq.id), subject: 'Your request', body: 'Hello', token: uuidv7() }, new Date(), readEmailConfig())
    const t = recorder()
    await drainOutbox(p, { cfg: readEmailConfig(), transport: t })
    const replyTo = t.sent[0]!.replyTo!
    expect(replyTo).toMatch(/^rfq\+[a-z2-7]{26}@example\.test$/)

    const box: Box = { uidvalidity: 42, messages: new Map([[1, msg(['From: old@example.test', 'To: rfq@example.test', 'Subject: old mail', '', 'not imported'])]]) }
    const settings: InboundSettings = { protocol: 'imap', host: 'imap.example.test', port: 993, user: 'rfq@example.test', pass: 'app-pass', servername: 'imap.example.test', mailbox: 'INBOX', roleLocal: 'rfq', domain: 'example.test' }
    const cfg = { enabled: true, errors: [], settings }
    const mailbox = () => imapMailbox(settings, { cursor: dbCursorStore(p), connect: async () => fakeServer(box, { password: 'app-pass' }).stream })
    expect(await pollInbound(p, { cfg, mailbox: mailbox() })).toMatchObject({ fetched: 0 })

    box.messages.set(2, msg([`From: "Avery" <${CUSTOMER}>`, `To: ${replyTo}`, 'Message-ID: <imap-reply-1@northwind.example.com>', `In-Reply-To: <${String(t.sent[0]!.messageId).replace(/[<>]/g, '')}>`, 'Subject: Re: Your request', 'Content-Type: text/plain; charset=utf-8', '', 'Thanks — photos to follow.', '', '> quoted']))
    box.messages.set(3, msg(['From: someone@example.test', 'To: rfq@example.test', 'Message-ID: <imap-other@example.test>', 'Subject: hello', '', 'no token']))
    expect(await pollInbound(p, { cfg, mailbox: mailbox() })).toMatchObject({ fetched: 2, linked: 1, review: 1, failed: 0 })
    expect(await pollInbound(p, { cfg, mailbox: mailbox() })).toMatchObject({ fetched: 0 })

    const inbound = (await p.find({ collection: 'crm-email-messages', where: { direction: { equals: 'INBOUND' } }, ...srv })).docs as unknown as Doc[]
    expect(inbound).toHaveLength(1)
    expect(inbound[0]).toMatchObject({ rfq: rfq.id, message_id: '<imap-reply-1@northwind.example.com>' })
    expect(String(inbound[0]!.source_ref)).toMatch(/^imap:[0-9a-f]{16}:42:2$/)
    const review = (await p.find({ collection: 'crm-email-review', ...srv })).docs as unknown as Doc[]
    expect(review.map((r) => r.reason)).toEqual(['NO_TOKEN'])
    const cursor = (await p.find({ collection: 'crm-mail-cursor' as never, ...srv })).docs as unknown as Doc[]
    expect(cursor).toHaveLength(1)
    expect(cursor[0]).toMatchObject({ uidvalidity: 42, last_uid: 3 })
    expect(String(cursor[0]!.key)).toMatch(/^imap:[0-9a-f]{16}$/)
    expect(JSON.stringify(cursor)).not.toContain('example.test')
  })
})

describe('SEC-CRM-1: the stored password stays bound to its server', () => {
  it('moving a profile to another server, port, TLS name or user needs the password again, and turns the profile off', async () => {
    const A = await session(admin)
    const sid = sidOf(admin.token)
    const t = later()
    await stepUpAt(admin, t)
    const id = ((await sending.saveProfile(A, sid, { ...GMAIL, preset: 'CUSTOM', host: 'mail.example.test', tls_servername: 'mail.example.test' }, { now: t })) as { id: string }).id
    await p.update({ collection: 'crm-sending-profiles' as never, id, data: { active: true } as never, ...srv, context: { crmServer: {} } })
    const sealedBefore = ((await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv, showHiddenFields: true })) as unknown as Doc).password_sealed
    for (const moved of [{ host: 'other.example.test', tls_servername: 'other.example.test' }, { port: '465' }, { tls_servername: 'alt.example.test' }, { username: 'someone@example.test' }]) {
      const out = await sending.saveProfile(A, sid, { ...GMAIL, preset: 'CUSTOM', host: 'mail.example.test', tls_servername: 'mail.example.test', ...moved, id, password: '' }, { now: t })
      expect(out).toMatchObject({ ok: false, code: 'PROFILE_PASSWORD_REQUIRED_FOR_CHANGE' })
    }
    const unchanged = (await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv, showHiddenFields: true })) as unknown as Doc
    expect(unchanged).toMatchObject({ host: 'mail.example.test', active: true })
    expect(unchanged.password_sealed).toBe(sealedBefore)
    // A name-only edit keeps the password and the state.
    expect(await sending.saveProfile(A, sid, { ...GMAIL, preset: 'CUSTOM', host: 'mail.example.test', tls_servername: 'mail.example.test', name: 'Renamed', id, password: '' }, { now: t })).toMatchObject({ ok: true })
    expect(((await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv })) as unknown as Doc).active).toBe(true)
    // With the password typed again the move is saved, re-sealed, and the profile is off until it passes a check.
    expect(await sending.saveProfile(A, sid, { ...GMAIL, preset: 'CUSTOM', host: 'other.example.test', tls_servername: 'other.example.test', id }, { now: t })).toMatchObject({ ok: true })
    const moved = (await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv, showHiddenFields: true })) as unknown as Doc
    expect(moved).toMatchObject({ host: 'other.example.test', active: false, last_check_state: null })
    expect(moved.password_sealed).not.toBe(sealedBefore)
  })
})
