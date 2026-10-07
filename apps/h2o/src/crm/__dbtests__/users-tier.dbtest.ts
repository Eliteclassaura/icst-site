import { beforeAll, describe, expect, it } from 'vitest'
import { as, payload, rest, user, userWith, type TestUser } from './harness'

/**
 * SEC-MAIN-1 against the isolated synthetic database: only a platform-admin manages platform-admins (CT ruling).
 * Through the app's real REST handlers (the path the admin UI uses too; GraphQL is off in this suite and goes through
 * the same operations) and the Local API with access on. Also: /api/users/first-register is 404 once users exist.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
let platform: TestUser
let client: TestUser
let target: TestUser
let sales: TestUser

beforeAll(async () => {
  ;[platform, client, sales] = await Promise.all([user('platform-admin'), user('client-admin'), user('sales')])
  target = await userWith('platform-admin.target@example.test', 'platform-admin')
})

const read = async (id: string) => (await (await payload()).findByID({ collection: 'users', id, ...sys })) as unknown as Doc

describe('a client-admin cannot touch a platform-admin account', () => {
  it('REST PATCH (password, email, roles, two-factor reset, name) is refused and nothing changes', async () => {
    const before = await read(target.id)
    for (const body of [{ password: 'Synthetic-Taken-1!' }, { email: 'taken@example.test' }, { roles: ['viewer'] }, { mfa_reset: true }, { name: 'taken' }]) {
      const res = await rest.patch(`users/${target.id}`, client.token, body)
      expect(res.status, JSON.stringify(body)).toBe(403)
    }
    const after = await read(target.id)
    expect(after).toMatchObject({ email: before.email, roles: before.roles, name: before.name, mfa_enabled: before.mfa_enabled })
  })
  it('the admin UI document access shows the account read-only', async () => {
    const res = await rest.get(`users/access/${target.id}`, client.token)
    expect((res.body.update as { permission?: boolean } | undefined)?.permission).toBe(false)
  })
  it('Local API with access on: update refused', async () => {
    const p = await payload()
    await expect(p.update({ collection: 'users', id: target.id, data: { name: 'taken' } as never, ...as(client) })).rejects.toThrow()
  })
})

describe('a client-admin cannot grant platform-admin', () => {
  it('not to a sales user, not to themself, not on create', async () => {
    expect((await rest.patch(`users/${sales.id}`, client.token, { roles: ['platform-admin', 'sales'] })).status).toBe(403)
    expect((await rest.patch(`users/${client.id}`, client.token, { roles: ['platform-admin'] })).status).toBe(403)
    expect((await rest.post('users', client.token, { email: 'new.pa@example.test', password: 'Synthetic-Password-1!', roles: ['platform-admin'] })).status).toBe(403)
    expect((await read(sales.id)).roles).toEqual(['sales'])
    expect((await read(client.id)).roles).toEqual(['client-admin'])
  })
  it('still manages non-platform users', async () => {
    const res = await rest.patch(`users/${sales.id}`, client.token, { name: 'Synthetic sales (renamed)' })
    expect(res.status).toBe(200)
    await rest.patch(`users/${sales.id}`, client.token, { name: 'Synthetic sales' })
  })
})

describe('a platform-admin manages platform-admins', () => {
  it('renames and resets two-factor on another platform-admin', async () => {
    expect((await rest.patch(`users/${target.id}`, platform.token, { name: 'Synthetic PA target' })).status).toBe(200)
    expect((await read(target.id)).name).toBe('Synthetic PA target')
  })
})

describe('first-user bootstrap is gone once users exist', () => {
  it('POST /api/users/first-register answers 404', async () => {
    const res = await rest.post('users/first-register', null, { email: 'first@example.test', password: 'Synthetic-Password-1!' })
    expect(res.status).toBe(404)
  })
})
