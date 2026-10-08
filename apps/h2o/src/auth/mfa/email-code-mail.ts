import type { Payload } from 'payload'
import { textToHtml, type Rendered } from '../../email/messages'
import { CODE_TTL_MS } from './email-code'

/**
 * MFA-2: the sign-in code email. Plain words, no link, no phone number, no postal address, nothing about the account
 * beyond the fact that someone asked for a code. The code is in the body only (never the subject, never logged).
 */
export function renderSignInCode(code: string): Rendered {
  const minutes = Math.round(CODE_TTL_MS / 60_000)
  const text = [
    `Your H2O CRM sign-in code is ${code}.`,
    `It works once and expires in ${minutes} minutes.`,
    'If you did not ask for it, you can ignore this message. Nobody can sign in with the code alone; they also need your password.',
  ].join('\n\n')
  return { subject: 'Your sign-in code', text, html: textToHtml(text) }
}

/** `jo***@example.com`: enough for the person to recognise the inbox, not enough to learn the address. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  if (!domain) return 'your email'
  return `${local.slice(0, 2)}***@${domain}`
}

/** Sends the code through the one system mail path (Payload's adapter: send gate, mode, allowlist, event log). */
export async function deliverSignInCode(payload: Payload, to: string, code: string): Promise<void> {
  const m = renderSignInCode(code)
  // No Reply-To on purpose (CT/auditor 2026-10-08): the code mail is not a conversation. Without one, a reply goes to the From
  // address (the sales mailbox); that is low risk because a code is single use, expires in 10 minutes and needs the password.
  await payload.sendEmail({ to, subject: m.subject, text: m.text, html: m.html })
}
