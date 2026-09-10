import { test, expect } from '@playwright/test'

/**
 * C8 acceptance: readiness reports the real dependency state, liveness does not, and neither body
 * describes the host. A public probe must not become a reconnaissance endpoint (the legacy
 * `diagnose.php` was exactly that — R1).
 */
test.describe('health and liveness (C8)', () => {
  test('liveness is 200 with a fixed one-key body', async ({ request }) => {
    const res = await request.get('/api/live')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(res.headers()['cache-control']).toContain('no-store')
    expect(res.headers()['x-robots-tag']).toContain('noindex')
  })

  test('readiness is 200 with exactly {status, checks:{database, storage}} when dependencies answer', async ({
    request,
  }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { status: string; checks: Record<string, string> }
    expect(Object.keys(body).sort()).toEqual(['checks', 'status'])
    expect(Object.keys(body.checks).sort()).toEqual(['database', 'storage'])
    expect(body.status).toBe('ok')
    expect(body.checks.database).toBe('ok')
    expect(body.checks.storage).toBe('ok')
    expect(res.headers()['cache-control']).toContain('no-store')
  })

  test('neither body leaks a hostname, port, path, version or error text', async ({ request }) => {
    for (const path of ['/api/health', '/api/live']) {
      const text = await (await request.get(path)).text()
      for (const leak of [
        'postgres',
        '5432',
        'localhost',
        '127.0.0.1',
        '/home',
        '/app',
        'node_modules',
        'v22',
        'Error',
        'ECONN',
        'payload',
      ]) {
        expect(text.toLowerCase(), `${path} leaked ${leak}`).not.toContain(leak.toLowerCase())
      }
      expect(text.length).toBeLessThan(120)
    }
  })

  test('neither endpoint is indexable or redirected by the public-route policy', async ({ request }) => {
    for (const path of ['/api/health', '/api/live']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status()).toBe(200) // no trailing-slash redirect for /api routes
    }
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).not.toContain('/api/health')
  })
})
