import { describe, expect, it } from 'vitest'

describe('payload config', () => {
  it('builds (every relationship resolves to a registered collection)', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://icsthailand.co.th'
    process.env.PAYLOAD_SECRET = 'test-secret-not-real'
    process.env.DATABASE_URI = 'postgres://u:p@127.0.0.1:1/none'
    const mod = await import('../payload.config')
    const config = await mod.default
    expect(config.collections.length).toBeGreaterThan(10)
    expect(config.collections.some((c) => (c.slug as string) === 'public-routes')).toBe(false)
  }, 60000)
})
