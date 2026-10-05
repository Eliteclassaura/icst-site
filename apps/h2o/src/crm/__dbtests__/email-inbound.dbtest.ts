import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { POST } from '../../app/(payload)/api/[...slug]/route'
import { readEmailConfig, readInboundConfig } from '../../email/config'
import { MAX_FAILURES, pollInbound } from '../../email/inbound-poller'
import type { InboundMailbox, JmapEmail } from '../../email/jmap'
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
import { discardReviewItem, linkReviewItem } from '../inbound'
import { composeReply } from '../reply'
import { loadRfq } from '../workspace/queries'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { captureLogs, payload, resetCrm, rest, user, type TestUser } from './harness'

/**
 * CRM email M3 (Control Tower 2026-10-04): customer replies thread back into the RFQ, against Postgres, with an
 * in-memory mailbox standing in for the JMAP account. Synthetic only.
 */
type Doc = Record<string, unknown>
let p: Payload
let admin: TestUser, sales: TestUser
let S: CrmSession, A: CrmSession
const srv = { overrideAccess: true as const, depth: 0 }
const CUSTOMER = 'avery.synthetic@northwind.example.com'
const ENV = {
  H2O_CRM_TYPEFORM_INGEST_ENABLED: '1',
  H2O_CRM_TYPEFORM_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  H2O_TYPEFORM_FORM_ID: SYNTHETIC_FORM_ID,
  H2O_CRM_TYPEFORM_FIELD_MAP: JSON.stringify(SYNTHETIC_FIELD_MAP),
  H2O_EMAIL_MODE: 'allowlist',
  H2O_EMAIL_ALLOWLIST: CUSTOMER,
  H2O_EMAIL_FROM: 'H2O RFQ Desk <rfq@example.test>',
  H2O_SALES_ALERT_TO: '',
  H2O_EMAIL_CUSTOMER_ACK: 'off',
  H2O_SMTP_HOST: 'stalwart',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'rfq@example.test',
  H2O_SMTP_PASS: 'synthetic-submission-password',
  H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
  H2O_EMAIL_INBOUND: 'on',
}
let saved: Record<string, string | undefined> = {}

async function newRfq(): Promise<string> {
  const s = signed(typeformDelivery({}), SYNTHETIC_SECRET)
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
  const number = ((await res.json()) as Doc).rfq_number
  return String(
    (await p.find({ collection: 'crm-rfqs', where: { rfq_number: { equals: number } }, ...srv })).docs[0]!.id,
  )
}
/** Reply from the CRM and deliver it; returns the token address and the sent Message-ID. */
async function replied(rfqId: string): Promise<{ replyTo: string; messageId: string }> {
  await composeReply(
    S,
    { rfqId, subject: 'Your request', body: 'Hello', token: uuidv7() },
    new Date(),
    readEmailConfig(),
  )
  const sent: MailMessage[] = []
  const t: MailTransport = {
    send: async (m) => (sent.push(m), { messageId: m.messageId ?? null, accepted: 1 }),
    close: () => undefined,
  }
  await drainOutbox(p, { cfg: readEmailConfig(), transport: t })
  return { replyTo: sent[0]!.replyTo!, messageId: sent[0]!.messageId! }
}
function mailbox(
  emails: JmapEmail[],
  opts: { failGet?: boolean } = {},
): InboundMailbox & { marked: string[] } {
  const m = {
    marked: [] as string[],
    fetchNew: async () => {
      if (opts.failGet) throw Object.assign(new Error('x'), { code: 'X' })
      return emails.filter((e) => !m.marked.includes(e.id))
    },
    markIngested: async (ids: string[]) => void m.marked.push(...ids),
  }
  return m
}
const customerReply = (id: string, to: string, over: Partial<JmapEmail> = {}): JmapEmail => ({
  id,
  messageId: [`${id}@northwind.example.com`],
  from: [{ name: 'Avery Synthetic', email: CUSTOMER }],
  to: [{ email: to }],
  subject: 'Re: Your request',
  receivedAt: new Date().toISOString(),
  textBody: [{ partId: '1', type: 'text/plain' }],
  bodyValues: { '1': { value: 'Thanks. We need 4 fan blades.\n\n> Hello' } },
  ...over,
})
const poll = (mb: InboundMailbox) => pollInbound(p, { cfg: readInboundConfig(), mailbox: mb })
const inbound = async (rfqId?: string) =>
  (
    await p.find({
      collection: 'crm-email-messages',
      where: { and: [{ direction: { equals: 'INBOUND' } }, ...(rfqId ? [{ rfq: { equals: rfqId } }] : [])] },
      sort: 'occurred_at',
      ...srv,
    })
  ).docs as unknown as Doc[]
const reviewItems = async () =>
  (await p.find({ collection: 'crm-email-review', sort: 'received_at', ...srv })).docs as unknown as Doc[]

let consoleLines: string[] = []
beforeAll(async () => {
  p = await payload()
  ;[admin, sales] = await Promise.all([user('platform-admin'), user('sales')])
  S = crmSessionFor(p, sales.user)!
  A = crmSessionFor(p, admin.user)!
})
beforeEach(async () => {
  await resetCrm()
  saved = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]))
  Object.assign(process.env, ENV)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('NETWORK_FORBIDDEN_IN_CRM_TESTS')
  })
  vi.spyOn(p, 'sendEmail').mockImplementation(async () => {
    throw new Error('NO_AUTO_ACK_OF_A_REPLY')
  })
  consoleLines = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, level).mockImplementation(
      (...a: unknown[]) => void consoleLines.push(a.map(String).join(' ')),
    )
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved))
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  vi.restoreAllMocks()
})

describe('E3: a reply to the token address threads into the RFQ', () => {
  it('links, threads, records the timeline, marks the mailbox message, and sends nothing back', async () => {
    const rfqId = await newRfq()
    const { replyTo, messageId } = await replied(rfqId)
    const outboxBefore = (await p.find({ collection: 'crm-email-outbox', ...srv, limit: 0 })).totalDocs
    const mb = mailbox([
      customerReply('J1', replyTo, {
        inReplyTo: [messageId.slice(1, -1)],
        references: [messageId.slice(1, -1)],
      }),
    ])
    const cap = captureLogs(p)
    let r
    try {
      r = await poll(mb)
    } finally {
      cap.restore()
    }
    expect(r).toMatchObject({ fetched: 1, linked: 1, review: 0 })
    expect(mb.marked).toEqual(['J1'])
    const [m] = await inbound(rfqId)
    expect(m).toMatchObject({
      direction: 'INBOUND',
      status: 'RECEIVED',
      from_address: CUSTOMER,
      from_name: 'Avery Synthetic',
      subject: 'Re: Your request',
      in_reply_to: messageId,
      message_id: '<J1@northwind.example.com>',
    })
    expect(m!.body_text).toContain('We need 4 fan blades')
    expect(m!.body_html ?? null).toBeNull()
    const act = (
      await p.find({ collection: 'crm-activities', where: { type: { equals: 'EMAIL_RECEIVED' } }, ...srv })
    ).docs as unknown as Doc[]
    expect(act.map((a) => [a.summary, a.actor_kind])).toEqual([['Customer email received', 'INTEGRATION']])
    // No acknowledgement of a reply, no outbound of any kind.
    expect((await p.find({ collection: 'crm-email-outbox', ...srv, limit: 0 })).totalDocs).toBe(outboxBefore)
    expect(p.sendEmail).not.toHaveBeenCalled()
    // The workspace shows the conversation in order.
    const d = await loadRfq(S, rfqId)
    expect(d!.messages.map((x) => x.direction)).toEqual(['OUTBOUND', 'INBOUND'])
    // Logs: counts only.
    const logs = [...cap.lines, ...consoleLines].join('\n')
    expect(logs).toMatch(/email inbound: fetched=1 linked=1/)
    expect(logs).not.toMatch(/avery|northwind|fan blades|rfq\+/i)
  })
  it('idempotent: the same mailbox message (or the same Message-ID again) is stored once', async () => {
    const rfqId = await newRfq()
    const { replyTo } = await replied(rfqId)
    const e = customerReply('J2', replyTo)
    const mb = { fetchNew: async () => [e], markIngested: async () => undefined } // never marks: re-read every poll
    await pollInbound(p, { cfg: readInboundConfig(), mailbox: mb })
    expect(await pollInbound(p, { cfg: readInboundConfig(), mailbox: mb })).toMatchObject({
      duplicate: 1,
      linked: 0,
    })
    await poll(mailbox([{ ...e, id: 'J2-copy' }]))
    expect(await inbound(rfqId)).toHaveLength(1)
  })
  it('a reply with attachments: metadata only, content withheld, said so on the timeline', async () => {
    const rfqId = await newRfq()
    const { replyTo } = await replied(rfqId)
    await poll(
      mailbox([
        customerReply('J3', replyTo, {
          attachments: [{ name: 'drawing.pdf', type: 'application/pdf', size: 52_000, blobId: 'B9' }],
        }),
      ]),
    )
    const [m] = await inbound(rfqId)
    expect(m!.attachments_withheld).toEqual([{ name: 'drawing.pdf', type: 'application/pdf', size: 52_000 }])
    expect(JSON.stringify(m)).not.toContain('B9')
    const act = (
      await p.find({ collection: 'crm-activities', where: { type: { equals: 'EMAIL_RECEIVED' } }, ...srv })
    ).docs as unknown as Doc[]
    expect(act[0]!.summary).toBe('Customer email received — 1 attachment(s) withheld')
  })
  it('HTML-only mail is stored as text; markup never reaches the record', async () => {
    const rfqId = await newRfq()
    const { replyTo } = await replied(rfqId)
    await poll(
      mailbox([
        customerReply('J4', replyTo, {
          textBody: [],
          htmlBody: [{ partId: '2', type: 'text/html' }],
          bodyValues: {
            '2': { value: '<p>Yes <b>please</b></p><script>alert(1)</script><img src=x onerror=alert(1)>' },
          },
        }),
      ]),
    )
    const [m] = await inbound(rfqId)
    expect(m!.body_text).toBe('Yes please')
  })
})

describe('E3: everything else goes to the review queue — never linked by name', () => {
  it('no token, unknown token, auto-reply, spam and loops are queued, not linked', async () => {
    const rfqId = await newRfq()
    const { replyTo } = await replied(rfqId)
    await poll(
      mailbox([
        customerReply('R1', 'rfq@example.test'),
        customerReply('R2', 'rfq+zzzzzzzzzzzzzzzzzzzzzzzzzz@example.test'),
        customerReply('R3', replyTo, { 'header:Auto-Submitted:asText': 'auto-replied' }),
        customerReply('R4', replyTo, { 'header:X-Spam-Status:asText': 'Yes, score=12' }),
        customerReply('R5', replyTo, { from: [{ email: 'rfq@example.test' }] }),
        // Same sender and subject as the real thread, but no token: still not linked.
        customerReply('R6', 'rfq@example.test', {
          from: [{ name: 'Avery Synthetic', email: CUSTOMER }],
          subject: 'Re: Your request',
        }),
      ]),
    )
    expect(await inbound(rfqId)).toEqual([])
    expect((await reviewItems()).map((i) => String(i.reason)).sort()).toEqual([
      'AUTO_SUBMITTED',
      'NO_TOKEN',
      'NO_TOKEN',
      'OWN_ADDRESS',
      'SPAM',
      'UNKNOWN_TOKEN',
    ])
  })
  it('an expired or revoked token is queued with the RFQ it pointed at, for an admin to decide', async () => {
    const rfqId = await newRfq()
    const { replyTo } = await replied(rfqId)
    const tok = (await p.find({ collection: 'crm-reply-tokens', ...srv })).docs[0] as unknown as Doc
    await p.update({
      collection: 'crm-reply-tokens',
      id: String(tok.id),
      data: { revoked_at: new Date().toISOString() } as never,
      ...srv,
      context: { crmServer: {} },
    })
    await poll(mailbox([customerReply('X1', replyTo)]))
    expect(await inbound(rfqId)).toEqual([])
    expect((await reviewItems())[0]).toMatchObject({ reason: 'EXPIRED_TOKEN', state: 'OPEN', rfq: rfqId })
  })
  it('an admin links a review item by RFQ number; it then appears on the RFQ, once', async () => {
    const rfqId = await newRfq()
    const rfq = (await p.findByID({ collection: 'crm-rfqs', id: rfqId, ...srv })) as unknown as Doc
    await poll(mailbox([customerReply('L1', 'rfq@example.test')]))
    const [item] = await reviewItems()
    expect(
      await linkReviewItem(S, { reviewId: String(item!.id), rfqNumber: String(rfq.rfq_number) }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(
      await linkReviewItem(A, { reviewId: String(item!.id), rfqNumber: 'RFQ-00000000-NOPE' }),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(
      await linkReviewItem(A, { reviewId: String(item!.id), rfqNumber: String(rfq.rfq_number) }),
    ).toMatchObject({ ok: true })
    expect(
      await linkReviewItem(A, { reviewId: String(item!.id), rfqNumber: String(rfq.rfq_number) }),
    ).toMatchObject({ ok: false, code: 'ALREADY_RESOLVED' })
    expect(await inbound(rfqId)).toHaveLength(1)
    expect((await reviewItems())[0]).toMatchObject({
      state: 'LINKED',
      rfq: rfqId,
      resolved_by: String(admin.id),
    })
    const act = (
      await p.find({ collection: 'crm-activities', where: { type: { equals: 'EMAIL_RECEIVED' } }, ...srv })
    ).docs as unknown as Doc[]
    expect(act.map((a) => [a.summary, a.actor_kind, String(a.actor)])).toEqual([
      ['Customer email received (linked by an admin)', 'USER', String(admin.id)],
    ])
  })
  it('an admin discards a review item; sales cannot', async () => {
    await poll(mailbox([customerReply('D1', 'rfq@example.test')]))
    const [item] = await reviewItems()
    expect(await discardReviewItem(S, { reviewId: String(item!.id) })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(await discardReviewItem(A, { reviewId: String(item!.id) })).toMatchObject({ ok: true })
    expect((await reviewItems())[0]).toMatchObject({ state: 'DISCARDED' })
  })
  it('the review queue is admin-only; nobody writes it through REST', async () => {
    await poll(mailbox([customerReply('Q1', 'rfq@example.test')]))
    expect((await rest.get('crm-email-review', admin.token)).status).toBe(200)
    expect([401, 403]).toContain((await rest.get('crm-email-review', sales.token)).status)
    expect([401, 403]).toContain((await rest.get('crm-email-review', null)).status)
    expect([401, 403]).toContain(
      (await rest.post('crm-email-review', admin.token, { reason: 'NO_TOKEN' })).status,
    )
  })
})

describe('E3: the poller is robust', () => {
  it('off: does nothing', async () => {
    process.env.H2O_EMAIL_INBOUND = 'off'
    expect(
      await pollInbound(p, {
        cfg: readInboundConfig(),
        mailbox: mailbox([customerReply('O1', 'rfq@example.test')]),
      }),
    ).toBeNull()
  })
  it('a mailbox outage is logged as a code and nothing is written', async () => {
    expect(await poll(mailbox([], { failGet: true }))).toMatchObject({ fetched: 0 })
    expect(consoleLines.join('\n')).toMatch(/email inbound: fetch failed/)
  })
  it(`a message that keeps failing is queued as PROCESSING_FAILED after ${MAX_FAILURES} attempts, so it cannot block the mailbox`, async () => {
    const bad = customerReply('P1', 'rfq@example.test')
    const spy = vi.spyOn(p, 'create')
    spy.mockImplementation((async (args: never) => {
      const a = args as { collection: string; data: { reason?: string } }
      if (a.collection === 'crm-email-review' && a.data.reason !== 'PROCESSING_FAILED')
        throw new Error('db hiccup')
      spy.mockRestore()
      return p.create(args)
    }) as never)
    const mb = mailbox([bad])
    for (let i = 0; i < MAX_FAILURES; i++) await poll(mb)
    expect(mb.marked).toEqual(['P1'])
    expect((await reviewItems())[0]).toMatchObject({ reason: 'PROCESSING_FAILED' })
  })
})
