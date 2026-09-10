import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Requires DEV_ROUTES=1 on the server (dev-only preview route).
test('design tokens page loads self-hosted fonts and contacts no third-party host', async ({
  page,
  baseURL,
}) => {
  const hosts = new Set<string>()
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  const res = await page.goto('/dev/tokens/', { waitUntil: 'networkidle' })
  expect(res?.status()).toBe(200)
  const own = new URL(baseURL!).host
  expect([...hosts]).toEqual([own])
  const fonts = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  )
  expect(fonts).toEqual(expect.arrayContaining(['Bodoni Moda', 'Jost']))
  expect(await page.locator('link[rel="preload"][as="font"]').count()).toBe(2)
})

test('design tokens page has no axe violations and one h1', async ({ page }) => {
  await page.goto('/dev/tokens/')
  await expect(page.locator('h1')).toHaveCount(1)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 1)).toEqual([])
})

test('square geometry: buttons and inputs have zero border radius', async ({ page }) => {
  await page.goto('/dev/tokens/')
  for (const sel of ['.ds-btn', '.ds-field input']) {
    const r = await page
      .locator(sel)
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius)
    expect(r, sel).toBe('0px')
  }
})
