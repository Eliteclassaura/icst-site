import { describe, expect, it } from 'vitest'
import { attachmentsOf, bodyOf, classify, cleanText, htmlToText, tokensIn } from '../../crm/inbound'
import { isRoleMailbox, readInboundConfig } from '../config'
import type { JmapEmail } from '../jmap'

const CTX = { roleLocal: 'rfq', domain: 'example.test' }
const TOKEN = 'abcdefghijklmnopqrstuvwxyz'
const mail = (over: Partial<JmapEmail> = {}): JmapEmail => ({
  id: 'M1',
  from: [{ name: 'Avery', email: 'avery.synthetic@northwind.example.com' }],
  to: [{ email: `rfq+${TOKEN}@example.test` }],
  subject: 'Re: Your request',
  ...over,
})

describe('M3 classification: only a live token links; nothing by name', () => {
  it('a reply to the token address is a TOKEN match (case-insensitive)', () => {
    expect(classify(mail(), CTX)).toEqual({ kind: 'TOKEN', token: TOKEN })
    expect(classify(mail({ to: [{ email: `RFQ+${TOKEN.toUpperCase()}@Example.TEST` }] }), CTX)).toEqual({
      kind: 'TOKEN',
      token: TOKEN,
    })
    expect(
      classify(
        mail({ to: [{ email: 'someone@example.test' }], cc: [{ email: `rfq+${TOKEN}@example.test` }] }),
        CTX,
      ),
    ).toEqual({ kind: 'TOKEN', token: TOKEN })
  })
  it.each([
    ['no token (plain role address)', { to: [{ email: 'rfq@example.test' }] }, 'NO_TOKEN'],
    ['token at another domain', { to: [{ email: `rfq+${TOKEN}@evil.example` }] }, 'NO_TOKEN'],
    ['token for another local part', { to: [{ email: `sales+${TOKEN}@example.test` }] }, 'NO_TOKEN'],
    [
      'two different tokens',
      {
        to: [{ email: `rfq+${TOKEN}@example.test` }, { email: 'rfq+zyxwvutsrqponmlkjihgfedcb@example.test' }],
      },
      'MULTIPLE_TOKENS',
    ],
    ['malformed token', { to: [{ email: 'rfq+short@example.test' }] }, 'UNKNOWN_TOKEN'],
    ['auto-submitted (out of office)', { 'header:Auto-Submitted:asText': ' auto-replied' }, 'AUTO_SUBMITTED'],
    ['precedence bulk', { 'header:Precedence:asText': 'bulk' }, 'BULK'],
    ['mailing list', { 'header:List-Id:asText': '<list.example>' }, 'BULK'],
    ['spam-flagged', { 'header:X-Spam-Status:asText': 'Yes, score=9.1' }, 'SPAM'],
    ['our own address (loop)', { from: [{ email: 'rfq@example.test' }] }, 'OWN_ADDRESS'],
  ] as Array<[string, Partial<JmapEmail>, string]>)('%s → review %s', (_l, over, reason) => {
    expect(classify(mail(over), CTX)).toEqual({ kind: 'REVIEW', reason })
  })
  it('Auto-Submitted: no is a person', () => {
    expect(classify(mail({ 'header:Auto-Submitted:asText': 'no' }), CTX).kind).toBe('TOKEN')
  })
  it('the display name is never used: a matching name without the token is still NO_TOKEN', () => {
    expect(classify(mail({ to: [{ name: `rfq+${TOKEN}`, email: 'rfq@example.test' }] }), CTX)).toEqual({
      kind: 'REVIEW',
      reason: 'NO_TOKEN',
    })
  })
  it('tokensIn ignores everything but To/Cc at our role and domain', () => {
    expect(tokensIn(mail({ from: [{ email: `rfq+${TOKEN}@example.test` }], to: [] }), CTX)).toEqual([])
  })
})

describe('M3 untrusted content', () => {
  it('HTML becomes text: scripts, styles, comments and tags removed; entities decoded; no markup survives', () => {
    const t = htmlToText(
      '<style>p{}</style><script>alert(1)</script><p>Hello &amp; <b>welcome</b></p><!-- x --><img src=x onerror=alert(1)>Line&lt;2&gt;',
    )
    expect(t).toBe('Hello & welcome\nLine<2>')
    expect(t).not.toMatch(/<(script|img|p|b)\b|alert|onerror/)
  })
  it('text keeps newlines and drops control characters; bounded', () => {
    expect(cleanText('a\u0000b\r\nc\u0007\td')).toBe('ab\nc\td')
    expect(cleanText('x'.repeat(60_000))).toHaveLength(50_000)
  })
  it('the plain-text part wins; HTML is used only when there is no text', () => {
    const e = mail({
      textBody: [{ partId: '1', type: 'text/plain' }],
      htmlBody: [{ partId: '2', type: 'text/html' }],
      bodyValues: { '1': { value: 'plain' }, '2': { value: '<p>html</p>' } },
    })
    expect(bodyOf(e)).toBe('plain')
    expect(bodyOf({ ...e, textBody: [] })).toBe('html')
  })
  it('attachments: name, type and size only (content never fetched)', () => {
    expect(
      attachmentsOf(
        mail({
          attachments: [{ name: 'spec\u0000.pdf', type: 'application/pdf', size: 1234, blobId: 'B1' }],
        }),
      ),
    ).toEqual([{ name: 'spec.pdf', type: 'application/pdf', size: 1234 }])
  })
})

describe('M3 inbound configuration', () => {
  const base = {
    H2O_EMAIL_FROM: 'H2O <rfq@example.test>',
    H2O_SMTP_HOST: 'stalwart',
    H2O_SMTP_USER: 'rfq@example.test',
    H2O_SMTP_PASS: 'p',
    H2O_SMTP_TLS_SERVERNAME: 'mail.example.test',
  }
  it('off by default', () =>
    expect(readInboundConfig({})).toEqual({ enabled: false, errors: [], settings: null }))
  it('on: internal HTTPS on 443 by default, same account and TLS name, role local part and domain from the sender', () => {
    expect(readInboundConfig({ ...base, H2O_EMAIL_INBOUND: 'on' }).settings).toEqual({
      protocol: 'jmap',
      host: 'stalwart',
      port: 443,
      user: 'rfq@example.test',
      pass: 'p',
      servername: 'mail.example.test',
      mailbox: null,
      roleLocal: 'rfq',
      domain: 'example.test',
    })
  })
  it('on but incomplete: not enabled, with codes', () => {
    const c = readInboundConfig({ ...base, H2O_EMAIL_INBOUND: 'on', H2O_SMTP_TLS_SERVERNAME: '' })
    expect(c).toMatchObject({ enabled: false, errors: ['SMTP_TLS_SERVERNAME_MISSING'] })
  })
  it('Patch C IMAP (Google Workspace): 993 TLS, the submission account by default, app-password spaces removed, INBOX', () => {
    const c = readInboundConfig({ ...base, H2O_EMAIL_INBOUND: 'on', H2O_INBOUND_PROTOCOL: 'imap', H2O_IMAP_HOST: 'imap.gmail.com', H2O_SMTP_PASS: 'abcd efgh ijkl mnop' })
    expect(c.enabled).toBe(true)
    expect(c.settings).toMatchObject({ protocol: 'imap', host: 'imap.gmail.com', port: 993, servername: 'imap.gmail.com', mailbox: 'INBOX', user: 'rfq@example.test', pass: 'abcdefghijklmnop', roleLocal: 'rfq', domain: 'example.test' })
  })
  it.each([
    [{ H2O_INBOUND_PROTOCOL: 'pop3' }, 'INBOUND_PROTOCOL_INVALID'],
    [{ H2O_INBOUND_PROTOCOL: 'imap' }, 'IMAP_HOST_MISSING'],
    [{ H2O_INBOUND_PROTOCOL: 'imap', H2O_IMAP_HOST: 'imap.gmail.com', H2O_IMAP_PORT: '143' }, 'IMAP_PORT_NOT_TLS'],
    [{ H2O_INBOUND_PROTOCOL: 'imap', H2O_IMAP_HOST: 'imap.gmail.com', H2O_IMAP_MAILBOX: 'In"box' }, 'IMAP_MAILBOX_INVALID'],
  ])('IMAP misconfiguration %o → off with %s', (over, code) => {
    const c = readInboundConfig({ ...base, H2O_EMAIL_INBOUND: 'on', ...over })
    expect(c.enabled).toBe(false)
    expect(c.errors).toContain(code)
  })
})

/**
 * T-R2 (CT, 2026-10-06): a login that is not the role mailbox (e.g. the owner's own Workspace account sending as the
 * sales@ alias) must read a named label. INBOX and All Mail would pull personal mail into the CRM: refused, and
 * inbound stays off. Synthetic addresses only.
 */
describe('T-R2: personal-INBOX guard', () => {
  const owner = {
    H2O_EMAIL_INBOUND: 'on',
    H2O_INBOUND_PROTOCOL: 'imap',
    H2O_IMAP_HOST: 'imap.gmail.com',
    H2O_IMAP_USER: 'owner.synthetic@example.com',
    H2O_IMAP_PASS: 'abcd efgh ijkl mnop',
    H2O_EMAIL_FROM: 'Rhonda Miller <sales@example.test>',
  }
  it.each([undefined, 'INBOX', 'inbox', ' Inbox ', '[Gmail]/All Mail', '[GMAIL]/ALL MAIL', '[Google Mail]/All Mail'])(
    'a personal login reading %o is refused; inbound stays off',
    (mailbox) => {
      const c = readInboundConfig({ ...owner, ...(mailbox === undefined ? {} : { H2O_IMAP_MAILBOX: mailbox }) })
      expect(c).toMatchObject({ enabled: false, settings: null })
      expect(c.errors).toContain('IMAP_PERSONAL_INBOX_REFUSED')
    },
  )
  it('a personal login reading a named label is allowed (the owner setup: label H2O-CRM, From sales@)', () => {
    const c = readInboundConfig({ ...owner, H2O_IMAP_MAILBOX: 'H2O-CRM' })
    expect(c.errors).toEqual([])
    expect(c.settings).toMatchObject({ protocol: 'imap', host: 'imap.gmail.com', user: 'owner.synthetic@example.com', pass: 'abcdefghijklmnop', mailbox: 'H2O-CRM', roleLocal: 'sales', domain: 'example.test' })
  })
  it('the role mailbox itself may read INBOX (case, spaces and a +tag in From do not matter)', () => {
    for (const user of ['sales@example.test', ' SALES@Example.TEST ']) {
      const c = readInboundConfig({ ...owner, H2O_IMAP_USER: user, H2O_EMAIL_FROM: 'Rhonda Miller <Sales+desk@Example.test>' })
      expect(c.errors, user).toEqual([])
      expect(c.enabled, user).toBe(true)
    }
    expect(isRoleMailbox('sales@example.test', 'sales+desk@example.test')).toBe(true)
    expect(isRoleMailbox('sales.team@example.test', 'sales@example.test')).toBe(false)
    expect(isRoleMailbox('sales@example.com', 'sales@example.test')).toBe(false)
    expect(isRoleMailbox('sales@example.test', 'not-an-address')).toBe(false)
  })
  it('JMAP (the role account on Stalwart) is not affected', () => {
    const c = readInboundConfig({ H2O_EMAIL_INBOUND: 'on', H2O_EMAIL_FROM: 'H2O <rfq@example.test>', H2O_SMTP_HOST: 'stalwart', H2O_SMTP_USER: 'other@example.test', H2O_SMTP_PASS: 'p', H2O_SMTP_TLS_SERVERNAME: 'mail.example.test' })
    expect(c.errors).toEqual([])
    expect(c.settings?.protocol).toBe('jmap')
  })
})
