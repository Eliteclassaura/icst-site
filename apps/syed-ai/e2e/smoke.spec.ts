import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('home page renders server-side at / with title, canonical and one h1', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+\/$/)
  await expect(page).toHaveTitle(/Get Cited in ChatGPT/)
})

test('/home/ is not a duplicate of /: it redirects permanently', async ({ request }) => {
  const res = await request.get('/home/', { maxRedirects: 0 })
  expect(res.status()).toBe(308)
  expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe('/')
})

test('non-slash URL redirects once to the slash form', async ({ request }) => {
  const res = await request.get('/dev/blocks', { maxRedirects: 0 })
  expect(res.status()).toBe(308)
  expect(res.headers()['location']).toMatch(/\/dev\/blocks\/$/)
})

test('unknown route is a real 404', async ({ request }) => {
  const res = await request.get('/does-not-exist/')
  expect(res.status()).toBe(404)
})

test('home page has no axe violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('@admin admin login page loads', async ({ page }) => {
  const res = await page.goto('/admin/login')
  expect(res?.status()).toBe(200)
})
