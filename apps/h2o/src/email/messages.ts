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
  company: string | null
  products: string[]
  pagePath: string | null
  ctaPlacement: string | null
  crmUrl: string
}

/**
 * Internal alert to the sales inbox. It identifies the RFQ and links to it; it does not carry the customer's
 * message body, name, address or phone number (those stay in the CRM, behind sign-in).
 */
export function renderSalesAlert(i: SalesAlertInput): Rendered {
  const products = i.products.map((p) => oneLine(p, 120)).filter(Boolean)
  const lines = [
    `RFQ number: ${oneLine(i.rfqNumber, 40)}`,
    `Company: ${oneLine(i.company) || 'not given'}`,
    `Product: ${products.length ? products.join('; ') : 'not specified'}`,
    `Page: ${oneLine(i.pagePath, 200) || 'not recorded'}`,
    `Request button: ${oneLine(i.ctaPlacement, 60) || 'not recorded'}`,
  ]
  const paragraphs = [
    'A new request for quotation was received through the website.',
    lines.join('\n'),
    `Open it in the CRM: ${i.crmUrl}`,
    'The customer’s details and message are in the CRM. This alert is sent automatically; do not reply to it.',
  ]
  return {
    subject: `New RFQ ${oneLine(i.rfqNumber, 40)}`,
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
