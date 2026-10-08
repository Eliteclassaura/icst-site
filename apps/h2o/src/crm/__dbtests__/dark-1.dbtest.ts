import { sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'
import { payload, rest, userWith, type TestUser } from './harness'

/**
 * DARK-1 against the isolated synthetic database: `users.crm_theme` (migration 20261007_214405_dark_1_crm_theme).
 * Default "system"; only the three values are stored; a person sets their own and cannot set someone else's.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
let a: TestUser
let b: TestUser

beforeAll(async () => {
  a = await userWith('dark1.a@example.test', 'sales')
  b = await userWith('dark1.b@example.test', 'sales')
})

describe('DARK-1 users.crm_theme', () => {
  it('a new user starts on "system" (the field default through Payload, and the column default in SQL)', async () => {
    const p = await payload()
    const created = (await p.create({
      collection: 'users',
      data: { email: `dark1.new.${Date.now()}@example.test`, password: 'synthetic-Password-1!', roles: ['sales'], name: 'Synthetic DARK-1' } as never,
      ...sys,
    })) as unknown as Doc
    expect(created.crm_theme).toBe('system')
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } }).drizzle
    const raw = await drizzle.execute(sql`SELECT column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'crm_theme'`)
    expect(String(raw.rows[0]!.column_default)).toMatch(/^'system'::/)
  })

  it('a person sets their own theme; it is read back on their session (what the CRM layout uses)', async () => {
    const r = await rest.patch(`users/${a.id}`, a.token, { crm_theme: 'dark' })
    expect(r.status).toBe(200)
    const me = await rest.get('users/me', a.token)
    expect((me.body.user as Doc).crm_theme).toBe('dark')
    await rest.patch(`users/${a.id}`, a.token, { crm_theme: 'system' })
  })

  it('an unknown value is refused and nothing is stored', async () => {
    const r = await rest.patch(`users/${a.id}`, a.token, { crm_theme: 'neon' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const p = await payload()
    expect(((await p.findByID({ collection: 'users', id: a.id, ...sys })) as unknown as Doc).crm_theme).toBe('system')
  })

  it("a person cannot change someone else's theme", async () => {
    const r = await rest.patch(`users/${b.id}`, a.token, { crm_theme: 'dark' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const p = await payload()
    expect(((await p.findByID({ collection: 'users', id: b.id, ...sys })) as unknown as Doc).crm_theme).toBe('system')
  })
})
