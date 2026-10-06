import type { JmapAddress, JmapBodyPart, JmapEmail } from './jmap'

/**
 * Patch C (IMAP inbound): an RFC 5322 / MIME message → the same `JmapEmail` shape the JMAP reader produces, so M3's
 * linking, review and storage rules (crm/inbound.ts) apply unchanged.
 *
 * Deliberately small and defensive — the content is untrusted:
 *   - headers: unfolded, RFC 2047 encoded words decoded, RFC 6532 UTF-8 accepted; addresses parsed with quotes,
 *     comments, angle addresses and groups;
 *   - bodies: multipart (any depth up to 12, at most 200 parts), base64 and quoted-printable, any charset Node knows
 *     (unknown → UTF-8 with replacement), truncated input tolerated (the reader fetches at most 2 MB);
 *   - text/plain and text/html leaves become the text and HTML bodies; everything else (files, images, forwarded
 *     messages) is an attachment, recorded by name, type and size only — attachment content is never decoded or kept.
 * Nothing here executes, fetches or renders anything; HTML stays a string that crm/inbound.ts reduces to text.
 */

const MAX_DEPTH = 12
const MAX_PARTS = 200

type Headers = Map<string, string[]>
type Leaf = { type: string; charset: string | null; disposition: string | null; name: string | null; encoding: string; body: Buffer; size: number }

// ── low-level decoding ───────────────────────────────────────────────────────────────────────────────────────────
export function decodeCharset(bytes: Buffer, charset: string | null | undefined): string {
  const cs = (charset ?? 'utf-8').trim().toLowerCase().replace(/^"|"$/g, '') || 'utf-8'
  try {
    return new TextDecoder(cs === 'us-ascii' || cs === 'ascii' ? 'utf-8' : cs, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
}

export function decodeQuotedPrintable(s: string): Buffer {
  const soft = s.replace(/=\r?\n/g, '')
  const out: number[] = []
  for (let i = 0; i < soft.length; i++) {
    const c = soft[i]!
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      out.push(parseInt(soft.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      const code = soft.charCodeAt(i)
      if (code < 256) out.push(code)
      else out.push(...Buffer.from(c, 'utf8'))
    }
  }
  return Buffer.from(out)
}

const decodeTransfer = (body: Buffer, encoding: string): Buffer => {
  const e = encoding.trim().toLowerCase()
  if (e === 'base64') return Buffer.from(body.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64')
  if (e === 'quoted-printable') return decodeQuotedPrintable(body.toString('latin1'))
  return body
}

/** RFC 2047 encoded words (adjacent ones joined, as the RFC requires). */
export function decodeWords(v: string): string {
  return v
    .replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)/g, '$1')
    .replace(/=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g, (_m, cs: string, enc: string, text: string) => {
      const charset = cs.split('*')[0]!
      const bytes = enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : decodeQuotedPrintable(text.replace(/_/g, ' '))
      return decodeCharset(bytes, charset)
    })
}

// ── headers ─────────────────────────────────────────────────────────────────────────────────────────────────────
function splitMessage(buf: Buffer): { head: string; body: Buffer } {
  let i = buf.indexOf('\r\n\r\n')
  let skip = 4
  const lf = buf.indexOf('\n\n')
  if (i < 0 || (lf >= 0 && lf < i)) {
    i = lf
    skip = 2
  }
  if (i < 0) return { head: decodeCharset(buf, 'utf-8'), body: Buffer.alloc(0) }
  return { head: decodeCharset(buf.subarray(0, i), 'utf-8'), body: buf.subarray(i + skip) }
}

export function parseHeaders(head: string): Headers {
  const map: Headers = new Map()
  const unfolded = head.replace(/\r?\n[ \t]+/g, ' ')
  for (const line of unfolded.split(/\r?\n/)) {
    const c = line.indexOf(':')
    if (c <= 0) continue
    const name = line.slice(0, c).trim().toLowerCase()
    if (!/^[\x21-\x39\x3b-\x7e]+$/.test(name)) continue
    const list = map.get(name) ?? []
    list.push(line.slice(c + 1).trim())
    map.set(name, list)
  }
  return map
}

const first = (h: Headers, name: string): string | null => h.get(name)?.[0] ?? null

/** `type/subtype; a=b; c="d"` with RFC 2231 extended and continued parameters. */
export function parseParams(v: string): { value: string; params: Record<string, string> } {
  const parts: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < v.length; i++) {
    const c = v[i]!
    if (c === '\\' && quoted && i + 1 < v.length) {
      cur += v[++i]
      continue
    }
    if (c === '"') quoted = !quoted
    else if (c === ';' && !quoted) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)
  const value = (parts.shift() ?? '').trim().toLowerCase()
  const raw: Record<string, string> = {}
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq < 0) continue
    raw[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim().replace(/^"(.*)"$/s, '$1')
  }
  const params: Record<string, string> = {}
  const continued = new Map<string, Array<{ n: number; v: string; enc: boolean }>>()
  for (const [k, val] of Object.entries(raw)) {
    // name*0="a" name*1="b" (continuation) · name*=utf-8''%E2%82%AC (extended) · name*0*=… (both)
    const seg = /^([^*]+)\*(\d+)(\*?)$/.exec(k)
    const ext = /^([^*]+)\*$/.exec(k)
    if (seg || ext) {
      const base = (seg ? seg[1] : ext![1])!
      const list = continued.get(base) ?? []
      list.push(seg ? { n: Number(seg[2]), v: val, enc: seg[3] === '*' } : { n: 0, v: val, enc: true })
      continued.set(base, list)
    } else params[k] = decodeWords(val)
  }
  for (const [base, list] of continued) {
    list.sort((a, b) => a.n - b.n)
    let charset = 'utf-8'
    const bytes: number[] = []
    list.forEach((s, i) => {
      let v = s.v
      if (s.enc && i === 0) {
        const q = /^([^']*)'[^']*'(.*)$/s.exec(v)
        if (q) {
          charset = q[1] || 'utf-8'
          v = q[2]!
        }
      }
      if (!s.enc) {
        bytes.push(...Buffer.from(v, 'utf8'))
        return
      }
      for (let k = 0; k < v.length; k++) {
        if (v[k] === '%' && /^[0-9A-Fa-f]{2}$/.test(v.slice(k + 1, k + 3))) {
          bytes.push(parseInt(v.slice(k + 1, k + 3), 16))
          k += 2
        } else bytes.push(...Buffer.from(v[k]!, 'utf8'))
      }
    })
    params[base] = decodeCharset(Buffer.from(bytes), charset)
  }
  return { value, params }
}

/** An address list: `"Name, Inc." <a@b>`, `Name <a@b>`, `a@b (comment)`, groups `Team: a@b, c@d;`. */
export function parseAddresses(v: string | null): JmapAddress[] {
  if (!v) return []
  const text = decodeWords(v)
  const items: string[] = []
  let cur = ''
  let quoted = false
  let angle = 0
  let comment = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '\\' && i + 1 < text.length) {
      cur += c + text[++i]
      continue
    }
    if (!comment && c === '"') quoted = !quoted
    else if (!quoted && c === '(') comment++
    else if (!quoted && c === ')' && comment) comment--
    else if (!quoted && !comment && c === '<') angle++
    else if (!quoted && !comment && c === '>' && angle) angle--
    if (!quoted && !comment && !angle && (c === ',' || c === ';')) {
      items.push(cur)
      cur = ''
      continue
    }
    if (!quoted && !comment && !angle && c === ':' && !/@/.test(cur)) {
      cur = '' // group name
      continue
    }
    cur += c
  }
  items.push(cur)
  const out: JmapAddress[] = []
  for (const raw of items) {
    const item = raw.trim()
    if (!item) continue
    const ang = /<([^<>]*)>/.exec(item)
    let email: string
    let name: string
    if (ang) {
      email = ang[1]!.trim()
      name = item.slice(0, ang.index).trim()
    } else {
      const noComment = item.replace(/\([^()]*\)/g, ' ').trim()
      email = noComment.split(/\s+/).find((w) => w.includes('@')) ?? noComment
      const cm = /\(([^()]*)\)/.exec(item)
      name = cm ? cm[1]!.trim() : ''
    }
    name = name.replace(/^"(.*)"$/s, '$1').replace(/\\(.)/g, '$1').trim()
    if (email.includes('@')) out.push({ name: name || null, email })
  }
  return out
}

const messageIds = (v: string | null): string[] | null => {
  if (!v) return null
  const ids = [...v.matchAll(/<([^<>\s]{1,250})>/g)].map((m) => m[1]!)
  return ids.length ? ids : null
}

// ── body structure ──────────────────────────────────────────────────────────────────────────────────────────────
function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const text = body.toString('latin1')
  const delim = `--${boundary}`
  const parts: Buffer[] = []
  let pos = text.indexOf(delim)
  if (pos < 0) return []
  while (pos >= 0) {
    const afterDelim = pos + delim.length
    if (text.startsWith('--', afterDelim)) break // closing delimiter
    const lineEnd = text.indexOf('\n', afterDelim)
    if (lineEnd < 0) break
    const next = text.indexOf(`\n${delim}`, lineEnd)
    const end = next < 0 ? text.length : next
    const chunk = text.slice(lineEnd + 1, end).replace(/\r$/, '')
    parts.push(Buffer.from(chunk, 'latin1'))
    if (next < 0 || parts.length >= MAX_PARTS) break
    pos = next + 1
  }
  return parts
}

function walk(buf: Buffer, depth: number, leaves: Leaf[], inheritedType = 'text/plain'): void {
  if (leaves.length >= MAX_PARTS) return
  const { head, body } = splitMessage(buf)
  const h = parseHeaders(head)
  const ct = parseParams(first(h, 'content-type') ?? inheritedType)
  const type = ct.value || 'text/plain'
  const cd = parseParams(first(h, 'content-disposition') ?? '')
  const name = cd.params.filename ?? ct.params.name ?? null
  if (type.startsWith('multipart/') && ct.params.boundary && depth < MAX_DEPTH) {
    const childDefault = type === 'multipart/digest' ? 'message/rfc822' : 'text/plain'
    for (const part of splitMultipart(body, ct.params.boundary)) walk(part, depth + 1, leaves, childDefault)
    return
  }
  leaves.push({
    type,
    charset: ct.params.charset ?? null,
    disposition: cd.value || null,
    name: name ? name.replace(/[\r\n]/g, ' ').slice(0, 200) : null,
    encoding: first(h, 'content-transfer-encoding') ?? '7bit',
    body,
    size: body.length,
  })
}

/** Parse one message. `id` is the mailbox's stable id; `receivedAt` the server's arrival time when known. */
export function parseMessage(raw: Buffer, id: string, receivedAt?: string | null, size?: number | null): JmapEmail {
  const { head } = splitMessage(raw)
  const h = parseHeaders(head)
  const leaves: Leaf[] = []
  walk(raw, 0, leaves)
  const textBody: JmapBodyPart[] = []
  const htmlBody: JmapBodyPart[] = []
  const attachments: JmapBodyPart[] = []
  const bodyValues: Record<string, { value: string; isTruncated: boolean }> = {}
  leaves.forEach((leaf, i) => {
    const partId = String(i + 1)
    const isText = leaf.type === 'text/plain' || leaf.type === 'text/html'
    if (isText && leaf.disposition !== 'attachment' && !leaf.name) {
      const value = decodeCharset(decodeTransfer(leaf.body, leaf.encoding), leaf.charset)
      bodyValues[partId] = { value, isTruncated: false }
      ;(leaf.type === 'text/html' ? htmlBody : textBody).push({ partId, type: leaf.type })
    } else {
      attachments.push({ partId, type: leaf.type, name: leaf.name ?? (leaf.type === 'message/rfc822' ? 'forwarded message' : null), size: leaf.size, disposition: leaf.disposition })
    }
  })
  const date = first(h, 'date')
  const arrived = receivedAt ?? (date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : null)
  return {
    id,
    messageId: messageIds(first(h, 'message-id')),
    inReplyTo: messageIds(first(h, 'in-reply-to')),
    references: messageIds((h.get('references') ?? []).join(' ')),
    from: parseAddresses(first(h, 'from')),
    to: parseAddresses((h.get('to') ?? []).join(', ')),
    cc: parseAddresses((h.get('cc') ?? []).join(', ')),
    subject: decodeWords(first(h, 'subject') ?? ''),
    receivedAt: arrived,
    size: size ?? raw.length,
    keywords: null,
    textBody,
    htmlBody,
    attachments,
    bodyValues,
    'header:Auto-Submitted:asText': first(h, 'auto-submitted'),
    'header:X-Spam-Status:asText': first(h, 'x-spam-status'),
    'header:Precedence:asText': first(h, 'precedence'),
    'header:List-Id:asText': first(h, 'list-id'),
  }
}
