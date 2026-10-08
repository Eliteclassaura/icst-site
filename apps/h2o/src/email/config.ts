import { domainToASCII } from 'node:url'

/**
 * Mail configuration (CRM email M1, Control Tower brief 2026-10-04). Environment only; no default sends.
 *
 *   H2O_EMAIL_MODE          off | allowlist | live        default off; anything else is a configuration error
 *   H2O_EMAIL_ALLOWLIST     comma-separated addresses     allowlist mode: the only recipients that receive mail
 *   H2O_EMAIL_FROM          "Name <addr@<sender domain>>" or "addr@<sender domain>"   the sender (owner input)
 *   H2O_SALES_ALERT_TO      comma-separated addresses     new-RFQ alert recipients (owner input)
 *   H2O_EMAIL_CUSTOMER_ACK  on | off                      default off: the owner approves the text first
 *   H2O_SMTP_HOST / _PORT   submission endpoint            launch: smtp.gmail.com / 587 (Google Workspace, owner
 *                                                          decision 2026-10-05); Stalwart later
 *   H2O_SMTP_USER / _PASS   submission credentials        secrets: environment only, never logged
 *   H2O_SMTP_TLS_SERVERNAME certificate name to verify    e.g. the mail host name (the ACME certificate)
 *   H2O_EMAIL_ALLOWED_KINDS comma-separated outbox kinds  SEND-FIX-1a (review R2-02): the only kinds that may be queued or
 *                                                          sent. Default = the launch set RFQ_SALES_ALERT,RFQ_CUSTOMER_ACK
 *                                                          (owner 2026-10-08: CRM replies and sequences stay off at launch)
 *   H2O_REPLY_TAG           optional, [a-z0-9]{3,16}      T-R3: a fixed tag in Reply-To token addresses
 *                                                          (`<role>+<tag>.<token>@<domain>`) so a mail filter can
 *                                                          match every CRM reply (e.g. Gmail `to:(<role>+<tag>)`)
 *
 * Patch C: the H2O_SMTP_* "environment profile" is optional. An admin's active sending profile in the CRM replaces it
 * (email/profiles.ts); H2O_EMAIL_FROM stays the role mailbox that customer replies go to (Reply-To tokens, inbound).
 *
 * Submission always requires STARTTLS (or implicit TLS on 465) with a verified certificate and AUTH. There
 * is no plaintext and no "ignore certificate" switch. In `off` mode no transport is ever created.
 */

export type EmailMode = 'off' | 'allowlist' | 'live'
/** T-R3: the Reply-To tag: 3–16 lowercase letters or digits (no dot: the dot separates it from the token). */
export const REPLY_TAG_RE = /^[a-z0-9]{3,16}$/
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
  /** The acknowledgement's first-response promise, e.g. "within one business day"; null = no promise. */
  responsePromise: string | null
  /** T-R3: the fixed Reply-To tag (H2O_REPLY_TAG), or null for plain `<role>+<token>` addresses. */
  replyTag?: string | null
  smtp: SmtpSettings | null
  /** SEND-FIX-1a (R2-02): the outbox kinds allowed to queue and send; absent = the launch set. */
  allowedKinds?: readonly string[]
}

/**
 * SEND-FIX-1a (R2-02): every outbox kind, and the launch set (the internal RFQ alerts — new request, and a request that
 * could not be processed — and the T1 acknowledgement).
 * MFA_CODE (MFA-2's emailed sign-in code) is reserved and stays out of the launch set until MFA-2 ships and adds it.
 * System mail is NOT an outbox kind and is never gated here: Payload's own mail (password reset, anything sent with
 * payload.sendEmail) goes through email/adapter.ts (kind PAYLOAD_AUTH), gated only by the mode and recipient gate.
 */
export const OUTBOX_KINDS = ['RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'RFQ_REPLY', 'SEQUENCE_EMAIL', 'MFA_CODE', 'INTAKE_FAILED_ALERT'] as const
export const LAUNCH_KINDS: readonly string[] = ['RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'INTAKE_FAILED_ALERT']
/** May a message of this kind be queued or submitted now? Checked when queueing AND immediately before SMTP submit. */
export const kindAllowed = (kind: string, cfg: Pick<EmailConfig, 'allowedKinds'> = readEmailConfig()): boolean =>
  (cfg.allowedKinds ?? LAUNCH_KINDS).includes(kind)

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

/**
 * The sender's display name when none is configured (owner decision 2026-10-06, T-R3: "ICS Sales Team"; it replaced
 * "Rhonda Miller" of 2026-10-05). A default only: the name in H2O_EMAIL_FROM ("Name <address>") or a sending profile's
 * "Send as (name)" replaces it. The Revenue Engine signature is separate (signer + email, settings data).
 */
export const DEFAULT_SENDER_NAME = 'ICS Sales Team'

export function parseFrom(raw: string | undefined): { name: string; address: string } | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(v)
  const name = m ? m[1].replace(/^"|"$/g, '').trim() : ''
  const address = (m ? m[2] : v).trim()
  if (!recipientKey(address)) return null
  if (/[\r\n]/.test(name)) return null
  return { name: name || DEFAULT_SENDER_NAME, address }
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
  // owner launch requirement: one alert to the whole team list (~10 addresses); more than 20 is a mistake, not a list
  if (salesAlertTo.length > 20) errors.push('SALES_ALERT_TO_TOO_MANY')

  // Owner decision 2026-10-05: the acknowledgement promises a first response "within one business day" (per office).
  // `off` removes the promise sentence. Plain words only: it is inserted into a customer email.
  const promiseRaw = (env.H2O_EMAIL_RESPONSE_PROMISE ?? 'within one business day').trim()
  const responsePromise = promiseRaw.toLowerCase() === 'off' || promiseRaw === '' ? null : promiseRaw
  if (responsePromise && !/^[A-Za-z0-9 ,.'-]{3,60}$/.test(responsePromise)) errors.push('RESPONSE_PROMISE_INVALID')

  // T-R3: an invalid tag would make replies miss the mail filter that collects them: a configuration error (fail closed).
  const replyTag = (env.H2O_REPLY_TAG ?? '').trim()
  if (replyTag && !REPLY_TAG_RE.test(replyTag)) errors.push('REPLY_TAG_INVALID')

  const kindsRaw = env.H2O_EMAIL_ALLOWED_KINDS
  const allowedKinds = kindsRaw === undefined || kindsRaw.trim() === '' ? LAUNCH_KINDS : list(kindsRaw).map((k) => k.toUpperCase())
  if (allowedKinds.some((k) => !(OUTBOX_KINDS as readonly string[]).includes(k))) errors.push('EMAIL_ALLOWED_KINDS_INVALID')

  const ackRaw = (env.H2O_EMAIL_CUSTOMER_ACK ?? 'off').trim().toLowerCase()
  if (!['on', 'off'].includes(ackRaw)) errors.push('CUSTOMER_ACK_FLAG_INVALID')

  let smtp: SmtpSettings | null = null
  // Patch C: the environment profile is optional — with no H2O_SMTP_* at all, the active CRM sending profile supplies
  // the transport (email/profiles.ts). Set partly, it is still an error: never a half-configured transport.
  const envSmtp = ['H2O_SMTP_HOST', 'H2O_SMTP_USER', 'H2O_SMTP_PASS', 'H2O_SMTP_TLS_SERVERNAME'].some((k) => (env[k] ?? '').trim() !== '')
  if (mode !== 'off') {
    if (!from) errors.push('EMAIL_FROM_MISSING_OR_INVALID')
    if (mode === 'allowlist' && allowlist.size === 0) errors.push('EMAIL_ALLOWLIST_EMPTY')
  }
  if (mode !== 'off' && envSmtp) {
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
    fromName: from?.name ?? DEFAULT_SENDER_NAME,
    salesAlertTo,
    customerAck: ackRaw === 'on',
    responsePromise,
    replyTag: replyTag && REPLY_TAG_RE.test(replyTag) ? replyTag : null,
    smtp,
    allowedKinds,
  }
}

/** Readiness: `off` is a valid, ready state; a requested mode that cannot be honoured is not. */
export function emailConfigState(cfg: EmailConfig = readEmailConfig()): 'ok' | 'off' | 'fail' {
  if (cfg.errors.length > 0) return 'fail'
  return cfg.mode === 'off' ? 'off' : 'ok'
}

/**
 * CRM email M3 — inbound replies, read over JMAP from the role mailbox on the internal Stalwart service.
 *
 *   H2O_EMAIL_INBOUND       on | off      default off
 *   H2O_JMAP_HOST / _PORT   internal HTTPS endpoint; default H2O_SMTP_HOST / 443 (never a public host)
 *   credentials and TLS name: the same role account as submission (H2O_SMTP_USER / _PASS /
 *   H2O_SMTP_TLS_SERVERNAME); the certificate is verified, there is no plaintext option
 *   H2O_EMAIL_REPLY_DOMAIN  the domain of the Reply-To token addresses; default: the H2O_EMAIL_FROM domain
 *   H2O_IMAP_MAILBOX        IMAP only: the folder/label read (default INBOX). INBOX and All Mail hold a whole mailbox and
 *                           are refused (IMAP_PERSONAL_INBOX_REFUSED, T-R2.1) unless H2O_IMAP_ALLOW_INBOX=1
 *   H2O_IMAP_ALLOW_INBOX    1 = allow reading INBOX / All Mail (only for a mailbox that receives nothing but CRM mail)
 */
export type InboundSettings = {
  /** Patch C: `jmap` (Stalwart, default) or `imap` (Google Workspace: imap.gmail.com:993). */
  protocol: 'jmap' | 'imap'
  host: string
  port: number
  user: string
  pass: string
  servername: string
  /** IMAP only: the folder read (default INBOX). */
  mailbox: string | null
  roleLocal: string
  domain: string
}
export type InboundConfig = { enabled: boolean; errors: string[]; settings: InboundSettings | null }

/** IMAP folders that hold a whole mailbox rather than a chosen label (Gmail: INBOX and All Mail, in any locale/case). */
export const WHOLE_MAILBOX_FOLDERS: ReadonlySet<string> = new Set(['inbox', '[gmail]/all mail', '[google mail]/all mail'])

export function readInboundConfig(env: Record<string, string | undefined> = process.env): InboundConfig {
  const raw = (env.H2O_EMAIL_INBOUND ?? 'off').trim().toLowerCase()
  const errors: string[] = []
  if (!['on', 'off'].includes(raw)) errors.push('EMAIL_INBOUND_FLAG_INVALID')
  if (raw !== 'on') return { enabled: false, errors, settings: null }
  const from = parseFrom(env.H2O_EMAIL_FROM)
  const protocolRaw = (env.H2O_INBOUND_PROTOCOL ?? 'jmap').trim().toLowerCase()
  if (!['jmap', 'imap'].includes(protocolRaw)) errors.push('INBOUND_PROTOCOL_INVALID')
  const protocol: 'jmap' | 'imap' = protocolRaw === 'imap' ? 'imap' : 'jmap'
  let host: string
  let port: number
  let user: string
  let pass: string
  let servername: string
  let mailbox: string | null = null
  if (protocol === 'imap') {
    // Patch C: H2O_IMAP_HOST / _PORT (993 only: implicit TLS) / _USER / _PASS (default: the H2O_SMTP_* account —
    // with Google Workspace the same mailbox and app password) / _TLS_SERVERNAME (default: the host) / _MAILBOX.
    host = (env.H2O_IMAP_HOST ?? '').trim().toLowerCase()
    port = Number(env.H2O_IMAP_PORT ?? '993')
    user = env.H2O_IMAP_USER ?? env.H2O_SMTP_USER ?? ''
    const rawPass = env.H2O_IMAP_PASS ?? env.H2O_SMTP_PASS ?? ''
    // Google shows app passwords in groups of four; the spaces are not part of the password.
    pass = host === 'imap.gmail.com' ? rawPass.replace(/\s+/g, '') : rawPass
    servername = (env.H2O_IMAP_TLS_SERVERNAME ?? host).trim().toLowerCase()
    mailbox = (env.H2O_IMAP_MAILBOX ?? 'INBOX').trim() || 'INBOX'
    if (!host) errors.push('IMAP_HOST_MISSING')
    if (port !== 993) errors.push('IMAP_PORT_NOT_TLS')
    if (!user || !pass) errors.push('IMAP_CREDENTIALS_MISSING')
    if (!servername) errors.push('IMAP_TLS_SERVERNAME_MISSING')
    if (mailbox.length > 100 || /[\r\n"\\]/.test(mailbox)) errors.push('IMAP_MAILBOX_INVALID')
  } else {
    host = (env.H2O_JMAP_HOST ?? env.H2O_SMTP_HOST ?? '').trim()
    port = Number(env.H2O_JMAP_PORT ?? '443')
    user = env.H2O_SMTP_USER ?? ''
    pass = env.H2O_SMTP_PASS ?? ''
    servername = (env.H2O_SMTP_TLS_SERVERNAME ?? '').trim()
    if (!host) errors.push('JMAP_HOST_MISSING')
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('JMAP_PORT_INVALID')
    if (!user || !pass) errors.push('SMTP_CREDENTIALS_MISSING')
    if (!servername) errors.push('SMTP_TLS_SERVERNAME_MISSING')
  }
  if (!from) errors.push('EMAIL_FROM_MISSING_OR_INVALID')
  // T-R2 / T-R2.1 (CT, 2026-10-06): every message in the folder read is stored in the CRM (replies on their RFQ,
  // everything else in the review queue with its text). Reading a whole mailbox (INBOX, All Mail) is therefore opt-in,
  // whoever the login is: refused unless H2O_IMAP_ALLOW_INBOX=1. The normal setup reads a named label (e.g.
  // H2O_IMAP_MAILBOX=H2O-CRM, filled by Gmail filters); inbound stays off until one is set or the opt-in is given.
  if (protocol === 'imap' && mailbox && WHOLE_MAILBOX_FOLDERS.has(mailbox.toLowerCase()) && (env.H2O_IMAP_ALLOW_INBOX ?? '').trim() !== '1')
    errors.push('IMAP_PERSONAL_INBOX_REFUSED')
  if (errors.length > 0 || !from) return { enabled: false, errors, settings: null }
  const at = from.address.lastIndexOf('@')
  const domain = ((env.H2O_EMAIL_REPLY_DOMAIN ?? '').trim() || from.address.slice(at + 1)).toLowerCase()
  return {
    enabled: true,
    errors,
    settings: {
      protocol,
      host,
      port,
      user,
      pass,
      servername,
      mailbox,
      roleLocal: from.address.slice(0, at).split('+')[0]!.toLowerCase(),
      domain,
    },
  }
}

/**
 * The sales address (owner decision 2026-10-08: sales@h2ocooling.com everywhere). The ONE lookup for it: the quote
 * confirmation's attachments line (RFQ-FIX-1, R15) and the T1 Reply-To use it. H2O_RFQ_SALES_EMAIL, else the default; an
 * invalid value falls back. This is the environment fallback; the live value (Settings → Email routing, ALERTS-1) is
 * email/routing-read.ts resolveSalesAddressLive, which falls back to this.
 */
export const DEFAULT_SALES_ADDRESS = 'sales@h2ocooling.com'
export const resolveSalesAddress = (env: NodeJS.ProcessEnv = process.env): string => {
  const v = (env.H2O_RFQ_SALES_EMAIL ?? '').trim()
  return v.length <= 254 && /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v) ? v : DEFAULT_SALES_ADDRESS
}
