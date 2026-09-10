import { test, expect } from '@playwright/test'

// C5 acceptance beyond the parity gate (tools/parity/compare.mjs runs separately in CI):
// redirects are single-hop, legacy .php paths are gone, security headers present, generated text routes,
// sitemap includes the A4 URLs, JSON-LD parses, hash routes resolve.

const ROUTES = [
  '/',
  '/geo-pricing/',
  '/geo-vs-seo/',
  '/cited-not-recommended/',
  '/glossary/',
  '/work/skincare/',
  '/building/revenue-crm/',
]

test('redirects are single-hop 308s to the canonical form', async ({ request }) => {
  for (const [from, to] of [
    ['/geo-pricing', '/geo-pricing/'],
    ['/index.html', '/'],
    ['/geo-pricing/index.html', '/geo-pricing/'],
    ['/home/', '/'],
  ]) {
    const res = await request.get(from!, { maxRedirects: 0 })
    expect(res.status(), from).toBe(308)
    expect(new URL(res.headers()['location']!, 'http://x').pathname, from).toBe(to)
    const next = await request.get(res.headers()['location']!, { maxRedirects: 0 })
    expect(next.status(), `${from} → ${to} must not chain`).toBe(200)
  }
})

test('legacy PHP endpoints are gone: 404, send.php is 410', async ({ request }) => {
  for (const p of [
    '/diagnose.php',
    '/subscribers.php',
    '/subs.php',
    '/confirm.php',
    '/email-check.php',
    '/roadmap.php',
  ])
    expect((await request.get(p)).status(), p).toBe(404)
  expect((await request.get('/send.php')).status()).toBe(410)
})

test('security headers on public HTML; none of the legacy leaks', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  expect(h['content-security-policy']).toMatch(/frame-ancestors 'none'/)
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['x-powered-by']).toBeUndefined()
  // Payload's API is not wrapped in the public CSP (admin needs its own policy — launch checklist)
  const api = await request.get('/api/users/me')
  expect(api.headers()['content-security-policy']).toBeUndefined()
})

test('generated text routes: robots, llms, sitemap, manifest', async ({ request, baseURL }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toMatch(/User-agent: GPTBot\nAllow: \//)
  expect(await robots.text()).toContain(`Sitemap: ${baseURL}/sitemap.xml`)
  expect((await request.get('/llms.txt')).status()).toBe(200)
  const manifest = await request.get('/site.webmanifest')
  expect(manifest.headers()['content-type']).toContain('application/manifest+json')
  const sitemap = await (await request.get('/sitemap.xml')).text()
  for (const p of [
    '/',
    '/geo-pricing/',
    '/geo-vs-seo/',
    '/cited-not-recommended/',
    '/glossary/',
    '/work/skincare/',
    '/building/revenue-crm/',
    '/work/',
    '/building/',
  ])
    expect(sitemap, p).toContain(`<loc>${baseURL}${p}</loc>`)
  expect(sitemap).not.toContain('/home/')
})

test('every route: one h1, parseable JSON-LD graph with WebPage + BreadcrumbList, canonical = own URL', async ({
  page,
  baseURL,
}) => {
  for (const r of ROUTES) {
    const res = await page.goto(r)
    expect(res?.status(), r).toBe(200)
    await expect(page.locator('h1'), r).toHaveCount(1)
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent()
    const graph = JSON.parse(ld!)['@graph'] as Array<{ '@type': string | string[]; '@id'?: string }>
    const types = graph.flatMap((n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]))
    expect(types, r).toEqual(expect.arrayContaining(['BreadcrumbList']))
    expect(
      types.some((t) => /WebPage/.test(t)),
      r,
    ).toBe(true)
    expect(
      graph.every((n) => !n['@id'] || n['@id'].startsWith(baseURL!)),
      `${r}: all ids on this origin`,
    ).toBe(true)
    await expect(page.locator('link[rel="canonical"]'), r).toHaveAttribute('href', `${baseURL}${r}`)
  }
})

test('hash routes: /#case/skincare lands on /work/skincare/; /#faq scrolls to the FAQ', async ({ page }) => {
  await page.goto('/#case/skincare')
  await page.waitForURL('**/work/skincare/')
  await expect(page.locator('h1')).toContainText('Monthly revenue doubles')
  await page.goto('/#faq')
  await expect(page.locator('#faq')).toBeVisible()
  const inView = await page
    .locator('#faq')
    .evaluate((el) => el.getBoundingClientRect().top < window.innerHeight)
  expect(inView).toBe(true)
})

test('unknown child paths are real 404s, not the parent page', async ({ request }) => {
  expect((await request.get('/work/nope/')).status()).toBe(404)
  expect((await request.get('/building/skincare/')).status()).toBe(404)
  expect((await request.get('/skincare/')).status()).toBe(404)
})
