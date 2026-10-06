#!/usr/bin/env node
/**
 * Native RFQ intake — end-to-end test through the real UI (Main's corner chat and inline form) and the real adapter.
 * SYNTHETIC submissions only (example.test addresses, "(synthetic)" company names). Never point it at production.
 *
 *   PW_MODULE=<playwright path> node ops/native-intake/e2e.mjs --origin=<staging or local origin> --out=<dir> [--strip-csp]
 *        read-back (one of):
 *          H2O_E2E_ADMIN_EMAIL / _PASSWORD / _TOTP_SECRET   REST as an admin (hosted staging; two-factor via ops/mfa)
 *          H2O_E2E_DB_URL=postgres://…127.0.0.1…synthetic…  psql against a local synthetic database (local runs)
 *
 * --strip-csp is for LOCAL runs only (refused for any non-localhost origin): a local `next start` without the Payload
 * content runtime serves the hash-based static CSP on dynamically rendered pages, which blocks hydration. Hosted runs
 * keep the real policy, so they also prove the UI works under the production CSP.
 *
 * Scenarios: chat parts→TH (landing with UTM + gclid), chat new tower→US, chat repair from Japan→TH queue, inline form
 * upgrade→US, a double submit (the UI's own request replayed: same RFQ), a conflicting replay (409), and the honeypot
 * (confirmation without a number, nothing stored). Each RFQ is read back: source, queue, country, type, attribution,
 * and the sales-alert outbox row (email in allowlist mode on staging during the test).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { completeMfa } from '../mfa/sign-in.mjs'

const require = createRequire(import.meta.url)
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const ORIGIN = (arg('origin') ?? '').replace(/\/+$/, '')
const OUT = arg('out') ?? 'native-intake-e2e'
const STRIP = process.argv.includes('--strip-csp')
if (!/^https?:\/\//.test(ORIGIN)) throw new Error('--origin is required')
const host = new URL(ORIGIN).hostname
if (/(^|\.)h2ocooling\.(com|org)$/i.test(host)) throw new Error('refused: never run synthetic submissions against production')
if (STRIP && !['localhost', '127.0.0.1'].includes(host)) throw new Error('--strip-csp is for localhost only')
mkdirSync(`${OUT}/screenshots`, { recursive: true })
const RUN = Date.now().toString(36)
const results = []
const rec = (id, pass, detail = {}) => {
  results.push({ id, result: pass ? 'PASS' : 'FAIL', ...detail })
  console.log(JSON.stringify(results.at(-1)))
}

// ── read-back ────────────────────────────────────────────────────────────────────────────────────────────────────
let readRfq
if (process.env.H2O_E2E_DB_URL) {
  const url = process.env.H2O_E2E_DB_URL
  if (!/^postgres(ql)?:\/\/[^/]*(127\.0\.0\.1|localhost)[:/][^?]*synthetic/.test(url)) throw new Error('H2O_E2E_DB_URL must be a loopback synthetic database')
  const q = (sql) => execFileSync('psql', [url, '-X', '-A', '-t', '-c', sql], { encoding: 'utf8' }).trim()
  readRfq = async (n) => {
    const row = q(`select json_build_object('id', id, 'source_system', source_system, 'office', office, 'country_code', country_code, 'inquiry_type', inquiry_type,
      'cta', attribution_cta_placement, 'utm_source', attribution_utm_source, 'gclid', attribution_gclid, 'landing_page', attribution_landing_page,
      'alerts', (select count(*) from crm_email_outbox o where o.rfq_id = r.id and o.kind = 'RFQ_SALES_ALERT')) from crm_rfqs r where rfq_number = '${n.replace(/[^A-Z0-9-]/g, '')}'`)
    return row ? JSON.parse(row) : null
  }
} else if (process.env.H2O_E2E_ADMIN_EMAIL) {
  const login = await fetch(`${ORIGIN}/api/users/login/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.H2O_E2E_ADMIN_EMAIL, password: process.env.H2O_E2E_ADMIN_PASSWORD }) })
  const token = (await login.json()).token
  if (!token) throw new Error(`admin login failed (${login.status})`)
  await completeMfa(ORIGIN, token, process.env.H2O_E2E_ADMIN_TOTP_SECRET, { envName: 'H2O_E2E_ADMIN_TOTP_SECRET' })
  const get = async (p) => (await fetch(`${ORIGIN}/api/${p}`, { headers: { Authorization: `JWT ${token}` } })).json()
  readRfq = async (n) => {
    const r = (await get(`crm-rfqs?where[rfq_number][equals]=${encodeURIComponent(n)}&depth=0&limit=1`)).docs?.[0]
    if (!r) return null
    const alerts = (await get(`crm-email-outbox?where[rfq][equals]=${r.id}&where[kind][equals]=RFQ_SALES_ALERT&depth=0&limit=10`)).totalDocs ?? 0
    return { id: r.id, source_system: r.source_system, office: r.office, country_code: r.country_code, inquiry_type: r.inquiry_type, cta: r.attribution?.cta_placement, utm_source: r.attribution?.utm_source, gclid: r.attribution?.gclid, landing_page: r.attribution?.landing_page, alerts }
  }
} else throw new Error('set H2O_E2E_ADMIN_* (hosted) or H2O_E2E_DB_URL (local) for the read-back')

// ── browser ──────────────────────────────────────────────────────────────────────────────────────────────────────
const { chromium } = require(process.env.PW_MODULE ?? 'playwright')
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  if (STRIP)
    await ctx.route('**/*', async (route) => {
      const r = await route.fetch()
      const h = { ...r.headers() }
      delete h['content-security-policy']
      await route.fulfill({ response: r, headers: h })
    })
  return ctx
}
const P = '[data-rfq-panel]'
const steps = {
  chip: async (page, label) => page.click(`${P} button:has-text("${label}")`),
  text: async (page, v) => {
    await page.fill(`${P} input:not([name=company_website]):not([type=search]), ${P} textarea`, v)
    await page.click(`${P} button[aria-label="Send answer"]`)
  },
  skip: async (page) => page.click(`${P} button:has-text("Skip")`),
  country: async (page, name) => {
    await page.fill(`${P} input[type=search]`, name)
    await page.click(`${P} button:has-text("${name}")`)
  },
}
/** Run one chat scenario; returns { rfqNumber, request } (the exact submit body the UI sent). */
async function chat(name, path, script, opts = {}) {
  const ctx = await context()
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
  let request = null
  page.on('request', (r) => {
    if (r.url().includes('/api/rfq/submit/') && r.method() === 'POST') request = r.postData()
  })
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' })
  await page.click('[data-rfq-launcher]')
  await page.waitForSelector(`${P} button:has-text("Parts")`, { timeout: 30000 })
  await page.waitForTimeout(3500) // the form token refuses a submission faster than 3 s — a person takes longer
  for (const [kind, v] of script) {
    await steps[kind](page, v)
    await page.waitForTimeout(250)
  }
  if (opts.honeypot) await page.fill(`${P} input[name=company_website]`, 'https://spam.example', { force: true })
  await page.click(`${P} button:has-text("Send request")`)
  await page.waitForSelector(`${P} :text("Request sent")`, { timeout: 30000 })
  const text = await page.$eval(P, (e) => e.innerText)
  await page.screenshot({ path: `${OUT}/screenshots/${name}.png` })
  await ctx.close()
  return { rfqNumber: text.match(/RFQ-\d{8}-[0-9A-Z]{8}/)?.[0] ?? null, request, errors, confirmation: text }
}
const contact = (n, country) => [['text', `Ana E2E${n}`], ['text', 'Northwind Thermal (synthetic)'], ['text', `e2e.${RUN}.${n}@example.test`], ['skip'], ['country', country]]

const expectations = []
// 1. Chat, parts → Thailand, landing with UTM + gclid.
const s1 = await chat('chat-parts-th', `/cooling-tower-parts-online/?utm_source=google&utm_medium=cpc&gclid=Cj0KCQjw-e2e_${RUN}`, [
  ['chip', 'Parts'], ['text', 'Fan blades'], ['skip'], ['text', '4'], ['skip'], ...contact(1, 'Thailand'),
])
expectations.push(['chat-parts-th', s1, { source_system: 'NATIVE_CHAT', office: 'TH', country_code: 'TH', inquiry_type: 'PARTS', utm_source: 'google', gclid: `Cj0KCQjw-e2e_${RUN}` }])
// 2. Chat, new tower → US.
const s2 = await chat('chat-new-tower-us', '/', [
  ['chip', 'New cooling tower'], ['chip', 'Crossflow'], ['chip', '2–4'], ['text', 'Houston'], ['skip'], ...contact(2, 'United States'),
])
expectations.push(['chat-new-tower-us', s2, { source_system: 'NATIVE_CHAT', office: 'US', country_code: 'US', inquiry_type: 'NEW_TOWER' }])
// 3. Chat, repair from Japan → the Thailand queue (Japan has no queue of its own).
const s3 = await chat('chat-repair-jp', '/', [
  ['chip', 'Repair'], ['text', 'Fan vibration'], ['chip', 'Urgent: the tower is down or at risk'], ['skip'], ...contact(3, 'Japan'),
])
expectations.push(['chat-repair-jp-to-th', s3, { source_system: 'NATIVE_CHAT', office: 'TH', country_code: 'JP', inquiry_type: 'REPAIR_SERVICE' }])

// 4. Inline form on /contact-us/: upgrade (towers + "What would you like to improve?") → US queue.
{
  const ctx = await context()
  const page = await ctx.newPage()
  let request = null
  page.on('request', (r) => {
    if (r.url().includes('/api/rfq/submit/') && r.method() === 'POST') request = r.postData()
  })
  await page.goto(`${ORIGIN}/contact-us/`, { waitUntil: 'networkidle' })
  await page.check('[data-rfq-field="purpose"] input[value="upgrade"]')
  await page.check('[data-rfq-field="towers_type"] input[value="counterflow"]')
  await page.fill('[data-rfq-field="service_issue_upgrade"] textarea', 'More capacity in summer')
  await page.fill('[data-rfq-field="name"] input', 'Ben E2E4')
  await page.fill('[data-rfq-field="company"] input', 'Rhein Kühlung (synthetic)')
  await page.fill('[data-rfq-field="email"] input', `e2e.${RUN}.4@example.test`)
  await page.selectOption('[data-rfq-field="country"] select', 'DE')
  await page.waitForTimeout(3500)
  await page.click('button:has-text("Continue")')
  await page.click('button:has-text("Send request")')
  await page.waitForSelector(':text("Request sent")', { timeout: 30000 })
  const text = await page.innerText('body')
  await page.screenshot({ path: `${OUT}/screenshots/form-upgrade-de.png` })
  await ctx.close()
  expectations.push(['form-upgrade-us', { rfqNumber: text.match(/RFQ-\d{8}-[0-9A-Z]{8}/)?.[0] ?? null, request }, { source_system: 'NATIVE_FORM', office: 'US', country_code: 'DE', inquiry_type: 'REPAIR_SERVICE' }])
}

for (const [id, s, want] of expectations) {
  const row = s.rfqNumber ? await readRfq(s.rfqNumber) : null
  const mismatch = row ? Object.entries(want).filter(([k, v]) => row[k] !== v).map(([k]) => k) : ['no RFQ']
  rec(id, Boolean(row) && mismatch.length === 0 && Number(row.alerts) >= 1 && !(s.errors?.length), { rfqNumber: s.rfqNumber, mismatch, alerts: row?.alerts ?? 0, pageErrors: s.errors ?? [] })
}

// 5. Double submit: the UI's own request again → the same RFQ, nothing new. 6. Changed content, same id → 409.
const post = (body) => fetch(`${ORIGIN}/api/rfq/submit/`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin' }, body })
{
  const again = await post(s1.request)
  const j = await again.json()
  rec('double-submit-same-rfq', again.status === 200 && j.rfqNumber === s1.rfqNumber && j.replay === true, { status: again.status })
  const b = JSON.parse(s1.request)
  b.answers.parts_part = 'Gearbox'
  const conflict = await post(JSON.stringify(b))
  rec('conflicting-replay-409', conflict.status === 409 && (await conflict.json()).code === 'SUBMISSION_CONFLICT', { status: conflict.status })
}
// 7. Honeypot through the UI: the visitor sees a confirmation without a number; nothing is stored.
{
  const hp = await chat('chat-honeypot', '/', [['chip', 'Parts'], ['text', 'Fill media'], ['skip'], ['skip'], ['skip'], ...contact(7, 'Thailand')], { honeypot: true })
  const body = JSON.parse(hp.request ?? '{}')
  rec('honeypot-no-rfq', hp.rfqNumber === null && /Request sent/.test(hp.confirmation) && Boolean(body.antiAbuse?.hp), {})
}

writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((r) => r.result !== 'PASS').length
console.log(`SUMMARY ${results.length - failed}/${results.length} PASS`)
await browser.close()
process.exit(failed ? 1 : 0)
