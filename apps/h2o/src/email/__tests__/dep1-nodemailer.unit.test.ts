import { createServer, type Server, type Socket } from 'node:net'
import nodemailer from 'nodemailer'
import { afterAll, describe, expect, it } from 'vitest'
import { smtpOptions } from '../transport'

/**
 * DEP-1 (nodemailer 9 → 10): the real library, not a fake.
 *   1. The message we hand to sendMail renders the same MIME headers under v10 (From quoting, Reply-To, threading,
 *      Message-ID, Auto-Submitted) and still strips CR/LF from header values (no header injection).
 *   2. Our submission settings require TLS on 587 (`requireTLS`, honoured by v10.0.12+): against a server that does
 *      not offer STARTTLS, nodemailer gives up BEFORE sending credentials or a message.
 * Local only (127.0.0.1); synthetic addresses.
 */
describe('DEP-1: nodemailer 10 renders our messages as before', () => {
  it('headers: From display name, Reply-To token address, threading, Message-ID, Auto-Submitted; no injection', async () => {
    const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    const info = await t.sendMail({
      from: '"ICS Sales Team" <rfq@example.test>',
      to: 'avery.synthetic@northwind.example.com',
      subject: 'Your request RFQ-1\r\nBcc: attacker@example.test',
      text: 'Hello',
      html: '<p>Hello</p>',
      messageId: '<m1.synthetic@example.test>',
      replyTo: 'rfq+h2ocrm.abcdefghijklmnopqrstuvwxyz@example.test',
      inReplyTo: '<prev@example.test>',
      references: '<prev@example.test>',
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    })
    const raw = (info.message as Buffer).toString('utf8')
    const head = raw.slice(0, raw.indexOf('\n\n'))
    expect(head).toMatch(/^From: ICS Sales Team <rfq@example\.test>$/m)
    expect(head).toMatch(/^To: avery\.synthetic@northwind\.example\.com$/m)
    expect(head).toMatch(/^Reply-To: rfq\+h2ocrm\.abcdefghijklmnopqrstuvwxyz@example\.test$/m)
    expect(head).toMatch(/^In-Reply-To: <prev@example\.test>$/m)
    expect(head).toMatch(/^References: <prev@example\.test>$/m)
    expect(head).toMatch(/^Message-ID: <m1\.synthetic@example\.test>$/m)
    expect(head).toMatch(/^Auto-Submitted: auto-generated$/m)
    expect(head).toMatch(/^X-Auto-Response-Suppress: All$/m)
    // CR/LF in a header value never starts a new header.
    expect(head).not.toMatch(/^Bcc:/im)
    expect(info.envelope).toEqual({ from: 'rfq@example.test', to: ['avery.synthetic@northwind.example.com'] })
  })
})

describe('DEP-1: requireTLS is enforced (no credentials or mail over plaintext)', () => {
  let server: Server | null = null
  afterAll(() => void server?.close())
  it('a server that offers no STARTTLS gets neither AUTH nor MAIL FROM; the send fails', async () => {
    const seen: string[] = []
    server = createServer((sock: Socket) => {
      sock.setEncoding('utf8')
      sock.write('220 fake.example.test ESMTP synthetic\r\n')
      let buf = ''
      sock.on('data', (chunk: string) => {
        buf += chunk
        let i: number
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i)
          buf = buf.slice(i + 2)
          seen.push(line.split(' ')[0]!.toUpperCase())
          if (/^EHLO/i.test(line)) sock.write('250-fake.example.test\r\n250 AUTH PLAIN LOGIN\r\n')
          else if (/^HELO/i.test(line)) sock.write('250 fake.example.test\r\n')
          else if (/^QUIT/i.test(line)) {
            sock.write('221 bye\r\n')
            sock.end()
          } else sock.write('235 ok\r\n')
        }
      })
      sock.on('error', () => undefined)
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const t = nodemailer.createTransport({
      ...smtpOptions({ host: '127.0.0.1', port, user: 'synthetic', pass: 'synthetic-not-a-password', servername: 'fake.example.test' }),
      connectionTimeout: 3_000,
      greetingTimeout: 3_000,
      socketTimeout: 3_000,
    })
    expect(smtpOptions({ host: 'x', port: 587, user: 'u', pass: 'p', servername: 'x' })).toMatchObject({ secure: false, requireTLS: true })
    await expect(t.sendMail({ from: 'rfq@example.test', to: 'avery.synthetic@northwind.example.com', subject: 's', text: 't' })).rejects.toBeTruthy()
    t.close()
    expect(seen).toContain('EHLO')
    expect(seen).not.toContain('AUTH')
    expect(seen.some((s) => s === 'MAIL')).toBe(false)
  })
})
