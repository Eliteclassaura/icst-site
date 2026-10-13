import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload, PayloadRequest } from 'payload'
import { adminRouteDestination } from '../../auth/admin-access'
import { crmSessionFor } from '../workspace/session'
import { PASSWORD, payload, rest, trustSession, user } from './harness'

let p: Payload
beforeAll(async () => { p = await payload() })

describe('CRM authentication and admin authorization with synthetic accounts', () => {
  it.each(['sales', 'viewer', 'editor', 'search-analyst', 'client-admin', 'platform-admin'] as const)(
    '%s receives only its intended admin permission after a verified login', async (role) => {
      const actor = await user(role)
      const { user: authenticated } = await p.auth({ headers: new Headers({ authorization: `JWT ${actor.token}` }) })
      expect(authenticated?.id).toBe(actor.id)
      const users = p.collections.users.config
      const admin = await users.access.admin!({ req: { user: authenticated } as PayloadRequest })
      const allowed = ['viewer', 'editor', 'client-admin', 'platform-admin'].includes(role)
      expect(admin).toBe(allowed)
      expect(adminRouteDestination(authenticated, ['crm-overview'])).toBe(allowed ? null : '/crm/')
      expect(Boolean(crmSessionFor(p, authenticated))).toBe(['sales', 'client-admin', 'platform-admin'].includes(role))
      const me = await rest.get('users/me', actor.token)
      expect(me.status).toBe(200)
    },
  )

  it.each([
    { second: 'editor', allowed: true },
    { second: 'viewer', allowed: true },
    { second: 'search-analyst', allowed: false },
  ] as const)('sales plus $second has the exact CMS boundary', async ({ second, allowed }) => {
    const email = `admin-matrix-${second}-${Date.now()}@example.test`
    const created = await p.create({ collection: 'users', data: { email, password: PASSWORD, roles: ['sales', second] } as never, overrideAccess: true })
    const login = await p.login({ collection: 'users', data: { email, password: PASSWORD } })
    await trustSession(String(created.id), String(login.token))
    const { user: authenticated } = await p.auth({ headers: new Headers({ authorization: `JWT ${login.token}` }) })
    expect(authenticated?.id).toBe(created.id)
    const users = p.collections.users.config
    expect(await users.access.admin!({ req: { user: authenticated } as PayloadRequest })).toBe(allowed)
    expect(adminRouteDestination(authenticated, ['crm-overview'])).toBe(allowed ? null : '/crm/')
    expect(crmSessionFor(p, authenticated)).not.toBeNull()
  })
})
