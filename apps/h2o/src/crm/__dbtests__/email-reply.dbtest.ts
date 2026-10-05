import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { readEmailConfig } from '../../email/config'
import { drainOutbox } from '../../email/outbox-worker'
import type { MailMessage, MailTransport } from '../../email/transport'
import {
  SYNTHETIC_FIELD_MAP,
  SYNTHETIC_FORM_ID,
  SYNTHETIC_SECRET,
  signed,
  typeformDelivery,
} from '../fixtures/synthetic'
import { uuidv7 } from '../ids'
import { REPLY_TOKEN_RE, composeReply, replyReadiness } from '../reply'
import { loadRfq } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { captureLogs, payload, resetCrm, rest, user, type TestUser } from './harness'

/**
 * CRM email M2 (Control Tower 2026-10-04): replies from the CRM, end to end against Postgres. The compose
 * layer runs as real Admin/Sales sessions; the outbox worker hands messages to a recording transport.
 * Synthetic only.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser, viewer: TestUser
let S: CrmSession, A: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const CUSTOMER = 'avery.synthetic@northwind.example.com'
const INGEST = {
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
}
const MAIL = {
  H2O_EMAIL_FROM: 'H2O RFQ Desk <rfq@example.test>',
  H2O_SALES_ALERT_TO: '',
  H2O_SMTP_HOST: 'stalwart',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'rfq@example.test',
  H2O_SMTP_PASS: 'synthetic-submission-password',
  H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
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
const mode = (m: 'off' | 'allowlist' | 'live', allow = CUSTOMER) =>
  setEnv({ ...MAIL, H2O_EMAIL_MODE: m, H2O_EMAIL_ALLOWLIST: allow, H2O_EMAIL_CUSTOMER_ACK: 'off' })

async function newRfq(spec: Parameters<typeof typeformDelivery>[0] = {}): Promise<string> {
  const s = signed(typeformDelivery(spec), SYNTHETIC_SECRET)
  const res = await (
    POST as never as (r: Request, c: { params: Promise<{ slug: string[] }> }) => Promise<Response>
  )(
    new Request(new URL('/api/crm/intake/typeform/', 'http://127.0.0.1:3200'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'typeform-signature': s.signature },
      body: s.raw,
    }),
    { params: Promise.resolve({ slug: ['crm', 'intake', 'typeform'] }) },
  )
  expect(res.status).toBe(200)
  const number = ((await res.json()) as Doc).rfq_number
  return String(
    (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: number } }, ...srv })).docs[0]!.id,
  )
}
const compose = (s: CrmSession, rfqId: string, over: Record<string, unknown> = {}) =>
  composeReply(
    s,
    {
      rfqId,
      subject: 'Your request',
      body: 'Hello,\n\nThank you. We are reviewing it.\n\nRiley',
      token: uuidv7(),
      ...over,
    },
    new Date(),
    readEmailConfig(),
  )
const messages = async (rfqId?: string) =>
  (
    await p.find({
      collection: 'crm-email-messages',
      where: rfqId ? { rfq: { equals: rfqId } } : {},
      sort: 'occurred_at',
      limit: 50,
      ...srv,
    })
  ).docs as unknown as Doc[]
const outboxReplies = async () =>
  (
    await p.find({
      collection: 'crm-email-outbox',
      where: { kind: { equals: 'RFQ_REPLY' } },
      sort: 'createdAt',
      limit: 50,
      ...srv,
    })
  ).docs as unknown as Doc[]
const tokens = async () =>
  (await p.find({ collection: 'crm-reply-tokens', limit: 50, ...srv })).docs as unknown as Doc[]
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
  ;[admin, sales, viewer] = await Promise.all([user('platform-admin'), user('sales'), user('viewer')])
  S = crmSessionFor(p, sales.user)!
  A = crmSessionFor(p, admin.user)!
})
beforeEach(async () => {
  await resetCrm()
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  setEnv(INGEST)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('NETWORK_FORBIDDEN_IN_CRM_TESTS')
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

describe('E2 compose → send', () => {
  it('a sales user replies; the message is recorded, queued, and sent from the role address with the RFQ token Reply-To', async () => {
    mode('allowlist')
    const rfqId = await newRfq()
    const cap = captureLogs(p)
    let t: ReturnType<typeof recorder>
    try {
      const out = await compose(S, rfqId, { subject: 'Your request\r\nBcc: x@example.test' })
      expect(out).toMatchObject({ ok: true, message: expect.stringMatching(/queued/i) })
      t = recorder()
      expect(await drain(t)).toMatchObject({ sent: 1 })
    } finally {
      cap.restore()
    }
    const [m] = await messages(rfqId)
    const rfq = (await p.findByID({ collection: 'crm-rfqs', id: rfqId, ...srv })) as unknown as Doc
    expect(m).toMatchObject({
      direction: 'OUTBOUND',
      status: 'SENT',
      to_address: CUSTOMER,
      from_address: 'rfq@example.test',
      subject: 'Your request Bcc: x@example.test',
    })
    expect(String(m!.author)).toBe(String(sales.id))
    expect(String(m!.body_text)).toContain(`Reference: ${String(rfq.rfq_number)}`)
    expect(m!.sent_at).toBeTruthy()
    const [tok] = await tokens()
    expect(String(tok!.token)).toMatch(REPLY_TOKEN_RE)
    const sent = t!.sent[0]!
    expect(sent.to).toBe(CUSTOMER)
    expect(sent.from).toBe('"H2O RFQ Desk" <rfq@example.test>')
    expect(sent.replyTo).toBe(`rfq+${String(tok!.token)}@example.test`)
    expect(sent.messageId).toBe(m!.message_id)
    expect(sent.subject).not.toMatch(/[\r\n]/)
    expect(sent.headers ?? {}).not.toHaveProperty('Auto-Submitted') // a person wrote it
    expect(sent.html).toContain('<p>Hello,</p>')
    const acts = (
      await p.find({
        collection: 'crm-activities',
        where: { type: { equals: 'EMAIL_REPLY' } },
        sort: 'occurred_at',
        ...srv,
      })
    ).docs as unknown as Doc[]
    expect(acts.map((a) => [a.summary, a.actor_kind])).toEqual([
      ['Email reply queued', 'USER'],
      ['Email reply sent', 'SYSTEM'],
    ])
    expect(String(acts[0]!.actor)).toBe(String(sales.id))
    // Logs and the activity timeline carry no address, subject or body.
    const logs = [...cap.lines, ...consoleLines, JSON.stringify(acts)].join('\n')
    expect(logs).not.toMatch(/avery|northwind|Thank you|We are reviewing|example\.test>/)
  })
  it('a second reply reuses the RFQ token and threads after the first (In-Reply-To / References)', async () => {
    mode('allowlist')
    const rfqId = await newRfq()
    await compose(S, rfqId)
    const t = recorder()
    await drain(t)
    await compose(A, rfqId, { subject: 'Following up' })
    await drain(t)
    const [first, second] = await messages(rfqId)
    expect(await tokens()).toHaveLength(1)
    expect(t.sent[0]!.replyTo).toBe(t.sent[1]!.replyTo)
    expect(second!.in_reply_to).toBe(first!.message_id)
    expect(t.sent[1]!.inReplyTo).toBe(first!.message_id)
    expect(t.sent[1]!.references).toBe(first!.message_id)
    expect(String(second!.author)).toBe(String(admin.id))
  })
  it('a double submit of the same form is one message', async () => {
    mode('allowlist')
    const rfqId = await newRfq()
    const token = uuidv7()
    const [a, b] = await Promise.all([compose(S, rfqId, { token }), compose(S, rfqId, { token })])
    expect(a.ok && b.ok).toBe(true)
    expect(await messages(rfqId)).toHaveLength(1)
    expect(await outboxReplies()).toHaveLength(1)
  })
  it('an expired or revoked token is replaced, never reused', async () => {
    mode('allowlist')
    const rfqId = await newRfq()
    await compose(S, rfqId)
    const [tok] = await tokens()
    await p.update({
      collection: 'crm-reply-tokens',
      id: String(tok!.id),
      data: { expires_at: new Date(Date.now() - 1000).toISOString() } as never,
      ...srv,
      context: { crmServer: {} },
    })
    await compose(S, rfqId)
    const [after] = await tokens()
    expect(after!.token).not.toBe(tok!.token)
    expect(String(after!.token)).toMatch(REPLY_TOKEN_RE)
  })
})

describe('E2 refusals and the gate', () => {
  it('allowlist: a non-allowlisted customer gets nothing; the reply is saved as NOT_SENT', async () => {
    mode('allowlist', 'someone.else.synthetic@example.test')
    const rfqId = await newRfq()
    const out = await compose(S, rfqId)
    expect(out).toMatchObject({ ok: true, message: expect.stringMatching(/not sent/) })
    expect((await messages(rfqId))[0]).toMatchObject({ status: 'NOT_SENT', status_code: 'MODE_ALLOWLIST' })
    expect((await outboxReplies())[0]).toMatchObject({ status: 'SUPPRESSED_BY_MODE', to_address: null })
    const t = recorder()
    await drain(t)
    expect(t.calls).toBe(0)
  })
  it('off: nothing is sent; a posted reply is recorded NOT_SENT (MODE_OFF)', async () => {
    mode('off')
    const rfqId = await newRfq()
    expect(
      (
        await replyReadiness(
          S,
          (await p.findByID({ collection: 'crm-rfqs', id: rfqId, ...srv })) as never,
          readEmailConfig(),
        )
      ).state,
    ).toBe('MODE_OFF')
    await compose(S, rfqId)
    expect((await messages(rfqId))[0]).toMatchObject({ status: 'NOT_SENT', status_code: 'MODE_OFF' })
  })
  it('do-not-contact refuses before anything is written', async () => {
    mode('live')
    const rfqId = await newRfq()
    await p.create({
      collection: 'crm-suppressions',
      data: { address: CUSTOMER, reason: 'DO_NOT_CONTACT' } as never,
      overrideAccess: false,
      user: sales.user,
    })
    expect(await compose(S, rfqId)).toMatchObject({ ok: false, code: 'DO_NOT_CONTACT' })
    expect(await messages(rfqId)).toEqual([])
    expect(await tokens()).toEqual([])
  })
  it('suppression applied after queueing stops the send; the message becomes NOT_SENT', async () => {
    mode('live')
    const rfqId = await newRfq()
    await compose(S, rfqId)
    await p.create({
      collection: 'crm-suppressions',
      data: { address: CUSTOMER, reason: 'DO_NOT_CONTACT' } as never,
      overrideAccess: false,
      user: sales.user,
    })
    const t = recorder()
    await drain(t)
    expect(t.calls).toBe(0)
    expect((await messages(rfqId))[0]).toMatchObject({
      status: 'NOT_SENT',
      status_code: 'SUPPRESSED_DO_NOT_CONTACT',
    })
  })
  it('attachments are refused clearly; nothing is written', async () => {
    mode('live')
    const rfqId = await newRfq()
    expect(await compose(S, rfqId, { attachments: 1 })).toMatchObject({
      ok: false,
      code: 'ATTACHMENTS_NOT_SUPPORTED',
      message: expect.stringMatching(/Attachments can’t be sent/),
    })
    expect(await messages(rfqId)).toEqual([])
  })
  it('validation: subject and body are required and bounded; an invalid form token is refused', async () => {
    mode('live')
    const rfqId = await newRfq()
    expect(await compose(S, rfqId, { subject: ' ', body: '' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fields: { subject: expect.any(String), body: expect.any(String) },
    })
    expect(await compose(S, rfqId, { body: 'x'.repeat(20_001) })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await compose(S, rfqId, { token: 'not-a-uuid' })).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    })
    expect(await messages(rfqId)).toEqual([])
  })
  it('no valid customer address: refused', async () => {
    mode('live')
    const rfqId = await newRfq({ email: null })
    expect(await compose(S, rfqId)).toMatchObject({ ok: false, code: 'NO_ADDRESS' })
  })
  it('a failed send is retried, then the message is marked FAILED', async () => {
    mode('live')
    const rfqId = await newRfq()
    await compose(S, rfqId)
    const t = recorder(() => Object.assign(new Error('550 rejected'), { responseCode: 550 }))
    await drain(t)
    expect((await messages(rfqId))[0]).toMatchObject({ status: 'FAILED', status_code: 'SMTP_550' })
    const acts = (
      await p.find({ collection: 'crm-activities', where: { type: { equals: 'EMAIL_REPLY' } }, ...srv })
    ).docs as unknown as Doc[]
    expect(acts.map((a) => a.summary)).toContain('Email reply failed')
  })
})

describe('E2 access', () => {
  it('only CRM users (Admin, Sales) can compose; viewers have no CRM session at all', () => {
    expect(crmSessionFor(p, viewer.user)).toBeNull()
  })
  it('CRM users read the conversation with the RFQ; the reply token and Reply-To are admin-only; nobody writes through REST', async () => {
    mode('allowlist')
    const rfqId = await newRfq()
    await compose(S, rfqId)
    const asSales = await rest.get('crm-email-messages', sales.token)
    expect(asSales.status).toBe(200)
    const doc = (asSales.body.docs as Doc[])[0]!
    expect(doc.subject).toBe('Your request')
    expect(doc.reply_to).toBeUndefined()
    expect([401, 403]).toContain((await rest.get('crm-reply-tokens', sales.token)).status)
    expect((await rest.get('crm-reply-tokens', admin.token)).status).toBe(200)
    for (const slug of ['crm-email-messages', 'crm-reply-tokens'])
      expect([401, 403]).toContain((await rest.post(slug, admin.token, { subject: 'x' })).status)
    expect([401, 403]).toContain(
      (await rest.patch(`crm-email-messages/${String(doc.id)}`, admin.token, { status: 'SENT' })).status,
    )
    for (const slug of ['crm-email-messages', 'crm-reply-tokens'])
      expect([401, 403]).toContain((await rest.get(slug, null)).status)
  })
  it('the RFQ detail shows the conversation to the workspace', async () => {
    mode('allowlist')
    const rfqId = await newRfq()
    await compose(S, rfqId)
    const d = await loadRfq(S, rfqId)
    expect(d!.messages).toEqual([
      expect.objectContaining({
        direction: 'OUTBOUND',
        status: 'QUEUED',
        subject: 'Your request',
        authorName: expect.any(String),
      }),
    ])
  })
})
