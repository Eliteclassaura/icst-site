import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { DEFAULT_SALES_ADDRESS, readEmailConfig } from '../../email/config'
import { resolveSending } from '../../email/profiles'
import { invalidateRouting, readRouting, resolveAlertRecipients, resolveSalesAddressLive, routingView } from '../../email/routing-read'
import { salesAddressDomains, saveRouting, sendTestAlert, TEST_ALERT_SUBJECT } from '../../email/routing'
import { checkProfile, saveProfile, setProfileActive } from '../../email/sending-settings'
import type { MailMessage } from '../../email/transport'
import { SYNTHETIC_FIELD_MAP, SYNTHETIC_FORM_ID, SYNTHETIC_SECRET, signed, typeformDelivery } from '../fixtures/synthetic'
import { enqueueRfqNotifications } from '../notify'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { payload, resetCrm, user, type TestUser } from './harness'

/**
 * ALERTS-1 (Settings → Email routing) and R2-06 (a changed SMTP password turns the profile off) against the isolated
 * synthetic database. Nothing is really sent: the test alert goes to a recording function, and the RFQ path is the
 * outbox (rows only).
 */
type Doc = Record<string, unknown>
const srv = { overrideAccess: true as const, depth: 0 }
const ENV_ALERT = 'env.alerts.synthetic@example.test'
const SID = 'sid-alerts-1'
let p: Payload
let admin: TestUser, clientAdmin: TestUser, sales: TestUser
const KEYS = ['H2O_EMAIL_MODE', 'H2O_EMAIL_ALLOWLIST', 'H2O_EMAIL_FROM', 'H2O_SALES_ALERT_TO', 'H2O_RFQ_SALES_EMAIL', 'H2O_EMAIL_CUSTOMER_ACK', 'H2O_SMTP_HOST', 'H2O_SMTP_USER', 'H2O_SMTP_PASS', 'H2O_SMTP_PORT', 'H2O_SMTP_TLS_SERVERNAME', 'H2O_SETTINGS_KEY', 'H2O_EMAIL_SENDER_DOMAINS', 'H2O_SALES_ADDRESS_DOMAINS']
let saved: Record<string, string | undefined> = {}
const setEnv = (env: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
  else process.env[k] = v
}
const INGEST = { H2O_CRM_TYPEFORM_INGEST_ENABLED: '1', H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET, H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID, H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP) }
const MAIL = { H2O_EMAIL_MODE: 'live', H2O_EMAIL_FROM: 'ICS Sales Team <sales@example.test>', H2O_SALES_ALERT_TO: ENV_ALERT, H2O_SMTP_HOST: 'stalwart', H2O_SMTP_PORT: '587', H2O_SMTP_USER: 'notifications', H2O_SMTP_PASS: 'synthetic-submission-password', H2O_SMTP_TLS_SERVERNAME: 'mail.example.test' }

const session = (u: TestUser): CrmSession => crmSessionFor(p, u.user)!
/** The step-up grant a fresh app code leaves on the user (what `stepUp` looks for). */
const grantStepUp = (u: TestUser, at = new Date()) => p.update({ collection: 'users', id: u.id, data: { mfa_stepup: { sid: SID, at: at.toISOString() } } as never, ...srv })
const revokeStepUp = (u: TestUser) => p.update({ collection: 'users', id: u.id, data: { mfa_stepup: null } as never, ...srv })
const reset = async () => {
  await p.updateGlobal({ slug: 'crm-email-routing' as never, data: { alerts_us: null, alerts_th: null, alerts_cc: null, sales_address: null } as never, ...srv })
  invalidateRouting()
}
const stored = async () => (await p.findGlobal({ slug: 'crm-email-routing' as never, ...srv })) as unknown as Doc
const auditRows = async () => (await p.find({ collection: 'audit-log', where: { action: { equals: 'email-routing-updated' } }, sort: '-createdAt', limit: 20, ...srv })).docs as unknown as Doc[]
const changeRows = async () => (await auditRows()).filter((r) => (r.detail as Doc).changes)

beforeAll(async () => {
  p = await payload()
  ;[admin, clientAdmin, sales] = await Promise.all([user('platform-admin'), user('client-admin'), user('sales')])
})
beforeEach(async () => {
  await resetCrm()
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  setEnv({ ...MAIL, ...INGEST, H2O_EMAIL_ALLOWLIST: undefined, H2O_RFQ_SALES_EMAIL: undefined, H2O_EMAIL_CUSTOMER_ACK: 'off', H2O_SALES_ADDRESS_DOMAINS: 'example.test' })
  await reset()
  await grantStepUp(admin)
  await grantStepUp(clientAdmin)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('NETWORK_FORBIDDEN_IN_CRM_TESTS')
  })
})
afterEach(() => {
  setEnv(saved)
  vi.restoreAllMocks()
})

describe('ALERTS-1: fallback to the server defaults', () => {
  it('a fresh database behaves exactly as before, and the page says "using default"', async () => {
    const cfg = readEmailConfig()
    expect(await resolveAlertRecipients(p, 'US', cfg)).toMatchObject({ everyone: [ENV_ALERT], extras: [], all: [ENV_ALERT], source: 'default' })
    expect((await resolveAlertRecipients(p, 'TH', cfg)).all).toEqual([ENV_ALERT])
    expect(await resolveSalesAddressLive(p, {} as never)).toBe(DEFAULT_SALES_ADDRESS)
    expect(await resolveSalesAddressLive(p, { H2O_RFQ_SALES_EMAIL: 'quotes@example.test' } as never)).toBe('quotes@example.test')
    const v = await routingView(p)
    expect(v.usingDefault).toEqual({ everyone: true, sales: true })
  })
  it('the "everyone" list replaces the server default; emptying it goes back to the default', async () => {
    expect(await saveRouting(session(admin), SID, { alerts_cc: 'team.one@example.test\nteam.two@gmail.com' })).toMatchObject({ ok: true })
    expect((await resolveAlertRecipients(p, 'TH')).all).toEqual(['team.one@example.test', 'team.two@gmail.com'])
    expect(await saveRouting(session(admin), SID, { alerts_cc: '' })).toMatchObject({ ok: true })
    expect((await resolveAlertRecipients(p, 'TH')).all).toEqual([ENV_ALERT])
  })
})

describe('ALERTS-1: who may change it, and the step-up', () => {
  it('sales users are refused; platform-admin and client-admin may save', async () => {
    expect(await saveRouting(session(sales), SID, { alerts_us: 'a@example.test' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await sendTestAlert(session(sales), SID)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await saveRouting(session(admin), SID, { alerts_us: 'a@example.test' })).toMatchObject({ ok: true })
    expect(await saveRouting(session(clientAdmin), SID, { alerts_us: 'b@example.test' })).toMatchObject({ ok: true })
    expect((await stored()).alerts_us).toEqual(['b@example.test'])
  })
  it('the global cannot be written through the API either (read-only for everyone)', async () => {
    await expect(p.updateGlobal({ slug: 'crm-email-routing' as never, data: { sales_address: 'x@example.test' } as never, overrideAccess: false, user: { ...admin.user, collection: 'users' } as never })).rejects.toThrow()
    expect((await stored()).sales_address ?? null).toBeNull()
  })
  it('saving and the test alert need the step-up', async () => {
    await revokeStepUp(admin)
    expect(await saveRouting(session(admin), SID, { alerts_us: 'a@example.test' })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await sendTestAlert(session(admin), SID)).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect((await stored()).alerts_us ?? null).toBeNull()
    // An old grant (older than 5 minutes) does not count either.
    await grantStepUp(admin, new Date(Date.now() - 6 * 60_000))
    expect(await saveRouting(session(admin), SID, { alerts_us: 'a@example.test' })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    // Nor does a grant from another session.
    await grantStepUp(admin)
    expect(await saveRouting(session(admin), 'some-other-session', { alerts_us: 'a@example.test' })).toMatchObject({ ok: false, code: 'STEP_UP_REQUIRED' })
    expect(await saveRouting(session(admin), SID, { alerts_us: 'a@example.test' })).toMatchObject({ ok: true })
  })
})

describe('ALERTS-1: validation', () => {
  const bad = async (input: Record<string, string>) => {
    const out = await saveRouting(session(admin), SID, input)
    expect(out.ok).toBe(false)
    expect((await stored()).alerts_us ?? null).toBeNull()
    return out
  }
  it('refuses things that are not plain email addresses', async () => {
    await bad({ alerts_us: 'not-an-address' })
    await bad({ alerts_us: 'Jo <jo@example.test>' })
    await bad({ alerts_us: 'https://example.test/alert' })
    await bad({ alerts_us: 'jo@example.test, http://evil.example' })
    await bad({ alerts_us: 'a b@example.test' })
    await bad({ alerts_th: 'javascript:alert(1)' })
    await bad({ alerts_cc: '<script>@example.test' })
    await bad({ sales_address: 'one@example.test, two@example.test' })
    await bad({ sales_address: 'www.example.test' })
  })
  it('allows at most 10 addresses per list', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `p${i}@example.test`).join('\n')
    expect(await bad({ alerts_us: eleven })).toMatchObject({ code: 'ROUTING_LIST_TOO_MANY' })
    const ten = Array.from({ length: 10 }, (_, i) => `p${i}@example.test`).join('\n')
    expect(await saveRouting(session(admin), SID, { alerts_us: ten })).toMatchObject({ ok: true })
  })
  it('lowercases, trims and removes duplicates; one per line or separated by commas or semicolons', async () => {
    expect(await saveRouting(session(admin), SID, { alerts_us: ' Sales@Example.test ;\nsales@example.test, other@example.test\n\n' })).toMatchObject({ ok: true })
    expect((await stored()).alerts_us).toEqual(['sales@example.test', 'other@example.test'])
  })
})

describe('ALERTS-1: audit', () => {
  it('records old → new values and the actor; an unchanged save writes nothing', async () => {
    await saveRouting(session(admin), SID, { alerts_us: 'one@example.test', sales_address: 'quotes@example.test' })
    await saveRouting(session(admin), SID, { alerts_us: 'one@example.test, two@example.test', sales_address: 'quotes@example.test' })
    const rows = await changeRows()
    expect(rows).toHaveLength(2)
    const last = rows[0]!
    expect(String(last.actor)).toBe(admin.id)
    expect((last.detail as Doc).changes).toEqual({ alerts_us: { from: ['one@example.test'], to: ['one@example.test', 'two@example.test'] } })
    expect(((rows[1]!.detail as Doc).changes as Doc).sales_address).toEqual({ from: null, to: 'quotes@example.test' })
    expect(await saveRouting(session(admin), SID, { alerts_us: 'one@example.test, two@example.test', sales_address: 'quotes@example.test' })).toMatchObject({ ok: true, message: 'Nothing changed.' })
    expect(await changeRows()).toHaveLength(2)
  })
})

describe('ALERTS-1: the next quote reads the settings (no restart)', () => {
  const TH = 'th.extra@example.test'
  const US = 'us.extra@example.test'
  const ALL = ['team.one@example.test', 'team.two@gmail.com']
  it('everyone + the office extras, deduplicated, in one list; a change applies to the very next lookup', async () => {
    expect((await resolveAlertRecipients(p, 'US')).all).toEqual([ENV_ALERT]) // fresh DB: the server default
    await saveRouting(session(admin), SID, { alerts_cc: ALL.join('\n'), alerts_us: `${US}\n${ALL[0]!.toUpperCase()}`, alerts_th: TH })
    expect((await resolveAlertRecipients(p, 'US')).all).toEqual([...ALL, US])
    expect((await resolveAlertRecipients(p, 'TH')).all).toEqual([...ALL, TH])
    expect((await resolveAlertRecipients(p, 'XX')).all).toEqual([...ALL, US]) // unknown office counts as US
    await saveRouting(session(admin), SID, { alerts_cc: ALL[0]!, alerts_us: 'changed@example.test', alerts_th: TH })
    expect((await resolveAlertRecipients(p, 'US')).all).toEqual([ALL[0], 'changed@example.test'])
  })
  async function newRfq(office: 'US' | 'TH', suffix: string) {
    // One real RFQ through the Typeform endpoint, then the notification step again for a copy of it in the wanted office.
    const sg = signed(typeformDelivery({}), SYNTHETIC_SECRET)
    const res = await (POST as never as (r: Request, c: { params: Promise<{ slug: string[] }> }) => Promise<Response>)(
      new Request('http://127.0.0.1:3200/api/crm/intake/typeform/', { method: 'POST', headers: { 'content-type': 'application/json', 'typeform-signature': sg.signature }, body: sg.raw }),
      { params: Promise.resolve({ slug: ['crm', 'intake', 'typeform'] }) },
    )
    expect(res.status).toBe(200)
    const rfq = (await p.find({ collection: 'crm-rfqs', ...srv, limit: 1, sort: '-createdAt' })).docs[0] as unknown as Doc
    await enqueueRfqNotifications({ payload: p } as never, { ...rfq, office, canonical_id: `${String(rfq.canonical_id)}-${suffix}` } as never, readEmailConfig())
    return ((await p.find({ collection: 'crm-email-outbox', ...srv, limit: 50 })).docs as unknown as Doc[]).filter((r) => r.kind === 'RFQ_SALES_ALERT' && (String(r.idempotency_key).includes(`-${suffix}:`) || String(r.idempotency_key).endsWith(`-${suffix}`)))
  }
  // SEND-FIX-1a (owner requirement): ONE alert row per quote, every recipient in its To (gated one by one)
  const toList = (rows: Array<{ to_address?: string | null }>) => {
    expect(rows.filter((r) => r.to_address)).toHaveLength(1)
    return rows.flatMap((r) => (r.to_address ?? '').split(', ').filter(Boolean)).sort()
  }
  it('the next quote goes to everyone + that office’s extras in ONE alert; a change applies to the very next quote', async () => {
    expect(toList(await newRfq('US', 'a'))).toEqual([ENV_ALERT]) // fresh DB: the server default
    await saveRouting(session(admin), SID, { alerts_cc: ALL.join('\n'), alerts_us: US, alerts_th: TH })
    expect(toList(await newRfq('TH', 'b'))).toEqual([...ALL, TH].sort())
    expect(toList(await newRfq('US', 'c'))).toEqual([...ALL, US].sort())
    await saveRouting(session(admin), SID, { alerts_cc: ALL[0]!, alerts_us: 'changed@example.test', alerts_th: TH })
    expect(toList(await newRfq('US', 'd'))).toEqual([ALL[0], 'changed@example.test'].sort())
  })
  it('the server mode still applies: in allowlist mode only allowlisted addresses are in To', async () => {
    setEnv({ H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: US })
    await saveRouting(session(admin), SID, { alerts_us: `${US}\nnot.allowed@example.test` })
    const rows = await newRfq('US', 'e')
    expect(rows.map((r) => [r.to_address ?? null, r.status])).toEqual([[US, 'PENDING']])
  })
  it('the alert lists accept any domain (a Gmail address is fine); the sales address does not', async () => {
    expect(await saveRouting(session(admin), SID, { alerts_cc: 'owner@gmail.com' })).toMatchObject({ ok: true })
    expect(await saveRouting(session(admin), SID, { sales_address: 'owner@gmail.com' })).toMatchObject({ ok: false, code: 'ROUTING_SALES_DOMAIN' })
    expect(await saveRouting(session(admin), SID, { sales_address: 'sales@sub.example.test' })).toMatchObject({ ok: false, code: 'ROUTING_SALES_DOMAIN' })
    expect(await saveRouting(session(admin), SID, { sales_address: 'sales@example.test' })).toMatchObject({ ok: true })
  })
  it('the default company domains are h2ocooling.com and h2ocooling.org', () => {
    expect(salesAddressDomains({} as never)).toEqual([DEFAULT_SALES_ADDRESS.split('@')[1], 'h2ocooling.org'])
  })
  it('the sales address customers see is the setting, then the server value, then the default', async () => {
    await saveRouting(session(admin), SID, { sales_address: 'Quotes@Example.test' })
    expect(await resolveSalesAddressLive(p, { H2O_RFQ_SALES_EMAIL: 'env@example.test' } as never)).toBe('quotes@example.test')
    await saveRouting(session(admin), SID, { sales_address: '' })
    expect(await resolveSalesAddressLive(p, { H2O_RFQ_SALES_EMAIL: 'env@example.test' } as never)).toBe('env@example.test')
    expect(await readRouting(p)).toMatchObject({ sales_address: null })
  })
  it('a changed sales address sends a notice to the PREVIOUS address; a failed notice does not fail the save; alert-only changes send none', async () => {
    const notices: Array<[string, string]> = []
    const notify = async (to: string, subject: string) => void notices.push([to, subject])
    expect(await saveRouting(session(admin), SID, { sales_address: 'first@example.test' }, { notify })).toMatchObject({ ok: true })
    expect(notices).toEqual([[DEFAULT_SALES_ADDRESS, 'The sales address shown to customers was changed']])
    expect(await saveRouting(session(admin), SID, { sales_address: 'second@example.test' }, { notify })).toMatchObject({ ok: true })
    expect(notices[1]![0]).toBe('first@example.test')
    expect(await saveRouting(session(admin), SID, { sales_address: 'second@example.test', alerts_cc: 'x@example.test' }, { notify })).toMatchObject({ ok: true })
    // the alert-list change sends ITS notices (note A), but no further sales-address notice
    expect(notices.filter((n) => n[1] === 'The sales address shown to customers was changed')).toHaveLength(2)
    const failing = async () => {
      throw new Error('SMTP_DOWN')
    }
    expect(await saveRouting(session(admin), SID, { sales_address: 'third@example.test', alerts_cc: 'x@example.test' }, { notify: failing })).toMatchObject({ ok: true })
    expect(((await stored()).sales_address)).toBe('third@example.test')
    const notice = (await auditRows()).find((r) => ((r.detail as Doc).notice as Doc | undefined)?.sent === false)
    expect(notice).toBeTruthy()
  })
  it('CRM-B-4C-FIX note A: when ANY alert list changes, the previous list recipients and every admin are told; audited; a failed notice never fails the save', async () => {
    await saveRouting(session(admin), SID, { alerts_cc: 'old.one@example.test\nold.two@example.test', alerts_us: 'old.us@example.test' })
    const notices: Array<[string, string, string]> = []
    const notify = async (to: string, subject: string, body: string) => void notices.push([to, subject, body])
    expect(await saveRouting(session(admin), SID, { alerts_cc: 'new.one@example.test', alerts_us: 'old.us@example.test' }, { notify })).toMatchObject({ ok: true })
    const told = notices.map((n) => n[0]).sort()
    // the people who were on the lists before (everyone + extras) ...
    for (const a of ['old.one@example.test', 'old.two@example.test', 'old.us@example.test']) expect(told).toContain(a)
    // ... and every admin (platform-admin and client-admin users), each told once
    expect(told).toContain(String(admin.user.email))
    expect(told).toContain(String(clientAdmin.user.email))
    expect(new Set(told).size).toBe(told.length)
    expect(notices[0]![1]).toBe('Who gets new quote alerts was changed')
    expect(notices[0]![2]).toContain('everyone who gets all new quote requests') // what changed, by name
    expect(notices[0]![2]).not.toContain('old.one@example.test') // no addresses in the notice body
    const audit = (await auditRows()).find((r) => ((r.detail as Doc).notice as Doc | undefined)?.kind === 'alert-lists-changed')
    expect(audit).toBeTruthy()
    expect(String(audit!.actor)).toBe(admin.id)
    expect((audit!.detail as Doc).notice).toMatchObject({ recipients: told.length, sent: told.length, failed: 0 })
    // no notice when nothing changed, and none for a sales-address-only change
    notices.length = 0
    expect(await saveRouting(session(admin), SID, { alerts_cc: 'new.one@example.test', alerts_us: 'old.us@example.test' }, { notify })).toMatchObject({ ok: true })
    expect(await saveRouting(session(admin), SID, { alerts_cc: 'new.one@example.test', alerts_us: 'old.us@example.test', sales_address: 'quotes@example.test' }, { notify })).toMatchObject({ ok: true })
    expect(notices.every((n) => n[1] === 'The sales address shown to customers was changed')).toBe(true)
    // a failing mailer does not fail the save
    const down = async () => {
      throw new Error('SMTP_DOWN')
    }
    expect(await saveRouting(session(admin), SID, { alerts_cc: 'newer@example.test', alerts_us: 'old.us@example.test', sales_address: 'quotes@example.test' }, { notify: down })).toMatchObject({ ok: true })
    expect((await stored()).alerts_cc).toEqual(['newer@example.test'])
    const failedAudit = (await auditRows()).find((r) => ((r.detail as Doc).notice as Doc | undefined)?.failed)
    expect(failedAudit).toBeTruthy()
  })
  it('the audit entry is written FIRST: when it cannot be written, nothing is saved', async () => {
    const real = p.create.bind(p)
    const spy = vi.spyOn(p, 'create').mockImplementation(((args: { collection?: string }) => (args.collection === 'audit-log' ? Promise.reject(new Error('AUDIT_DOWN')) : real(args as never))) as never)
    try {
      expect(await saveRouting(session(admin), SID, { alerts_cc: 'a@example.test' })).toMatchObject({ ok: false, code: 'AUDIT_FAILED' })
    } finally {
      spy.mockRestore()
    }
    expect((await stored()).alerts_cc ?? null).toBeNull()
  })
})

describe('ALERTS-1: "Send test alert"', () => {
  const recorder = () => {
    const sent: MailMessage[] = []
    return { sent, send: async (_s: unknown, m: MailMessage) => void sent.push(m) }
  }
  it('sends ONE clearly labelled TEST to everyone on the lists (all in To), and is limited to one per 5 minutes', async () => {
    await saveRouting(session(admin), SID, { alerts_us: 'us@example.test', alerts_th: 'th@example.test', alerts_cc: 'cc@example.test' })
    const r = recorder()
    const now = new Date()
    const out = await sendTestAlert(session(admin), SID, { send: r.send, now })
    expect(out).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(1)
    expect(r.sent[0]!.to.split(', ').sort()).toEqual(['cc@example.test', 'th@example.test', 'us@example.test'])
    const m = r.sent[0]!
    expect(m.subject).toBe(TEST_ALERT_SUBJECT)
    expect(m.subject).toMatch(/^\[TEST\]/)
    expect(m.text).toMatch(/^TEST/)
    expect(`${m.text}${m.subject}`).not.toMatch(/https?:|\+?\d[\d\s().-]{8,}\d/)
    const again = await sendTestAlert(session(admin), SID, { send: r.send, now: new Date(now.getTime() + 20_000) })
    expect(again).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(r.sent).toHaveLength(1)
    expect(await sendTestAlert(session(admin), SID, { send: r.send, now: new Date(now.getTime() + 4 * 60_000) })).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    // A refused click stays counted (admit), so a burst throttles itself: the next one is allowed 5 minutes after the last click.
    await grantStepUp(admin, new Date(now.getTime() + 9 * 60_000)) // the step-up itself lasts only 5 minutes
    expect(await sendTestAlert(session(admin), SID, { send: r.send, now: new Date(now.getTime() + 4 * 60_000 + 301_000) })).toMatchObject({ ok: true })
    expect(r.sent).toHaveLength(2)
  })
  it('is audited with the actor, and its recipients are only the configured lists (no address can be supplied)', async () => {
    await saveRouting(session(admin), SID, { alerts_cc: 'team@example.test' })
    const r = recorder()
    expect(await sendTestAlert(session(admin), SID, { send: r.send, now: new Date() })).toMatchObject({ ok: true })
    expect(r.sent.map((m) => m.to)).toEqual(['team@example.test'])
    const rows = await auditRows()
    const test = rows.find((x) => (x.detail as Doc).test)
    expect(test).toBeTruthy()
    expect(String(test!.actor)).toBe(admin.id)
    expect((test!.detail as Doc).test).toMatchObject({ recipients: 1, sent: 1, failed: 0 })
    // The function takes no recipient: whatever else is in the deps, it only ever sends to the lists.
    expect(sendTestAlert.length).toBeLessThanOrEqual(3)
  })
  it('the limiter is atomic: parallel clicks never send more than one test', async () => {
    await saveRouting(session(admin), SID, { alerts_cc: 'cc@example.test' })
    const r = recorder()
    const now = new Date()
    const out = await Promise.all(Array.from({ length: 4 }, () => sendTestAlert(session(admin), SID, { send: r.send, now })))
    // admit() counts every click first, so a burst may even refuse all of them; it can never let two through
    expect(out.filter((o) => o.ok).length).toBeLessThanOrEqual(1)
    expect(r.sent.length).toBeLessThanOrEqual(1)
  })
  it('never reaches a customer: with no setting it goes to the server default list only; with mail off nothing is sent', async () => {
    const r = recorder()
    expect(await sendTestAlert(session(admin), SID, { send: r.send })).toMatchObject({ ok: true })
    expect(r.sent.map((m) => m.to)).toEqual([ENV_ALERT])
    setEnv({ H2O_EMAIL_MODE: 'off' })
    const r2 = recorder()
    expect(await sendTestAlert(session(admin), SID, { send: r2.send, now: new Date(Date.now() + 120_000) })).toMatchObject({ ok: false, code: 'MODE_BLOCKS_TEST' })
    expect(r2.sent).toHaveLength(0)
  })
})

describe('R2-06: a changed SMTP password turns the profile off until it is checked again', () => {
  const deps = { verify: async () => undefined, resolve: async () => [{ address: '93.184.216.34' }] }
  const base = { name: 'Synthetic profile', preset: 'CUSTOM', use: 'TRANSACTIONAL', host: 'smtp.example.test', port: '587', tls_servername: 'smtp.example.test', username: 'box@example.test', from_address: 'sales@example.test', from_name: 'ICS Sales Team' }
  async function activeProfile() {
    setEnv({ H2O_SETTINGS_KEY: 'synthetic-settings-key-0000000000000000000000', H2O_EMAIL_SENDER_DOMAINS: 'example.test' })
    const s = session(admin)
    const saved = await saveProfile(s, SID, { ...base, password: 'first-password' }, deps)
    const id = (saved as { id?: string }).id!
    expect(await checkProfile(s, SID, id, deps)).toMatchObject({ ok: true })
    expect(await setProfileActive(s, SID, id, true, deps)).toMatchObject({ ok: true })
    return { s, id }
  }
  it('settings changes name WHO made them: the audit actor is the signed-in admin, with from → to', async () => {
    const { id } = await activeProfile()
    const rows = (await p.find({ collection: 'audit-log', where: { and: [{ collection: { equals: 'crm-sending-profiles' } }, { docId: { equals: id } }] }, sort: 'createdAt', limit: 50, ...srv })).docs as unknown as Doc[]
    expect(rows.length).toBeGreaterThanOrEqual(3)
    for (const r of rows) expect(String(r.actor)).toBe(admin.id)
    const turnedOn = rows.find((r) => (((r.detail as Doc).transitions as Doc | undefined)?.active as Doc | undefined)?.to === true)
    expect(turnedOn).toBeTruthy()
    expect((((turnedOn!.detail as Doc).transitions as Doc).active as Doc).from).toBe(false)
    const checked = rows.find((r) => (((r.detail as Doc).transitions as Doc | undefined)?.last_check_state as Doc | undefined)?.to === 'OK')
    expect(checked).toBeTruthy()
    expect(String(checked!.actor)).toBe(admin.id)
  })
  it('password-only change: the profile goes off and its check is cleared', async () => {
    const { s, id } = await activeProfile()
    expect(await saveProfile(s, SID, { ...base, id, password: 'second-password' }, deps)).toMatchObject({ ok: true })
    const doc = (await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv })) as unknown as Doc
    expect(doc.active).toBe(false)
    expect(doc.last_check_state ?? null).toBeNull()
  })
  it('an active profile whose check is not OK is refused (fails closed, no fallback to the server profile)', async () => {
    const { id } = await activeProfile()
    await p.update({ collection: 'crm-sending-profiles' as never, id, data: { last_check_state: null } as never, ...srv })
    const r = await resolveSending(p, readEmailConfig(), 'TRANSACTIONAL', Date.now() + 120_000)
    expect(r).toMatchObject({ ok: false, code: 'PROFILE_NOT_CHECKED' })
  })
  it('a check that finishes after the profile was changed is thrown away', async () => {
    const { s, id } = await activeProfile()
    let changed = false
    const slow = {
      ...deps,
      verify: async () => {
        if (!changed) {
          changed = true
          await saveProfile(s, SID, { ...base, id, password: 'third-password' }, deps)
        }
      },
    }
    expect(await checkProfile(s, SID, id, slow)).toMatchObject({ ok: false, code: 'PROFILE_CHANGED' })
    const doc = (await p.findByID({ collection: 'crm-sending-profiles' as never, id, ...srv })) as unknown as Doc
    expect(doc.last_check_state ?? null).toBeNull()
    expect(doc.active).toBe(false)
  })
})
