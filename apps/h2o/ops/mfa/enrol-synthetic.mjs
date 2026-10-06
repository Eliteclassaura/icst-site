#!/usr/bin/env node
/**
 * Patch L2: enrol one SYNTHETIC staging user in two-factor through the real page (/crm/mfa/), the way a person would —
 * no bypass, no database access. The authenticator here is the 0600 credentials file: the setup key shown on the page
 * is appended to it as `totp_secret=…`, and the first code is computed from it. Nothing secret is printed.
 *
 *   PW_MODULE=<playwright module path> node ops/mfa/enrol-synthetic.mjs <staging origin> <0600 credentials file>
 *
 * The credentials file holds `email=` and `password=` lines (the existing synthetic-user file). Refuses the public
 * production hosts. Recovery codes are acknowledged on screen and not stored (a synthetic user is reset by an admin).
 */
import { appendFileSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { totpCode } from './totp.mjs'

const require = createRequire(import.meta.url)
const [origin, file] = process.argv.slice(2)
const fail = (m) => {
  console.error(`enrol-synthetic: ${m}`)
  process.exit(2)
}
if (!origin || !file) fail('usage: node ops/mfa/enrol-synthetic.mjs <staging origin> <0600 credentials file>')
const base = origin.replace(/\/+$/, '')
if (!/^https?:\/\//.test(base) || /(^|\.)h2ocooling\.(com|org)$/i.test(new URL(base).hostname)) fail('refused: staging or rehearsal origins only')
if ((statSync(file).mode & 0o077) !== 0) fail('the credentials file must be mode 0600')
const lines = readFileSync(file, 'utf8').split('\n')
if (lines.some((l) => l.startsWith('totp_secret='))) fail('the file already holds a totp_secret (nothing changed)')
const get = (k) => lines.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? fail(`no ${k}= line in the credentials file`)
const email = get('email')
const password = get('password')

const { chromium } = require(process.env.PW_MODULE ?? 'playwright')
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`${base}/admin/login/?redirect=/admin/`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL(/\/crm\/mfa\//, { timeout: 60000 }), page.click('button[type=submit]')])
  const shots = process.env.ENROL_SCREENSHOT_DIR // evidence runs against synthetic local servers only
  await page.locator('[aria-label="Setup key"]').waitFor({ timeout: 15000 })
  if (shots) await page.screenshot({ path: `${shots}/mfa-enrol-setup.png`, fullPage: true })
  const key = (await page.locator('[aria-label="Setup key"]').textContent({ timeout: 15000 }))?.replace(/\s+/g, '') ?? ''
  if (!/^[A-Z2-7]{16,}$/.test(key)) fail('no setup key on the page (is this user already enrolled? an admin can reset it)')
  appendFileSync(file, `${lines[lines.length - 1] === '' ? '' : '\n'}totp_secret=${key}\n`, { mode: 0o600 })
  await page.fill('input[name=code]', totpCode(key))
  await page.click('button[type=submit]')
  await page.getByText('Save your recovery codes').waitFor({ timeout: 30000 })
  if (shots) await page.screenshot({ path: `${shots}/mfa-enrol-recovery-codes.png`, fullPage: true })
  // Leave through the exit route, which sets the routing cookie, and land where the sign-in was going.
  await Promise.all([page.waitForURL(/\/admin\//, { timeout: 30000 }), page.getByRole('link', { name: 'I saved them. Continue' }).click()])
  console.log('enrol-synthetic: two-factor on; totp_secret appended to the credentials file')
} finally {
  await browser.close()
}
