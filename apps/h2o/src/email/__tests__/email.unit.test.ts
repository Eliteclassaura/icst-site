import { describe, expect, it, vi } from 'vitest'
import { emailKey } from '../../crm/normalize'
import { planRfqNotifications } from '../../crm/notify'
import { evaluateTransactionalSend, type LedgerRow } from '../../crm/suppression'
import { EmailSendError, makeSendEmail } from '../adapter'
import { emailConfigState, parseFrom, readEmailConfig, recipientKey } from '../config'
import { MAX_ATTEMPTS, failureCode, gateRecipient, nextAttemptAt, recipientRef } from '../gate'
import { renderPasswordReset, renderSalesAlert, textToHtml } from '../messages'
import { greetingFor, renderTemplate, responseSentence, SEED_TEMPLATES } from '../templates'
import { smtpOptions, type MailMessage } from '../transport'

const BASE = {
  H2O_EMAIL_FROM: 'H2O RFQ Desk <rfq@example.test>',
  H2O_EMAIL_ALLOWLIST: 'Owner.Synthetic@Example.test, qa.synthetic@example.test',
  H2O_SALES_ALERT_TO: 'sales.synthetic@example.test',
  H2O_SMTP_HOST: 'stalwart',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'notifications',
  H2O_SMTP_PASS: 'synthetic-password',
  H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
}

describe('config: H2O_EMAIL_MODE fails closed', () => {
  it('defaults to off, and off is a ready state', () => {
    const c = readEmailConfig({})
    expect(c.mode).toBe('off')
    expect(c.errors).toEqual([])
    expect(c.smtp).toBeNull()
    expect(emailConfigState(c)).toBe('off')
  })
  it('allowlist with a complete configuration is on, with the allowlist keyed case-insensitively', () => {
    const c = readEmailConfig({ ...BASE, H2O_EMAIL_MODE: 'allowlist' })
    expect(c.mode).toBe('allowlist')
    expect([...c.allowlist]).toEqual(['owner.synthetic@example.test', 'qa.synthetic@example.test'])
    expect(c.smtp).toMatchObject({ host: 'stalwart', port: 587, servername: 'mail.example.test' })
    expect(emailConfigState(c)).toBe('ok')
  })
  it.each([
    [{ H2O_EMAIL_MODE: 'yes' }, 'EMAIL_MODE_INVALID'],
    [{ H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: '' }, 'EMAIL_ALLOWLIST_EMPTY'],
    [{ H2O_EMAIL_MODE: 'live', H2O_SMTP_PASS: '' }, 'SMTP_CREDENTIALS_MISSING'],
    [{ H2O_EMAIL_MODE: 'live', H2O_SMTP_TLS_SERVERNAME: '' }, 'SMTP_TLS_SERVERNAME_MISSING'],
    [{ H2O_EMAIL_MODE: 'live', H2O_SMTP_PORT: '25' }, 'SMTP_PORT_NOT_SUBMISSION'],
    [{ H2O_EMAIL_MODE: 'live', H2O_EMAIL_FROM: 'not an address' }, 'EMAIL_FROM_MISSING_OR_INVALID'],
    [{ H2O_EMAIL_MODE: 'live', H2O_SALES_ALERT_TO: 'nope' }, 'SALES_ALERT_TO_INVALID'],
    [{ H2O_EMAIL_MODE: 'live', H2O_EMAIL_CUSTOMER_ACK: 'maybe' }, 'CUSTOMER_ACK_FLAG_INVALID'],
  ])('%o → off with %s (never a partial send configuration)', (over, code) => {
    const c = readEmailConfig({ ...BASE, ...over })
    expect(c.mode).toBe('off')
    expect(c.smtp).toBeNull()
    expect(c.errors).toContain(code)
    expect(emailConfigState(c)).toBe('fail')
  })
  it('the error list holds codes only, never a configured value', () => {
    const c = readEmailConfig({ ...BASE, H2O_EMAIL_MODE: 'live', H2O_SMTP_PORT: '2525', H2O_SMTP_PASS: '' })
    expect(JSON.stringify(c.errors)).not.toMatch(/synthetic|stalwart|2525|example/)
  })
  it('parses the sender and refuses header injection in the display name', () => {
    expect(parseFrom('H2O RFQ Desk <rfq@example.test>')).toEqual({
      name: 'H2O RFQ Desk',
      address: 'rfq@example.test',
    })
    // Owner decision 2026-10-05: the default display name for the sales mailbox.
    expect(parseFrom('rfq@example.test')).toEqual({ name: 'Rhonda Miller', address: 'rfq@example.test' })
    expect(parseFrom('Evil\r\nBcc: x@example.test <rfq@example.test>')).toBeNull()
  })
  it('recipientKey is the suppression ledger key (crm/normalize emailKey().matchKey)', () => {
    for (const a of [
      'J.Doe+RFQ@Example.COM',
      ' a@b.example ',
      'x@bücher.example',
      'bad',
      'a@b',
      'user@sub.Example.Test.',
    ])
      expect(recipientKey(a)).toBe(emailKey(a)?.matchKey ?? null)
  })
})

describe('send gate', () => {
  const allow = readEmailConfig({ ...BASE, H2O_EMAIL_MODE: 'allowlist' })
  it('off suppresses everyone', () => {
    expect(gateRecipient({ mode: 'off', allowlist: allow.allowlist }, 'owner.synthetic@example.test')).toBe(
      'SUPPRESSED_BY_MODE',
    )
  })
  it('allowlist sends only to listed addresses (case-insensitive) and suppresses the rest', () => {
    expect(gateRecipient(allow, 'OWNER.synthetic@example.test')).toBe('SEND')
    expect(gateRecipient(allow, 'customer.synthetic@example.test')).toBe('SUPPRESSED_BY_MODE')
  })
  it('live sends to any valid address; an invalid address is never sent', () => {
    expect(gateRecipient({ mode: 'live', allowlist: new Set() }, 'customer.synthetic@example.test')).toBe(
      'SEND',
    )
    expect(gateRecipient({ mode: 'live', allowlist: new Set() }, 'not-an-address')).toBe('INVALID_RECIPIENT')
  })
})

describe('PII-safe vocabulary', () => {
  it('recipientRef is stable, keyed and does not contain the address', () => {
    const a = recipientRef('Owner.Synthetic@example.test', 's1')
    expect(a).toBe(recipientRef('owner.synthetic@example.test', 's1'))
    expect(a).not.toBe(recipientRef('owner.synthetic@example.test', 's2'))
    expect(a).toMatch(/^r_[0-9a-f]{20}$/)
    expect(a).not.toMatch(/owner|example/)
  })
  it('failureCode keeps codes and drops message text (which can hold the address or a banner)', () => {
    const smtp = Object.assign(new Error('550 5.1.1 <customer.synthetic@example.test>: user unknown'), {
      code: 'EENVELOPE',
      responseCode: 550,
      command: 'RCPT TO',
    })
    expect(failureCode(smtp)).toEqual({ code: 'SMTP_550_RCPT_TO', klass: 'PERMANENT' })
    expect(failureCode(Object.assign(new Error('451 try later'), { responseCode: 451 }))).toEqual({
      code: 'SMTP_451',
      klass: 'TRANSIENT',
    })
    expect(
      failureCode(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:587'), { code: 'ESOCKET' })),
    ).toEqual({ code: 'ESOCKET', klass: 'TRANSIENT' })
    expect(failureCode(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))).toEqual({
      code: 'EAUTH',
      klass: 'TRANSIENT',
    })
    expect(failureCode(Object.assign(new Error('x'), { code: 'evil code <a@b.example>' }))).toEqual({
      code: 'UNKNOWN',
      klass: 'TRANSIENT',
    })
    expect(failureCode(new Error('boom')).code).toBe('UNKNOWN')
  })
  it('retry schedule: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, then dead-letter after 7 attempts', () => {
    const now = new Date('2026-10-05T12:00:00Z')
    expect(
      [1, 2, 3, 4, 5, 6].map((n) => (nextAttemptAt(n, now)!.getTime() - now.getTime()) / 60_000),
    ).toEqual([1, 5, 15, 60, 180, 360])
    expect(nextAttemptAt(7, now)).toBeNull()
    expect(MAX_ATTEMPTS).toBe(7)
  })
})

describe('transport options: TLS and auth are not optional', () => {
  it('587 requires STARTTLS with a verified certificate for the configured name; logging off', () => {
    const o = smtpOptions({
      host: 'stalwart',
      port: 587,
      user: 'u',
      pass: 'p',
      servername: 'mail.example.test',
    })
    expect(o).toMatchObject({
      secure: false,
      requireTLS: true,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    expect(o.tls).toEqual({
      servername: 'mail.example.test',
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    })
    expect(o.auth).toEqual({ user: 'u', pass: 'p' })
  })
  it('465 is implicit TLS', () => {
    expect(smtpOptions({ host: 'h', port: 465, user: 'u', pass: 'p', servername: 's' })).toMatchObject({
      secure: true,
      requireTLS: false,
    })
  })
})

describe('E1 planning (who gets what, decided before anything is sent)', () => {
  const rfq = {
    canonicalId: 'c1',
    sourceSystem: 'TYPEFORM',
    submittedEmail: 'Customer.Synthetic@example.test',
  }
  const ok = { allowed: true }
  const cfg = (over: Record<string, string>) => readEmailConfig({ ...BASE, ...over })
  it('manual entries and other sources get nothing', () => {
    for (const s of ['MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYNTHETIC_FIXTURE', undefined])
      expect(planRfqNotifications(cfg({ H2O_EMAIL_MODE: 'live' }), { ...rfq, sourceSystem: s }, ok)).toEqual(
        [],
      )
  })
  it('off: every message is SUPPRESSED_BY_MODE (the acknowledgement switch is checked first)', () => {
    const p = planRfqNotifications(cfg({ H2O_EMAIL_MODE: 'off', H2O_EMAIL_CUSTOMER_ACK: 'on' }), rfq, ok)
    expect(p.map((x) => [x.kind, x.status, x.code])).toEqual([
      ['RFQ_SALES_ALERT', 'SUPPRESSED_BY_MODE', 'MODE_OFF'],
      ['RFQ_CUSTOMER_ACK', 'SUPPRESSED_BY_MODE', 'MODE_OFF'],
    ])
  })
  it('allowlist: the allowlisted sales address is queued; a non-allowlisted customer is suppressed', () => {
    const p = planRfqNotifications(
      cfg({
        H2O_EMAIL_MODE: 'allowlist',
        H2O_EMAIL_ALLOWLIST: 'sales.synthetic@example.test',
        H2O_EMAIL_CUSTOMER_ACK: 'on',
      }),
      rfq,
      ok,
    )
    expect(p.map((x) => [x.kind, x.status])).toEqual([
      ['RFQ_SALES_ALERT', 'PENDING'],
      ['RFQ_CUSTOMER_ACK', 'SUPPRESSED_BY_MODE'],
    ])
  })
  it('the acknowledgement stays off until the owner approves the text', () => {
    const p = planRfqNotifications(cfg({ H2O_EMAIL_MODE: 'live' }), rfq, ok)
    expect(p.find((x) => x.kind === 'RFQ_CUSTOMER_ACK')).toMatchObject({
      status: 'SUPPRESSED_ACK_DISABLED',
      code: 'CUSTOMER_ACK_OFF',
    })
  })
  it('suppression wins over the gate; an invalid or missing address is never sent', () => {
    const live = cfg({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_CUSTOMER_ACK: 'on' })
    expect(
      planRfqNotifications(live, rfq, { allowed: false, blockedBy: ['SUPPRESSED_DO_NOT_CONTACT'] }).at(-1),
    ).toMatchObject({
      status: 'SUPPRESSED_BY_SUPPRESSION',
      code: 'SUPPRESSED_DO_NOT_CONTACT',
    })
    for (const e of [null, '', 'not-an-address'])
      expect(planRfqNotifications(live, { ...rfq, submittedEmail: e }, ok).at(-1)).toMatchObject({
        status: 'SUPPRESSED_NO_RECIPIENT',
        to: null,
      })
  })
  it('one sales-alert row per recipient; none configured is recorded, not silently skipped', () => {
    const two = planRfqNotifications(
      cfg({
        H2O_EMAIL_MODE: 'live',
        H2O_SALES_ALERT_TO: 'a.synthetic@example.test,b.synthetic@example.test',
      }),
      rfq,
      ok,
    )
    const alerts = two.filter((x) => x.kind === 'RFQ_SALES_ALERT')
    expect(alerts).toHaveLength(2)
    expect(new Set(alerts.map((a) => a.key)).size).toBe(2)
    const none = planRfqNotifications(cfg({ H2O_EMAIL_MODE: 'live', H2O_SALES_ALERT_TO: '' }), rfq, ok)
    expect(none[0]).toMatchObject({
      kind: 'RFQ_SALES_ALERT',
      status: 'SUPPRESSED_NO_RECIPIENT',
      code: 'SALES_ALERT_TO_UNSET',
    })
  })
  it('idempotency keys are stable per RFQ (and per sales recipient) and contain no address', () => {
    const a = planRfqNotifications(
      cfg({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_CUSTOMER_ACK: 'on' }),
      rfq,
      ok,
      's',
    )
    const b = planRfqNotifications(
      cfg({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_CUSTOMER_ACK: 'on' }),
      rfq,
      ok,
      's',
    )
    expect(a.map((x) => x.key)).toEqual(b.map((x) => x.key))
    expect(a.map((x) => x.key).join(' ')).not.toMatch(/@|synthetic/)
    expect(a.find((x) => x.kind === 'RFQ_CUSTOMER_ACK')!.key).toBe('rfq-customer-ack:c1')
  })
})

describe('transactional suppression (customer acknowledgement)', () => {
  const row = (id: string, reason: string, scope: string, action = 'APPLY', clears?: string): LedgerRow =>
    ({ id, action, reason, scope, clears }) as never
  it('a marketing-only suppression does not block a transactional message', () => {
    expect(evaluateTransactionalSend([row('1', 'UNSUBSCRIBED', 'MARKETING_EMAIL')], true)).toEqual({
      allowed: true,
    })
  })
  it('do-not-contact, legal, bounce, invalid address and all-email scopes block', () => {
    for (const [r, s] of [
      ['DO_NOT_CONTACT', 'MARKETING_EMAIL'],
      ['LEGAL_PROHIBITION', 'MARKETING_EMAIL'],
      ['HARD_BOUNCE', 'MARKETING_EMAIL'],
      ['INVALID_ADDRESS', 'MARKETING_EMAIL'],
      ['COMPLAINT', 'ALL_EMAIL'],
      ['COMPLAINT', 'ALL_OUTREACH'],
    ])
      expect(evaluateTransactionalSend([row('1', r!, s!)], true).allowed, `${r} ${s}`).toBe(false)
  })
  it('fails closed without an active transaction', () => {
    expect(evaluateTransactionalSend([], false)).toEqual({
      allowed: false,
      blockedBy: ['TRANSACTIONAL_REQUIRES_ACTIVE_TRANSACTION'],
    })
  })
})

describe('E1 messages', () => {
  // Patch C: T1 is rendered from the approved template (seed = the OGCS copy), through the template engine.
  const T1 = SEED_TEMPLATES.find((t) => t.code === 'T1')!
  const t1 = (first: string | null, promise: string | null) => {
    const r = renderTemplate(T1, { rfq_number: 'RFQ-20261005-ABC123', greeting: greetingFor(first), response_sentence: responseSentence(promise) })
    if (!r.ok) throw new Error(r.code)
    return { ...r, html: textToHtml(r.text) }
  }
  const ack = t1('Pat', 'within one business day')
  const noPromise = t1(null, null)
  it('T1 (OGCS copy): the reference, the owner\'s one-business-day promise, and never a price or outcome', () => {
    expect(ack.subject).toBe('We received your request: RFQ RFQ-20261005-ABC123')
    expect(ack.text).toContain('Hi Pat,')
    expect(ack.text).toContain('respond within one business day.')
    expect(ack.text).not.toMatch(/\$|€|£|price|guarantee|24 ?h|48 ?h/i)
    // Promise switched off: no time is promised at all.
    expect(noPromise.text).toMatch(/^Hello,/)
    expect(noPromise.text).not.toMatch(/within|hours?\b|days?\b|business day/i)
  })
  it('T1 is exactly the wording the owner approved on 2026-10-05 (as returned with Patch L), and is seeded approved', () => {
    expect(T1.approved).toBe(true)
    expect(ack.text).toBe(
      "Hi Pat,\n\nThank you for contacting Industrial Cooling Solutions. We've received your request and logged it as RFQ RFQ-20261005-ABC123.\n\n" +
        'A member of our team will review it and respond within one business day.\n\n' +
        'If you have drawings, nameplate photos or earlier inspection reports, reply to this email and attach them. They help us scope your request accurately.\n\n' +
        'The ICS team\nIndustrial Cooling Solutions (ICS)\n',
    )
    // T1 is the only approved transactional seed; the E1.1 sequence seeds (owner-accepted copy) are approved too.
    expect(SEED_TEMPLATES.filter((t) => t.approved && t.purpose === 'TRANSACTIONAL').map((t) => t.code)).toEqual(['T1'])
    expect(SEED_TEMPLATES.filter((t) => t.approved && t.purpose === 'SEQUENCE').map((t) => t.code)).toEqual(['E11_QUAL_1', 'E11_QUAL_2', 'E11_MISS_1', 'E11_MISS_2'])
  })
  it('T1 echoes only the RFQ number and a one-line first name, never markup or a second line', () => {
    const hostile = t1('<b>Pat</b>\nBcc: x@example.test', null)
    expect(hostile.text.split('\n')[0]).toBe('Hello,')
    expect(hostile.html).not.toContain('Pat')
    expect(t1("Ngozi O'Neil-Phạm", null).text).toMatch(/^Hi Ngozi O'Neil-Phạm,/)
  })
  it('the sales alert carries the RFQ, company, product, page and CRM link, and no customer message body', () => {
    const a = renderSalesAlert({
      rfqNumber: 'RFQ-1',
      company: 'Northwind Synthetic',
      products: ['Fan blade'],
      pagePath: '/product/fan/',
      ctaPlacement: 'rfq_page',
      crmUrl: 'https://crm.example.test/crm/rfqs/1/',
    })
    expect(a.subject).toBe('New RFQ RFQ-1')
    expect(a.subject).not.toContain('Northwind')
    for (const s of [
      'Northwind Synthetic',
      'Fan blade',
      '/product/fan/',
      'rfq_page',
      'https://crm.example.test/crm/rfqs/1/',
    ])
      expect(a.text).toContain(s)
  })
  it('untrusted fields cannot inject headers or markup', () => {
    const a = renderSalesAlert({
      rfqNumber: 'RFQ-1\r\nBcc: x@example.test',
      company: '<script>alert(1)</script>',
      products: [],
      pagePath: null,
      ctaPlacement: null,
      crmUrl: 'u',
    })
    expect(a.subject).not.toMatch(/[\r\n]/)
    expect(a.html).not.toContain('<script>')
    expect(a.html).toContain('&lt;script&gt;')
  })
  it('the password reset carries the link and says when it expires', () => {
    const r = renderPasswordReset('https://admin.example.test/admin/reset/abc')
    expect(r.text).toContain('https://admin.example.test/admin/reset/abc')
    expect(r.text).toContain('1 hour')
  })
})

describe('Payload adapter (password reset path)', () => {
  type Ev = { event: string; kind: string; code?: string | null; recipient_ref?: string | null }
  const fakePayload = () => {
    const events: Ev[] = []
    return {
      events,
      payload: { create: vi.fn(async ({ data }: { data: Ev }) => (events.push(data), data)) } as never,
    }
  }
  const html = renderPasswordReset('https://admin.example.test/admin/reset/SECRET-TOKEN-123').html
  it('off: suppresses, records DIRECT_SUPPRESSED, and never touches a transport', async () => {
    const { events, payload } = fakePayload()
    const send = makeSendEmail(payload, readEmailConfig({}), null)
    expect(await send({ to: 'owner.synthetic@example.test', subject: 'Reset your password', html })).toEqual({
      sent: 0,
      suppressed: 1,
    })
    expect(events).toEqual([
      expect.objectContaining({ event: 'DIRECT_SUPPRESSED', kind: 'PAYLOAD_AUTH', code: 'MODE_OFF' }),
    ])
  })
  it('allowlist: sends to an allowlisted address (text derived from HTML, auto-submitted), suppresses others', async () => {
    const { events, payload } = fakePayload()
    const sent: MailMessage[] = []
    const send = makeSendEmail(payload, readEmailConfig({ ...BASE, H2O_EMAIL_MODE: 'allowlist' }), {
      send: async (m) => (sent.push(m), { messageId: '<x@y>', accepted: 1 }),
      close: () => undefined,
    })
    expect(
      await send({
        to: ['owner.synthetic@example.test', 'stranger.synthetic@example.test'],
        subject: 'Reset your password',
        html,
      }),
    ).toEqual({ sent: 1, suppressed: 1 })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe('owner.synthetic@example.test')
    expect(sent[0]!.text).toContain('/admin/reset/SECRET-TOKEN-123')
    expect(sent[0]!.headers!['Auto-Submitted']).toBe('auto-generated')
    expect(events.map((e) => e.event)).toEqual(['DIRECT_SENT', 'DIRECT_SUPPRESSED'])
    // The audit trail never holds the address, the subject, the link or the token.
    expect(JSON.stringify(events)).not.toMatch(/owner|stranger|example|Reset|SECRET-TOKEN/)
  })
  it('a transport failure becomes a code-only EmailSendError and a DIRECT_FAILED event', async () => {
    const { events, payload } = fakePayload()
    const boom = Object.assign(new Error('535 5.7.8 auth failed for notifications@example.test'), {
      code: 'EAUTH',
      responseCode: 535,
    })
    const send = makeSendEmail(payload, readEmailConfig({ ...BASE, H2O_EMAIL_MODE: 'allowlist' }), {
      send: async () => Promise.reject(boom),
      close: () => undefined,
    })
    const err = await send({ to: 'owner.synthetic@example.test', subject: 's', html }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(EmailSendError)
    expect(String((err as Error).message)).toBe('EMAIL_SEND_FAILED SMTP_535')
    expect(events).toEqual([expect.objectContaining({ event: 'DIRECT_FAILED', code: 'SMTP_535' })])
  })
})
