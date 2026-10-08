/**
 * CRM email M1 system messages: the internal sales alert and the password reset. Plain text is the authority; the
 * HTML part is the same words, escaped, in simple paragraphs (no images, no tracking, no external resources, no
 * scripts). Customer-facing messages (T1 acknowledgement, T2–T6) are templates since Patch C (email/templates.ts):
 * T1 is sent only while its wording is approved in the CRM and H2O_EMAIL_CUSTOMER_ACK=on.
 */

export type Rendered = { subject: string; text: string; html: string }

export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** One line of untrusted text: control characters and line breaks removed, length bounded. */
export const oneLine = (s: unknown, max = 160): string =>
  typeof s === 'string'
    ? [...s]
        .map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? ' ' : c))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/** Patch C: a plain-text template body → the HTML part (escaped paragraphs; blank lines separate paragraphs). */
export const textToHtml = (text: string): string => htmlFrom(text.trim().split(/\n{2,}/))

const htmlFrom = (paragraphs: string[]): string =>
  `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}</body></html>`

export type SalesAlertInput = {
  rfqNumber: string
  /** Owner launch requirement (CT 2026-10-08): every submitted field, in the order the customer gave them. */
  email: string | null
  firstName: string | null
  lastName: string | null
  company: string | null
  /** The purpose / interest the customer picked. */
  interest: string | null
  /** Product names: the product page the request came from, and any product on the request. */
  products: string[]
  phone: string | null
  country: string | null
  message: string | null
  /** Full URL of the page the request was sent from. */
  pageUrl: string | null
  ctaPlacement: string | null
  office: string | null
  /** When it arrived, and the office time zone it is shown in. */
  receivedAt: string | null
  timeZone: string
  crmUrl: string
}

/** A typed phone number and its digits-only form (+ and digits; an extension kept as "ext"). */
export function phoneForms(raw: string | null): { typed: string; digits: string } | null {
  const typed = oneLine(raw, 60)
  if (!typed) return null
  const n = typed.normalize('NFKC')
  const ext = /(?:x|ext\.?|extension)\s*([0-9]{1,6})\s*$/i.exec(n)
  const main = ext ? n.slice(0, ext.index) : n
  const digits = `${main.trim().startsWith('+') ? '+' : ''}${main.replace(/[^0-9]/g, '')}${ext ? ` ext ${ext[1]}` : ''}`
  return { typed, digits }
}

/** "8 Oct 2026, 09:15 MDT (America/Denver)", or "not recorded". */
export function alertTime(iso: string | null, timeZone: string): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return 'not recorded'
  const local = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(d)
  return `${local} (${timeZone})`
}

/**
 * Internal alert to the sales team (owner launch requirement, CT 2026-10-08, after the old Typeform notification):
 * every submitted field as plain question/answer pairs in the order submitted, then where it came from, which office it
 * is routed to, when it arrived, and the link into the CRM. It goes to the team's own mailboxes only; Reply-To is the
 * customer (set by the outbox worker), so sales can answer straight from the mailbox while CRM replies are off. No
 * signature (no phone or postal address), no images, no tracking.
 */
export function renderSalesAlert(i: SalesAlertInput): Rendered {
  const products = i.products.map((p) => oneLine(p, 120)).filter(Boolean)
  const name = [oneLine(i.firstName, 80), oneLine(i.lastName, 80)].filter(Boolean).join(' ')
  const phone = phoneForms(i.phone)
  const about = oneLine(i.interest, 80) || products[0] || ''
  const answer = (v: string) => v || 'not given'
  const pairs: Array<[string, string]> = [
    ['Email', answer(oneLine(i.email, 254))],
    ['First name', answer(oneLine(i.firstName, 80))],
    ['Last name', answer(oneLine(i.lastName, 80))],
    ['Company', answer(oneLine(i.company))],
    ['Interest', answer(oneLine(i.interest, 120))],
    ['Product', products.length ? products.join('; ') : 'not specified'],
    ['Phone', phone ? (phone.digits && phone.digits !== phone.typed ? `${phone.typed} (normalized: ${phone.digits})` : phone.typed) : 'not given'],
    ['Country of destination', answer(oneLine(i.country, 80))],
  ]
  // the message keeps its line breaks (control characters removed), bounded
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const message = (i.message ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, 6000) || 'not given'
  const paragraphs = [
    'Your website quote form has a new response:',
    pairs.map(([q, a]) => `${q}: ${a}`).join('\n'),
    `Message:\n${message}`,
    [
      `RFQ number: ${oneLine(i.rfqNumber, 40)}`,
      `Page: ${oneLine(i.pageUrl, 400) || 'not recorded'}`,
      `Request button: ${oneLine(i.ctaPlacement, 60) || 'not recorded'}`,
      `Routed to: ${oneLine(i.office, 10) === 'TH' ? 'Thailand office (TH)' : oneLine(i.office, 10) === 'US' ? 'US office (US)' : 'not routed'}`,
      `Received: ${alertTime(i.receivedAt, i.timeZone)}`,
    ].join('\n'),
    `Open it in the CRM: ${i.crmUrl}`,
    'Reply to this email to answer the customer directly.',
  ]
  return {
    subject: `New quote request — ${oneLine(i.company, 80) || name || 'website'}${about ? ` — ${oneLine(about, 80)}` : ''}`,
    text: paragraphs.join('\n\n') + '\n',
    html: htmlFrom(paragraphs),
  }
}

export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000

/** Staff password reset (Payload auth). The link is the only secret in it; it is never logged. */
export function renderPasswordReset(resetUrl: string): Rendered {
  const paragraphs = [
    'Someone asked to reset the password for your account on the H2O website administration.',
    `To choose a new password, open this link within 1 hour:\n${resetUrl}`,
    'If you did not ask for this, ignore this message. Your password stays the same.',
  ]
  return { subject: 'Reset your password', text: paragraphs.join('\n\n') + '\n', html: htmlFrom(paragraphs) }
}
