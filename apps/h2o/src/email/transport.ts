import nodemailer from 'nodemailer'
import type { EmailConfig, SmtpSettings } from './config'

/**
 * The only place a mail transport is created. SMTP submission to the internal Stalwart service:
 *
 *   - port 587: STARTTLS is required (`requireTLS`) — a server that does not offer it is refused, never
 *     downgraded to plaintext; port 465: implicit TLS;
 *   - the certificate is verified against H2O_SMTP_TLS_SERVERNAME (the ACME certificate for
 *     the mail host name), TLS 1.2 minimum; there is no switch to skip verification. A test CA is trusted
 *     only through Node's own NODE_EXTRA_CA_CERTS, never through code;
 *   - AUTH with H2O_SMTP_USER / H2O_SMTP_PASS;
 *   - nodemailer logging and debug are off, and file/URL attachment sources are disabled.
 */

export type MailMessage = {
  from: string
  to: string
  subject: string
  text: string
  html?: string
  messageId?: string
  replyTo?: string
  inReplyTo?: string
  references?: string
  headers?: Record<string, string>
}
export type MailResult = { messageId: string | null; accepted: number }
export type MailTransport = { send: (m: MailMessage) => Promise<MailResult>; close: () => void }

export function smtpOptions(s: SmtpSettings) {
  return {
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    requireTLS: s.port !== 465,
    auth: { user: s.user, pass: s.pass },
    tls: { servername: s.servername, minVersion: 'TLSv1.2' as const, rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}

export function createTransport(cfg: EmailConfig): MailTransport | null {
  if (cfg.mode === 'off' || !cfg.smtp) return null
  const t = nodemailer.createTransport(smtpOptions(cfg.smtp))
  return {
    send: async (m) => {
      const info = await t.sendMail({
        from: m.from,
        to: m.to,
        subject: m.subject,
        text: m.text,
        ...(m.html ? { html: m.html } : {}),
        ...(m.messageId ? { messageId: m.messageId } : {}),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(m.inReplyTo ? { inReplyTo: m.inReplyTo } : {}),
        ...(m.references ? { references: m.references } : {}),
        headers: m.headers ?? {},
      })
      return {
        messageId: typeof info.messageId === 'string' ? info.messageId : null,
        accepted: info.accepted.length,
      }
    },
    close: () => t.close(),
  }
}

export const formatFrom = (cfg: Pick<EmailConfig, 'fromName' | 'fromAddress'>): string =>
  `"${cfg.fromName.replace(/["\\\r\n]/g, '')}" <${cfg.fromAddress}>`

/** Patch C: connect, secure the connection (verified certificate) and authenticate, then disconnect. Sends nothing. */
export async function verifySmtp(s: SmtpSettings): Promise<void> {
  const t = nodemailer.createTransport(smtpOptions(s))
  try {
    await t.verify()
  } finally {
    t.close()
  }
}

/** Patch C: one message through the given settings (the settings page's test send). Same TLS rules as every send. */
export async function sendWith(s: SmtpSettings, m: MailMessage): Promise<void> {
  const t = nodemailer.createTransport(smtpOptions(s))
  try {
    await t.sendMail({ from: m.from, to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), headers: m.headers ?? {} })
  } finally {
    t.close()
  }
}
