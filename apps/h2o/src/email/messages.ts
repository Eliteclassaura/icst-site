/**
 * CRM email M1 message templates (E1). Plain text is the authority; the HTML part is the same words, escaped,
 * in simple paragraphs (no images, no tracking, no external resources, no scripts).
 *
 * Customer-facing copy states only facts the system knows: the reference number and the next step. It makes
 * no promise of a time, a price or an outcome, and it names no person, phone number or address — the sender
 * name comes from H2O_EMAIL_FROM. The acknowledgement is sent only when H2O_EMAIL_CUSTOMER_ACK=on, which the
 * owner turns on after approving this text (ACKNOWLEDGEMENT_TEXT_VERSION identifies the approved wording).
 */

export const ACKNOWLEDGEMENT_TEXT_VERSION = 'ACK_R1_DRAFT_2026-10-04'

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

/**
 * `responsePromise`: the owner's first-response commitment (owner decision 2026-10-05: "within one business day";
 * business days per office, Patch L1). Null or empty: the sentence promises no time.
 */
export type AckInput = { rfqNumber: string; firstName?: string | null; responsePromise?: string | null }

/**
 * Customer acknowledgement (T1), sent once per web RFQ. Wording: OGCS prelaunch copy R1 §7 T1 (CT-accepted), pending
 * the owner's final approval. It quotes only the RFQ number and the customer's first name — never their message.
 */
export function renderCustomerAck(i: AckInput): Rendered {
  const ref = oneLine(i.rfqNumber, 40)
  // Only a plausible name is echoed (letters, spaces, apostrophes, periods, hyphens); anything else greets neutrally.
  const name = oneLine(i.firstName, 40)
  const first = /^\p{L}[\p{L}\p{M} '’.-]{0,39}$/u.test(name) ? name : ''
  const promise = oneLine(i.responsePromise, 60)
  const paragraphs = [
    first ? `Hi ${first},` : 'Hello,',
    `Thank you for contacting Industrial Cooling Solutions. We've received your request and logged it as RFQ ${ref}.`,
    promise ? `A member of our team will review it and respond ${promise}.` : 'A member of our team will review it and contact you.',
    'If you have drawings, nameplate photos or earlier inspection reports, reply to this email and attach them. They help us scope your request accurately.',
    'The ICS team\nIndustrial Cooling Solutions (ICS)',
  ]
  return {
    subject: `We received your request: RFQ ${ref}`,
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
