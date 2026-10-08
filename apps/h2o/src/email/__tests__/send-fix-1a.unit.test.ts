import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { kindAllowed, LAUNCH_KINDS, readEmailConfig, resolveSalesAddress } from '../config'
import { classifyRefusal, submissionOutcome } from '../gate'
import { makeSendEmail } from '../adapter'
import { renderPasswordReset } from '../messages'
import type { MailMessage } from '../transport'
import { attemptIdentity } from '../outbox-worker'

/** SEND-FIX-1a (review R2-02, R2-03, R2-11): the pure pieces. */
const err = (o: Record<string, unknown>) => Object.assign(new Error('synthetic'), o)

describe('R2-03: did the mail server possibly accept it?', () => {
  it('a reply code is a definite answer; a failure before DATA is not accepted; anything at or after DATA is uncertain', () => {
    expect(submissionOutcome(err({ responseCode: 421, command: 'DATA' }))).toBe('NOT_ACCEPTED')
    expect(submissionOutcome(err({ responseCode: 550, command: 'RCPT TO' }))).toBe('NOT_ACCEPTED')
    for (const command of ['CONN', 'EHLO', 'STARTTLS', 'AUTH PLAIN', 'AUTH XOAUTH2', 'MAIL FROM', 'RCPT TO']) expect(submissionOutcome(err({ code: 'ETIMEDOUT', command })), command).toBe('NOT_ACCEPTED')
    for (const code of ['ECONNECTION', 'ECONNREFUSED', 'EDNS', 'ETLS', 'EAUTH', 'EENVELOPE', 'EMESSAGE']) expect(submissionOutcome(err({ code })), code).toBe('NOT_ACCEPTED')
    expect(submissionOutcome(err({ code: 'ETIMEDOUT', command: 'DATA' }))).toBe('UNCERTAIN')
    expect(submissionOutcome(err({ code: 'ECONNRESET' }))).toBe('UNCERTAIN')
    expect(submissionOutcome(err({ code: 'ESOCKET' }))).toBe('UNCERTAIN')
    expect(submissionOutcome(new Error('anything else'))).toBe('UNCERTAIN')
    expect(submissionOutcome(undefined)).toBe('UNCERTAIN')
  })
})

describe('R4-03: why a server refused (stage + enhanced code)', () => {
  it('only a confirmed invalid mailbox is an address failure; policy, size, login and unknown are not', () => {
    const r = (responseCode: number, response: string, command = 'RCPT TO') => classifyRefusal(err({ responseCode, response, command }))
    expect(r(550, '550 5.1.1 <x@example.test>: user unknown')).toBe('INVALID_MAILBOX')
    expect(r(550, '550 5.1.10 recipient address rejected')).toBe('INVALID_MAILBOX')
    expect(r(550, '550 5.1.8 sender address rejected')).toBe('UNKNOWN') // sender-side, not the recipient
    expect(r(550, '550 5.7.1 message refused: policy')).toBe('POLICY')
    expect(r(554, '554 5.7.1 rejected by reputation', 'DATA')).toBe('POLICY')
    expect(r(552, '552 5.3.4 message too big', 'DATA')).toBe('SIZE')
    expect(r(552, '552 message size exceeds limit', 'DATA')).toBe('SIZE')
    expect(r(552, '552 5.2.2 mailbox full')).toBe('POLICY')
    expect(r(535, '535 5.7.8 authentication failed', 'AUTH PLAIN')).toBe('AUTH')
    expect(classifyRefusal(err({ code: 'EAUTH' }))).toBe('AUTH')
    expect(r(553, '553 mailbox name not allowed')).toBe('UNKNOWN') // a bare 553 is no longer an address bounce
    expect(r(550, '550 refused')).toBe('UNKNOWN')
    expect(r(451, '451 4.7.1 try later')).toBe('TRANSIENT')
    expect(r(550, '550 5.1.1 user unknown', 'DATA')).toBe('UNKNOWN') // an invalid-mailbox code outside RCPT TO is not trusted
  })
})

describe('R2-02: the allowed kinds', () => {
  it('the launch set is the RFQ alert and T1; replies and sequences need an explicit list; a bad list fails closed', () => {
    expect(LAUNCH_KINDS).toEqual(['RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'INTAKE_FAILED_ALERT'])
    const launch = readEmailConfig({})
    for (const k of ['RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'INTAKE_FAILED_ALERT']) expect(kindAllowed(k, launch)).toBe(true)
    // owner launch requirement: the team list is ~10 addresses; more than 20 is a mistake (fail closed)
    const many = Array.from({ length: 21 }, (_, i) => `t${i}@example.test`).join(',')
    expect(readEmailConfig({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_FROM: 'rfq@example.test', H2O_SALES_ALERT_TO: many }).errors).toContain('SALES_ALERT_TO_TOO_MANY')
    expect(readEmailConfig({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_FROM: 'rfq@example.test', H2O_SALES_ALERT_TO: many.split(',').slice(0, 10).join(',') }).errors).not.toContain('SALES_ALERT_TO_TOO_MANY')
    for (const k of ['RFQ_REPLY', 'SEQUENCE_EMAIL', 'MFA_CODE', 'ANYTHING']) expect(kindAllowed(k, launch)).toBe(false)
    // MFA_CODE is a valid, reserved kind: MFA-2 turns it on by adding it to the list
    expect(kindAllowed('MFA_CODE', readEmailConfig({ H2O_EMAIL_ALLOWED_KINDS: 'RFQ_SALES_ALERT,RFQ_CUSTOMER_ACK,MFA_CODE' }))).toBe(true)
    expect(kindAllowed('RFQ_REPLY', readEmailConfig({ H2O_EMAIL_ALLOWED_KINDS: 'rfq_sales_alert, RFQ_REPLY' }))).toBe(true)
    expect(kindAllowed('RFQ_CUSTOMER_ACK', readEmailConfig({ H2O_EMAIL_ALLOWED_KINDS: 'RFQ_SALES_ALERT' }))).toBe(false)
    expect(readEmailConfig({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_ALLOWED_KINDS: 'RFQ_SALES_ALERT,MFA' }).errors).toContain('EMAIL_ALLOWED_KINDS_INVALID')
  })
  it('the sales address: sales@h2ocooling.com unless configured', async () => {
    expect(await resolveSalesAddress({} as NodeJS.ProcessEnv)).toBe('sales@h2ocooling.com')
    expect(await resolveSalesAddress({ H2O_RFQ_SALES_EMAIL: 'quotes@example.test' } as unknown as NodeJS.ProcessEnv)).toBe('quotes@example.test')
  })
})

describe('system mail is not an outbox kind: the launch allowlist never blocks it (auditor, MFA-2 review)', () => {
  it('under the launch allowlist a forgot-password email still sends; replies, sequences and blasts stay blocked', async () => {
    const launch = readEmailConfig({ H2O_EMAIL_MODE: 'live', H2O_EMAIL_FROM: 'Desk <rfq@example.test>', H2O_SMTP_HOST: 'smtp.example.test', H2O_SMTP_PORT: '587', H2O_SMTP_USER: 'rfq@example.test', H2O_SMTP_PASS: 'synthetic-pass', H2O_SMTP_TLS_SERVERNAME: 'smtp.example.test' })
    expect(launch.errors).toEqual([])
    for (const k of ['RFQ_REPLY', 'SEQUENCE_EMAIL', 'BLAST', 'MFA_CODE']) expect(kindAllowed(k, launch), k).toBe(false)
    const events: Array<Record<string, unknown>> = []
    const sent: MailMessage[] = []
    const send = makeSendEmail({ create: async ({ data }: { data: Record<string, unknown> }) => (events.push(data), data) } as never, launch, {
      send: async (m) => (sent.push(m), { messageId: '<x@example.test>', accepted: 1 }),
      close: () => undefined,
    })
    expect(await send({ to: 'owner.synthetic@example.test', subject: 'Reset your password', html: renderPasswordReset('https://admin.example.test/admin/reset/SYNTHETIC').html })).toEqual({ sent: 1, suppressed: 0 })
    expect(sent).toHaveLength(1)
    expect(events).toEqual([expect.objectContaining({ event: 'DIRECT_SENT', kind: 'PAYLOAD_AUTH' })])
  })
})

describe('R2-03: the attempt identity never carries a secret', () => {
  it('host, port, account, TLS name, envelope sender, From and profile; no password', () => {
    const cfg = readEmailConfig({ H2O_EMAIL_MODE: 'allowlist', H2O_EMAIL_ALLOWLIST: 'a@example.test', H2O_EMAIL_FROM: 'Desk <rfq@example.test>', H2O_SMTP_HOST: 'smtp.example.test', H2O_SMTP_PORT: '465', H2O_SMTP_USER: 'rfq@example.test', H2O_SMTP_PASS: 'never-shown-secret', H2O_SMTP_TLS_SERVERNAME: 'smtp.example.test' })
    const id = attemptIdentity('TRANSACTIONAL', cfg, { ok: true, source: 'profile', profileId: '42', smtp: cfg.smtp!, fromAddress: cfg.fromAddress, fromName: cfg.fromName })
    expect(id).toEqual({ lane: 'TRANSACTIONAL', source: 'profile', profile_id: '42', host: 'smtp.example.test', port: 465, account: 'rfq@example.test', tls_servername: 'smtp.example.test', envelope_from: 'rfq@example.test', from: '"Desk" <rfq@example.test>' })
    expect(JSON.stringify(id)).not.toContain('never-shown-secret')
  })
})

describe('R2-11: a dialog portaled to <body> carries the saved theme', () => {
  const css = readFileSync(path.join(__dirname, '../../crm/workspace/ui/crm.css'), 'utf8')
  it('pinned light reaches the portal host through the light token block, pinned dark through the dark one', () => {
    expect(css).toContain(".c-body:has(.c-theme[data-theme='light']) > .crm-portal-host,\n.crm-app {")
    expect(css).toContain(".c-body:has(.c-theme[data-theme='dark']) > .crm-portal-host,\n[data-theme='dark'] .crm-app {")
    const dialog = readFileSync(path.join(__dirname, '../../crm/workspace/ui/ActionDialog.tsx'), 'utf8')
    expect(dialog).toContain('createPortal(<div className="crm-app crm-portal-host">')
  })
})
