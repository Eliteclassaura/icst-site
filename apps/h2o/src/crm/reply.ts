import { randomBytes } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import { readEmailConfig, type EmailConfig } from '../email/config'
import { gateRecipient, recipientRef } from '../email/gate'
import { escapeHtml } from '../email/messages'
import { recordActivity } from './activity'
import { relId } from './guards'
import { messageIdFor, recordEmailEvent } from './notify'
import { emailKey } from './normalize'
import { evaluateTransactionalSend, ledgerFor } from './suppression'
import type { Outcome } from './workspace/mutations'
import { withRowLock } from './workspace/serialize'
import { asUser, type CrmSession } from './workspace/session'

/**
 * CRM email M2 — E2: a person (Admin or Sales) writes to the customer from the RFQ.
 *
 *   - The recipient is the RFQ's own customer address (the linked contact's, else the submitted one). There is
 *     no free-form "To": the CRM is not a general mailer.
 *   - Plain text, as written. The HTML part is generated from it (escaped paragraphs); a person never writes
 *     HTML. No attachments: refused clearly until CRM-2 attachments exist.
 *   - Sent from the role address (H2O_EMAIL_FROM) with `Reply-To: <role>+<token>@<domain>`, where the token is
 *     the RFQ's unguessable reply token (collections/email-messages.ts). M3 routes replies by that token only.
 *   - Suppression (do-not-contact, legal, bounce, invalid address, all-email scopes) is checked before anything
 *     is written, and again by the outbox worker before sending. The send gate (H2O_EMAIL_MODE) applies: a
 *     message the gate stops is still recorded on the RFQ, as NOT_SENT with the reason.
 *   - One message per compose token (idempotent on double submit), written inside the RFQ row lock as the user.
 *   - Logged as the RFQ conversation (who, when, subject, body, Message-ID) and an RFQ timeline entry.
 */

export const SUBJECT_MAX = 200
export const BODY_MAX = 20_000
export const REPLY_TOKEN_TTL_MS = 365 * 24 * 3600 * 1000
export const REPLY_TOKEN_RE = /^[a-z2-7]{26}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 130 random bits as 26 lowercase base32 characters (RFC 4648 alphabet, no padding). */
export function newReplyToken(): string {
  const bytes = randomBytes(17)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5 && out.length < 26) {
      out += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

/** `rfq@example.org` + token → `rfq+<token>@example.org`. Null if the sender is not a plain address. */
export function replyToAddress(fromAddress: string, token: string): string | null {
  const at = fromAddress.lastIndexOf('@')
  if (at < 1 || !REPLY_TOKEN_RE.test(token)) return null
  const local = fromAddress.slice(0, at).split('+')[0]
  return `${local}+${token}@${fromAddress.slice(at + 1)}`
}

export const replyHtml = (text: string): string =>
  `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}</body></html>`

type Valid = { ok: true; rfqId: string; subject: string; body: string; key: string }
export function validateReply(input: {
  rfqId?: unknown
  subject?: unknown
  body?: unknown
  token?: unknown
  attachments?: number
}): Valid | Extract<Outcome, { ok: false }> {
  if ((input.attachments ?? 0) > 0)
    return {
      ok: false,
      code: 'ATTACHMENTS_NOT_SUPPORTED',
      message: 'Attachments can’t be sent from the CRM yet. Nothing was sent.',
    }
  const rfqId = typeof input.rfqId === 'string' && UUID_RE.test(input.rfqId) ? input.rfqId : null
  if (!rfqId) return { ok: false, code: 'INVALID_ID', message: 'That record reference is not valid.' }
  if (typeof input.token !== 'string' || !UUID_RE.test(input.token))
    return {
      ok: false,
      code: 'INVALID_TOKEN',
      message: 'This form expired. Reload the page and write the reply again.',
    }
  const subject = typeof input.subject === 'string' ? input.subject.replace(/[\r\n\t]+/g, ' ').trim() : ''
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n').trim() : ''
  const fields: Record<string, string> = {}
  if (!subject) fields.subject = 'Add a subject.'
  else if (subject.length > SUBJECT_MAX) fields.subject = `Keep the subject under ${SUBJECT_MAX} characters.`
  if (!body) fields.body = 'Write the message.'
  else if (body.length > BODY_MAX)
    fields.body = `Keep the message under ${BODY_MAX.toLocaleString('en-US')} characters.`
  if (Object.keys(fields).length)
    return { ok: false, code: 'VALIDATION', message: 'Some values need attention.', fields }
  return { ok: true, rfqId, subject, body, key: `rfq-reply:${input.token.toLowerCase()}` }
}

type Doc = Record<string, unknown>

/** The RFQ's customer address, as the workspace shows it: the linked contact's, else the submitted one. */
export async function customerAddress(s: CrmSession, rfq: Doc): Promise<string | null> {
  const contactId = relId(rfq.contact)
  if (contactId) {
    try {
      const c = (await s.payload.findByID({
        collection: 'crm-contacts',
        id: contactId,
        depth: 0,
        ...asUser(s),
      })) as unknown as Doc
      const k = emailKey(c.email)
      if (k) return k.canonical
    } catch {
      // fall through to the submitted address
    }
  }
  return emailKey(((rfq.submitted ?? {}) as Doc).email)?.canonical ?? null
}

export type ReplyReadiness =
  | { state: 'READY'; to: string; mode: 'allowlist' | 'live'; allowlisted: boolean }
  | { state: 'MODE_OFF' | 'NO_ADDRESS' | 'SUPPRESSED' | 'NOT_CONFIGURED'; to: string | null }

/** For the compose panel: can a reply be written here, and what will happen to it? */
export async function replyReadiness(
  s: CrmSession,
  rfq: Doc,
  cfg: EmailConfig = readEmailConfig(),
): Promise<ReplyReadiness> {
  const to = await customerAddress(s, rfq)
  if (cfg.errors.length > 0) return { state: 'NOT_CONFIGURED', to }
  if (cfg.mode === 'off') return { state: 'MODE_OFF', to }
  if (!to) return { state: 'NO_ADDRESS', to: null }
  const ledger = await ledgerFor({ payload: s.payload } as never, emailKey(to)!.matchKey)
  if (!evaluateTransactionalSend(ledger, true).allowed) return { state: 'SUPPRESSED', to }
  return { state: 'READY', to, mode: cfg.mode, allowlisted: gateRecipient(cfg, to) === 'SEND' }
}

const findOne = async (
  req: PayloadRequest,
  collection: 'crm-email-messages' | 'crm-reply-tokens',
  where: Doc,
) =>
  ((
    await req.payload.find({
      collection,
      where: where as never,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })
  ).docs[0] ?? null) as unknown as Doc | null

/** The RFQ's live reply token: reuse it (extending its life) or issue a fresh one. Inside the RFQ lock. */
export async function ensureReplyToken(req: PayloadRequest, rfqId: string, now: Date): Promise<string> {
  const row = await findOne(req, 'crm-reply-tokens', { rfq: { equals: rfqId } })
  const expires = new Date(now.getTime() + REPLY_TOKEN_TTL_MS).toISOString()
  const live = row && !row.revoked_at && new Date(String(row.expires_at)).getTime() > now.getTime()
  if (row && live) {
    await req.payload.update({
      collection: 'crm-reply-tokens',
      id: String(row.id),
      data: { last_used_at: now.toISOString(), expires_at: expires } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
    })
    return String(row.token)
  }
  const token = newReplyToken()
  const data = {
    token,
    issued_at: now.toISOString(),
    last_used_at: now.toISOString(),
    expires_at: expires,
    revoked_at: null,
  }
  if (row)
    await req.payload.update({
      collection: 'crm-reply-tokens',
      id: String(row.id),
      data: data as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
    })
  else
    await req.payload.create({
      collection: 'crm-reply-tokens',
      data: { ...data, rfq: rfqId } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
    })
  return token
}

/** Threading: answer the latest inbound message if there is one, else follow the latest sent message. */
async function threadHeaders(
  req: PayloadRequest,
  rfqId: string,
): Promise<{ inReplyTo: string | null; references: string | null }> {
  const res = await req.payload.find({
    collection: 'crm-email-messages',
    where: {
      and: [
        { rfq: { equals: rfqId } },
        { or: [{ direction: { equals: 'INBOUND' } }, { status: { equals: 'SENT' } }] },
      ],
    } as never,
    sort: 'occurred_at',
    depth: 0,
    limit: 200,
    overrideAccess: true,
    req,
  })
  const docs = res.docs as unknown as Doc[]
  const ids = docs
    .map((d) => d.message_id)
    .filter((m): m is string => typeof m === 'string' && /^<[^<>\s]+>$/.test(m))
  const lastIn = [...docs]
    .reverse()
    .find((d) => d.direction === 'INBOUND' && typeof d.message_id === 'string')
  const inReplyTo = (lastIn?.message_id as string | undefined) ?? ids.at(-1) ?? null
  return { inReplyTo, references: ids.length ? ids.slice(-20).join(' ') : null }
}

export async function composeReply(
  s: CrmSession,
  input: { rfqId?: unknown; subject?: unknown; body?: unknown; token?: unknown; attachments?: number },
  now: Date = new Date(),
  cfg: EmailConfig = readEmailConfig(),
): Promise<Outcome> {
  const v = validateReply(input)
  if (!v.ok) return v
  let rfq: Doc
  try {
    rfq = (await s.payload.findByID({
      collection: 'crm-rfqs',
      id: v.rfqId,
      depth: 0,
      ...asUser(s),
    })) as unknown as Doc
  } catch {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'That record no longer exists or you don’t have access to it.',
    }
  }
  if (cfg.errors.length > 0 || !cfg.fromAddress)
    return {
      ok: false,
      code: 'EMAIL_NOT_CONFIGURED',
      message: 'Email is not set up on this environment. Nothing was sent.',
    }
  const to = await customerAddress(s, rfq)
  if (!to)
    return {
      ok: false,
      code: 'NO_ADDRESS',
      message: 'This inquiry has no valid email address. Nothing was sent.',
    }
  const key = emailKey(to)!
  const suppression = evaluateTransactionalSend(
    await ledgerFor({ payload: s.payload } as never, key.matchKey),
    true,
  )
  if (!suppression.allowed)
    return {
      ok: false,
      code: 'DO_NOT_CONTACT',
      message: 'This contact is on do-not-contact. Nothing was sent.',
    }

  return withRowLock(s, 'crm-rfqs', v.rfqId, async (req) => {
    const already = await findOne(req, 'crm-email-messages', { idempotency_key: { equals: v.key } })
    if (already)
      return { ok: true as const, message: 'This reply was already recorded.', id: String(already.id) }
    const token = await ensureReplyToken(req, v.rfqId, now)
    const replyTo = replyToAddress(cfg.fromAddress, token)
    if (!replyTo) throw new Error('REPLY_TO_UNBUILDABLE')
    const gate = gateRecipient(cfg, to)
    const queued = gate === 'SEND'
    const code = queued
      ? null
      : gate === 'INVALID_RECIPIENT'
        ? 'INVALID_RECIPIENT'
        : `MODE_${cfg.mode.toUpperCase()}`
    const { inReplyTo, references } = await threadHeaders(req, v.rfqId)
    const messageId = messageIdFor(cfg)
    const reference = String(rfq.rfq_number ?? '')
    const bodyText =
      reference && !v.body.includes(reference) ? `${v.body}\n\nReference: ${reference}` : v.body
    const msg = await req.payload.create({
      collection: 'crm-email-messages',
      data: {
        direction: 'OUTBOUND',
        rfq: v.rfqId,
        status: queued ? 'QUEUED' : 'NOT_SENT',
        status_code: code,
        author: s.userId,
        from_address: cfg.fromAddress,
        to_address: to,
        reply_to: replyTo,
        subject: v.subject,
        body_text: bodyText,
        body_html: replyHtml(bodyText),
        message_id: messageId,
        in_reply_to: inReplyTo,
        references,
        idempotency_key: v.key,
        occurred_at: now.toISOString(),
      } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
    })
    const msgId = String((msg as { id: string | number }).id)
    const ref = recipientRef(to)
    const out = await req.payload.create({
      collection: 'crm-email-outbox',
      data: {
        idempotency_key: v.key,
        kind: 'RFQ_REPLY',
        status: queued ? 'PENDING' : 'SUPPRESSED_BY_MODE',
        rfq: v.rfqId,
        conversation_message: msgId,
        recipient_ref: ref,
        to_address: queued ? to : null,
        message_id: queued ? messageId : null,
        attempts: 0,
        next_attempt_at: queued ? now.toISOString() : null,
        last_error_code: code,
      } as never,
      depth: 0,
      overrideAccess: true,
      context: { crmServer: {} },
      req,
    })
    const outId = String((out as { id: string | number }).id)
    await recordEmailEvent(req, {
      event: queued ? 'QUEUED' : 'SUPPRESSED',
      kind: 'RFQ_REPLY',
      code,
      outbox: outId,
      rfq: v.rfqId,
      recipient_ref: ref,
    })
    await recordActivity(req, {
      type: 'EMAIL_REPLY',
      summary: queued ? 'Email reply queued' : `Email reply not sent (${code})`,
      idempotency_key: `email-reply:${msgId}:${queued ? 'QUEUED' : 'NOT_SENT'}`,
      rfq: v.rfqId,
      account: relId(rfq.account),
      contact: relId(rfq.contact),
      detail: { message: msgId, outbox: outId, status: queued ? 'QUEUED' : 'NOT_SENT', code },
    })
    return queued
      ? { ok: true as const, message: 'Reply queued. It is sent within a minute.', id: msgId }
      : {
          ok: true as const,
          message:
            'Saved on the RFQ but not sent: this environment only sends to allow-listed test addresses.',
          id: msgId,
        }
  })
}
