import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '../../auth/mfa/keys'
import { HTML_LIMIT, htmlToText, reportedMessageIds } from '../../crm/inbound'
import { parseOne } from '../imap'
import { MAX_PARAM_CHARS, parseMessage, parseParams } from '../mime'
import { seal, unseal } from '../settings-key'

/** SEC-CRM-1 (Security Auditor R1): the auditor's crafted inputs, synthetic, against the inbound parsers and the seals. */
const saved = { s: process.env.H2O_SETTINGS_KEY, p: process.env.PAYLOAD_SECRET }
beforeAll(() => {
  process.env.H2O_SETTINGS_KEY = 'unit-test-settings-key-0000000000000000'
  process.env.PAYLOAD_SECRET ??= 'unit-test-only-synthetic-secret-0000000000'
})
afterAll(() => {
  if (saved.s === undefined) delete process.env.H2O_SETTINGS_KEY
  else process.env.H2O_SETTINGS_KEY = saved.s
})

const ms = (f: () => void) => {
  const t = performance.now()
  f()
  return performance.now() - t
}

describe('finding 22: a huge header parameter cannot throw', () => {
  it('a 500 KB unencoded continuation parameter parses (capped), never a RangeError', () => {
    const big = 'A'.repeat(500_000)
    const out = parseParams(`text/plain; name*0="${big}"; name*1="tail"`)
    expect(out.value).toBe('text/plain')
    expect(out.params.name!.length).toBeLessThanOrEqual(MAX_PARAM_CHARS)
    expect(out.params.name!.startsWith('AAAA')).toBe(true)
  })
  it('a 500 KB percent-encoded and a 500 KB plain parameter are capped too; normal names are unchanged', () => {
    expect(parseParams(`attachment; filename*=utf-8''${'%41'.repeat(200_000)}`).params.filename!.length).toBeLessThanOrEqual(MAX_PARAM_CHARS)
    expect(parseParams(`attachment; filename="${'B'.repeat(500_000)}"`).params.filename!.length).toBeLessThanOrEqual(MAX_PARAM_CHARS + 2)
    expect(parseParams(`attachment; filename*=utf-8''%E2%82%AC%20rates.pdf`).params.filename).toBe('€ rates.pdf')
    expect(parseParams('attachment; filename*0="spec"; filename*1="-sheet.pdf"').params.filename).toBe('spec-sheet.pdf')
  })
  it('the whole message with that header parses', () => {
    const raw = Buffer.from(`From: a@northwind.example.com\r\nTo: rfq@example.test\r\nSubject: x\r\nContent-Type: text/plain; name*0="${'A'.repeat(200_000)}"\r\n\r\nhello\r\n`)
    expect(() => parseMessage(raw, 'm1')).not.toThrow()
  })
  it('parseOne never throws: an unparseable input becomes a parse-failure stub with its id', () => {
    const stub = parseOne(null as unknown as Buffer, 'acct:1:42', null, 10)
    expect(stub).toMatchObject({ id: 'acct:1:42', parseFailed: true })
    expect(parseOne(Buffer.from('Subject: ok\r\n\r\nbody'), 'acct:1:43').parseFailed).toBeUndefined()
  })
})

describe('finding 21: htmlToText is linear', () => {
  it('2 MB of unterminated "<script " finishes in well under a second', () => {
    expect(ms(() => htmlToText('<script '.repeat(250_000)))).toBeLessThan(500)
  })
  it('500 000 unterminated "<!--" openers finish in well under a second', () => {
    expect(ms(() => htmlToText('<!--'.repeat(500_000)))).toBeLessThan(500)
  })
  it('many "<" with no ">" (plain text that looks like tags) finish fast and are kept as text', () => {
    const t0 = performance.now()
    const out = htmlToText('a<b'.repeat(60_000))
    expect(performance.now() - t0).toBeLessThan(500)
    expect(out.startsWith('a<ba<b')).toBe(true)
  })
  it('input beyond HTML_LIMIT is cut before processing (even when what precedes it would be stripped)', () => {
    expect(htmlToText(`<p>${'x'.repeat(HTML_LIMIT)}</p><p>LATE</p>`)).not.toContain('LATE')
    expect(htmlToText(`<!--${'x'.repeat(HTML_LIMIT)}--><p>LATE</p>`)).not.toContain('LATE')
    expect(htmlToText(`<!--${'x'.repeat(1000)}--><p>EARLY</p>`)).toBe('EARLY')
  })
  it('repeated unterminated blocks that do close their tag ("<script>", "<!--x>") stay linear', () => {
    expect(ms(() => htmlToText('<script>a'.repeat(22_000)))).toBeLessThan(400)
    expect(ms(() => htmlToText('<style>a'.repeat(25_000)))).toBeLessThan(400)
    expect(ms(() => htmlToText('<!--a>'.repeat(33_000)))).toBeLessThan(400)
  })
  it('same text as before for normal HTML: blocks, comments, scripts, breaks, entities', () => {
    expect(
      htmlToText(
        '<html><head><title>T</title><style>p{}</style></head><body><!-- c --><p>Hello&nbsp;<b>Avery</b>,</p><div>Line&#33;<br/>Next &amp; last &#x263A;</div><script>alert(1)</script><SCRIPT type="x">y</SCRIPT>End &bogus;</body></html>',
      ),
    ).toBe('Hello Avery,\nLine!\nNext & last ☺\nEnd &bogus;')
    expect(htmlToText('a < b and c > d')).toBe('a d')
    expect(htmlToText('price < 5')).toBe('price < 5')
    expect(htmlToText('<script>never closed <p>tail</p>')).toBe('never closed tail')
    expect(htmlToText('<!-- never closed <p>tail</p>')).toBe('tail')
  })
  it('auditor note (b): a character whose lowercase is longer (U+0130) cannot shift the tag offsets', () => {
    expect(htmlToText('İİİİ<script>secret()</script><p>Body</p>')).toBe('İİİİ Body')
    const out = htmlToText('<P>İİ</P><SCRIPT>hidden()</SCRIPT>tail')
    expect(out).not.toContain('hidden')
    expect(out.replace(/\s+/g, ' ')).toBe('İİ tail')
  })
  it('an out-of-range numeric entity is a space, never a thrown RangeError', () => {
    expect(() => htmlToText('a&#99999999;b&#x110000;c&#xD800;d')).not.toThrow()
    expect(htmlToText('a&#99999999;b&#x110000;c&#xD800;d')).toBe('a b c d')
  })
})

describe('finding 20: which of our Message-IDs a delivery report names', () => {
  it('In-Reply-To, References and a quoted (Original-)Message-ID, without brackets; nothing else', () => {
    expect(
      reportedMessageIds({
        id: 'x',
        inReplyTo: ['<a1@example.test>'],
        references: ['b2@example.test'],
        deliveryStatus: 'Reporting-MTA: dns; mx\nOriginal-Message-ID: <c3@example.test>\nMessage-ID: d4@example.test\nX-Note: message-id: e5@example.test',
      }).sort(),
    ).toEqual(['a1@example.test', 'b2@example.test', 'c3@example.test', 'd4@example.test'])
    expect(reportedMessageIds({ id: 'y', deliveryStatus: 'Final-Recipient: rfc822; a@b.example.com' })).toEqual([])
  })
})

describe('finding 10: the GCM tag length is pinned to 16 bytes', () => {
  const truncate = (sealed: string, bytes: number) => {
    const [v, iv, tag, body] = sealed.split('.')
    return [v, iv, Buffer.from(tag!, 'base64url').subarray(0, bytes).toString('base64url'), body].join('.')
  }
  it('the MFA seal: a full tag opens; a 4-, 8- or 12-byte tag never does', () => {
    const s = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(s)).toBe('JBSWY3DPEHPK3PXP')
    for (const n of [4, 8, 12]) expect(decryptSecret(truncate(s, n))).toBeNull()
  })
  it('the settings seal: same', () => {
    const s = seal('synthetic-app-password', 'profile:1')
    expect(unseal(s, 'profile:1')).toBe('synthetic-app-password')
    for (const n of [4, 8, 12]) expect(unseal(truncate(s, n), 'profile:1')).toBeNull()
  })
})
