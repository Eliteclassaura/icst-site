import type { EmailAdapter, Payload, SendEmailOptions } from 'payload'
import { recordEmailEvent } from '../crm/notify'
import { readEmailConfig, type EmailConfig } from './config'
import { resolveSending, withSending } from './profiles'
import { failureCode, gateRecipient, recipientRef } from './gate'
import { createTransport, formatFrom, type MailTransport } from './transport'

/**
 * Payload's email adapter for H2O (CRM email M1). Payload itself sends only auth mail (the password reset).
 *
 * It is ALWAYS configured — in `off` mode too — because Payload's fallback when no adapter is set is to write
 * the whole message, recipient and reset link included, to the server log. This adapter never logs a
 * recipient, subject, body, link or token; a send failure is reported as a code only.
 *
 * Every call passes the send gate (H2O_EMAIL_MODE / allowlist) and writes one email event:
 * DIRECT_SENT, DIRECT_SUPPRESSED or DIRECT_FAILED. A suppressed message resolves quietly (the caller's
 * response must not differ, so it reveals nothing about which accounts exist).
 */

export class EmailSendError extends Error {
  constructor(public readonly code: string) {
    super(`EMAIL_SEND_FAILED ${code}`)
    this.name = 'EmailSendError'
  }
}

const recipientsOf = (to: SendEmailOptions['to']): string[] => {
  const one = (v: unknown): string | null =>
    typeof v === 'string'
      ? v
      : v && typeof v === 'object' && typeof (v as { address?: unknown }).address === 'string'
        ? (v as { address: string }).address
        : null
  const all = Array.isArray(to) ? to.map(one) : [one(to)]
  return all
    .filter((x): x is string => Boolean(x))
    .flatMap((x) =>
      x
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
}

const textFromHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

export function makeSendEmail(payload: Payload, cfg: EmailConfig, transport: MailTransport | null, noTransportCode?: string) {
  return async (message: SendEmailOptions): Promise<{ sent: number; suppressed: number }> => {
    const kind = 'PAYLOAD_AUTH'
    let sent = 0
    let suppressed = 0
    for (const to of recipientsOf(message.to)) {
      const ref = recipientRef(to)
      if (gateRecipient(cfg, to) === 'SEND' && !transport) {
        // Patch C: sending is on but no transport is usable (see email/profiles.ts) — a failure, reported by code.
        await recordEmailEvent({ payload }, { event: 'DIRECT_FAILED', kind, code: noTransportCode ?? 'NO_TRANSPORT', recipient_ref: ref })
        throw new EmailSendError(noTransportCode ?? 'NO_TRANSPORT')
      }
      if (gateRecipient(cfg, to) !== 'SEND' || !transport) {
        suppressed++
        await recordEmailEvent(
          { payload },
          { event: 'DIRECT_SUPPRESSED', kind, code: `MODE_${cfg.mode.toUpperCase()}`, recipient_ref: ref },
        )
        continue
      }
      const html = typeof message.html === 'string' ? message.html : undefined
      const text = typeof message.text === 'string' ? message.text : html ? textFromHtml(html) : ''
      try {
        await transport.send({
          from: formatFrom(cfg),
          to,
          subject: typeof message.subject === 'string' ? message.subject : '',
          text,
          html,
          headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
        })
        sent++
        await recordEmailEvent({ payload }, { event: 'DIRECT_SENT', kind, recipient_ref: ref })
      } catch (err) {
        const { code } = failureCode(err)
        await recordEmailEvent({ payload }, { event: 'DIRECT_FAILED', kind, code, recipient_ref: ref })
        throw new EmailSendError(code)
      }
    }
    return { sent, suppressed }
  }
}

export const h2oEmailAdapter: EmailAdapter<{ sent: number; suppressed: number }> = ({ payload }) => {
  const cfg = readEmailConfig()
  return {
    name: 'h2o-gated-submission',
    defaultFromAddress: cfg.fromAddress || 'no-reply@invalid',
    defaultFromName: cfg.fromName,
    // Patch C: the transport and sender are resolved per message (the active sending profile, else the environment).
    sendEmail: async (message) => {
      const env = readEmailConfig()
      const r = env.mode === 'off' ? null : await resolveSending(payload, env, 'TRANSACTIONAL')
      const effective = r ? withSending(env, r) : env
      const transport = createTransport(effective)
      try {
        return await makeSendEmail(payload, effective, transport, r && !r.ok ? r.code : undefined)(message)
      } finally {
        transport?.close()
      }
    },
  }
}
