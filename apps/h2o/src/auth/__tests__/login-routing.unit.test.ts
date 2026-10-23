import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { signInDestination } from '../admin-access'

/** 1.3b login routing: where sign-in ends, and what the bare admin login does. */
const ORIGIN = 'http://localhost:3210'
const req = (path: string, method = 'GET') => new NextRequest(new URL(path, ORIGIN), { method })

describe('1.3b sign-in destination', () => {
  it.each([
    [['sales'], '/admin/', '/crm/'],
    [['sales'], '/admin/collections/users/', '/crm/'],
    [['sales'], '/crm/rfqs/', '/crm/'],
    [['sales', 'search-analyst'], '/admin/', '/crm/'],
    [[], '/admin/', '/crm/'],
    [['platform-admin'], '/admin/', '/admin/'],
    [['platform-admin'], '/crm/rfqs/', '/crm/rfqs/'],
    [['client-admin'], '/admin/collections/products/', '/admin/collections/products/'],
    [['sales', 'editor'], '/admin/', '/admin/'],
    [['editor'], '/crm/', '/crm/'],
  ] as const)('roles %j asking for %s end at %s', (roles, asked, end) => {
    expect(signInDestination({ roles }, asked)).toBe(end)
  })
})

describe('1.3b bare admin login', () => {
  it('sends the bare login (including after logout) to the CRM sign-in, and leaves a link with its own redirect', async () => {
    const { loginRoute } = await import('../../proxy')
    for (const p of ['/admin/login', '/admin/login/']) {
      const r = loginRoute(req(p))
      expect(r?.status).toBe(307)
      expect(r?.headers.get('location')).toBe(`${ORIGIN}/admin/login/?redirect=%2Fcrm%2F`)
      expect(r?.headers.get('cache-control')).toBe('no-store')
    }
    expect(loginRoute(req('/admin/login/?redirect=%2Fadmin%2F'))).toBeNull()
    expect(loginRoute(req('/admin/login/?redirect=%2Fcrm%2Frfqs%2F'))).toBeNull()
  })

  it('does not touch other methods or other admin pages', async () => {
    const { loginRoute } = await import('../../proxy')
    expect(loginRoute(req('/admin/login/', 'POST'))).toBeNull()
    expect(loginRoute(req('/admin/'))).toBeNull()
    expect(loginRoute(req('/admin/logout/'))).toBeNull()
    expect(loginRoute(req('/admin/forgot/'))).toBeNull()
    expect(loginRoute(req('/crm/'))).toBeNull()
  })
})
