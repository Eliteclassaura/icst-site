#!/usr/bin/env node
/**
 * Launch email readiness (owner decision 2026-10-05: Google Workspace SMTP). Uses the app's own settings and transport
 * options (H2O_SMTP_* / H2O_EMAIL_FROM from the environment — secrets stay in the secret store).
 *
 *   node ops/email/smtp-check.mjs                    connect, STARTTLS, verify the certificate, AUTH — sends nothing
 *   node ops/email/smtp-check.mjs --send-to <addr>   additionally send ONE short test message to <addr>, which must be in
 *                                                    H2O_EMAIL_ALLOWLIST (staging/allowlist mode only)
 *
 * Prints codes and the server's greeting/capabilities only — never the password. Exit 0 = ready.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const nodemailer = require('nodemailer')

const env = process.env
const sendTo = process.argv.includes('--send-to') ? process.argv[process.argv.indexOf('--send-to') + 1] : null
const host = env.H2O_SMTP_HOST, port = Number(env.H2O_SMTP_PORT ?? '587'), user = env.H2O_SMTP_USER, pass = env.H2O_SMTP_PASS
const servername = env.H2O_SMTP_TLS_SERVERNAME, from = env.H2O_EMAIL_FROM
const missing = Object.entries({ H2O_SMTP_HOST: host, H2O_SMTP_USER: user, H2O_SMTP_PASS: pass, H2O_SMTP_TLS_SERVERNAME: servername, H2O_EMAIL_FROM: from }).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) { console.error(`smtp-check: NOT_READY missing ${missing.join(' ')}`); process.exit(2) }
if (![587, 465].includes(port)) { console.error('smtp-check: FAIL port must be 587 (STARTTLS) or 465 (TLS)'); process.exit(2) }
const allow = (env.H2O_EMAIL_ALLOWLIST ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
if (sendTo && !allow.includes(sendTo.toLowerCase())) { console.error('smtp-check: FAIL --send-to must be in H2O_EMAIL_ALLOWLIST'); process.exit(2) }

// The same options the app uses (src/email/transport.ts smtpOptions): STARTTLS required on 587, certificate verified.
const t = nodemailer.createTransport({
  host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass },
  tls: { servername, minVersion: 'TLSv1.2', rejectUnauthorized: true },
  connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000, logger: false, debug: false,
})
try {
  await t.verify()
  console.log(`smtp-check: OK connect + TLS + AUTH as the configured account on ${host}:${port}`)
  if (sendTo) {
    const info = await t.sendMail({ from, to: sendTo, subject: 'ICS CRM email check', text: 'This is a one-time delivery check from the ICS CRM. No action is needed.\n' })
    console.log(`smtp-check: OK sent 1 test message (accepted ${info.accepted.length}); check From alignment, SPF/DKIM pass in the received headers`)
  }
  process.exit(0)
} catch (e) {
  // Code and response code only: an error object can carry the server transcript.
  console.error(`smtp-check: FAIL ${e?.code ?? 'ERROR'}${e?.responseCode ? ` ${e.responseCode}` : ''}`)
  process.exit(1)
} finally {
  t.close()
}
