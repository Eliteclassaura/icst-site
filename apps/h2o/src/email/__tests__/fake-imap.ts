import { Duplex } from 'node:stream'
import type { Cursor, CursorStore } from '../imap'

/** Patch C test helper: an in-memory IMAP server (enough of RFC 3501 for the reader) and an in-memory cursor. */
const CRLF = '\r\n'
export const msg = (lines: string[]) => Buffer.from(lines.join(CRLF), 'utf8')
export type Box = { uidvalidity: number; messages: Map<number, Buffer> }
export function fakeServer(box: Box, opts: { caps?: string; password?: string } = {}) {
  const commands: string[] = []
  let pending = ''
  let awaitingPlain: string | null = null
  const stream = new Duplex({
    read() {},
    write(chunk: Buffer, _enc, cb) {
      pending += chunk.toString('utf8')
      let i: number
      while ((i = pending.indexOf(CRLF)) >= 0) {
        const line = pending.slice(0, i)
        pending = pending.slice(i + 2)
        handle(line)
      }
      cb()
    },
  })
  const send = (s: string | Buffer) => stream.push(typeof s === 'string' ? Buffer.from(s) : s)
  const okLogin = (b64: string) => Buffer.from(b64, 'base64').toString('utf8') === `\u0000rfq@example.test\u0000${opts.password ?? 'app-pass'}`
  function handle(line: string) {
    if (awaitingPlain !== null) {
      const tag = awaitingPlain
      awaitingPlain = null
      send(okLogin(line) ? `${tag} OK done${CRLF}` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials secret-detail${CRLF}`)
      return
    }
    commands.push(line.replace(/(AUTHENTICATE PLAIN) .+/, '$1 <redacted>').replace(/^(\S+ LOGIN) .+/, '$1 <redacted>'))
    const [tag, ...rest] = line.split(' ')
    const cmd = rest.join(' ')
    if (/^CAPABILITY$/i.test(cmd)) return send(`* CAPABILITY IMAP4rev1 ${opts.caps ?? 'AUTH=PLAIN SASL-IR'}${CRLF}${tag} OK${CRLF}`)
    if (/^AUTHENTICATE PLAIN (.+)$/i.test(cmd)) return send(okLogin(cmd.slice(19)) ? `${tag} OK${CRLF}` : `${tag} NO [AUTHENTICATIONFAILED] bad${CRLF}`)
    if (/^AUTHENTICATE PLAIN$/i.test(cmd)) {
      awaitingPlain = tag!
      return send(`+ ${CRLF}`)
    }
    if (/^LOGIN /i.test(cmd)) return send(cmd === `LOGIN "rfq@example.test" "${opts.password ?? 'app-pass'}"` ? `${tag} OK${CRLF}` : `${tag} NO bad${CRLF}`)
    if (/^EXAMINE "INBOX"$/i.test(cmd)) {
      const next = Math.max(0, ...box.messages.keys()) + 1
      return send(`* ${box.messages.size} EXISTS${CRLF}* OK [UIDVALIDITY ${box.uidvalidity}] ok${CRLF}* OK [UIDNEXT ${next}] ok${CRLF}${tag} OK [READ-ONLY] EXAMINE${CRLF}`)
    }
    let m = /^UID SEARCH UID (\d+):\*$/i.exec(cmd)
    if (m) {
      const from = Number(m[1])
      const all = [...box.messages.keys()].sort((a, b) => a - b)
      const hits = all.filter((u) => u >= from)
      // RFC 3501: n:* always includes the highest UID, even when it is below n.
      if (!hits.length && all.length) hits.push(all[all.length - 1]!)
      return send(`* SEARCH ${hits.join(' ')}${CRLF}${tag} OK${CRLF}`)
    }
    m = /^UID FETCH ([\d,]+) \(UID RFC822\.SIZE INTERNALDATE BODY\.PEEK\[\]<0\.(\d+)>\)$/i.exec(cmd)
    if (m) {
      m[1]!.split(',').forEach((u, n) => {
        const raw = box.messages.get(Number(u))
        if (!raw) return
        send(`* ${n + 1} FETCH (UID ${u} RFC822.SIZE ${raw.length} FLAGS (\\Seen) INTERNALDATE "05-Oct-2026 10:0${n}:00 +0000" BODY[]<0> {${raw.length}}${CRLF}`)
        send(raw)
        send(`)${CRLF}`)
      })
      return send(`${tag} OK${CRLF}`)
    }
    if (/^LOGOUT$/i.test(cmd)) return send(`* BYE${CRLF}${tag} OK${CRLF}`)
    send(`${tag} BAD unknown${CRLF}`)
  }
  setImmediate(() => send(`* OK IMAP ready${CRLF}`))
  return { stream, commands }
}

export const memoryCursor = (): CursorStore & { data: Map<string, Cursor> } => {
  const data = new Map<string, Cursor>()
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, c) => void data.set(k, c) }
}
export const mail = (n: number) => msg([`From: c${n}@example.test`, `To: rfq+abcdefghijklmnopqrstuvwxyz@example.org`, `Message-ID: <in${n}@example.test>`, `Subject: reply ${n}`, '', `body ${n}`])

