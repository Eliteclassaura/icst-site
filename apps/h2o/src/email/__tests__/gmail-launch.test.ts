import { describe, expect, it } from 'vitest'
import { readEmailConfig } from '../config'
import { smtpOptions } from '../transport'
import { replyToAddress } from '../../crm/reply'

/**
 * Owner decision 2026-10-05: email ON at launch through Google Workspace SMTP, sender sales@ (the only identity).
 * M1's env transport needs no code change; this pins the settings Commander will use (values are synthetic).
 */
const GMAIL = {
  H2O_EMAIL_MODE: 'allowlist',
  H2O_EMAIL_ALLOWLIST: 'staff@example.org',
  H2O_EMAIL_FROM: 'ICS Sales <sales@example.org>',
  H2O_SMTP_HOST: 'smtp.gmail.com',
  H2O_SMTP_PORT: '587',
  H2O_SMTP_USER: 'sales@example.org',
  H2O_SMTP_PASS: 'synthetic-app-password',
  H2O_SMTP_TLS_SERVERNAME: 'smtp.gmail.com',
  H2O_SALES_ALERT_TO: 'alerts-1@example.org, alerts-2@example.org',
}

describe('launch email via Google Workspace SMTP', () => {
  it('is a valid configuration: STARTTLS on 587 is required (never downgraded), the certificate is verified', () => {
    const cfg = readEmailConfig(GMAIL)
    expect(cfg.errors).toEqual([])
    expect(cfg.mode).toBe('allowlist')
    expect(smtpOptions(cfg.smtp!)).toMatchObject({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'sales@example.org', pass: 'synthetic-app-password' },
      tls: { servername: 'smtp.gmail.com', minVersion: 'TLSv1.2', rejectUnauthorized: true },
    })
  })
  it('sales alerts go to a configured list; the promise defaults to "within one business day" and can be switched off', () => {
    const cfg = readEmailConfig(GMAIL)
    expect(cfg.salesAlertTo).toEqual(['alerts-1@example.org', 'alerts-2@example.org'])
    expect(cfg.responsePromise).toBe('within one business day')
    expect(readEmailConfig({ ...GMAIL, H2O_EMAIL_RESPONSE_PROMISE: 'off' }).responsePromise).toBeNull()
    expect(readEmailConfig({ ...GMAIL, H2O_EMAIL_RESPONSE_PROMISE: '<script>' }).errors).toContain('RESPONSE_PROMISE_INVALID')
  })
  it('the Reply-To token is a plus-address of the sender, which Gmail delivers to the sender mailbox', () => {
    expect(replyToAddress('sales@example.org', 'abcdefghijklmnopqrstuvwxyz')).toMatch(/^sales\+[^@]+@example\.org$/)
  })
})
