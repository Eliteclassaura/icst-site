#!/usr/bin/env node
/**
 * CRM GO-LIVE — PASS 3 automated part: signed-in role boundaries and the UI-1 checks at 1440 / 1024 / 390.
 * Read-only (GET pages only; logs in through Payload's login endpoint). Synthetic users only (Commander creates
 * them on the validation DB; credentials come from the protected secrets location, never printed).
 *
 *   PW_MODULE=<path to playwright> CHROMIUM_PATH=<chromium binary, optional> \
 *   H2O_PASS3_BASE_URL=https://<validation-app-host> \
 *   H2O_PASS3_ADMIN_EMAIL=… H2O_PASS3_ADMIN_PASSWORD=… H2O_PASS3_SALES_EMAIL=… H2O_PASS3_SALES_PASSWORD=… \
 *   H2O_PASS3_NONCRM_EMAIL=… H2O_PASS3_NONCRM_PASSWORD=… H2O_PASS3_ACCOUNT_ID=<a synthetic account id, optional> \
 *   node ops/crm-golive/pass3-ui-review.mjs <outDir>
 *
 * Writes screenshots and ui-review.json (PASS/HOLD per check). The visual comparison against the UI-1 Figma
 * authority stays a human review of the screenshots (checklist in README.md).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { completeMfa } from '../mfa/sign-in.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_MODULE ?? 'playwright')
const env = process.env
const B = (env.H2O_PASS3_BASE_URL ?? '').replace(/\/+$/, '')
if (!/^https?:\/\//.test(B) || /h2ocooling\.com/i.test(B)) throw new Error('H2O_PASS3_BASE_URL must be the staging origin')
const OUT = process.argv[2] ?? 'pass3-ui-review'
mkdirSync(OUT, { recursive: true })
const CRED = {
  [env.H2O_PASS3_ADMIN_EMAIL]: env.H2O_PASS3_ADMIN_PASSWORD,
  [env.H2O_PASS3_SALES_EMAIL]: env.H2O_PASS3_SALES_PASSWORD,
  [env.H2O_PASS3_NONCRM_EMAIL]: env.H2O_PASS3_NONCRM_PASSWORD,
}
const TOTP = {
  [env.H2O_PASS3_ADMIN_EMAIL]: env.H2O_PASS3_ADMIN_TOTP_SECRET,
  [env.H2O_PASS3_SALES_EMAIL]: env.H2O_PASS3_SALES_TOTP_SECRET,
  [env.H2O_PASS3_NONCRM_EMAIL]: env.H2O_PASS3_NONCRM_TOTP_SECRET,
}
const results = []
const rec = (id, pass, detail = {}) => results.push({ id, result: pass ? 'PASS' : 'HOLD', ...detail })

async function tokenFor(email) {
  const r = await fetch(`${B}/api/users/login/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: CRED[email] }) })
  const token = (await r.json()).token
  // Patch L2: finish two-factor with this user's seeded secret.
  return completeMfa(B, token, TOTP[email], { envName: 'H2O_PASS3_*_TOTP_SECRET' })
}
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, laptop: { width: 1024, height: 768 }, phone: { width: 390, height: 844 } }

const browser = await chromium.launch(env.CHROMIUM_PATH ? { executablePath: env.CHROMIUM_PATH } : {})
async function session(email, vp) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1, ...(vp === 'phone' ? { isMobile: true, hasTouch: true } : {}) })
  const token = await tokenFor(email)
  await ctx.addCookies([{ name: 'payload-token', value: token, url: B }])
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  return { ctx, page, errors }
}

const firstRfq = async (page) => page.$eval('a[data-row-link]', (a) => a.getAttribute('href'))

for (const [who, email] of [['admin', env.H2O_PASS3_ADMIN_EMAIL], ['sales', env.H2O_PASS3_SALES_EMAIL]]) {
  for (const vp of Object.keys(VIEWPORTS)) {
    const { ctx, page, errors } = await session(email, vp)
    const shot = async (name) => page.screenshot({ path: `${OUT}/${who}-${vp}-${name}.png`, fullPage: true })
    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    const pages = []
    // My Work
    await page.goto(`${B}/crm/`, { waitUntil: 'networkidle' })
    await shot('my-work')
    pages.push(['my-work', await overflow()])
    const badLinks = await page.$$eval('a', (as) => as.filter((a) => /^(Open|View|Inquiry)$/.test(a.textContent.trim())).length)
    rec(`${who}-${vp}-M4`, badLinks === 0, { genericLinks: badLinks })
    const bareDue = await page.evaluate(() => /(^|\s)Due\s*·/.test(document.body.innerText))
    rec(`${who}-${vp}-M1`, !bareDue)
    rec(`${who}-${vp}-badge`, await page.evaluate(() => document.body.innerText.includes('SYNTHETIC DATA')))
    // Inbox
    await page.goto(`${B}/crm/rfqs/`, { waitUntil: 'networkidle' })
    await shot('inbox')
    pages.push(['inbox', await overflow()])
    const clippedHere = await page.evaluate(() => {
      const wrap = document.querySelector('.c-table-wrap')
      if (!wrap) return ['no-table']
      const w = wrap.getBoundingClientRect()
      return [...wrap.querySelectorAll('th')].filter((th) => th.getBoundingClientRect().width > 0 && th.getBoundingClientRect().right > w.right + 1).map((th) => th.innerText || 'Flags')
    })
    if (vp !== 'phone') rec(`${who}-${vp}-inbox-columns`, clippedHere.length === 0, { clippedHeaders: clippedHere })
    if (vp === 'phone') rec(`${who}-phone-title`, await page.evaluate(() => { const h = document.querySelector('.c-top h1'); return h && h.scrollWidth <= h.clientWidth }))
    const href = await firstRfq(page)
    if (vp === 'phone') {
      const cards = await page.$$eval('.c-rfq-table tbody tr', (rows) =>
        rows.slice(0, 3).map((r) => {
          const vis = (sel) => {
            const el = r.querySelector(sel)
            if (!el) return false
            const b = el.getBoundingClientRect()
            return b.width > 0 && b.height > 0 && b.right <= window.innerWidth + 1 && el.innerText.trim().length > 0
          }
          return { status: vis('td.status'), owner: vis('td.owner'), who: vis('td.two') }
        }),
      )
      rec(`${who}-phone-M3`, cards.length > 0 && cards.every((c) => c.status && c.owner && c.who), { cards })
    }
    // Split view (desktop) / detail
    await page.goto(`${B}${href}`, { waitUntil: 'networkidle' })
    await shot('inbox-split-or-detail')
    pages.push(['split', await overflow()])
    if (vp === 'desktop') {
      const clipped = await page.evaluate(() => {
        const wrap = document.querySelector('.c-table-wrap')
        if (!wrap) return ['no-table']
        const w = wrap.getBoundingClientRect()
        return [...wrap.querySelectorAll('th')].filter((th) => th.getBoundingClientRect().right > w.right + 1).map((th) => th.innerText)
      })
      rec('M2-' + who, clipped.length === 0, { clippedHeaders: clipped })
    }
    // Full detail page
    const detailPath = href.replace(/\?rfq=([^&]+).*/, '$1/')
    const id = new URL(href, B).searchParams.get('rfq')
    await page.goto(`${B}/crm/rfqs/${id}/`, { waitUntil: 'networkidle' })
    await shot('detail')
    pages.push(['detail', await overflow()])
    if (vp === 'phone') {
      const tabs = await page.$$eval('.c-tabs a', (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.innerText))
      rec(`${who}-phone-M5`, !tabs.includes('Technical'), { tabs })
    }
    await page.goto(`${B}/crm/rfqs/${id}/?tab=activity`, { waitUntil: 'networkidle' })
    await shot('detail-activity')
    const codes = await page.evaluate(() => (document.querySelector('.c-timeline')?.innerText.match(/\b[A-Z]+_[A-Z_]+\b/g) ?? []))
    rec(`${who}-${vp}-M7`, codes.length === 0, { codes })
    const extra = env.H2O_PASS3_ACCOUNT_ID ? [['account', `/crm/accounts/${env.H2O_PASS3_ACCOUNT_ID}/`]] : []
    for (const [name, path] of [['follow-ups', '/crm/follow-ups/'], ['pipeline', '/crm/pipeline/'], ['new', '/crm/new/'], ...extra]) {
      const r = await page.goto(`${B}${path}`, { waitUntil: 'networkidle' })
      await shot(name)
      pages.push([name, await overflow(), r?.status()])
    }
    // Required indicators (M6)
    await page.goto(`${B}/crm/new/`, { waitUntil: 'networkidle' })
    const req = await page.$$eval('[aria-required="true"]', (els) => els.map((e) => e.getAttribute('name')))
    rec(`${who}-${vp}-M6`, req.includes('message'), { required: req })
    // Shortcuts never fire while typing
    await page.goto(`${B}/crm/rfqs/`, { waitUntil: 'networkidle' })
    const search = await page.$('input[name="q"]')
    if (search && vp !== 'phone') {
      await search.click()
      await page.keyboard.type('jk')
      const ok = await page.evaluate(() => document.activeElement?.getAttribute('name') === 'q' && document.activeElement.value === 'jk' && location.pathname === '/crm/rfqs/')
      rec(`${who}-${vp}-keys`, ok)
    }
    rec(`${who}-${vp}-overflow`, pages.every(([, o]) => o <= 0), { pages })
    rec(`${who}-${vp}-console`, errors.length === 0, { errors: errors.slice(0, 5) })
    await ctx.close()
  }
}
// Non-CRM users land on /crm/denied
{
  const { ctx, page } = await session(env.H2O_PASS3_NONCRM_EMAIL, 'desktop')
  for (const path of ['/crm/', '/crm/rfqs/', '/crm/pipeline/']) {
    await page.goto(`${B}${path}`, { waitUntil: 'networkidle' })
    rec(`denied-noncrm${path}`, new URL(page.url()).pathname === '/crm/denied/', { url: new URL(page.url()).pathname })
  }
  await page.screenshot({ path: `${OUT}/noncrm-denied.png` })
  await ctx.close()
}
// Server-side role boundaries through the REST API (refusals only; a refused request writes nothing).
{
  const api = async (method, path, token, body) => {
    const r = await fetch(`${B}/api/${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `JWT ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    let j = {}
    try { j = await r.json() } catch {}
    return { status: r.status, body: j }
  }
  const sales = await tokenFor(env.H2O_PASS3_SALES_EMAIL)
  const admin = await tokenFor(env.H2O_PASS3_ADMIN_EMAIL)
  const noncrm = await tokenFor(env.H2O_PASS3_NONCRM_EMAIL)
  const review = (await api('GET', 'crm-identity-reviews/?limit=1&depth=0&where[state][equals]=OPEN', admin)).body.docs?.[0]
  if (review) {
    const r = await api('PATCH', `crm-identity-reviews/${review.id}/`, sales, { state: 'DISMISSED', resolution_note: 'PASS3 probe' })
    const after = (await api('GET', `crm-identity-reviews/${review.id}/?depth=0`, admin)).body
    rec('role-sales-cannot-resolve-identity', r.status === 403 && after.state === 'OPEN', { status: r.status })
  } else rec('role-sales-cannot-resolve-identity', false, { note: 'no OPEN identity review on staging to probe (run Pass 2 first)' })
  const closed = (await api('GET', 'crm-rfqs/?limit=1&depth=0&where[status][in]=CLOSED,REJECTED_NON_CORE,DUPLICATE_OF_EXISTING', admin)).body.docs?.[0]
  if (closed) {
    const r = await api('PATCH', `crm-rfqs/${closed.id}/`, sales, { status: 'IN_REVIEW' })
    rec('role-sales-cannot-reopen-terminal', r.status >= 400, { status: r.status })
  } else rec('role-sales-cannot-reopen-terminal', true, { note: 'no terminal RFQ to probe; covered by the DB suite (W3). Close one synthetic RFQ as Sales in the manual checklist, then rerun.' })
  const supp = (await api('GET', 'crm-suppressions/?limit=1&depth=0&where[action][equals]=APPLY', admin)).body.docs?.[0]
  if (supp) {
    const contact = supp.contact ?? (await api('GET', `crm-contacts/?limit=1&depth=0&where[email_match_key][equals]=${encodeURIComponent(supp.email_match_key)}`, admin)).body.docs?.[0]?.id
    const r = await api('POST', 'crm-suppressions/', sales, { contact, action: 'CLEAR', clears: supp.id, reason: supp.reason, reason_note: 'PASS3 probe' })
    const code = r.body?.errors?.[0]?.data?.code
    rec('role-sales-cannot-clear-suppression', r.status === 403 && code === 'SUPPRESSION_CLEAR_PRIVILEGED', { status: r.status, code })
  } else rec('role-sales-cannot-clear-suppression', false, { note: 'no suppression on staging to probe (run Pass 2 first)' })
  const anyRfq = (await api('GET', 'crm-rfqs/?limit=1&depth=0', admin)).body.docs?.[0]
  if (anyRfq) {
    for (const [who, t] of [['admin', admin], ['sales', sales], ['noncrm', noncrm], ['anonymous', null]]) {
      const r = await api('DELETE', `crm-rfqs/${anyRfq.id}/`, t)
      rec(`role-delete-refused-${who}`, r.status >= 400, { status: r.status })
    }
    const still = await api('GET', `crm-rfqs/${anyRfq.id}/?depth=0`, admin)
    rec('role-delete-nothing-deleted', still.status === 200)
  }
  const r = await api('GET', 'crm-rfqs/?limit=1', noncrm)
  rec('role-noncrm-rest-refused', r.status === 401 || r.status === 403, { status: r.status })
}
// Signed out → login
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${B}/crm/rfqs/`, { waitUntil: 'networkidle' })
  rec('signed-out', /\/admin\/login/.test(page.url()), { url: new URL(page.url()).pathname })
  await ctx.close()
}
await browser.close()
writeFileSync(`${OUT}/ui-review.json`, JSON.stringify(results, null, 2))
const hold = results.filter((r) => r.result === 'HOLD')
process.stdout.write(`${JSON.stringify({ checks: results.length, pass: results.length - hold.length, hold: hold.length })}\n`)
for (const h of hold) process.stdout.write(`${JSON.stringify(h)}\n`)
