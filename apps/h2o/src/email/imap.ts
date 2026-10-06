import { createHash } from 'node:crypto'
import type { Duplex } from 'node:stream'
import { connect as tlsConnect } from 'node:tls'
import type { InboundSettings } from './config'
import type { InboundMailbox, JmapEmail } from './jmap'
import { parseMessage } from './mime'
import { guardHost } from './net-guard'

/**
 * Patch C: IMAP inbound mode for M3 (owner decision 2026-10-05: Google Workspace — imap.gmail.com:993, app password).
 * The same poller, linking rules, review queue, poison handling and idempotency as JMAP; only the reader differs.
 *
 *   - TLS only (implicit TLS on 993), certificate verified against the configured name, TLS 1.2+; no STARTTLS
 *     downgrade path, no plaintext, no "ignore certificate". The host passes the same network guard as SMTP.
 *   - AUTHENTICATE PLAIN (or LOGIN when PLAIN is not offered); refused if the server disables login.
 *   - READ-ONLY: the mailbox is opened with EXAMINE and bodies are read with BODY.PEEK, so nothing is marked, moved,
 *     flagged or deleted in the mailbox — people keep using it normally. What has been read is kept in the CRM's
 *     database instead (`crm-mail-cursor`: UIDVALIDITY + the last UID stored), advanced only past messages that were
 *     stored, so a message that fails is read again on the next poll.
 *   - First run (or a mailbox whose UIDVALIDITY changed): starts from mail arriving NOW — the existing inbox is never
 *     imported. A UIDVALIDITY change is logged by code.
 *   - Each message is read up to 2 MB (attachments are never kept anyway). Errors are codes; nothing the server or a
 *     message says is logged.
 */

export const IMAP_FETCH_BYTES = 2_000_000
const COMMAND_TIMEOUT_MS = 30_000
const CONNECT_TIMEOUT_MS = 10_000

export class ImapError extends Error {
  constructor(public readonly code: string) {
    super(`IMAP ${code}`)
    this.name = 'ImapError'
  }
}

/** A response line with each {n} literal replaced by <U+E000>index<U+E000> (a private-use mark); bytes in `literals`. */
const LIT = '\uE000'
type Response = { line: string; literals: Buffer[] }

/** One IMAP connection: framing (lines and {n} literals), tagged commands, untagged responses. */
export class ImapSession {
  private buf = Buffer.alloc(0)
  private queue: Response[] = []
  private waiter: (() => void) | null = null
  private ended: string | null = null
  private tag = 0
  private partial: Response = { line: '', literals: [] }

  constructor(private readonly stream: Duplex) {
    stream.on('data', (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d])
      this.drain()
    })
    const end = (code: string) => () => {
      this.ended ??= code
      this.waiter?.()
    }
    stream.on('end', end('IMAP_CLOSED'))
    stream.on('close', end('IMAP_CLOSED'))
    stream.on('error', end('IMAP_SOCKET_ERROR'))
  }

  private drain() {
    for (;;) {
      const crlf = this.buf.indexOf('\r\n')
      if (crlf < 0) return
      const line = this.buf.subarray(0, crlf).toString('utf8')
      const lit = /\{(\d{1,9})\}$/.exec(line)
      if (lit) {
        const n = Number(lit[1])
        if (this.buf.length < crlf + 2 + n) return // wait for the whole literal
        this.partial.line += line.slice(0, lit.index) + `${LIT}${this.partial.literals.length}${LIT}`
        this.partial.literals.push(Buffer.from(this.buf.subarray(crlf + 2, crlf + 2 + n)))
        this.buf = this.buf.subarray(crlf + 2 + n)
        continue
      }
      this.partial.line += line
      this.queue.push(this.partial)
      this.partial = { line: '', literals: [] }
      this.buf = this.buf.subarray(crlf + 2)
      this.waiter?.()
    }
  }

  private async next(deadline: number): Promise<Response> {
    while (this.queue.length === 0) {
      if (this.ended) throw new ImapError(this.ended)
      const left = deadline - Date.now()
      if (left <= 0) throw new ImapError('IMAP_TIMEOUT')
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left)
        this.waiter = () => {
          clearTimeout(t)
          resolve()
        }
      })
      this.waiter = null
    }
    return this.queue.shift()!
  }

  async greeting(): Promise<string> {
    const r = await this.next(Date.now() + COMMAND_TIMEOUT_MS)
    if (!/^\* (OK|PREAUTH)\b/i.test(r.line)) throw new ImapError('IMAP_GREETING_REFUSED')
    return r.line
  }

  /** Send a command; returns the untagged responses. A continuation (+) is answered with `continuation`. */
  async run(command: string, continuation?: string): Promise<Response[]> {
    const tag = `h${++this.tag}`
    this.stream.write(`${tag} ${command}\r\n`)
    const deadline = Date.now() + COMMAND_TIMEOUT_MS
    const untagged: Response[] = []
    for (;;) {
      const r = await this.next(deadline)
      if (r.line.startsWith('+')) {
        if (continuation === undefined) throw new ImapError('IMAP_UNEXPECTED_CONTINUATION')
        this.stream.write(`${continuation}\r\n`)
        continuation = undefined
        continue
      }
      if (r.line.startsWith(`${tag} `)) {
        const status = r.line.slice(tag.length + 1).split(' ')[0]!.toUpperCase()
        if (status === 'OK') return untagged
        throw new ImapError(`IMAP_${command.split(' ')[command.startsWith('UID ') ? 1 : 0]!.toUpperCase()}_${status === 'NO' ? 'NO' : 'BAD'}`)
      }
      untagged.push(r)
    }
  }

  close() {
    this.stream.destroy()
  }
}

export const quoteImap = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export async function authenticate(session: ImapSession, user: string, pass: string): Promise<void> {
  if (/[\r\n\0]/.test(user) || /[\r\n\0]/.test(pass)) throw new ImapError('IMAP_CREDENTIALS_INVALID')
  const caps = (await session.run('CAPABILITY')).map((r) => r.line.toUpperCase()).join(' ')
  const plain = Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64')
  try {
    if (caps.includes('AUTH=PLAIN')) {
      if (caps.includes('SASL-IR')) await session.run(`AUTHENTICATE PLAIN ${plain}`)
      else await session.run('AUTHENTICATE PLAIN', plain)
      return
    }
    if (caps.includes('LOGINDISABLED')) throw new ImapError('IMAP_LOGIN_DISABLED')
    await session.run(`LOGIN ${quoteImap(user)} ${quoteImap(pass)}`)
  } catch (err) {
    // The server's words are not kept; a refused login is one code.
    if (err instanceof ImapError && err.code !== 'IMAP_LOGIN_DISABLED' && !err.code.startsWith('IMAP_TIMEOUT')) throw new ImapError('IMAP_AUTH_FAILED')
    throw err
  }
}

export type Fetched = { uid: number; size: number | null; internalDate: string | null; raw: Buffer }

const num = (re: RegExp, s: string): number | null => {
  const m = re.exec(s)
  return m ? Number(m[1]) : null
}

/** Parse `* n FETCH (UID u RFC822.SIZE s INTERNALDATE "…" BODY[]<0> {literal})`. */
export function parseFetch(r: Response): Fetched | null {
  if (!/^\* \d+ FETCH \(/i.test(r.line)) return null
  const uid = num(/\bUID (\d+)/i, r.line)
  const ref = /BODY\[\](?:<\d+>)? \uE000(\d+)\uE000/i.exec(r.line)
  if (!uid || !ref) return null
  const date = /INTERNALDATE "([^"]+)"/i.exec(r.line)
  const parsed = date ? new Date(date[1]!.replace(/^(\d{1,2})-(\w{3})-(\d{4})/, '$2 $1 $3')) : null
  return { uid, size: num(/RFC822\.SIZE (\d+)/i, r.line), internalDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null, raw: r.literals[Number(ref[1])]! }
}

// ── the cursor (what has been stored) ─────────────────────────────────────────────────────────────────────────────
export type Cursor = { uidvalidity: number; lastUid: number }
export type CursorStore = { get: (key: string) => Promise<Cursor | null>; set: (key: string, c: Cursor) => Promise<void> }

export const mailboxKey = (s: Pick<InboundSettings, 'host' | 'user' | 'mailbox'>): string =>
  `imap:${createHash('sha256').update(`${s.user.toLowerCase()}@${s.host.toLowerCase()}/${s.mailbox ?? 'INBOX'}`).digest('hex').slice(0, 16)}`

export type Connector = (s: InboundSettings) => Promise<Duplex>

export const tlsConnector: Connector = async (s) => {
  const guard = await guardHost(s.host)
  if (!guard.ok) throw new ImapError(`IMAP_${guard.code}`)
  return new Promise((resolve, reject) => {
    const sock = tlsConnect({ host: guard.address, port: s.port, servername: s.servername, minVersion: 'TLSv1.2', rejectUnauthorized: true })
    const t = setTimeout(() => {
      sock.destroy()
      reject(new ImapError('IMAP_CONNECT_TIMEOUT'))
    }, CONNECT_TIMEOUT_MS)
    sock.once('secureConnect', () => {
      clearTimeout(t)
      resolve(sock)
    })
    sock.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(t)
      reject(new ImapError(/CERT|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY/i.test(String(err.code ?? '')) ? 'IMAP_TLS_FAILED' : 'IMAP_CONNECT_FAILED'))
    })
  })
}

/** The IMAP reader as the poller's mailbox (one connection per poll). */
export function imapMailbox(s: InboundSettings, deps: { cursor: CursorStore; connect?: Connector; log?: (code: string) => void }): InboundMailbox {
  const key = mailboxKey(s)
  let pending: { uidvalidity: number; base: number; uids: number[] } | null = null
  return {
    fetchNew: async (limit: number): Promise<JmapEmail[]> => {
      pending = null
      const session = new ImapSession(await (deps.connect ?? tlsConnector)(s))
      try {
        await session.greeting()
        await authenticate(session, s.user, s.pass)
        const sel = await session.run(`EXAMINE ${quoteImap(s.mailbox ?? 'INBOX')}`)
        const text = sel.map((r) => r.line).join('\n')
        const uidvalidity = num(/\[UIDVALIDITY (\d+)\]/i, text)
        const uidnext = num(/\[UIDNEXT (\d+)\]/i, text)
        if (!uidvalidity || !uidnext) throw new ImapError('IMAP_NO_UIDVALIDITY')
        const cur = await deps.cursor.get(key)
        if (!cur || cur.uidvalidity !== uidvalidity) {
          if (cur) deps.log?.('IMAP_UIDVALIDITY_CHANGED')
          // Start from mail arriving from now on: the existing mailbox is never imported.
          await deps.cursor.set(key, { uidvalidity, lastUid: uidnext - 1 })
          return []
        }
        if (uidnext - 1 <= cur.lastUid) return []
        const found = (await session.run(`UID SEARCH UID ${cur.lastUid + 1}:*`))
          .filter((r) => /^\* SEARCH\b/i.test(r.line))
          .flatMap((r) => r.line.slice(8).trim().split(/\s+/).filter(Boolean).map(Number))
          .filter((u) => Number.isInteger(u) && u > cur.lastUid)
          .sort((a, b) => a - b)
          .slice(0, Math.max(1, limit))
        if (found.length === 0) return []
        const fetched = (await session.run(`UID FETCH ${found.join(',')} (UID RFC822.SIZE INTERNALDATE BODY.PEEK[]<0.${IMAP_FETCH_BYTES}>)`))
          .map(parseFetch)
          .filter((f): f is Fetched => f !== null && found.includes(f.uid))
          .sort((a, b) => a.uid - b.uid)
        pending = { uidvalidity, base: cur.lastUid, uids: fetched.map((f) => f.uid) }
        return fetched.map((f) => parseMessage(f.raw, `${key}:${uidvalidity}:${f.uid}`, f.internalDate, f.size))
      } finally {
        try {
          await session.run('LOGOUT')
        } catch {
          // closing anyway
        }
        session.close()
      }
    },
    markIngested: async (ids: string[]): Promise<void> => {
      if (!pending) return
      const done = new Set(ids.map((id) => Number(id.slice(id.lastIndexOf(':') + 1))))
      // Advance past every message stored, stopping at the first one that was not (it is read again next poll).
      let last = pending.base
      for (const u of pending.uids) {
        if (!done.has(u)) break
        last = u
      }
      if (last > pending.base) await deps.cursor.set(key, { uidvalidity: pending.uidvalidity, lastUid: last })
      pending = null
    },
  }
}
