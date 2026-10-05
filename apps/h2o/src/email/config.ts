import { domainToASCII } from 'node:url'

/**
 * Mail configuration (CRM email M1, Control Tower brief 2026-10-04). Environment only; no default sends.
 *
 *   H2O_EMAIL_MODE          off | allowlist | live        default off; anything else is a configuration error
 *   H2O_EMAIL_ALLOWLIST     comma-separated addresses     allowlist mode: the only recipients that receive mail
 *   H2O_EMAIL_FROM          "Name <addr@<sender domain>>" or "addr@<sender domain>"   the sender (owner input)
 *   H2O_SALES_ALERT_TO      comma-separated addresses     new-RFQ alert recipients (owner input)
 *   H2O_EMAIL_CUSTOMER_ACK  on | off                      default off: the owner approves the text first
 *   H2O_SMTP_HOST / _PORT   internal submission endpoint  e.g. stalwart / 587 (never a public host)
 *   H2O_SMTP_USER / _PASS   submission credentials        secrets: environment only, never logged
 *   H2O_SMTP_TLS_SERVERNAME certificate name to verify    e.g. the mail host name (the ACME certificate)
 *
 * Submission always requires STARTTLS (or implicit TLS on 465) with a verified certificate and AUTH. There
 * is no plaintext and no "ignore certificate" switch. In `off` mode no transport is ever created.
 */

export type EmailMode = 'off' | 'allowlist' | 'live'
export const EMAIL_MODES: readonly EmailMode[] = ['off', 'allowlist', 'live']

export type SmtpSettings = {
  host: string
  port: number
  user: string
  pass: string
  servername: string
}

export type EmailConfig = {
  /** The effective mode. A configuration error always yields `off` (fail closed). */
  mode: EmailMode
  /** Requested mode, as written in the environment (for the readiness report). */
  requested: string
  /** Configuration problems, as codes (never values). Non-empty ⇒ mode is `off`. */
  errors: string[]
  allowlist: ReadonlySet<string>
  fromAddress: string
  fromName: string
  salesAlertTo: string[]
  customerAck: boolean
  smtp: SmtpSettings | null
}

const list = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Lowercased match key (local part case-folded, dots and +tags kept, domain IDNA) or null if the address is not
 * plausible. Self-contained so the readiness route does not import CRM code; a unit test pins it to
 * `crm/normalize.ts emailKey().matchKey`, which keys the suppression ledger.
 */
const EMAIL_SHAPE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/
export function recipientKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (v.length < 3 || v.length > 254 || !EMAIL_SHAPE.test(v)) return null
  const at = v.lastIndexOf('@')
  const d = v
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
  if (d === '' || d.length > 253 || /[\s/@:]/.test(d)) return null
  const ascii = domainToASCII(d)
  if (!ascii || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(ascii)) return null
  return `${v.slice(0, at).toLowerCase()}@${ascii}`
}

export function parseFrom(raw: string | undefined): { name: string; address: string } | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(v)
  const name = m ? m[1].replace(/^"|"$/g, '').trim() : ''
  const address = (m ? m[2] : v).trim()
  if (!recipientKey(address)) return null
  if (/[\r\n]/.test(name)) return null
  return { name: name || 'H2O Cooling', address }
}

export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const errors: string[] = []
  const requested = (env.H2O_EMAIL_MODE ?? 'off').trim().toLowerCase() || 'off'
  let mode: EmailMode = (EMAIL_MODES as readonly string[]).includes(requested)
    ? (requested as EmailMode)
    : 'off'
  if (!(EMAIL_MODES as readonly string[]).includes(requested)) errors.push('EMAIL_MODE_INVALID')

  const allowRaw = list(env.H2O_EMAIL_ALLOWLIST)
  const allowlist = new Set<string>()
  for (const a of allowRaw) {
    const k = recipientKey(a)
    if (k) allowlist.add(k)
    else errors.push('EMAIL_ALLOWLIST_ENTRY_INVALID')
  }

  const from = parseFrom(env.H2O_EMAIL_FROM)
  const salesAlertTo = list(env.H2O_SALES_ALERT_TO)
  if (salesAlertTo.some((a) => !recipientKey(a))) errors.push('SALES_ALERT_TO_INVALID')

  const ackRaw = (env.H2O_EMAIL_CUSTOMER_ACK ?? 'off').trim().toLowerCase()
  if (!['on', 'off'].includes(ackRaw)) errors.push('CUSTOMER_ACK_FLAG_INVALID')

  let smtp: SmtpSettings | null = null
  if (mode !== 'off') {
    if (!from) errors.push('EMAIL_FROM_MISSING_OR_INVALID')
    if (mode === 'allowlist' && allowlist.size === 0) errors.push('EMAIL_ALLOWLIST_EMPTY')
    const host = (env.H2O_SMTP_HOST ?? '').trim()
    const port = Number(env.H2O_SMTP_PORT ?? '587')
    const user = env.H2O_SMTP_USER ?? ''
    const pass = env.H2O_SMTP_PASS ?? ''
    const servername = (env.H2O_SMTP_TLS_SERVERNAME ?? '').trim()
    if (!host) errors.push('SMTP_HOST_MISSING')
    if (![587, 465].includes(port)) errors.push('SMTP_PORT_NOT_SUBMISSION')
    if (!user || !pass) errors.push('SMTP_CREDENTIALS_MISSING')
    if (!servername) errors.push('SMTP_TLS_SERVERNAME_MISSING')
    if (errors.length === 0) smtp = { host, port, user, pass, servername }
  }
  if (errors.length > 0) {
    mode = 'off'
    smtp = null
  }
  return {
    mode,
    requested,
    errors,
    allowlist,
    fromAddress: from?.address ?? '',
    fromName: from?.name ?? 'H2O Cooling',
    salesAlertTo,
    customerAck: ackRaw === 'on',
    smtp,
  }
}

/** Readiness: `off` is a valid, ready state; a requested mode that cannot be honoured is not. */
export function emailConfigState(cfg: EmailConfig = readEmailConfig()): 'ok' | 'off' | 'fail' {
  if (cfg.errors.length > 0) return 'fail'
  return cfg.mode === 'off' ? 'off' : 'ok'
}
