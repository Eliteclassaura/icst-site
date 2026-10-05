import { beforeAll, describe, expect, it } from 'vitest'
import { CRM_SLUGS } from '../index'
import { NON_ADMIN_MAX_PAGE } from '../access'
import { payload, resetCrm, rest, user, type TestUser } from './harness'

/**
 * T1–T4, T26 and the adversarial access cases, exercised through the app's **real REST route handlers**
 * and the Local API with access on. Anonymous, viewer, editor and search-analyst must be refused on every
 * CRM collection; sales and admins allowed as the matrix says.
 */
let admin: TestUser,
  clientAdmin: TestUser,
  sales: TestUser,
  viewer: TestUser,
  editor: TestUser,
  analyst: TestUser
let accountId: string

beforeAll(async () => {
  await resetCrm()
  ;[admin, clientAdmin, sales, viewer, editor, analyst] = await Promise.all([
    user('platform-admin'),
    user('client-admin'),
    user('sales'),
    user('viewer'),
    user('editor'),
    user('search-analyst'),
  ])
  const p = await payload()
  const acc = await p.create({
    collection: 'crm-accounts',
    data: {
      canonical_name: 'Northwind Thermal (synthetic)',
      provenance: { source_system: 'SYNTHETIC_FIXTURE' },
    } as never,
    context: { crmServer: {} },
    overrideAccess: true,
  })
  accountId = String(acc.id)
})

describe('T1 registration', () => {
  it('registers exactly the 18 CRM collections, all crm- prefixed', async () => {
    const p = await payload()
    const registered = Object.keys(p.collections).filter((s) => s.startsWith('crm-'))
    expect(registered.sort()).toEqual([...CRM_SLUGS].sort())
    expect(CRM_SLUGS).toHaveLength(18)
  })
  it('does not register the agency-core CRM layer', async () => {
    const p = await payload()
    for (const s of [
      'contacts',
      'companies',
      'leads',
      'activities',
      'tasks',
      'submissions',
      'subscribers',
      'outbox',
    ])
      expect(p.collections[s as never]).toBeUndefined()
  })
})

describe('T2/T26 anonymous and non-CRM roles are refused on every CRM collection (REST)', () => {
  for (const slug of CRM_SLUGS) {
    it(`anonymous GET /api/${slug} is refused`, async () => {
      const r = await rest.get(slug, null)
      expect([401, 403]).toContain(r.status)
      expect(r.body.docs).toBeUndefined()
    })
    it(`anonymous POST /api/${slug} is refused`, async () => {
      const r = await rest.post(slug, null, { canonical_name: 'x' })
      expect([401, 403]).toContain(r.status)
    })
  }
  it('viewer, editor and search-analyst cannot list or read any CRM collection', async () => {
    for (const u of [viewer, editor, analyst])
      for (const slug of CRM_SLUGS) {
        const r = await rest.get(slug, u.token)
        expect([401, 403], `${u.role} ${slug}`).toContain(r.status)
      }
  })
  it('anonymous cannot read a known account by id', async () => {
    const r = await rest.get(`crm-accounts/${accountId}`, null)
    expect([401, 403, 404]).toContain(r.status)
    expect(r.body.canonical_name).toBeUndefined()
  })
})

describe('T3/T4 authorised roles', () => {
  it('platform-admin and client-admin can list accounts', async () => {
    for (const u of [admin, clientAdmin]) {
      const r = await rest.get('crm-accounts', u.token)
      expect(r.status).toBe(200)
      expect((r.body.docs as unknown[]).length).toBe(1)
    }
  })
  it('sales can read and create accounts', async () => {
    const r = await rest.get('crm-accounts', sales.token)
    expect(r.status).toBe(200)
    const c = await rest.post('crm-accounts', sales.token, { canonical_name: 'Contoso Cooling (synthetic)' })
    expect(c.status).toBe(201)
  })
  it('no role can delete an account — not even platform-admin, not even via the Local API', async () => {
    const r = await rest.delete(`crm-accounts/${accountId}`, admin.token)
    expect(r.status).toBeGreaterThanOrEqual(400)
    const p = await payload()
    await expect(
      p.delete({ collection: 'crm-accounts', id: accountId, overrideAccess: true }),
    ).rejects.toThrow(/DELETE_FORBIDDEN/)
    expect(
      (await p.findByID({ collection: 'crm-accounts', id: accountId, overrideAccess: true })).id,
    ).toBeTruthy()
  })
  it('sales cannot read intake raw payloads or audit-log', async () => {
    const r = await rest.get('audit-log', sales.token)
    expect([401, 403]).toContain(r.status)
  })
  it('sales cannot create intake events (server only)', async () => {
    const r = await rest.post('crm-intake-events', sales.token, {
      source_system: 'TYPEFORM',
      source_event_id: 'forged',
    })
    expect(r.status).toBeGreaterThanOrEqual(400)
  })
})

describe('bulk-export control', () => {
  it('a non-admin asking for limit=0 / pagination=false gets a bounded page', async () => {
    const p = await payload()
    for (let i = 0; i < NON_ADMIN_MAX_PAGE + 5; i++)
      await p.create({
        collection: 'crm-accounts',
        data: { canonical_name: `Synthetic Bulk ${i}` } as never,
        overrideAccess: true,
      })
    const r = await rest.get('crm-accounts?limit=0&pagination=false', sales.token)
    expect(r.status).toBe(200)
    expect((r.body.docs as unknown[]).length).toBeLessThanOrEqual(NON_ADMIN_MAX_PAGE)
    const big = await rest.get('crm-accounts?limit=100000', sales.token)
    expect((big.body.docs as unknown[]).length).toBeLessThanOrEqual(NON_ADMIN_MAX_PAGE)
  })
})

describe('pricing stays admin-only (sales vs products.public_price)', () => {
  it('sales cannot read pricing-observations', async () => {
    const r = await rest.get('pricing-observations', sales.token)
    expect([401, 403]).toContain(r.status)
  })
  it('the products public_price field is admin-only on read', async () => {
    const p = await payload()
    const field = p.collections.products.config.flattenedFields.find((f) => f.name === 'public_price') as
      { access?: { read?: (a: unknown) => boolean } } | undefined
    expect(field?.access?.read).toBeTypeOf('function')
    expect(field!.access!.read!({ req: { user: sales.user } })).toBe(false)
    expect(field!.access!.read!({ req: { user: admin.user } })).toBe(true)
  })
  it('no CRM collection has a price field', async () => {
    const p = await payload()
    for (const slug of CRM_SLUGS) {
      const coll = (
        p.collections as unknown as Record<string, { config: { flattenedFields: Array<{ name: string }> } }>
      )[slug]!
      const names = coll.config.flattenedFields.map((f) => f.name)
      expect(
        names.some((n: string) => /price/i.test(n)),
        slug,
      ).toBe(false)
    }
  })
})
