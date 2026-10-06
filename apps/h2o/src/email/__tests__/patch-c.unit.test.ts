import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bodyOf, classify } from '../../crm/inbound'
import type { InboundSettings } from '../config'
import { authenticate, imapMailbox, ImapSession, mailboxKey, parseFetch } from '../imap'
import { fakeServer, mail, memoryCursor, msg, type Box } from './fake-imap'
import { decodeWords, parseAddresses, parseMessage, parseParams } from '../mime'
import { guardHost, isPublicAddress, normaliseHost } from '../net-guard'
import { checkProfileShape, openProfile, passwordContext } from '../profiles'
import { seal, SettingsKeyError, unseal } from '../settings-key'
import { choicesOf, lintTemplate, renderTemplate, responseSentence, SEED_TEMPLATES, templateHash } from '../templates'

/**
 * Patch C unit tests: MIME → JMAP shape, the IMAP reader against an in-memory server, the host guard, sealed settings,
 * templates (lint, choices, fail-closed rendering, approval hash) and sending-profile validation. Synthetic data only.
 */

describe('MIME parser (IMAP messages → the JMAP shape M3 already stores)', () => {
  it('plain message: headers, encoded words, addresses with quotes, comments and groups, ids without brackets', () => {
    const e = parseMessage(
      msg([
        'From: "Doe, Pat (Plant)" <pat.synthetic@example.test>',
        'To: Sales Team: sales+abcdefghijklmnopqrstuvwxyz@example.org, other@example.test;',
        'Cc: ops@example.test (Ops desk)',
        'Subject: =?UTF-8?B?UmU6IFlvdXIgcmVxdWVzdA==?= =?ISO-8859-1?Q?_caf=E9?=',
        'Message-ID: <m1@example.test>',
        'In-Reply-To: <out1@example.org>',
        'References: <a@example.org>',
        ' <out1@example.org>',
        'Date: Mon, 05 Oct 2026 10:00:00 +0000',
        '',
        'Hello there',
        '',
      ]),
      'imap:k:1:7',
    )
    expect(e.subject).toBe('Re: Your request café')
    expect(e.from).toEqual([{ name: 'Doe, Pat (Plant)', email: 'pat.synthetic@example.test' }])
    expect(e.to!.map((a) => a.email)).toEqual(['sales+abcdefghijklmnopqrstuvwxyz@example.org', 'other@example.test'])
    expect(e.cc).toEqual([{ name: 'Ops desk', email: 'ops@example.test' }])
    expect([e.messageId, e.inReplyTo, e.references]).toEqual([['m1@example.test'], ['out1@example.org'], ['a@example.org', 'out1@example.org']])
    expect(e.receivedAt).toBe('2026-10-05T10:00:00.000Z')
    expect(bodyOf(e)).toBe('Hello there')
  })

  it('multipart/mixed with alternative: text preferred, quoted-printable and base64, charsets; attachments by name only', () => {
    const e = parseMessage(
      msg([
        'From: a@example.test',
        'Content-Type: multipart/mixed; boundary="OUT"',
        '',
        'preamble',
        '--OUT',
        'Content-Type: multipart/alternative; boundary=ALT',
        '',
        '--ALT',
        'Content-Type: text/plain; charset=iso-8859-1',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'Gr=FC=DFe aus K=F6ln, a long line that is=',
        ' softly broken',
        '--ALT',
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('<p>Grüße <b>aus</b> Köln</p>').toString('base64'),
        '--ALT--',
        '--OUT',
        'Content-Type: application/pdf; name="=?UTF-8?Q?Angebot_=C3=A4.pdf?="',
        'Content-Disposition: attachment',
        'Content-Transfer-Encoding: base64',
        '',
        'JVBERi0xLjQK',
        '--OUT',
        "Content-Type: image/png",
        "Content-Disposition: inline; filename*=utf-8''nameplate%20%E2%91%A0.png",
        '',
        'xx',
        '--OUT--',
      ]),
      'imap:k:1:8',
    )
    expect(bodyOf(e)).toBe('Grüße aus Köln, a long line that is softly broken')
    expect(e.attachments!.map((a) => [a.name, a.type])).toEqual([
      ['Angebot ä.pdf', 'application/pdf'],
      ['nameplate ①.png', 'image/png'],
    ])
    // Attachment content is never decoded into a body value.
    expect(JSON.stringify(e.bodyValues)).not.toContain('JVBER')
  })

  it('HTML-only mail reduces to text; truncated input (2 MB cap) still parses; an unknown charset falls back to UTF-8', () => {
    const html = parseMessage(msg(['Content-Type: text/html; charset=x-unknown-cs', '', '<p>Hi<script>alert(1)</script> team</p>']), 'imap:k:1:9')
    expect(bodyOf(html)).toBe('Hi team')
    const cut = parseMessage(msg(['Content-Type: multipart/mixed; boundary=B', '', '--B', 'Content-Type: text/plain', '', 'first part only, then the fetch limit']), 'imap:k:1:10')
    expect(bodyOf(cut)).toBe('first part only, then the fetch limit')
  })

  it('auto-replies, lists and spam flags reach the existing M3 classification', () => {
    const ctx = { roleLocal: 'sales', domain: 'example.org' }
    const auto = parseMessage(msg(['From: x@example.test', 'To: sales+abcdefghijklmnopqrstuvwxyz@example.org', 'Auto-Submitted: auto-replied', '', 'away']), 'imap:k:1:11')
    expect(classify(auto, ctx)).toEqual({ kind: 'REVIEW', reason: 'AUTO_SUBMITTED' })
    const list = parseMessage(msg(['From: x@example.test', 'To: sales+abcdefghijklmnopqrstuvwxyz@example.org', 'List-Id: <news.example.test>', '', 'n']), 'imap:k:1:12')
    expect(classify(list, ctx)).toEqual({ kind: 'REVIEW', reason: 'BULK' })
    const ok = parseMessage(msg(['From: x@example.test', 'To: "Sales" <SALES+ABCDEFGHIJKLMNOPQRSTUVWXYZ@Example.org>', '', 'hi']), 'imap:k:1:13')
    expect(classify(ok, ctx)).toEqual({ kind: 'TOKEN', token: 'abcdefghijklmnopqrstuvwxyz' })
  })

  it('parameter and word decoding edge cases', () => {
    expect(parseParams('text/plain; charset="utf-8"; format=flowed').params).toEqual({ charset: 'utf-8', format: 'flowed' })
    expect(parseParams("attachment; filename*0*=utf-8''a%20b; filename*1=c.txt").params.filename).toBe('a bc.txt')
    expect(decodeWords('=?utf-8?q?no_close')).toBe('=?utf-8?q?no_close')
    expect(parseAddresses('undisclosed-recipients:;')).toEqual([])
  })
})

const SETTINGS: InboundSettings = {
  protocol: 'imap',
  host: 'imap.example.test',
  port: 993,
  user: 'rfq@example.test',
  pass: 'app-pass',
  servername: 'imap.example.test',
  mailbox: 'INBOX',
  roleLocal: 'rfq',
  domain: 'example.org',
}
describe('IMAP reader (in-memory server)', () => {
  it('first run starts from now: the existing mailbox is never imported', async () => {
    const box: Box = { uidvalidity: 7, messages: new Map([[1, mail(1)], [2, mail(2)]]) }
    const cursor = memoryCursor()
    let srv = fakeServer(box)
    const mb = imapMailbox(SETTINGS, { cursor, connect: async () => (srv = fakeServer(box)).stream })
    expect(await mb.fetchNew(25)).toEqual([])
    expect(cursor.data.get(mailboxKey(SETTINGS))).toEqual({ uidvalidity: 7, lastUid: 2 })
    // Read-only: EXAMINE (never SELECT), no STORE / COPY / MOVE / EXPUNGE, ever.
    expect(srv.commands.join('\n')).toMatch(/EXAMINE "INBOX"/)
    expect(srv.commands.join('\n')).not.toMatch(/SELECT|STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE/)
  })

  it('reads new mail after the cursor, advances only past stored messages, re-reads a failed one', async () => {
    const box: Box = { uidvalidity: 7, messages: new Map([[1, mail(1)]]) }
    const cursor = memoryCursor()
    const connect = async () => fakeServer(box).stream
    const mb = imapMailbox(SETTINGS, { cursor, connect })
    await mb.fetchNew(25) // start point
    box.messages.set(2, mail(2))
    box.messages.set(3, mail(3))
    box.messages.set(4, mail(4))
    const got = await mb.fetchNew(25)
    expect(got.map((e) => e.subject)).toEqual(['reply 2', 'reply 3', 'reply 4'])
    expect(got[0]!.id).toBe(`${mailboxKey(SETTINGS)}:7:2`)
    expect(got[0]!.receivedAt).toBe('2026-10-05T10:00:00.000Z')
    // 3 failed processing: the cursor stops at 2, so 3 (and 4, a harmless duplicate) are read again.
    await mb.markIngested([got[0]!.id, got[2]!.id])
    expect(cursor.data.get(mailboxKey(SETTINGS))!.lastUid).toBe(2)
    const again = await mb.fetchNew(25)
    expect(again.map((e) => e.subject)).toEqual(['reply 3', 'reply 4'])
    await mb.markIngested(again.map((e) => e.id))
    expect(cursor.data.get(mailboxKey(SETTINGS))!.lastUid).toBe(4)
    expect(await mb.fetchNew(25)).toEqual([]) // "n:*" returning the last UID is not treated as new
  })

  it('a UIDVALIDITY change restarts from now (logged by code), never re-importing the mailbox', async () => {
    const box: Box = { uidvalidity: 7, messages: new Map([[1, mail(1)]]) }
    const cursor = memoryCursor()
    const logs: string[] = []
    const mb = imapMailbox(SETTINGS, { cursor, connect: async () => fakeServer(box).stream, log: (c) => logs.push(c) })
    await mb.fetchNew(25)
    box.uidvalidity = 8
    box.messages.set(2, mail(2))
    expect(await mb.fetchNew(25)).toEqual([])
    expect(logs).toEqual(['IMAP_UIDVALIDITY_CHANGED'])
    expect(cursor.data.get(mailboxKey(SETTINGS))).toEqual({ uidvalidity: 8, lastUid: 2 })
  })

  it('authentication: SASL-IR, PLAIN with continuation, LOGIN fallback; a refusal is one code, never the server text', async () => {
    for (const caps of ['AUTH=PLAIN SASL-IR', 'AUTH=PLAIN', '']) {
      const s = new ImapSession(fakeServer({ uidvalidity: 1, messages: new Map() }, { caps }).stream)
      await s.greeting()
      await expect(authenticate(s, 'rfq@example.test', 'app-pass')).resolves.toBeUndefined()
      s.close()
    }
    const s = new ImapSession(fakeServer({ uidvalidity: 1, messages: new Map() }, { caps: 'AUTH=PLAIN' }).stream)
    await s.greeting()
    const err = await authenticate(s, 'rfq@example.test', 'wrong').catch((e: Error) => e)
    expect(String(err)).toBe('ImapError: IMAP IMAP_AUTH_FAILED')
    expect(String(err)).not.toContain('secret-detail')
    await expect(authenticate(s, 'rfq@example.test', 'line\r\nbreak')).rejects.toThrow('IMAP_CREDENTIALS_INVALID')
    s.close()
  })

  it('FETCH parsing: literal bodies of any content, size and arrival time', () => {
    const r = parseFetch({ line: '* 3 FETCH (UID 42 RFC822.SIZE 10 INTERNALDATE "05-Oct-2026 10:00:00 +0700" BODY[]<0> \uE0000\uE000)', literals: [Buffer.from('a {9}\r\n)x')] })
    expect(r).toEqual({ uid: 42, size: 10, internalDate: '2026-10-05T03:00:00.000Z', raw: Buffer.from('a {9}\r\n)x') })
  })
})

describe('host guard (SSRF)', () => {
  const env = { H2O_SMTP_INTERNAL_HOSTS: 'stalwart' }
  it('refuses IP literals, localhost, single labels and private-looking names; allows listed internal hosts', () => {
    for (const h of ['10.0.0.1', '127.0.0.1', '::1', 'localhost', 'db', 'mail.local', 'x.internal', 'a..b', '-a.example'])
      expect(normaliseHost(h, env), h).toBeNull()
    expect(normaliseHost('SMTP.Gmail.com.', env)).toBe('smtp.gmail.com')
    expect(normaliseHost('stalwart', env)).toBe('stalwart')
  })
  it('refuses names that resolve to private, loopback, link-local, CGNAT or mapped addresses', async () => {
    for (const a of ['10.1.2.3', '172.20.0.5', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '224.0.0.1'])
      expect(isPublicAddress(a), a).toBe(false)
    for (const a of ['142.250.4.108', '2607:f8b0:4023:c06::6c']) expect(isPublicAddress(a), a).toBe(true)
    const resolve = async () => [{ address: '142.250.4.108' }, { address: '10.0.0.9' }]
    expect(await guardHost('smtp.example.test', { env, resolve })).toEqual({ ok: false, code: 'HOST_PRIVATE_ADDRESS' })
    expect(await guardHost('smtp.example.test', { env, resolve: async () => [{ address: '142.250.4.108' }] })).toEqual({ ok: true, address: '142.250.4.108', internal: false })
    expect(await guardHost('stalwart', { env, resolve: async () => [{ address: '172.18.0.4' }] })).toEqual({ ok: true, address: '172.18.0.4', internal: true })
    expect(await guardHost('nx.example.test', { env, resolve: async () => Promise.reject(new Error('ENOTFOUND')) })).toEqual({ ok: false, code: 'HOST_NOT_FOUND' })
  })
})

describe('sealed settings (H2O_SETTINGS_KEY)', () => {
  const saved = process.env.H2O_SETTINGS_KEY
  beforeEach(() => {
    process.env.H2O_SETTINGS_KEY = 'unit-test-settings-key-0000000000000000'
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.H2O_SETTINGS_KEY
    else process.env.H2O_SETTINGS_KEY = saved
  })
  it('round-trips only for the same record, never stores the plain value, refuses tampering and a changed key', () => {
    const s = seal('abcd efgh', passwordContext('p1'))
    expect(s).toMatch(/^s1\./)
    expect(s).not.toContain('abcd')
    expect(unseal(s, passwordContext('p1'))).toBe('abcd efgh')
    expect(unseal(s, passwordContext('p2'))).toBeNull()
    expect(unseal(s.slice(0, -2) + 'AA', passwordContext('p1'))).toBeNull()
    process.env.H2O_SETTINGS_KEY = 'another-settings-key-11111111111111111111'
    expect(unseal(s, passwordContext('p1'))).toBeNull()
  })
  it('fails closed without a key (no fallback to PAYLOAD_SECRET)', () => {
    delete process.env.H2O_SETTINGS_KEY
    expect(() => seal('x', 'c')).toThrow(SettingsKeyError)
  })
})

describe('sending profiles: shape and opening', () => {
  const ok = { name: 'Workspace', preset: 'GMAIL', use: 'TRANSACTIONAL', host: 'smtp.gmail.com', port: 587, tls_servername: 'smtp.gmail.com', username: 'sales@example.org', from_address: 'sales@h2ocooling.org', from_name: 'H2O Cooling' }
  it('accepts the Google Workspace preset; sender limited to the allowed domains; submission ports only', () => {
    expect(checkProfileShape(ok, {})).toBeNull()
    expect(checkProfileShape({ ...ok, from_address: 'sales@h2ocooling.com' }, {})).toBeNull()
    expect(checkProfileShape({ ...ok, from_address: 'x@example.test' }, {})?.code).toBe('PROFILE_FROM_DOMAIN_NOT_ALLOWED')
    expect(checkProfileShape({ ...ok, port: 25 }, {})?.code).toBe('PROFILE_PORT_INVALID')
    expect(checkProfileShape({ ...ok, host: '10.0.0.5' }, {})?.code).toBe('PROFILE_HOST_INVALID')
    expect(checkProfileShape({ ...ok, from_name: 'Evil" <x@y>' }, {})?.code).toBe('PROFILE_FROM_NAME_INVALID')
    expect(checkProfileShape({ ...ok, active: true }, {})?.code).toBe('PROFILE_PASSWORD_REQUIRED')
  })
  it('an active profile that cannot be opened fails closed with a code (never falls back)', async () => {
    const saved = process.env.H2O_SETTINGS_KEY
    process.env.H2O_SETTINGS_KEY = 'unit-test-settings-key-0000000000000000'
    try {
      const doc = { ...ok, id: 'p1', password_set: true, password_sealed: seal('pw', passwordContext('p1')) }
      const resolve = async () => [{ address: '142.250.4.108' }]
      const r = await openProfile(doc, { resolve, env: process.env })
      expect(r).toMatchObject({ ok: true, smtp: { host: '142.250.4.108', port: 587, user: 'sales@example.org', pass: 'pw', servername: 'smtp.gmail.com' }, fromAddress: 'sales@h2ocooling.org' })
      expect(await openProfile({ ...doc, id: 'p2' }, { resolve, env: process.env })).toMatchObject({ ok: false, code: 'PROFILE_PASSWORD_UNREADABLE' })
      expect(await openProfile(doc, { resolve, env: {} })).toMatchObject({ ok: false, code: 'SETTINGS_KEY_MISSING' })
      expect(await openProfile(doc, { resolve: async () => [{ address: '10.0.0.1' }], env: process.env })).toMatchObject({ ok: false, code: 'HOST_PRIVATE_ADDRESS' })
    } finally {
      if (saved === undefined) delete process.env.H2O_SETTINGS_KEY
      else process.env.H2O_SETTINGS_KEY = saved
    }
  })
})

describe('templates T1–T6', () => {
  const by = (c: string) => SEED_TEMPLATES.find((t) => t.code === c)!
  const values = { rfq_number: 'RFQ-1', customer_first_name: 'Pat', company: 'Plant (synthetic)', sales_rep_name: 'Dana', sales_rep_title: 'Sales engineer', office_phone: '+1 555 0100', response_sentence: responseSentence('within one business day') }
  it('every seed passes lint, is transactional, carries the footer and no price or promise words', () => {
    for (const t of SEED_TEMPLATES) {
      expect(lintTemplate(t), t.code).toEqual([])
      expect(t.purpose).toBe('TRANSACTIONAL')
      // OGCS footer on T2–T6; T1 is the owner-approved wording, which has none.
      if (t.code !== 'T1') expect(t.body).toContain('You’re receiving this email because you sent a request through h2ocooling.com.')
      expect(t.body + t.subject).not.toMatch(/\$|price|guarantee|\b(24|48) ?h/i)
      expect(t.body).not.toMatch(/@/) // no email address in any body
    }
  })
  it('T2–T6 render with the signature; T3/T5 choices — one pick for the same option set in subject and body', () => {
    const t5 = by('T5')
    expect(choicesOf(t5)).toEqual([['call', 'site visit']])
    const r = renderTemplate(t5, values, ['site visit'])
    expect(r).toMatchObject({ ok: true, subject: 'Scheduling a site visit for RFQ RFQ-1' })
    expect(r.ok && r.text).toContain("set up a site visit with your team at Plant (synthetic).")
    expect(r.ok && r.text).toContain('Dana\nSales engineer\nIndustrial Cooling Solutions (ICS)\n+1 555 0100')
    expect(renderTemplate(t5, values, ['phone call'])).toEqual({ ok: false, code: 'CHOICE_MISSING', missing: ['0'] })
  })
  it('fails closed: a required field without a value renders nothing', () => {
    expect(renderTemplate(by('T2'), { ...values, office_phone: '' })).toEqual({ ok: false, code: 'MERGE_FIELD_MISSING', missing: ['office_phone'] })
    expect(renderTemplate(by('T4'), { ...values, sales_rep_title: undefined })).toMatchObject({ ok: false, missing: ['sales_rep_title'] })
  })
  it('merge values are data: one line, no markup injection into headers', () => {
    const r = renderTemplate(by('T2'), { ...values, company: 'Evil\r\nBcc: x@example.test' })
    expect(r.ok && r.text).toContain('Evil Bcc: x@example.test')
    const s = renderTemplate({ ...by('T4'), subject: 'Re {{rfq_number}}' }, { ...values, rfq_number: 'A\nB' })
    expect(s.ok && s.subject).toBe('Re A B')
  })
  it('lint: unknown fields, unsubscribe rules, braces, choices', () => {
    const base = { subject: 'S', body: 'B', purpose: 'TRANSACTIONAL' }
    expect(lintTemplate({ ...base, body: 'Hi {{first_name}}' }).map((p) => p.code)).toEqual(['TEMPLATE_UNKNOWN_FIELD'])
    expect(lintTemplate({ ...base, purpose: 'MARKETING' }).map((p) => p.code)).toEqual(['TEMPLATE_UNSUBSCRIBE_REQUIRED'])
    expect(lintTemplate({ ...base, purpose: 'MARKETING', body: 'x {{unsubscribe_url}}' })).toEqual([])
    expect(lintTemplate({ ...base, body: 'x {{unsubscribe_url}}' }).map((p) => p.code)).toEqual(['TEMPLATE_UNSUBSCRIBE_NOT_ALLOWED'])
    expect(lintTemplate({ ...base, body: 'x {{rfq_number' }).map((p) => p.code)).toEqual(['TEMPLATE_BRACES'])
    expect(lintTemplate({ ...base, body: '{{choice:only}}' }).map((p) => p.code)).toEqual(['TEMPLATE_CHOICE_INVALID'])
  })
  it('the approval hash changes with any edit of purpose, subject or body', () => {
    const t = by('T4')
    const h = templateHash(t)
    expect(templateHash({ ...t })).toBe(h)
    expect(templateHash({ ...t, body: t.body + ' ' })).not.toBe(h)
    expect(templateHash({ ...t, subject: t.subject.toLowerCase() })).not.toBe(h)
    expect(templateHash({ ...t, purpose: 'MARKETING' })).not.toBe(h)
  })
})
