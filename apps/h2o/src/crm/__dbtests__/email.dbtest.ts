import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { readEmailConfig } from '../../email/config'
import { claimBatch, drainOutbox } from '../../email/outbox-worker'
import type { MailMessage, MailTransport } from '../../email/transport'
import {
  SYNTHETIC_FIELD_MAP,
  SYNTHETIC_FORM_ID,
  SYNTHETIC_SECRET,
  signed,
  typeformDelivery,
} from '../fixtures/synthetic'
import { uuidv7 } from '../ids'
import { createManualInquiry } from '../workspace/manualInquiry'
import { crmSessionFor } from '../workspace/session'
import { captureLogs, payload, resetCrm, rest, user, userEmail, type TestUser } from './harness'

/**
 * CRM email M1 (Control Tower 2026-10-04): the E1 outbox end to end against Postgres, through the real
 * Typeform endpoint, with a recording transport in place of the SMTP connection. Synthetic only.
 *
 * Proves: gate modes (off / allowlist / live), the acknowledgement switch, suppression at enqueue and at send,
 * idempotency (replayed webhook, double drain, concurrent claims), retry with backoff, dead-letter, the audit
 * trail, timeline entries, access (admin-only), and that no address, company, subject, body or token reaches a log.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
const srv = { overrideAccess: true as const, depth: 0 }

const CUSTOMER = 'avery.synthetic@northwind.example.com'
const OWNER = 'owner.synthetic@example.test'
const SALES_INBOX = 'sales.synthetic@example.test'
const INGEST = {
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
}
const MAIL = {
  H2O_EMAIL_FROM: 'H2O RFQ Desk <rfq@example.test>',
  H2O_SALES_ALERT_TO: SALES_INBOX,
  H2O_SMTP_HOST: 'stalwart',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'notifications',
  H2O_SMTP_PASS: 'synthetic-submission-password',
  H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
  NEXT_PUBLIC_SERVER_URL: 'https://crm.example.test',
}
const KEYS = [
  ...Object.keys(INGEST),
  ...Object.keys(MAIL),
  'H2O_EMAIL_MODE',
  'H2O_EMAIL_ALLOWLIST',
  'H2O_EMAIL_CUSTOMER_ACK',
]
let saved: Record<string, string | undefined> = {}
const setEnv = (env: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(env))
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
}
const mode = (m: 'off' | 'allowlist' | 'live', extra: Record<string, string | undefined> = {}) =>
  setEnv({
    ...MAIL,
    H2O_EMAIL_MODE: m,
    H2O_EMAIL_ALLOWLIST: `${OWNER},${SALES_INBOX}`,
    H2O_EMAIL_CUSTOMER_ACK: 'off',
    ...extra,
  })

async function deliver(spec: Parameters<typeof typeformDelivery>[0] = {}): Promise<Doc> {
  const s = signed(typeformDelivery(spec), SYNTHETIC_SECRET)
  const url = new URL('/api/crm/intake/typeform/', 'http://127.0.0.1:3200')
  const res = await (
    POST as never as (r: Request, c: { params: Promise<{ slug: string[] }> }) => Promise<Response>
  )(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'typeform-signature': s.signature },
      body: s.raw,
    }),
    { params: Promise.resolve({ slug: ['crm', 'intake', 'typeform'] }) },
  )
  expect(res.status).toBe(200)
  return (await res.json()) as Doc
}
const outbox = async () =>
  (await p.find({ collection: 'crm-email-outbox', ...srv, limit: 100, sort: 'createdAt' }))
    .docs as unknown as Doc[]
const events = async () =>
  (await p.find({ collection: 'crm-email-events', ...srv, limit: 200, sort: 'occurred_at' }))
    .docs as unknown as Doc[]
const byKind = (rows: Doc[], kind: string) => rows.filter((r) => r.kind === kind)
/** Do-not-contact, recorded the way staff record it (a sales user through the Local API with access). */
const suppress = () =>
  p.create({
    collection: 'crm-suppressions',
    data: { address: CUSTOMER, reason: 'DO_NOT_CONTACT' } as never,
    overrideAccess: false,
    user: sales.user,
  })

/** Recording transport: what would have been handed to the submission server. */
function recorder(fail?: (n: number) => unknown): MailTransport & { sent: MailMessage[]; calls: number } {
  const t = {
    sent: [] as MailMessage[],
    calls: 0,
    send: async (m: MailMessage) => {
      t.calls++
      const f = fail?.(t.calls)
      if (f) throw f
      t.sent.push(m)
      return { messageId: m.messageId ?? null, accepted: 1 }
    },
    close: () => undefined,
  }
  return t
}
const drain = (t: MailTransport | null, now = new Date()) =>
  drainOutbox(p, { cfg: readEmailConfig(), transport: t, now })

let consoleLines: string[] = []
beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
})
beforeEach(async () => {
  await resetCrm()
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  setEnv(INGEST)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('NETWORK_FORBIDDEN_IN_CRM_TESTS')
  })
  // Payload's own sendEmail (auth mail) must not be reached by the outbox path.
  vi.spyOn(p, 'sendEmail').mockImplementation(async () => {
    throw new Error('OUTBOX_MUST_NOT_USE_PAYLOAD_SENDEMAIL')
  })
  consoleLines = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, level).mockImplementation(
      (...a: unknown[]) => void consoleLines.push(a.map(String).join(' ')),
    )
})
afterEach(() => {
  setEnv(saved)
  vi.restoreAllMocks()
})

describe('E1 enqueue: decided in the RFQ transaction, by mode', () => {
  it('off (production default): both messages are recorded SUPPRESSED_BY_MODE, with no address or body kept', async () => {
    mode('off', { H2O_EMAIL_CUSTOMER_ACK: 'on' })
    const r = await deliver()
    const rows = await outbox()
    expect(rows.map((x) => [x.kind, x.status, x.last_error_code])).toEqual([
      ['RFQ_SALES_ALERT', 'SUPPRESSED_BY_MODE', 'MODE_OFF'],
      ['RFQ_CUSTOMER_ACK', 'SUPPRESSED_BY_MODE', 'MODE_OFF'],
    ])
    for (const x of rows) {
      expect(x.to_address ?? null).toBeNull()
      expect(x.body_text ?? null).toBeNull()
      expect(String(x.rfq)).toBe(
        String(r.rfq_id ?? (await p.find({ collection: 'crm-rfqs', ...srv })).docs[0]!.id),
      )
    }
    expect((await events()).map((e) => e.event)).toEqual(['SUPPRESSED', 'SUPPRESSED'])
    const t = recorder()
    expect(await drain(t)).toMatchObject({ claimed: 0 })
    expect(t.calls).toBe(0)
  })
  it('allowlist: the allowlisted sales alert is queued; the customer (not allowlisted) is SUPPRESSED_BY_MODE', async () => {
    mode('allowlist', { H2O_EMAIL_CUSTOMER_ACK: 'on' })
    await deliver()
    const rows = await outbox()
    expect(byKind(rows, 'RFQ_SALES_ALERT')[0]).toMatchObject({ status: 'PENDING', to_address: SALES_INBOX })
    expect(byKind(rows, 'RFQ_CUSTOMER_ACK')[0]).toMatchObject({
      status: 'SUPPRESSED_BY_MODE',
      to_address: null,
    })
  })
  it('allowlist with an allowlisted test customer: both queued; the acknowledgement needs the owner switch', async () => {
    mode('allowlist', { H2O_EMAIL_ALLOWLIST: `${OWNER},${SALES_INBOX},${CUSTOMER}` })
    await deliver()
    expect(byKind(await outbox(), 'RFQ_CUSTOMER_ACK')[0]).toMatchObject({ status: 'SUPPRESSED_ACK_DISABLED' })
    await resetCrm()
    mode('allowlist', {
      H2O_EMAIL_ALLOWLIST: `${OWNER},${SALES_INBOX},${CUSTOMER}`,
      H2O_EMAIL_CUSTOMER_ACK: 'on',
    })
    await deliver()
    expect(byKind(await outbox(), 'RFQ_CUSTOMER_ACK')[0]).toMatchObject({
      status: 'PENDING',
      to_address: CUSTOMER,
    })
  })
  it('an active do-not-contact suppression blocks the acknowledgement at enqueue', async () => {
    mode('live', { H2O_EMAIL_CUSTOMER_ACK: 'on' })
    await suppress()
    await deliver()
    expect(byKind(await outbox(), 'RFQ_CUSTOMER_ACK')[0]).toMatchObject({
      status: 'SUPPRESSED_BY_SUPPRESSION',
      to_address: null,
    })
  })
  it('a manually entered inquiry queues nothing', async () => {
    mode('live', { H2O_EMAIL_CUSTOMER_ACK: 'on' })
    const S = crmSessionFor(p, sales.user)!
    const r = await createManualInquiry(S, {
      token: uuidv7(),
      email: 'morgan.synthetic@example.test',
      message: 'Synthetic phone inquiry',
    })
    expect(r.ok).toBe(true)
    expect((await p.find({ collection: 'crm-rfqs', ...srv })).totalDocs).toBe(1)
    expect(await outbox()).toEqual([])
  })
  it('a replayed webhook (same event) adds no outbox rows', async () => {
    mode('allowlist')
    const spec = { eventId: 'evt-email-replay-1' }
    await deliver(spec)
    const before = await outbox()
    await deliver(spec)
    expect((await outbox()).map((x) => x.id)).toEqual(before.map((x) => x.id))
  })
})

describe('E1 send: the outbox worker', () => {
  it('sends the queued sales alert once, with a fixed Message-ID, auto-submitted, and the CRM link; logs ids only', async () => {
    mode('allowlist', {
      H2O_EMAIL_ALLOWLIST: `${OWNER},${SALES_INBOX},${CUSTOMER}`,
      H2O_EMAIL_CUSTOMER_ACK: 'on',
    })
    const cap = captureLogs(p)
    let t: ReturnType<typeof recorder>
    try {
      await deliver({ company: 'Northwind Thermal (synthetic)' })
      t = recorder()
      expect(await drain(t)).toMatchObject({ claimed: 2, sent: 2 })
      expect(await drain(t)).toMatchObject({ claimed: 0 })
    } finally {
      cap.restore()
    }
    expect(t!.sent.map((m) => m.to).sort()).toEqual([CUSTOMER, SALES_INBOX].sort())
    const alert = t!.sent.find((m) => m.to === SALES_INBOX)!
    const rows = await outbox()
    const alertRow = byKind(rows, 'RFQ_SALES_ALERT')[0]!
    expect(alert.messageId).toBe(alertRow.message_id)
    expect(alert.headers!['Auto-Submitted']).toBe('auto-generated')
    expect(alert.from).toBe('"H2O RFQ Desk" <rfq@example.test>')
    expect(alert.text).toContain(`https://crm.example.test/crm/rfqs/${String(alertRow.rfq)}/`)
    expect(alert.text).toContain('Northwind Thermal (synthetic)')
    expect(alert.text).not.toContain('fan stack replacement') // the customer's message body stays in the CRM
    expect(rows.every((x) => x.status === 'SENT' && x.sent_at && Number(x.attempts) === 1)).toBe(true)
    expect(alertRow.body_text).toBe(alert.text)
    const ev = await events()
    expect(ev.filter((e) => e.event === 'SENT')).toHaveLength(2)
    const acts = (
      await p.find({
        collection: 'crm-activities',
        where: { type: { equals: 'EMAIL_NOTIFICATION' } },
        ...srv,
      })
    ).docs as unknown as Doc[]
    expect(acts.map((a) => a.summary).sort()).toEqual(['Customer acknowledgement sent', 'Sales alert sent'])
    // Nothing personal in any log line, the audit trail, or the activity summaries.
    const logs = [
      ...cap.lines,
      ...consoleLines,
      JSON.stringify(ev),
      JSON.stringify(acts.map((a) => a.summary)),
    ].join('\n')
    expect(logs).not.toMatch(
      /avery|northwind|sales\.synthetic|owner\.synthetic|fan stack|We received|New RFQ/i,
    )
    expect(consoleLines.join('\n')).toMatch(/email outbox: claimed=2 sent=2/)
  })
  it('a transient failure is retried with backoff; not before it is due; then sent', async () => {
    mode('allowlist')
    await deliver()
    const t0 = new Date()
    const t = recorder((n) =>
      n === 1 ? Object.assign(new Error(`connect ECONNREFUSED ${SALES_INBOX}`), { code: 'ESOCKET' }) : null,
    )
    expect(await drain(t, t0)).toMatchObject({ claimed: 1, retried: 1 })
    let row = byKind(await outbox(), 'RFQ_SALES_ALERT')[0]!
    expect(row).toMatchObject({ status: 'RETRY', last_error_code: 'ESOCKET' })
    expect(new Date(String(row.next_attempt_at)).getTime() - t0.getTime()).toBe(60_000)
    expect(await drain(t, new Date(t0.getTime() + 30_000))).toMatchObject({ claimed: 0 })
    expect(await drain(t, new Date(t0.getTime() + 61_000))).toMatchObject({ claimed: 1, sent: 1 })
    row = byKind(await outbox(), 'RFQ_SALES_ALERT')[0]!
    expect(row).toMatchObject({ status: 'SENT', attempts: 2 })
    expect((await events()).map((e) => e.event)).toEqual(['QUEUED', 'SUPPRESSED', 'ATTEMPT_FAILED', 'SENT'])
    expect(consoleLines.join('\n')).not.toContain(SALES_INBOX)
  })
  it('a permanent (5xx) failure is dead-lettered immediately', async () => {
    mode('allowlist')
    await deliver()
    const t = recorder(() =>
      Object.assign(new Error(`550 5.1.1 <${SALES_INBOX}> unknown`), {
        code: 'EENVELOPE',
        responseCode: 550,
        command: 'RCPT TO',
      }),
    )
    expect(await drain(t)).toMatchObject({ dead: 1 })
    expect(byKind(await outbox(), 'RFQ_SALES_ALERT')[0]).toMatchObject({
      status: 'DEAD',
      last_error_code: 'SMTP_550_RCPT_TO',
    })
    const act = (
      await p.find({
        collection: 'crm-activities',
        where: { type: { equals: 'EMAIL_NOTIFICATION' } },
        ...srv,
      })
    ).docs as unknown as Doc[]
    expect(act.map((a) => a.summary)).toContain('Sales alert failed')
  })
  it('after the last attempt a transient failure is dead-lettered too', async () => {
    mode('allowlist')
    await deliver()
    const t = recorder(() => Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    let now = new Date()
    for (let i = 0; i < 7; i++) {
      await drain(t, now)
      now = new Date(now.getTime() + 7 * 3_600_000)
    }
    expect(t.calls).toBe(7)
    expect(byKind(await outbox(), 'RFQ_SALES_ALERT')[0]).toMatchObject({
      status: 'DEAD',
      attempts: 7,
      last_error_code: 'ETIMEDOUT',
    })
    expect(await drain(t, now)).toMatchObject({ claimed: 0 })
  })
  it('the gate is re-checked at send time: switching to off suppresses queued mail and erases its address', async () => {
    mode('allowlist')
    await deliver()
    mode('off')
    const t = recorder()
    expect(await drain(t, new Date())).toMatchObject({ claimed: 1, suppressed: 1 })
    expect(t.calls).toBe(0)
    expect(byKind(await outbox(), 'RFQ_SALES_ALERT')[0]).toMatchObject({
      status: 'SUPPRESSED_BY_MODE',
      to_address: null,
    })
  })
  it('suppression is re-checked at send time for the acknowledgement', async () => {
    mode('live', { H2O_EMAIL_CUSTOMER_ACK: 'on' })
    await deliver()
    await suppress()
    const t = recorder()
    await drain(t)
    expect(t.sent.map((m) => m.to)).toEqual([SALES_INBOX])
    expect(byKind(await outbox(), 'RFQ_CUSTOMER_ACK')[0]).toMatchObject({
      status: 'SUPPRESSED_BY_SUPPRESSION',
      to_address: null,
      body_text: null,
    })
  })
  it('two workers claiming at once never take the same row', async () => {
    mode('live', {
      H2O_SALES_ALERT_TO: Array.from({ length: 6 }, (_, i) => `s${i}.synthetic@example.test`).join(','),
      H2O_EMAIL_CUSTOMER_ACK: 'on',
    })
    await deliver()
    const now = new Date()
    const [a, b] = await Promise.all([claimBatch(p, now, 4), claimBatch(p, now, 4)])
    expect(a.length + b.length).toBe(7)
    expect(a.filter((id) => b.includes(id))).toEqual([])
  })
})

describe('outbox access', () => {
  it('admins read the outbox and its audit trail; sales cannot; nobody writes through REST', async () => {
    mode('allowlist')
    await deliver()
    expect((await rest.get('crm-email-outbox', admin.token)).status).toBe(200)
    expect((await rest.get('crm-email-events', admin.token)).status).toBe(200)
    for (const slug of ['crm-email-outbox', 'crm-email-events']) {
      expect([401, 403]).toContain((await rest.get(slug, sales.token)).status)
      expect([401, 403]).toContain((await rest.get(slug, null)).status)
      expect([401, 403]).toContain((await rest.post(slug, admin.token, { kind: 'RFQ_SALES_ALERT' })).status)
    }
    const row = (await outbox())[0]!
    expect([401, 403]).toContain(
      (await rest.patch(`crm-email-outbox/${String(row.id)}`, admin.token, { status: 'SENT' })).status,
    )
    expect([401, 403, 405]).toContain(
      (await rest.delete(`crm-email-outbox/${String(row.id)}`, admin.token)).status,
    )
  })
})

describe('password reset through Payload (allowlist mode)', () => {
  it('forgot-password is accepted, the token is never logged, and the adapter records an event', async () => {
    mode('allowlist')
    vi.mocked(p.sendEmail).mockRestore()
    const cap = captureLogs(p)
    let r
    try {
      r = await rest.post('users/forgot-password', null, { email: userEmail('sales') })
    } finally {
      cap.restore()
    }
    expect(r!.status).toBe(200)
    const u = (
      await p.find({
        collection: 'users',
        where: { email: { equals: userEmail('sales') } },
        overrideAccess: true,
        showHiddenFields: true,
      })
    ).docs[0] as unknown as Doc
    const token = String(u.resetPasswordToken ?? '')
    expect(token.length).toBeGreaterThan(10)
    expect([...cap.lines, ...consoleLines].join('\n')).not.toContain(token)
    expect([...cap.lines, ...consoleLines].join('\n')).not.toMatch(/reset\/|example\.test/i)
    const ev = (await events()).filter((e) => e.kind === 'PAYLOAD_AUTH')
    // The test Payload instance booted in `off`, so its adapter suppresses even though the gate now allows the
    // operation: two independent locks. (A live transport is proven in the staging end-to-end.)
    expect(ev.map((e) => e.event)).toEqual(['DIRECT_SUPPRESSED'])
    await p.update({
      collection: 'users',
      id: String(u.id),
      data: { resetPasswordToken: null, resetPasswordExpiration: null } as never,
      overrideAccess: true,
    })
  })
})
