import { request } from 'node:https'
import type { InboundSettings } from './config'

/**
 * Minimal JMAP (RFC 8620 / 8621) client for the CRM's role mailbox on the internal Stalwart service (M3).
 *
 *   - HTTPS only, to H2O_JMAP_HOST:PORT on the private network, with the certificate verified against
 *     H2O_SMTP_TLS_SERVERNAME (the same certificate as submission); HTTP Basic auth with the role account.
 *   - The session's `apiUrl` is used for its PATH only: the server may advertise its public URL, but the CRM
 *     always talks to the internal host.
 *   - Read-only except one write: the keyword `$h2o_ingested` on a message the CRM has stored, so it is not
 *     read again. Nothing is deleted, moved or answered.
 *   - Errors are codes; response bodies are never logged.
 */

export const INGESTED_KEYWORD = '$h2o_ingested'

export type JmapAddress = { name?: string | null; email?: string | null }
export type JmapBodyPart = {
  partId?: string | null
  blobId?: string | null
  type?: string | null
  name?: string | null
  size?: number | null
  disposition?: string | null
}
export type JmapEmail = {
  id: string
  messageId?: string[] | null
  inReplyTo?: string[] | null
  references?: string[] | null
  from?: JmapAddress[] | null
  to?: JmapAddress[] | null
  cc?: JmapAddress[] | null
  subject?: string | null
  receivedAt?: string | null
  size?: number | null
  keywords?: Record<string, boolean> | null
  textBody?: JmapBodyPart[] | null
  htmlBody?: JmapBodyPart[] | null
  attachments?: JmapBodyPart[] | null
  bodyValues?: Record<string, { value?: string; isTruncated?: boolean }> | null
  'header:Auto-Submitted:asText'?: string | null
  'header:X-Spam-Status:asText'?: string | null
  'header:Precedence:asText'?: string | null
  'header:List-Id:asText'?: string | null
  /** Revenue Engine slice 1: the text of a `message/delivery-status` part (RFC 3464), when the reader has it. */
  deliveryStatus?: string | null
  /**
   * SEC-CRM-1: set by the IMAP reader when the raw message could not be parsed at all. The poller records it in the
   * review queue (PROCESSING_FAILED) at once and moves past it, so one malformed message never blocks the mailbox.
   */
  parseFailed?: boolean
}

/** What the poller needs from a mailbox. The HTTPS implementation is below; tests use an in-memory one. */
export type InboundMailbox = {
  fetchNew: (limit: number) => Promise<JmapEmail[]>
  markIngested: (ids: string[]) => Promise<void>
}

export const EMAIL_PROPERTIES = [
  'id',
  'messageId',
  'inReplyTo',
  'references',
  'from',
  'to',
  'cc',
  'subject',
  'receivedAt',
  'size',
  'keywords',
  'textBody',
  'htmlBody',
  'attachments',
  'bodyValues',
  'header:Auto-Submitted:asText',
  'header:X-Spam-Status:asText',
  'header:Precedence:asText',
  'header:List-Id:asText',
] as const

export class JmapError extends Error {
  constructor(public readonly code: string) {
    super(`JMAP ${code}`)
    this.name = 'JmapError'
  }
}

type Http = (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<{ status: number; location?: string; json: unknown }>

export function httpsTransport(s: InboundSettings, timeoutMs = 15_000): Http {
  const auth = `Basic ${Buffer.from(`${s.user}:${s.pass}`).toString('base64')}`
  return (method, path, body) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
      const req = request(
        {
          host: s.host,
          port: s.port,
          servername: s.servername,
          method,
          path,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          headers: {
            authorization: auth,
            accept: 'application/json',
            ...(payload
              ? { 'content-type': 'application/json', 'content-length': String(payload.length) }
              : {}),
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = []
          let total = 0
          res.on('data', (c: Buffer) => {
            total += c.length
            if (total > 32 * 1024 * 1024) req.destroy(new JmapError('RESPONSE_TOO_LARGE'))
            else chunks.push(c)
          })
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            let json: unknown
            try {
              json = text ? JSON.parse(text) : null
            } catch {
              json = null
            }
            resolve({
              status: res.statusCode ?? 0,
              location: typeof res.headers.location === 'string' ? res.headers.location : undefined,
              json,
            })
          })
        },
      )
      req.on('timeout', () => req.destroy(new JmapError('TIMEOUT')))
      req.on('error', (e: Error & { code?: string }) =>
        reject(
          e instanceof JmapError
            ? e
            : new JmapError(typeof e.code === 'string' && /^[A-Z_]{2,40}$/.test(e.code) ? e.code : 'NETWORK'),
        ),
      )
      if (payload) req.write(payload)
      req.end()
    })
}

const pathOf = (u: string): string => {
  try {
    const url = new URL(u, 'https://internal.invalid')
    return `${url.pathname}${url.search}`
  } catch {
    throw new JmapError('BAD_URL')
  }
}

export function jmapMailbox(http: Http): InboundMailbox {
  let api: { path: string; accountId: string; inbox: string } | null = null
  const call = async (methodCalls: unknown[]) => {
    const r = await http('POST', api!.path, {
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls,
    })
    if (r.status !== 200) throw new JmapError(`HTTP_${r.status}`)
    const responses = (r.json as { methodResponses?: Array<[string, Record<string, unknown>, string]> })
      ?.methodResponses
    if (!Array.isArray(responses)) throw new JmapError('BAD_RESPONSE')
    for (const [name] of responses) if (name === 'error') throw new JmapError('METHOD_ERROR')
    return responses
  }
  const connect = async () => {
    if (api) return api
    let r = await http('GET', '/.well-known/jmap')
    if ([301, 302, 307, 308].includes(r.status) && r.location) r = await http('GET', pathOf(r.location))
    if (r.status !== 200) throw new JmapError(`SESSION_HTTP_${r.status}`)
    const session = r.json as { apiUrl?: string; primaryAccounts?: Record<string, string> }
    const accountId = session?.primaryAccounts?.['urn:ietf:params:jmap:mail']
    if (!session?.apiUrl || !accountId) throw new JmapError('SESSION_INVALID')
    api = { path: pathOf(session.apiUrl), accountId, inbox: '' }
    const [[, mb]] = (await call([['Mailbox/get', { accountId, properties: ['id', 'role'] }, 'm']])) as Array<
      [string, { list?: Array<{ id: string; role?: string | null }> }, string]
    >
    const inbox = mb.list?.find((m) => m.role === 'inbox')?.id
    if (!inbox) throw new JmapError('NO_INBOX')
    api.inbox = inbox
    return api
  }
  return {
    fetchNew: async (limit) => {
      const a = await connect()
      const res = await call([
        [
          'Email/query',
          {
            accountId: a.accountId,
            filter: { inMailbox: a.inbox, notKeyword: INGESTED_KEYWORD },
            sort: [{ property: 'receivedAt', isAscending: true }],
            limit,
          },
          'q',
        ],
        [
          'Email/get',
          {
            accountId: a.accountId,
            '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
            properties: EMAIL_PROPERTIES,
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
            maxBodyValueBytes: 100_000,
          },
          'g',
        ],
      ])
      const get = res.find(([name]) => name === 'Email/get')?.[1] as { list?: JmapEmail[] } | undefined
      return get?.list ?? []
    },
    markIngested: async (ids) => {
      if (!ids.length) return
      const a = await connect()
      const update = Object.fromEntries(ids.map((id) => [id, { [`keywords/${INGESTED_KEYWORD}`]: true }]))
      const res = await call([['Email/set', { accountId: a.accountId, update }, 's']])
      const set = res[0]?.[1] as { notUpdated?: Record<string, unknown> } | undefined
      if (set?.notUpdated && Object.keys(set.notUpdated).length) throw new JmapError('NOT_UPDATED')
    },
  }
}
