import type { Payload } from 'payload'
import { DSN_EVENT_PREFIX } from './suppression'
import type { JmapAddress, JmapBodyPart, JmapEmail } from '../email/jmap'
import { recordActivity } from './activity'
import { relId } from './guards'
import { emailKey } from './normalize'
import { REPLY_TOKEN_RE } from './reply'
import type { Outcome } from './workspace/mutations'
import { asUser, type CrmSession } from './workspace/session'
import type { EmailReviewReason } from './vocabulary'

/**
 * CRM email M3 — E3: customer replies thread back into the CRM.
 *
 * Linking rule: an inbound message is attached to an RFQ only when it is addressed to that RFQ's LIVE reply
 * token (`<role>+<token>@<domain>`, issued by M2). Never by display name, subject, sender or quoted text.
 * Everything else goes to the admin review queue (`crm-email-review`) with the reason:
 *
 *   OWN_ADDRESS     sent from our own role address (a loop)
 *   AUTO_SUBMITTED  RFC 3834 Auto-Submitted present and not "no" (out-of-office, bounces, auto-replies)
 *   BULK            Precedence bulk/junk/list, or a List-Id (mailing lists)
 *   SPAM            the server's spam filter flagged it (X-Spam-Status: Yes)
 *   NO_TOKEN / MULTIPLE_TOKENS / UNKNOWN_TOKEN / EXPIRED_TOKEN
 *
 * Content is untrusted: stored as plain text only (HTML is reduced to text, never stored or rendered as
 * HTML); control characters are removed and length is bounded. Attachments are withheld: name, type and size
 * are recorded, the content is never fetched. Nothing is ever sent in response — no acknowledgement of a reply.
 * Idempotent: one row per mailbox message (`source_ref`), and a Message-ID already stored is a duplicate.
 */

type Doc = Record<string, unknown>
export type InboundContext = { roleLocal: string; domain: string }
export type Classification =
  { kind: 'TOKEN'; token: string } | { kind: 'REVIEW'; reason: EmailReviewReason; token?: string }

const addrs = (list: JmapAddress[] | null | undefined): string[] =>
  (list ?? []).map((a) => (typeof a?.email === 'string' ? a.email.trim() : '')).filter(Boolean)

const TAGGED_TOKEN = /^[a-z0-9]{3,16}\.([a-z2-7]{26})$/

/** Distinct reply tokens found in To/Cc for our role address at our domain (case-insensitive). */
export function tokensIn(email: JmapEmail, ctx: InboundContext): string[] {
  const found = new Set<string>()
  for (const a of [...addrs(email.to), ...addrs(email.cc)]) {
    const at = a.lastIndexOf('@')
    if (at < 1 || a.slice(at + 1).toLowerCase() !== ctx.domain) continue
    const local = a.slice(0, at).toLowerCase()
    const plus = local.indexOf('+')
    if (plus < 0 || local.slice(0, plus) !== ctx.roleLocal) continue
    // T-R3: `<role>+<tag>.<token>` (H2O_REPLY_TAG) or the untagged `<role>+<token>`; any valid tag, so a reply to mail
    // sent before a tag change still links.
    const tagged = TAGGED_TOKEN.exec(local.slice(plus + 1))
    found.add(tagged ? tagged[1]! : local.slice(plus + 1))
  }
  return [...found]
}

const header = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Pure: decide what to do with one inbound message, before any token lookup. */
export function classify(email: JmapEmail, ctx: InboundContext): Classification {
  const from = emailKey(addrs(email.from)[0])
  if (from && from.domain === ctx.domain && from.matchKey.split('@')[0]!.split('+')[0] === ctx.roleLocal)
    return { kind: 'REVIEW', reason: 'OWN_ADDRESS' }
  const auto = header(email['header:Auto-Submitted:asText'])
  if (auto && auto !== 'no') return { kind: 'REVIEW', reason: 'AUTO_SUBMITTED' }
  if (
    ['bulk', 'junk', 'list'].includes(header(email['header:Precedence:asText'])) ||
    header(email['header:List-Id:asText'])
  )
    return { kind: 'REVIEW', reason: 'BULK' }
  if (header(email['header:X-Spam-Status:asText']).startsWith('yes'))
    return { kind: 'REVIEW', reason: 'SPAM' }
  const tokens = tokensIn(email, ctx)
  if (tokens.length === 0) return { kind: 'REVIEW', reason: 'NO_TOKEN' }
  if (tokens.length > 1) return { kind: 'REVIEW', reason: 'MULTIPLE_TOKENS' }
  if (!REPLY_TOKEN_RE.test(tokens[0]!)) return { kind: 'REVIEW', reason: 'UNKNOWN_TOKEN' }
  return { kind: 'TOKEN', token: tokens[0]! }
}

export const BODY_LIMIT = 50_000

/** Untrusted text: keep newlines and tabs, drop other control characters, normalise line ends, bound length. */
export function cleanText(s: string): string {
  return [...s.replace(/\r\n?/g, '\n')]
    .filter((c) => {
      const n = c.charCodeAt(0)
      return n === 9 || n === 10 || (n >= 32 && n !== 127)
    })
    .join('')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, BODY_LIMIT)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** SEC-CRM-1: HTML longer than this is cut before any processing (the stored body is capped far lower anyway). */
export const HTML_LIMIT = 200_000
const SKIP_BLOCKS = new Set(['script', 'style', 'head', 'title', 'template', 'noscript'])
const BREAK_AFTER = /^(p|div|li|tr|h[1-6]|blockquote)$/
const TAG_NAME = /\/?([a-z][a-z0-9]*)/y
/** A code point from an entity, or a space when it is not a valid Unicode scalar (never throws). */
const codePoint = (n: number): string => (Number.isInteger(n) && n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : ' ')

/**
 * HTML reduced to text (tags, scripts, styles and comments removed). The result is only ever rendered as text.
 * SEC-CRM-1: one forward scan with `indexOf`, linear in the input (the old lazy regexes were quadratic on
 * unterminated `<script` or `<!--` openers). Each "no closing marker after here" answer is remembered, because it
 * stays true for every later position. Same output as before for well-formed HTML: an unterminated comment or
 * skipped block loses only its opening tag; a `<` with no `>` after it is kept as text.
 */
export function htmlToText(input: string): string {
  const html = input.length > HTML_LIMIT ? input.slice(0, HTML_LIMIT) : input
  // ASCII-only case folding (auditor note b): toLowerCase() can change the length (U+0130 → 2 code units), which would
  // shift the offsets found in `lower` away from `html`
  const lower = html.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))
  const out: string[] = []
  const noClose = new Set<string>()
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out.push(html.slice(i))
      break
    }
    out.push(html.slice(i, lt))
    if (!noClose.has('-->') && html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      if (close >= 0) {
        out.push(' ')
        i = close + 3
        continue
      }
      noClose.add('-->')
    }
    const gt = html.indexOf('>', lt + 1)
    if (gt < 0) {
      out.push(html.slice(lt))
      break
    }
    TAG_NAME.lastIndex = lt + 1
    const m = TAG_NAME.exec(lower)
    const name = m ? m[1]! : ''
    const closing = lower[lt + 1] === '/'
    i = gt + 1
    if (!m) continue
    if (!closing && SKIP_BLOCKS.has(name) && !noClose.has(name)) {
      const end = lower.indexOf(`</${name}`, i)
      const endGt = end < 0 ? -1 : html.indexOf('>', end)
      if (endGt < 0) noClose.add(name)
      else {
        out.push(' ')
        i = endGt + 1
      }
    } else if (name === 'br') out.push('\n')
    else if (closing && BREAK_AFTER.test(name)) out.push('\n')
  }
  return cleanText(
    out
      .join('')
      .replace(/&(#x?[0-9a-f]{1,8}|[a-z]{1,10});/gi, (m, e: string) => {
        const k = e.toLowerCase()
        if (k.startsWith('#x')) return codePoint(parseInt(k.slice(2), 16))
        if (k.startsWith('#')) return codePoint(parseInt(k.slice(1), 10))
        return ENTITIES[k] ?? m
      })
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n'),
  )
}

export function bodyOf(email: JmapEmail): string {
  const values = email.bodyValues ?? {}
  const part = (p: JmapBodyPart) => (p.partId ? (values[p.partId]?.value ?? '') : '')
  const text = (email.textBody ?? [])
    .filter((p) => !p.type || p.type === 'text/plain')
    .map(part)
    .join('\n\n')
  if (text.trim()) return cleanText(text)
  return htmlToText((email.htmlBody ?? []).map(part).join('\n'))
}

const line = (s: unknown, max: number) =>
  typeof s === 'string'
    ? [...s]
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, max)
    : ''

export const attachmentsOf = (email: JmapEmail) =>
  (email.attachments ?? [])
    .slice(0, 50)
    .map((a) => ({
      name: line(a.name, 120) || 'unnamed',
      type: line(a.type, 80) || 'application/octet-stream',
      size: typeof a.size === 'number' ? a.size : null,
    }))

const msgIdOf = (ids: string[] | null | undefined): string | null => {
  const v = (ids ?? [])[0]
  return typeof v === 'string' && /^[^<>\s]{1,250}$/.test(v) ? `<${v}>` : null
}
const refsOf = (ids: string[] | null | undefined): string | null => {
  const out = (ids ?? [])
    .filter((v) => typeof v === 'string' && /^[^<>\s]{1,250}$/.test(v))
    .slice(-20)
    .map((v) => `<${v}>`)
  return out.length ? out.join(' ') : null
}

/** The stored mailbox reference: `jmap:<id>`, or (Patch C) the IMAP id as-is (`imap:<mailbox hash>:<uidvalidity>:<uid>`). */
const sourceRefOf = (email: JmapEmail): string => (email.id.startsWith('imap:') ? line(email.id, 200) : `jmap:${line(email.id, 200)}`)

export type IngestResult = 'LINKED' | 'REVIEW' | 'DUPLICATE'

/** Store one inbound message (idempotent). Runs in the runner as a system write. */
export async function ingestInbound(
  payload: Payload,
  email: JmapEmail,
  ctx: InboundContext,
  now: Date = new Date(),
): Promise<IngestResult> {
  const sourceRef = sourceRefOf(email)
  const messageId = msgIdOf(email.messageId)
  const exists = async (collection: 'crm-email-messages' | 'crm-email-review', where: Doc) =>
    (await payload.find({ collection, where: where as never, depth: 0, limit: 1, overrideAccess: true })).docs
      .length > 0
  if (
    (await exists('crm-email-messages', { source_ref: { equals: sourceRef } })) ||
    (await exists('crm-email-review', { source_ref: { equals: sourceRef } }))
  )
    return 'DUPLICATE'
  if (messageId && (await exists('crm-email-messages', { message_id: { equals: messageId } })))
    return 'DUPLICATE'
  // Revenue Engine slice 1: a bounce report (RFC 3464) records a hard bounce for each failed address (5.x.x, not
  // 5.7.x). The report itself still goes to the review queue below like any automatic message.
  if (email.deliveryStatus) await recordDsnBounces(payload, email, now)

  const from = addrs(email.from)[0] ?? null
  const fromName = line((email.from ?? [])[0]?.name, 120) || null
  const subject = line(email.subject, 200) || '(no subject)'
  const body = bodyOf(email)
  const attachments = attachmentsOf(email)
  const receivedAt =
    email.receivedAt && !Number.isNaN(new Date(email.receivedAt).getTime())
      ? new Date(email.receivedAt).toISOString()
      : now.toISOString()
  const common = {
    from_address: from ? line(from, 254) : null,
    from_name: fromName,
    subject,
    body_text: body || '(empty message)',
    message_id: messageId,
    in_reply_to: msgIdOf(email.inReplyTo),
    references: refsOf(email.references),
    source_ref: sourceRef,
    attachments_withheld: attachments.length ? attachments : null,
  }

  const review = async (reason: EmailReviewReason, rfq: string | null = null): Promise<IngestResult> => {
    await payload.create({
      collection: 'crm-email-review',
      data: {
        ...common,
        reason,
        state: 'OPEN',
        to_addresses: [...addrs(email.to), ...addrs(email.cc)]
          .map((a) => line(a, 254))
          .join(', ')
          .slice(0, 1000),
        received_at: receivedAt,
        rfq,
      } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
    })
    return 'REVIEW'
  }

  const c = classify(email, ctx)
  if (c.kind === 'REVIEW') return review(c.reason)
  const tok = (
    await payload.find({
      collection: 'crm-reply-tokens',
      where: { token: { equals: c.token } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0] as unknown as Doc | undefined
  if (!tok) return review('UNKNOWN_TOKEN')
  const rfqId = relId(tok.rfq)
  if (!rfqId) return review('UNKNOWN_TOKEN')
  if (tok.revoked_at || new Date(String(tok.expires_at)).getTime() <= now.getTime())
    return review('EXPIRED_TOKEN', rfqId)
  await linkToRfq(
    payload,
    rfqId,
    common,
    `${ctx.roleLocal}+${c.token}@${ctx.domain}`,
    receivedAt,
    attachments.length,
    null,
  )
  return 'LINKED'
}

/** A message that repeatedly failed processing: recorded for an admin with whatever is safely readable. */
export async function recordProcessingFailure(
  payload: Payload,
  email: JmapEmail,
  now: Date = new Date(),
): Promise<void> {
  const sourceRef = sourceRefOf(email)
  if (
    (
      await payload.find({
        collection: 'crm-email-review',
        where: { source_ref: { equals: sourceRef } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
    ).docs.length
  )
    return
  await payload.create({
    collection: 'crm-email-review',
    data: {
      reason: 'PROCESSING_FAILED',
      state: 'OPEN',
      source_ref: sourceRef,
      from_address: line(addrs(email.from)[0], 254) || null,
      subject: line(email.subject, 200) || '(no subject)',
      body_text: '(This message could not be processed. Open it in the mailbox.)',
      received_at:
        email.receivedAt && !Number.isNaN(new Date(email.receivedAt).getTime())
          ? new Date(email.receivedAt).toISOString()
          : now.toISOString(),
    } as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
  })
}

async function linkToRfq(
  payload: Payload,
  rfqId: string,
  common: Doc,
  to: string | null,
  receivedAt: string,
  withheld: number,
  linkedBy: { id: string } | null,
): Promise<string> {
  const msg = await payload.create({
    collection: 'crm-email-messages',
    data: {
      ...common,
      direction: 'INBOUND',
      rfq: rfqId,
      status: 'RECEIVED',
      to_address: to,
      occurred_at: receivedAt,
    } as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
  })
  const id = String((msg as { id: string | number }).id)
  const rfq = (await payload.findByID({
    collection: 'crm-rfqs',
    id: rfqId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Doc
  await recordActivity(linkedBy ? ({ payload, user: linkedBy } as never) : { payload }, {
    type: 'EMAIL_RECEIVED',
    summary: `Customer email received${linkedBy ? ' (linked by an admin)' : ''}${withheld ? ` — ${withheld} attachment(s) withheld` : ''}`,
    idempotency_key: `email-in:${id}`,
    occurred_at: receivedAt,
    rfq: rfqId,
    account: relId(rfq.account),
    contact: relId(rfq.contact),
    detail: { message: id, attachments_withheld: withheld },
    actor_kind: linkedBy ? 'USER' : 'INTEGRATION',
  })
  return id
}

/** Admin: attach a reviewed inbound message to an RFQ by its number. The admin decides; the system never guesses. */
export async function linkReviewItem(
  s: CrmSession,
  input: { reviewId?: unknown; rfqNumber?: unknown },
): Promise<Outcome> {
  if (!s.isAdmin) return { ok: false, code: 'FORBIDDEN', message: 'Only an admin can link inbound email.' }
  const reviewId = typeof input.reviewId === 'string' ? input.reviewId : ''
  const number = typeof input.rfqNumber === 'string' ? input.rfqNumber.trim().toUpperCase() : ''
  if (!/^RFQ-[A-Z0-9-]{4,40}$/.test(number))
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Enter an RFQ number.',
      fields: { rfqNumber: 'Enter an RFQ number like RFQ-20261005-ABC123.' },
    }
  let item: Doc
  try {
    item = (await s.payload.findByID({
      collection: 'crm-email-review',
      id: reviewId,
      depth: 0,
      ...asUser(s),
    })) as unknown as Doc
  } catch {
    return { ok: false, code: 'NOT_FOUND', message: 'That item no longer exists.' }
  }
  if (item.state !== 'OPEN')
    return { ok: false, code: 'ALREADY_RESOLVED', message: 'This item was already resolved.' }
  const rfq = (
    await s.payload.find({
      collection: 'crm-rfqs',
      where: { rfq_number: { equals: number } },
      depth: 0,
      limit: 1,
      ...asUser(s),
    })
  ).docs[0] as unknown as Doc | undefined
  if (!rfq)
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'No RFQ has that number.',
      fields: { rfqNumber: 'No RFQ has that number.' },
    }
  if (
    typeof item.message_id === 'string' &&
    (
      await s.payload.find({
        collection: 'crm-email-messages',
        where: { message_id: { equals: item.message_id } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
    ).docs.length
  )
    return { ok: false, code: 'DUPLICATE', message: 'This email is already on an RFQ.' }
  const common = {
    from_address: item.from_address ?? null,
    from_name: item.from_name ?? null,
    subject: item.subject ?? '(no subject)',
    body_text: item.body_text ?? '(empty message)',
    message_id: item.message_id ?? null,
    in_reply_to: item.in_reply_to ?? null,
    references: item.references ?? null,
    source_ref: `review:${reviewId}`,
    attachments_withheld: item.attachments_withheld ?? null,
  }
  const withheld = Array.isArray(item.attachments_withheld) ? item.attachments_withheld.length : 0
  await linkToRfq(s.payload, String(rfq.id), common, null, String(item.received_at), withheld, {
    id: s.userId,
  })
  await s.payload.update({
    collection: 'crm-email-review',
    id: reviewId,
    data: {
      state: 'LINKED',
      rfq: String(rfq.id),
      resolved_by: s.userId,
      resolved_at: new Date().toISOString(),
    } as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
  })
  return { ok: true, message: `Linked to ${number}.`, id: String(rfq.id) }
}

/** Admin: discard a reviewed inbound message (it stays recorded, as DISCARDED). */
export async function discardReviewItem(s: CrmSession, input: { reviewId?: unknown }): Promise<Outcome> {
  if (!s.isAdmin) return { ok: false, code: 'FORBIDDEN', message: 'Only an admin can discard inbound email.' }
  const reviewId = typeof input.reviewId === 'string' ? input.reviewId : ''
  let item: Doc
  try {
    item = (await s.payload.findByID({
      collection: 'crm-email-review',
      id: reviewId,
      depth: 0,
      ...asUser(s),
    })) as unknown as Doc
  } catch {
    return { ok: false, code: 'NOT_FOUND', message: 'That item no longer exists.' }
  }
  if (item.state !== 'OPEN')
    return { ok: false, code: 'ALREADY_RESOLVED', message: 'This item was already resolved.' }
  await s.payload.update({
    collection: 'crm-email-review',
    id: reviewId,
    data: { state: 'DISCARDED', resolved_by: s.userId, resolved_at: new Date().toISOString() } as never,
    depth: 0,
    overrideAccess: true,
    context: { crmServer: {} },
  })
  return { ok: true, message: 'Discarded.' }
}

/** SEC-CRM-1: Message-IDs a delivery report names: its In-Reply-To / References, and any quoted in the report text. */
export function reportedMessageIds(email: JmapEmail): string[] {
  const ids = new Set<string>()
  for (const v of [...(email.inReplyTo ?? []), ...(email.references ?? [])]) if (v) ids.add(v.replace(/^<|>$/g, '').trim())
  for (const m of (email.deliveryStatus ?? '').slice(0, 20_000).matchAll(/^(?:original-)?message-id:\s*<?([^\s<>]{3,250})>?\s*$/gim)) ids.add(m[1]!)
  return [...ids].filter(Boolean).slice(0, 20)
}

/**
 * RFC 3464: hard bounces for failed recipients. SEC-CRM-1: a report is acted on only when it names a message the CRM
 * sent (its Message-ID, via In-Reply-To / References or quoted in the report) and only for the address that message
 * went to — the Final-Recipient the report states is matched against our own row, never trusted on its own. Anything
 * else changes nothing (the message itself still lands in the review queue as usual). Suppressions recorded here are
 * admin-clearable (crm/suppression.ts canClear).
 */
async function recordDsnBounces(payload: Payload, email: JmapEmail, now: Date): Promise<void> {
  const { parseDeliveryStatus, isHardBounce } = await import('../email/dsn')
  const { recordHardBounce } = await import('./ers/feedback')
  const ids = reportedMessageIds(email)
  if (ids.length === 0) return
  const ours = (
    await payload.find({
      collection: 'crm-email-outbox',
      where: {
        and: [
          { message_id: { in: ids.flatMap((id) => [id, `<${id}>`]) } },
          { sent_at: { greater_than: new Date(now.getTime() - 30 * 24 * 3600_000).toISOString() } },
        ],
      } as never,
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Doc[]
  if (ours.length === 0) return
  for (const r of parseDeliveryStatus(email.deliveryStatus ?? '').filter(isHardBounce)) {
    const key = emailKey(r.recipient)
    if (!key) continue
    const row = ours.find((d) => emailKey(d.to_address)?.matchKey === key.matchKey)
    if (!row) continue
    const to = emailKey(row.to_address)!
    await recordHardBounce(payload, { address: to.canonical, sourceEventId: `${DSN_EVENT_PREFIX}${line(email.id, 120)}:${to.matchKey}`.slice(0, 250), outboxId: String(row.id) }, now)
  }
}
