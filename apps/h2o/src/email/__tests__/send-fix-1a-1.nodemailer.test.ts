import { createServer, type Server, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import nodemailer from 'nodemailer'
import { afterEach, describe, expect, it } from 'vitest'
import { submissionOutcome } from '../gate'

/**
 * SEND-FIX-1a.1 (auditor B1): the classification against the INSTALLED nodemailer, not a hand-made error. A local
 * SMTP stub (127.0.0.1 only, no message stored) speaks just enough SMTP to reach DATA, takes the message, then either
 * drops the connection or stays silent. nodemailer reports both with command 'CONN'; both must be UNCERTAIN. A refused
 * connection (nothing listening) must be NOT_ACCEPTED.
 */
type After = 'CLOSE' | 'SILENT'
const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(null)))
})
function stub(after: After): Promise<number> {
  const server = createServer((sock: Socket) => {
    let inData = false
    let buf = ''
    sock.write('220 stub.example.test ESMTP\r\n')
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1')
      let i: number
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        if (inData) {
          if (line === '.') {
            // the whole message was handed over; now the reply never comes
            if (after === 'CLOSE') sock.destroy()
            return
          }
          continue
        }
        const cmd = line.toUpperCase()
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) sock.write('250 stub.example.test\r\n')
        else if (cmd.startsWith('MAIL FROM') || cmd.startsWith('RCPT TO')) sock.write('250 OK\r\n')
        else if (cmd === 'DATA') {
          inData = true
          sock.write('354 go ahead\r\n')
        } else if (cmd === 'QUIT') sock.end('221 bye\r\n')
        else sock.write('502 not here\r\n')
      }
    })
    sock.on('error', () => undefined)
  })
  servers.push(server)
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)))
}
const send = async (port: number) => {
  const t = nodemailer.createTransport({ host: '127.0.0.1', port, secure: false, ignoreTLS: true, socketTimeout: 400, connectionTimeout: 2000, greetingTimeout: 2000 })
  try {
    await t.sendMail({ from: 'rfq@example.test', to: 'sales.alerts@example.test', subject: 'synthetic', text: 'synthetic' })
    return null
  } catch (e) {
    return e as Error & { code?: string; command?: string }
  } finally {
    t.close()
  }
}

describe('nodemailer (installed) after DATA', () => {
  it('the connection drops after the message was handed over: command CONN, ECONNECTION → UNCERTAIN', async () => {
    const e = await send(await stub('CLOSE'))
    expect(e).toMatchObject({ code: 'ECONNECTION', command: 'CONN' })
    expect(submissionOutcome(e)).toBe('UNCERTAIN')
  })
  it('no reply after the message was handed over: command CONN, ETIMEDOUT "Timeout" → UNCERTAIN', async () => {
    const e = await send(await stub('SILENT'))
    expect(e).toMatchObject({ code: 'ETIMEDOUT', command: 'CONN' })
    expect(submissionOutcome(e)).toBe('UNCERTAIN')
  })
  it('nothing listening (connection refused): NOT_ACCEPTED', async () => {
    const port = await stub('CLOSE')
    await new Promise((r) => servers.pop()!.close(() => r(null)))
    const e = await send(port)
    expect(e?.command).toBe('CONN')
    expect(submissionOutcome(e)).toBe('NOT_ACCEPTED')
  })
})
