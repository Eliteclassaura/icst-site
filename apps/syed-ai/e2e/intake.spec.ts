import { test, expect } from '@playwright/test'

const brief =
  'Our category pages lost AI Overview citations after the spring redesign; we want the audit and a fixed-scope plan for the quarter.'

// Every test presents a distinct client address so the per-address limits are exercised deliberately,
// not by accident. This requires the server under test to run with TRUSTED_PROXY=xff (CI does; see
// ci.yml) — with the fail-closed default TRUSTED_PROXY=none the header is ignored, every request shares
// UNTRUSTED_BUCKET and these tests exhaust the hourly limit. That a header cannot mint a bucket by
// default is asserted in packages/agency-core/test/intake.test.ts, not here.
// Third octet is per run, so re-runs inside the same hour do not inherit an earlier run's counters.
const runOctet = 1 + Math.floor(Math.random() * 250)
let ipN = 1
const nextIp = () => `198.51.${runOctet}.${test.info().parallelIndex * 40 + ipN++}`
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.1' } })

test.describe('brief form (C6)', () => {
  test('JS on: fetch submit, inline status, no navigation', async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.waitForTimeout(3200) // dwell ≥ 3 s
    await page.fill('#fName', 'E2E Person')
    await page.fill('#fEmail', `e2e-${Date.now()}@example.test`)
    await page.fill('#fCompany', 'E2E Ltd')
    await page.fill('#fBrief', brief)
    const url = page.url()
    await page.click('form.blk-brief__form button[type=submit]')
    await expect(page.locator('#brief-status')).toHaveAttribute('data-kind', 'ok', { timeout: 15_000 })
    await expect(page.locator('#brief-status')).toContainText(/your brief is in/i)
    await expect(page.locator('#brief-status')).toContainText(/e\*\*\*@example\.test/)
    await expect(page.locator('#brief-status')).not.toContainText(/e2e-\d+@example\.test/)
    expect(page.url()).toBe(url)
    await ctx.close()
  })

  test('JS on: typo domain gets a one-click suggestion', async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.waitForTimeout(3200)
    await page.fill('#fName', 'Typo Person')
    await page.fill('#fEmail', `typo-${Date.now()}@gmial.com`)
    await page.fill('#fBrief', brief)
    await page.click('form.blk-brief__form button[type=submit]')
    await expect(page.locator('#brief-status')).toHaveAttribute('data-kind', 'error', { timeout: 15_000 })
    await expect(page.locator('#brief-status')).toContainText(/did you mean/i)
    await expect(page.locator('#fEmail')).toHaveValue(/@gmail\.com$/)
    await ctx.close()
  })

  test('JS off: native POST answers with the masked, noindex confirmation page', async ({ browser }) => {
    const ctx = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
    })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.fill('#fName', 'NoJS Person')
    await page.fill('#fEmail', `nojs-${Date.now()}@example.test`)
    await page.fill('#fBrief', brief + ' (no JavaScript)')
    await page.click('form.blk-brief__form button[type=submit]')
    await page.waitForURL(/\/thanks\/\?s=/)
    await expect(page.locator('h1')).toContainText(/your brief is in/i)
    await expect(page.locator('body')).toContainText(/n\*\*\*@example\.test/)
    await expect(page.locator('body')).not.toContainText(/nojs-\d+@example\.test/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await ctx.close()
  })

  test('honeypot is invisible to a11y and a filled one is silently accepted', async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } })
    const page = await ctx.newPage()
    const request = ctx.request
    await page.goto('/')
    // Visually and semantically hidden (clip-path + opacity + aria-hidden), out of the tab order — but present in
    // the DOM so autofilling bots still find it.
    const hp = page.locator('.blk-brief__hp')
    await expect(hp).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('#website_url')).toHaveAttribute('tabindex', '-1')
    expect(await hp.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
    const res = await request.post('/api/forms/brief', {
      headers: { accept: 'application/json' },
      form: {
        name: 'Bot',
        email: 'bot@example.test',
        brief: 'bot brief bot brief',
        website_url: 'http://x.example',
        t0: String(Date.now() - 10_000),
      },
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).ok).toBe(true)
    await ctx.close()
  })

  test('6th send in an hour from one address is refused with 429', async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextIp() } })
    const post = (i: number) =>
      ctx.request.post('/api/forms/brief', {
        headers: { accept: 'application/json' },
        form: {
          name: 'Burst',
          email: `burst-${Date.now()}-${i}@example.test`,
          brief: `${brief} Variant ${i}.`,
          t0: String(Date.now() - 10_000),
        },
      })
    for (let i = 0; i < 5; i++) expect((await post(i)).status()).toBe(200)
    const sixth = await post(5)
    expect(sixth.status()).toBe(429)
    expect((await sixth.json()).code).toBe('ip-sends')
    await ctx.close()
  })

  test('rate-events, submissions and leads are not readable anonymously over REST', async ({ request }) => {
    for (const c of ['rate-events', 'submissions', 'leads', 'contacts']) {
      const res = await request.get(`/api/${c}`)
      expect([401, 403]).toContain(res.status())
    }
  })
})
