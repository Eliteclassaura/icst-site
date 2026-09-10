import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { blockManifest } from '@factory/agency-core/blocks/manifest'

// C4 acceptance (docs/release-plan.md): every registry fixture renders in /dev/blocks with zero axe
// violations at 360 and 1440; content-bearing blocks are identical with JavaScript disabled;
// keyboard operability with visible focus; reduced motion disables animation. Requires DEV_ROUTES=1.

const url = (slug: string, fixture: string) => `/dev/blocks/${slug}/?fixture=${fixture}`

for (const b of blockManifest) {
  for (const f of b.fixtures) {
    test(`${b.slug}/${f}: renders with zero axe violations`, async ({ page }) => {
      const res = await page.goto(url(b.slug, f))
      expect(res?.status()).toBe(200)
      await expect(page.locator(`[data-block="${b.slug}"]`)).toHaveCount(1)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 1)).toEqual([])
    })
  }
}

test('no-JS parity: content blocks render the same text without JavaScript', async ({ browser }) => {
  const targets = ['faq', 'glossaryList', 'evidenceGrid', 'takeawayList', 'richText', 'briefForm']
  for (const slug of targets) {
    const withJs = await browser.newContext()
    const noJs = await browser.newContext({ javaScriptEnabled: false })
    const a = await withJs.newPage()
    const b = await noJs.newPage()
    await a.goto(url(slug, 'default'))
    await b.goto(url(slug, 'default'))
    const ta = (await a.locator('main').innerText()).replace(/\s+/g, ' ').trim()
    const tb = (await b.locator('main').innerText()).replace(/\s+/g, ' ').trim()
    expect(tb, slug).toBe(ta)
    expect(tb.length, slug).toBeGreaterThan(40)
    await withJs.close()
    await noJs.close()
  }
})

test('keyboard: header nav and brief form are operable in order with visible focus', async ({ page }) => {
  await page.goto(url('header', 'default'))
  const links = page.locator('header nav a')
  const n = await links.count()
  expect(n).toBeGreaterThan(3)
  // Tab through: logo, then each nav link in DOM order.
  await page.keyboard.press('Tab')
  await expect(page.locator('header a').first()).toBeFocused()
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab')
    await expect(links.nth(i)).toBeFocused()
    const outline = await links.nth(i).evaluate((el) => {
      const s = getComputedStyle(el)
      return `${s.outlineStyle} ${s.outlineWidth}`
    })
    expect(outline, `focus ring on nav link ${i}`).not.toMatch(/^none|0px$/)
  }

  await page.goto(url('briefForm', 'default'))
  const controls = page.locator(
    'form :is(input:not([type=hidden]):not([tabindex="-1"]), select, textarea, button)',
  )
  const count = await controls.count()
  expect(count).toBeGreaterThan(8)
  await controls.first().focus()
  for (let i = 1; i < count; i++) {
    await page.keyboard.press('Tab')
    await expect(controls.nth(i), `control ${i}`).toBeFocused()
  }
  // Honeypot never receives focus.
  await expect(page.locator('#website_url')).not.toBeFocused()
})

test('reduced motion: hero status dot has no running animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(url('hero', 'default'))
  const anim = await page.locator('.blk-hero__dot').evaluate((el) => getComputedStyle(el).animationName)
  expect(anim).toBe('none')
  await ctx.close()
})

test('every layout block is the same block set the CMS accepts', async ({ request }) => {
  // Registry (fixtures) ↔ Payload config drift guard: the /dev/blocks index lists every manifest slug.
  const res = await request.get('/dev/blocks/')
  const html = await res.text()
  for (const b of blockManifest) expect(html, b.slug).toContain(`/dev/blocks/${b.slug}/`)
})
