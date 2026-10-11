import { sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'
import { PASSWORD, payload, rest, user, userWith, type TestUser } from './harness'

/**
 * DEP-1 (security dependency upgrade, Payload 3.90): hidden and secret fields never leave the server through the
 * REST API — reads, the auth responses Payload 3.90 fixed (login, me, refresh, reset-password), and the sealed SMTP
 * password. GraphQL is not mounted at all. The secrets are first proven to exist in the database, so an absent key
 * means "withheld", not "never set". Synthetic users only.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0 }
/** Keys that must never appear anywhere in an API response body (at any depth). */
const SECRET_KEYS = [
  'mfa_secret',
  'mfa_pending_secret',
  'mfa_pending_at',
  'mfa_recovery',
  'mfa_last_step',
  'mfa_sessions',
  'mfa_failures',
  'mfa_stepup',
  'mfa_locked_until',
  'hash',
  'salt',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'resetPasswordRequestedAt',
  'password',
  'apiKey',
  'apiKeyIndex',
  'password_sealed',
]
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out)
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Doc)) {
      out.add(k)
      keysDeep(x, out)
    }
  return out
}
const leaked = (body: unknown) => SECRET_KEYS.filter((k) => keysDeep(body).has(k))

let admin: TestUser
beforeAll(async () => {
  admin = await user('platform-admin')
})

describe('DEP-1: hidden fields stay on the server (Payload 3.90)', () => {
  it('the secrets exist in the database for the signed-in admin (so their absence below is real)', async () => {
    const p = await payload()
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } })
      .drizzle
    const row = (await drizzle.execute(sql`SELECT mfa_secret, hash, salt FROM users WHERE id = ${admin.id}`))
      .rows[0]!
    expect(row.mfa_secret).toBeTruthy()
    expect(row.hash).toBeTruthy()
    expect(row.salt).toBeTruthy()
  })
  it('REST reads: users/me, users/:id and the users list (admin) carry no secret field', async () => {
    const me = await rest.get('users/me', admin.token)
    expect(me.status).toBe(200)
    expect((me.body.user as Doc | undefined)?.id).toBe(admin.id)
    expect(leaked(me.body)).toEqual([])
    const one = await rest.get(`users/${admin.id}`, admin.token)
    expect(one.status).toBe(200)
    expect(leaked(one.body)).toEqual([])
    const list = await rest.get('users?limit=50&depth=1', admin.token)
    expect(list.status).toBe(200)
    expect((list.body.docs as unknown[]).length).toBeGreaterThan(0)
    expect(leaked(list.body)).toEqual([])
  })
  it('auth responses: login and refresh-token carry no secret field', async () => {
    const u = await userWith('dep1.login@example.test', 'sales')
    const login = await rest.post('users/login', null, {
      email: 'dep1.login@example.test',
      password: PASSWORD,
    })
    expect(login.status).toBe(200)
    expect(login.body.token).toBeTruthy()
    expect(leaked(login.body)).toEqual([])
    const refreshed = await rest.post('users/refresh-token', u.token, {})
    expect(leaked(refreshed.body)).toEqual([])
  })
  it('auth responses: forgot-password is refused (resets are admin-only), no reset token is issued, and reset-password leaks nothing', async () => {
    const p = await payload()
    const email = `dep1.reset.${Date.now()}@example.test`
    await p.create({
      collection: 'users',
      data: { email, password: PASSWORD, roles: ['sales'], name: 'Synthetic DEP-1 reset' } as never,
      ...sys,
    })
    const forgot = await rest.post('users/forgot-password', null, { email })
    expect(forgot.status).toBeGreaterThanOrEqual(400)
    expect(leaked(forgot.body)).toEqual([])
    await expect(
      p.forgotPassword({ collection: 'users', data: { email }, disableEmail: true }),
    ).rejects.toThrow(/disabled/i)
    const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } })
      .drizzle
    const raw = (await drizzle.execute(sql`SELECT reset_password_token FROM users WHERE email = ${email}`))
      .rows[0]!
    expect(raw.reset_password_token ?? null).toBeNull()
    const reset = await rest.post('users/reset-password', null, {
      token: 'f'.repeat(40),
      password: 'synthetic-Password-2!',
    })
    expect(reset.status).toBeGreaterThanOrEqual(400)
    expect(leaked(reset.body)).toEqual([])
  })
  it('the sealed SMTP password is never readable through REST, even by an admin', async () => {
    const p = await payload()
    const before = process.env.H2O_EMAIL_SENDER_DOMAINS
    const beforeHosts = process.env.H2O_SMTP_CUSTOM_HOSTS
    process.env.H2O_EMAIL_SENDER_DOMAINS = 'example.test' // reserved test domain only (CRM test fixture rule)
    process.env.H2O_SMTP_CUSTOM_HOSTS = 'smtp.example.test' // C-S1-2: a custom host must be listed by the operator
    try {
      const prof = (await p.create({
        collection: 'crm-sending-profiles' as never,
        data: {
          name: 'DEP-1 (synthetic)',
          preset: 'CUSTOM',
          use: 'TRANSACTIONAL',
          host: 'smtp.example.test',
          port: 587,
          tls_servername: 'smtp.example.test',
          username: 'dep1@example.test',
          from_address: 'dep1@example.test',
          from_name: 'ICS Sales Team',
          active: false,
          password_set: true,
          password_sealed: 'v1.synthetic-sealed-value',
        } as never,
        ...sys,
        context: { crmServer: {} },
      })) as unknown as Doc
      const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Doc[] }> } })
        .drizzle
      expect(
        (
          await drizzle.execute(
            sql`SELECT password_sealed FROM crm_sending_profiles WHERE id = ${String(prof.id)}`,
          )
        ).rows[0]!.password_sealed,
      ).toBeTruthy()
      const one = await rest.get(`crm-sending-profiles/${String(prof.id)}`, admin.token)
      const list = await rest.get('crm-sending-profiles?limit=50', admin.token)
      for (const r of [one, list]) {
        expect(r.status).toBeLessThan(500)
        expect(leaked(r.body)).toEqual([])
      }
    } finally {
      if (before === undefined) delete process.env.H2O_EMAIL_SENDER_DOMAINS
      else process.env.H2O_EMAIL_SENDER_DOMAINS = before
      if (beforeHosts === undefined) delete process.env.H2O_SMTP_CUSTOM_HOSTS
      else process.env.H2O_SMTP_CUSTOM_HOSTS = beforeHosts
    }
  })
  it('GraphQL is not mounted: nothing answers a users query', async () => {
    const r = await rest.post('graphql', admin.token, { query: '{ Users { docs { id email mfa_secret } } }' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(keysDeep(r.body).has('docs')).toBe(false)
    expect(leaked(r.body)).toEqual([])
  })
})
