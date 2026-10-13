import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import { adminRouteDestination, adminUiAccess } from '../admin-access'

const actor = (roles: string[]) => ({ user: { roles } }) as PayloadRequest

describe('H2O admin application boundary', () => {
  it.each([
    [['sales'], false],
    [['sales', 'editor'], true],
    [['sales', 'viewer'], true],
    [['viewer'], true],
    [['editor'], true],
    [['search-analyst'], false],
    [['unknown-role'], false],
    [[], false],
    [['platform-admin'], true],
    [['client-admin'], true],
    [['sales', 'client-admin'], true],
  ] as const)('grants admin access only to an admin role', (roles, allowed) => {
    expect(adminUiAccess({ req: actor([...roles]) })).toBe(allowed)
  })

  it.each([
    { segments: [] },
    { segments: ['collections', 'users'] },
    { segments: ['crm-overview'] },
    { segments: ['login'] },
    { segments: ['reset', 'token'] },
  ])(
    'redirects a signed-in sales user from admin path $segments', ({ segments }) => {
      expect(adminRouteDestination({ roles: ['sales'] }, segments)).toBe('/crm/')
    },
  )

  it('preserves logout and allowed CMS roles, and leaves anonymous requests to Payload login', () => {
    expect(adminRouteDestination({ roles: ['sales'] }, ['logout'])).toBeNull()
    expect(adminRouteDestination({ roles: ['client-admin'] }, ['crm-overview'])).toBeNull()
    expect(adminRouteDestination({ roles: ['sales', 'editor'] }, ['collections', 'public-routes'])).toBeNull()
    expect(adminRouteDestination({ roles: ['sales', 'viewer'] }, ['collections', 'public-routes'])).toBeNull()
    expect(adminRouteDestination({ roles: ['sales', 'search-analyst'] }, ['collections', 'public-routes'])).toBe('/crm/')
    expect(adminRouteDestination({ roles: ['editor'] }, ['collections', 'public-routes'])).toBeNull()
    expect(adminRouteDestination({ roles: ['sales', 'platform-admin'] }, ['collections', 'users'])).toBeNull()
    expect(adminRouteDestination(null, ['collections', 'users'])).toBeNull()
  })

  it('routes every signed-in non-CMS user to CRM', () => {
    expect(adminRouteDestination({ roles: [] }, ['crm-overview'])).toBe('/crm/')
    expect(adminRouteDestination({ roles: ['unknown-role'] }, ['collections', 'users'])).toBe('/crm/')
    expect(adminRouteDestination({ roles: ['search-analyst'] }, [])).toBe('/crm/')
    expect(adminRouteDestination({ roles: [] }, ['unauthorized'])).toBe('/crm/')
    expect(adminRouteDestination({ roles: [] }, ['logout'])).toBeNull()
  })
})
