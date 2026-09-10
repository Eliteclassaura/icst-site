import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

type Bp = {
  redirects: Array<{ from: string; to: string | null; status: number }>
  gone: Array<{ path: string; status: number }>
}
const bp = JSON.parse(
  readFileSync(new URL('../content/syed-ai.blueprint.json', import.meta.url), 'utf8'),
) as Bp

test.describe('redirects served from the map (ADR-028 §6–7)', () => {
  for (const r of bp.redirects) {
    test(`${r.from} → ${r.to ?? '(410)'} in one hop with ${r.status}`, async ({ request }) => {
      const res = await request.get(r.from, { maxRedirects: 0 })
      expect(res.status()).toBe(r.status)
      if (r.status !== 410) {
        expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe(r.to)
        const hop = await request.get(res.headers()['location']!, { maxRedirects: 0 })
        expect([200, 308]).toContain(hop.status()) // a 308 here would be the trailing-slash rule, never a chain of redirects
        if (hop.status() === 308) expect(new URL(hop.headers()['location']!, 'http://x').pathname).toBe(r.to)
      } else {
        expect((await res.text()).length).toBe(0)
      }
    })
  }
  for (const g of bp.gone) {
    test(`${g.path} answers ${g.status} with no body`, async ({ request }) => {
      const res = await request.get(g.path, { maxRedirects: 0 })
      expect(res.status()).toBe(g.status)
      expect((await res.text()).length).toBe(0)
    })
  }
  test('a proposed redirect is neither in the map nor served', async ({ request }) => {
    const map = (await (await request.get('/api/redirects-map')).json()) as {
      redirects: Record<string, unknown>
    }
    expect(map.redirects['/e2e-proposed/']).toBeUndefined()
    expect(map.redirects['/index.html']).toBeTruthy()
    const res = await request.get('/e2e-proposed/', { maxRedirects: 0 })
    expect(res.status()).toBe(404)
  })
})
