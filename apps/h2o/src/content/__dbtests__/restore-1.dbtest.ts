import path from 'node:path'
import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payload, user, type TestUser } from '../../crm/__dbtests__/harness'
import { importAuthority } from '../import/authority-import'
import { importContext } from '../collections/public-routes'

/**
 * RESTORE-1 (CT 2026-10-07, pre-launch): version restore through the real Payload `restoreVersion` operation against the
 * isolated synthetic database. A restore restores editable content only: disposition, canonical, provenance, identity,
 * `document` and `requestedPath` keep their CURRENT values for every user, and the public-routes guard stays fail-closed
 * for held / private / redirect records. Products keep their current price and truth states. RESTORE-1.1 (Security Auditor
 * gap 1, CT 2026-10-07): the editor cases where the current record differs from the restored version.
 */
type Doc = Record<string, unknown>
const IMPORTED = 'SALMON-pages-2380' // a published, PUBLIC imported page (as in bridge.dbtest.ts)
let admin: TestUser, editor: TestUser
let heldId = ''
const sys = { overrideAccess: true as const, depth: 0 }
const as = (u: TestUser) => ({ overrideAccess: false as const, user: u.user as never, depth: 0 })
const byRoute = async (routeId: string): Promise<Doc> =>
  (await (await payload()).find({ collection: 'public-routes' as never, where: { routeId: { equals: routeId } } as never, limit: 1, ...sys })).docs[0] as unknown as Doc
const byId = async (collection: string, id: unknown, draft = false): Promise<Doc> =>
  (await (await payload()).findByID({ collection: collection as never, id: String(id), draft, ...sys })) as unknown as Doc
/** Versions of a record, oldest first. */
const versions = async (collection: string, id: unknown): Promise<Doc[]> =>
  (await (await payload()).findVersions({ collection: collection as never, where: { parent: { equals: id } } as never, sort: 'createdAt', limit: 100, ...sys })).docs as unknown as Doc[]
const restore = async (collection: string, versionId: unknown, who: TestUser) =>
  (await payload()).restoreVersion({ collection: collection as never, id: String(versionId), ...as(who) })

beforeAll(async () => {
  const p = await payload()
  const drizzle = (p.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
  await drizzle.execute(sql.raw(`TRUNCATE "public_routes", "_public_routes_v", "public_redirects", "payload_jobs" RESTART IDENTITY CASCADE`))
  ;[admin, editor] = await Promise.all([user('platform-admin'), user('editor')])
  const { releaseAuthority } = (await import(path.join(process.cwd(), 'release/authority.mjs'))) as { releaseAuthority: (r: string) => { routes: Array<{ routeId: string; state: string; path: string }> } }
  heldId = releaseAuthority(process.cwd()).routes.find((r) => r.state === 'REVIEW_HOLD' && !r.path.includes('%'))!.routeId
  const { ledger } = await importAuthority(p, process.cwd(), { only: (id) => id === IMPORTED || id === heldId })
  expect(ledger.filter((l) => l.status === 'ERROR')).toEqual([])
}, 120_000)

describe('RESTORE-1 public-routes', () => {
  it('(a) an editor restores an earlier draft of their own PUBLIC editorial page; admin-owned values are unchanged', async () => {
    const p = await payload()
    const page = (await p.create({ collection: 'public-routes' as never, data: { title: 'Restore one synthetic v1', requestedPath: '/restore-1-synthetic/' } as never, draft: true, ...as(editor) })) as unknown as Doc
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { title: 'Restore one synthetic v2' } as never, draft: true, ...as(editor) })
    const before = await byId('public-routes', page.id, true)
    const v = await versions('public-routes', page.id)
    const v1 = v.find((x) => (x.version as Doc).title === 'Restore one synthetic v1')!
    await expect(restore('public-routes', v1.id, editor)).resolves.toBeDefined()
    const after = await byId('public-routes', page.id, true)
    expect(after.title).toBe('Restore one synthetic v1')
    expect((after.disposition as Doc).state).toBe('PUBLIC')
    expect((after.disposition as Doc).export).toBe(true)
    for (const f of ['disposition', 'source', 'routeId', 'path', 'pathKey', 'family', 'requestedPath']) expect(after[f], f).toEqual(before[f])
    expect((after.seo as Doc).canonical).toBe((before.seo as Doc).canonical)
    const latest = (await versions('public-routes', page.id)).at(-1)!.version as Doc
    expect((latest.disposition as Doc).state).toBe('PUBLIC')
    expect(latest.source).toEqual(before.source)
  })

  it('(b) an editor restore on a REVIEW_HOLD record is refused (403) and writes nothing', async () => {
    const p = await payload()
    const held = await byRoute(heldId)
    await p.update({ collection: 'public-routes' as never, id: String(held.id), data: { title: `${String(held.title)} (admin draft)` } as never, draft: true, user: admin.user as never, overrideAccess: false })
    const v = await versions('public-routes', held.id)
    const count = v.length
    await expect(restore('public-routes', v[0]!.id, editor)).rejects.toMatchObject({ status: 403 })
    expect((await versions('public-routes', held.id)).length).toBe(count)
    expect(((await byRoute(heldId)).disposition as Doc).state).toBe('REVIEW_HOLD')
  })

  it('(c) an admin restore on a REVIEW_HOLD record succeeds and keeps the CURRENT disposition', async () => {
    const p = await payload()
    const held = await byRoute(heldId)
    const first = (await versions('public-routes', held.id))[0]!
    await p.update({ collection: 'public-routes' as never, id: String(held.id), data: { disposition: { ...(held.disposition as Doc), releaseOverride: 'RESTORE-1 current override' } } as never, user: admin.user as never, overrideAccess: false })
    await expect(restore('public-routes', first.id, admin)).resolves.toBeDefined()
    const after = await byRoute(heldId)
    expect((after.disposition as Doc).state).toBe('REVIEW_HOLD')
    expect((after.disposition as Doc).releaseOverride).toBe('RESTORE-1 current override')
  })

  it('(d) an editor restore on an imported PUBLIC page keeps `document`, also in the new version', async () => {
    const p = await payload()
    const page = await byRoute(IMPORTED)
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { seo: { title: 'RESTORE-1 editor draft' } } as never, draft: true, ...as(editor) })
    const first = (await versions('public-routes', page.id))[0]!
    await expect(restore('public-routes', first.id, editor)).resolves.toBeDefined()
    const after = await byRoute(IMPORTED)
    expect(after.document).toEqual(page.document)
    expect(JSON.stringify(after.document).length).toBeGreaterThan(1000)
    expect(((await versions('public-routes', page.id)).at(-1)!.version as Doc).document).toEqual(page.document)
    expect((after.disposition as Doc).state).toBe('PUBLIC')
  })

  it('(e) an admin restore keeps the CURRENT canonical when the restored version had another', async () => {
    const p = await payload()
    const page = await byRoute(IMPORTED)
    const first = (await versions('public-routes', page.id))[0]!
    const canonical = String((page.seo as Doc).canonical ?? page.path)
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { seo: { ...(page.seo as Doc), canonical: `${canonical}#restore-1` } } as never, user: admin.user as never, overrideAccess: false })
    await expect(restore('public-routes', first.id, admin)).resolves.toBeDefined()
    expect(((await byRoute(IMPORTED)).seo as Doc).canonical).toBe(`${canonical}#restore-1`)
  })

  it('(f) an admin restore of an imported page leaves `document` and `requestedPath` unchanged', async () => {
    const page = await byRoute(IMPORTED)
    const first = (await versions('public-routes', page.id))[0]!
    await expect(restore('public-routes', first.id, admin)).resolves.toBeDefined()
    const after = await byRoute(IMPORTED)
    expect(after.document).toEqual(page.document)
    expect(after.requestedPath ?? null).toEqual(page.requestedPath ?? null)
    const latest = (await versions('public-routes', page.id)).at(-1)!.version as Doc
    expect(latest.document).toEqual(page.document)
  })
})

describe('RESTORE-1.1 (Security Auditor gap 1): editor restores where the current record differs from the version', () => {
  const editorialPage = async (title: string, path: string): Promise<Doc> =>
    (await (await payload()).create({ collection: 'public-routes' as never, data: { title, requestedPath: path } as never, draft: true, ...as(editor) })) as unknown as Doc

  it('(h) disposition, source and canonical changed by an admin after v1 keep their CURRENT values when an editor restores v1', async () => {
    const p = await payload()
    const page = await editorialPage('RESTORE-1.1 h v1', '/restore-1-1-h-synthetic/')
    const v1 = (await versions('public-routes', page.id))[0]!
    const now = await byId('public-routes', page.id, true)
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { disposition: { ...(now.disposition as Doc), releaseOverride: 'RESTORE-1.1 admin override' } } as never, draft: true, user: admin.user as never, overrideAccess: false })
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { seo: { ...((now.seo ?? {}) as Doc), canonical: '/restore-1-1-h-synthetic/#admin' } } as never, draft: true, user: admin.user as never, overrideAccess: false })
    // Provenance changes only through the reviewed import path (the guard freezes it for every editor and admin write).
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { source: { ...(now.source as Doc), sourceRobots: 'noindex, nofollow' } } as never, draft: true, context: importContext, ...sys })
    const before = await byId('public-routes', page.id, true)
    expect((before.disposition as Doc).releaseOverride).toBe('RESTORE-1.1 admin override')
    expect((before.seo as Doc).canonical).toBe('/restore-1-1-h-synthetic/#admin')
    expect((before.source as Doc).sourceRobots).toBe('noindex, nofollow')
    await expect(restore('public-routes', v1.id, editor)).resolves.toBeDefined()
    const after = await byId('public-routes', page.id, true)
    expect(after.title).toBe('RESTORE-1.1 h v1')
    expect(after.disposition).toEqual(before.disposition)
    expect(after.source).toEqual(before.source)
    expect((after.seo as Doc).canonical).toBe('/restore-1-1-h-synthetic/#admin')
    const latest = (await versions('public-routes', page.id)).at(-1)!.version as Doc
    expect(latest.disposition).toEqual(before.disposition)
    expect(latest.source).toEqual(before.source)
  })

  it('(i) v1 was PUBLIC, the record is now REVIEW_HOLD: an editor restore of v1 is refused (403) and writes nothing', async () => {
    const p = await payload()
    const page = await editorialPage('RESTORE-1.1 i v1', '/restore-1-1-i-synthetic/')
    const v1 = (await versions('public-routes', page.id))[0]!
    expect(((v1.version as Doc).disposition as Doc).state).toBe('PUBLIC')
    const now = await byId('public-routes', page.id, true)
    await p.update({ collection: 'public-routes' as never, id: String(page.id), data: { disposition: { ...(now.disposition as Doc), state: 'REVIEW_HOLD', export: false } } as never, draft: true, user: admin.user as never, overrideAccess: false })
    const count = (await versions('public-routes', page.id)).length
    await expect(restore('public-routes', v1.id, editor)).rejects.toMatchObject({ status: 403 })
    expect((await versions('public-routes', page.id)).length).toBe(count)
    expect(((await byId('public-routes', page.id, true)).disposition as Doc).state).toBe('REVIEW_HOLD')
  })
})

describe('RESTORE-1 products (same pattern)', () => {
  let productId = ''
  afterAll(async () => {
    if (productId) await (await payload()).delete({ collection: 'products', id: productId, overrideAccess: true })
  })
  it('(g) an editor restore keeps the CURRENT truth status and price', async () => {
    const p = await payload()
    const product = (await p.create({
      collection: 'products',
      data: { title: 'RESTORE-1 synthetic gear', slug: 'restore-1-synthetic-gear', commerce_mode: 'QUOTE_ONLY', manufacturer_evidence: { state: 'UNKNOWN', unknown_reason: 'NO_BRAND_TERM_IN_ESTATE' } } as never,
      ...sys,
    })) as unknown as Doc
    productId = String(product.id)
    await p.update({ collection: 'products', id: productId, data: { title: 'RESTORE-1 synthetic gear v2' } as never, draft: true, ...as(editor) })
    await p.update({ collection: 'products', id: productId, data: { truth_status: 'VERIFIED_ICS' } as never, user: admin.user as never, overrideAccess: false })
    const before = await byId('products', productId, true)
    const v1 = (await versions('products', productId))[0]!
    await expect(restore('products', v1.id, editor)).resolves.toBeDefined()
    const after = await byId('products', productId, true)
    expect(after.title).toBe('RESTORE-1 synthetic gear')
    expect(after.truth_status).toBe('VERIFIED_ICS')
    expect(after.public_price ?? null).toEqual(before.public_price ?? null)
    expect((after.manufacturer_evidence as Doc).state).toBe((before.manufacturer_evidence as Doc).state)
  })
})
