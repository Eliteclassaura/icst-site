import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { payload, resetCrm, rest, user, type TestUser } from '../../crm/__dbtests__/harness'
import { ingestTypeformDelivery } from '../../crm/intake/typeform/ingest'
import { intakeConfig, signed, typeformDelivery } from '../../crm/fixtures/synthetic'
import { importAuthority } from '../import/authority-import'
import { ownBrandTerms, productSlugOf, seedCatalog } from '../import/catalog-seed'

/**
 * CRM go-live Pass 0 — catalog seed (Control Tower 2026-10-02), against the isolated synthetic PostgreSQL.
 * The accepted authority's product and product-category routes are imported (the same importer staging used),
 * then the seed indexes them into the catalog. SEO-CONTENT-1 (CT 2026-10-07): the two placeholder products are REDIRECT rows in the authority (imported as
 * drafts), so the seed sees 181 published products (157 with exactly one brand term, 12 manufacturers). Counts computed from the ledger and the
 * seed's own ownBrandTerms; this suite needs the isolated PostgreSQL and was not run in the SEO-CONTENT-1 lane. Synthetic CRM payloads only; no real customer data.
 */
type Doc = Record<string, unknown>
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
let p: Payload
let admin: TestUser, editor: TestUser, sales: TestUser
const sys = { overrideAccess: true as const, depth: 0 }
const db = () => (p.db as unknown as { drizzle: Exec }).drizzle
const isCatalogRoute = (id: string) => /^SALMON-product(_cat)?-\d+$/.test(id)
const routeFingerprint = async () =>
  (
    await db().execute(
      sql.raw(`SELECT string_agg(id::text || ':' || coalesce(content_sha256,'') || ':' || updated_at::text || ':' || _status::text, '|' ORDER BY id) AS f, count(*)::int AS n FROM public_routes`),
    )
  ).rows?.[0] as { f: string; n: number }

async function cleanCatalog() {
  for (const collection of ['products', 'product-categories'] as const)
    await p.delete({ collection, where: { source_route_id: { exists: true } }, ...sys })
  await p.delete({ collection: 'manufacturers', where: { corporate_status: { equals: 'RESEARCH_REQUIRED' } }, ...sys })
}

beforeAll(async () => {
  p = await payload()
  await db().execute(sql.raw(`TRUNCATE "public_routes", "_public_routes_v", "public_redirects", "payload_jobs", "h2o_publication_events" RESTART IDENTITY CASCADE`))
  await cleanCatalog()
  ;[admin, editor, sales] = await Promise.all([user('platform-admin'), user('editor'), user('sales')])
  const { ledger } = await importAuthority(p, process.cwd(), { only: isCatalogRoute })
  expect(ledger.filter((l) => l.status === 'ERROR')).toEqual([])
}, 900_000)
afterAll(async () => {
  await cleanCatalog()
  await db().execute(sql.raw(`TRUNCATE "public_routes", "_public_routes_v", "public_redirects", "payload_jobs", "h2o_publication_events" RESTART IDENTITY CASCADE`))
}, 300_000)

describe('CS1 seed counts, dry run and idempotent rerun', () => {
  it('a dry run writes nothing and plans 181 products and every product-category page', async () => {
    const before = await routeFingerprint()
    const dry = await seedCatalog(p, { dryRun: true })
    expect(dry.summary.productRoutes).toBe(181)
    expect(dry.summary.productsCreate).toBe(181)
    expect(dry.summary.categoriesCreate).toBe(dry.summary.categoryRoutes)
    expect(dry.summary.categoryRoutes).toBe(43)
    expect((await p.find({ collection: 'products', ...sys, limit: 0 })).totalDocs).toBe(0)
    expect((await p.find({ collection: 'product-categories', ...sys, limit: 0 })).totalDocs).toBe(0)
    expect((await routeFingerprint()).f).toBe(before.f)
  }, 300_000)
  it('apply creates them; public-routes are not written; a rerun reports 0 changes', async () => {
    const before = await routeFingerprint()
    const first = await seedCatalog(p, { dryRun: false })
    expect(first.summary.productsCreate).toBe(181)
    expect(first.summary.categoriesCreate).toBe(43)
    expect((await p.find({ collection: 'products', ...sys, limit: 0 })).totalDocs).toBe(181)
    expect((await p.find({ collection: 'product-categories', ...sys, limit: 0 })).totalDocs).toBe(43)
    const again = await seedCatalog(p, { dryRun: false })
    expect(again.summary.changes).toBe(0)
    expect(again.summary.productsUnchanged).toBe(181)
    expect(again.summary.categoriesUnchanged).toBe(43)
    const after = await routeFingerprint()
    expect(after.n).toBe(before.n)
    expect(after.f).toBe(before.f) // byte-for-byte the same route rows: the seed is one-way
  }, 600_000)
  it('every product: slug = the page-address slug, linked to its own route record, legacy url kept', async () => {
    const routes = (await p.find({ collection: 'public-routes' as never, where: { routeClass: { equals: 'product' } } as never, limit: 500, ...sys })).docs as unknown as Doc[]
    const products = (await p.find({ collection: 'products', limit: 500, ...sys })).docs as unknown as Doc[]
    const bySource = new Map(products.map((x) => [String(x.source_route_id), x]))
    for (const r of routes) {
      const prod = bySource.get(String(r.routeId))!
      expect(prod, String(r.path)).toBeTruthy()
      expect(prod.slug).toBe(productSlugOf(String(r.path)))
      expect(String(prod.page_route)).toBe(String(r.id))
      expect((prod.legacy_urls as Doc[])[0]!.path).toBe(r.path)
    }
  })
  it('manufacturer only where the product page states exactly one brand term; every other product is reported', async () => {
    const report = await seedCatalog(p, { dryRun: true })
    const routes = (await p.find({ collection: 'public-routes' as never, where: { routeClass: { equals: 'product' } } as never, limit: 500, ...sys })).docs as unknown as Doc[]
    const products = (await p.find({ collection: 'products', limit: 500, depth: 1, overrideAccess: true })).docs as unknown as Doc[]
    const bySource = new Map(products.map((x) => [String(x.source_route_id), x]))
    let linked = 0
    for (const r of routes) {
      const terms = ownBrandTerms((r.document ?? {}) as Doc)
      const prod = bySource.get(String(r.routeId))!
      const ev = prod.manufacturer_evidence as Doc
      if (terms.length === 1) {
        linked++
        expect((prod.manufacturer as Doc).estate_brand_term).toBe(terms[0])
        expect(ev.state).toBe('LEGACY_ICS')
      } else {
        expect(prod.manufacturer ?? null).toBeNull()
        expect(ev.state).toBe('UNKNOWN')
        expect(ev.unknown_reason).toBe(terms.length ? 'MULTIPLE_BRANDS_ON_ONE_RECORD' : 'NO_BRAND_TERM_IN_ESTATE')
        expect(report.unlinkedManufacturer.map((u) => u.path)).toContain(r.path)
      }
    }
    expect(report.unlinkedManufacturer).toHaveLength(181 - linked)
    // Known pages: a brand link outside the product's own attribute table is not evidence for this product.
    const bySlug = new Map(products.map((x) => [String(x.slug), x]))
    expect(((bySlug.get('baldor-motor')!.manufacturer as Doc).estate_brand_term)).toBe('Baldor')
    expect((bySlug.get('tuf-lite-iii-6000mk-series-hub-fan-assemblies')!.manufacturer_evidence as Doc).unknown_reason).toBe('NO_BRAND_TERM_IN_ESTATE')
    expect((bySlug.get('fiberglass-fanstack')!.manufacturer_evidence as Doc).unknown_reason).toBe('MULTIPLE_BRANDS_ON_ONE_RECORD')
    expect(linked).toBe(157)
    const mf = (await p.find({ collection: 'manufacturers', limit: 100, ...sys })).docs as unknown as Doc[]
    for (const m of mf) {
      expect(m.name).toBe(m.estate_brand_term)
      expect(m.corporate_status).toBe('RESEARCH_REQUIRED')
    }
  })
  it('categories come only from page evidence; parents follow the page addresses', async () => {
    const report = await seedCatalog(p, { dryRun: true })
    expect(report.summary.productsWithCategory + report.summary.productsWithoutCategory).toBe(181)
    expect(report.summary.productsWithCategory).toBeGreaterThanOrEqual(128) // category-page links alone
    const cats = (await p.find({ collection: 'product-categories', limit: 100, depth: 1, overrideAccess: true })).docs as unknown as Doc[]
    const child = cats.find((c) => c.slug === 'film-fill')!
    expect((child.parent as Doc).slug).toBe('fill-media')
    expect(cats.find((c) => c.slug === 'fill-media')!.parent ?? null).toBeNull()
    expect(cats.filter((c) => String(c.name).includes('|')).every((c) => c.state === 'MALFORMED_TERM_REVIEW_REQUIRED')).toBe(true)
  })
})

describe('CS2 single source of truth in the admin', () => {
  const anyProduct = async () => ((await p.find({ collection: 'products', limit: 1, ...sys })).docs[0] as unknown as Doc)
  it('an editor cannot change a seeded product’s page-owned fields; the error points at the page', async () => {
    const prod = await anyProduct()
    for (const data of [{ title: 'Changed title' }, { slug: 'changed-slug' }, { seo: { title: 'x' } }, { categories: [] }]) {
      const r = await rest.patch(`products/${String(prod.id)}`, editor.token, data)
      expect(r.status, JSON.stringify(data)).toBe(400)
      expect(JSON.stringify(r.body)).toMatch(/Edit page content/)
    }
  })
  it('catalog truth work stays editable, and re-saving unchanged page-owned values is allowed', async () => {
    const prod = (await p.find({ collection: 'products', where: { 'manufacturer_evidence.state': { equals: 'UNKNOWN' } }, limit: 1, ...sys })).docs[0] as unknown as Doc
    const r = await rest.patch(`products/${String(prod.id)}`, editor.token, {
      title: prod.title,
      identifiers: { identifier_state: 'ABSENT' },
      manufacturer_evidence: { state: 'UNKNOWN', unknown_reason: 'RESEARCH_PENDING' },
    })
    expect(r.status).toBe(200)
  })
  it('nobody but the seed links a catalog record to a page', async () => {
    const route = (await p.find({ collection: 'public-routes' as never, limit: 1, ...sys })).docs[0] as unknown as Doc
    const r = await rest.post('products', admin.token, {
      title: 'Synthetic hand-linked', slug: 'synthetic-hand-linked', page_route: route.id,
      manufacturer_evidence: { state: 'UNKNOWN', unknown_reason: 'RESEARCH_PENDING' },
    })
    expect(r.status).toBe(400)
  })
  it('admin navigation: Products, Product categories and Manufacturers are one group; read by content readers', async () => {
    const cfg = (slug: string) => p.collections[slug as 'products']!.config
    expect(cfg('products').labels).toMatchObject({ plural: 'Products' })
    expect(cfg('product-categories').labels).toMatchObject({ plural: 'Product categories' })
    for (const s of ['products', 'product-categories', 'manufacturers']) expect(cfg(s).admin.group, s).toBe('Products')
    expect(String(cfg('products').admin.description)).toMatch(/Edit page content/)
    for (const who of [admin, editor, sales]) expect((await rest.get('products?limit=1', who.token)).status).toBe(200)
    expect((await rest.get('products?limit=1', null)).status).toBe(403)
  })
})

describe('CS3 CRM links product RFQs to the seeded catalog by exact slug', () => {
  it('a sample of real product slugs (product page and category card placements) resolve to their product', async () => {
    const products = (await p.find({ collection: 'products', limit: 500, sort: 'slug', ...sys })).docs as unknown as Doc[]
    const sample = [0, 37, 74, 111, 148, 182].map((i) => products[i]!)
    for (const [i, prod] of sample.entries()) {
      const hidden =
        i % 2 === 0
          ? { page_path: String((prod.legacy_urls as Doc[])[0]!.path), cta_placement: 'header_action', product_slug: String(prod.slug), product_id: String(prod.source_route_id).split('-').at(-1)! }
          : { page_path: '/fans/', cta_placement: 'category_and_family', product_slug: String(prod.slug), product_id: String(prod.source_route_id).split('-').at(-1)! }
      const body = typeformDelivery({ email: `catalog.probe${i}@northwind.example.com`, message: `Synthetic catalog probe ${i}`, hidden })
      const s = signed(body)
      const r = await ingestTypeformDelivery(p, { rawBody: s.raw, signature: s.signature, config: intakeConfig() })
      expect(r.status).toBe(200)
      const item = (await p.find({ collection: 'crm-rfq-items', where: { rfq: { equals: r.rfqId } }, ...sys })).docs[0] as unknown as Doc
      expect(String(item.product), String(prod.slug)).toBe(String(prod.id))
      expect(item.product_resolution_state).toBe('RESOLVED_EXACT_SLUG')
    }
    // A near miss never links.
    const s = signed(typeformDelivery({ email: 'catalog.miss@northwind.example.com', hidden: { page_path: '/product/x/', cta_placement: 'header_action', product_slug: `${String(sample[0]!.slug)}-x`, product_id: '1' } }))
    const miss = await ingestTypeformDelivery(p, { rawBody: s.raw, signature: s.signature, config: intakeConfig() })
    const item = (await p.find({ collection: 'crm-rfq-items', where: { rfq: { equals: miss.rfqId } }, ...sys })).docs[0] as unknown as Doc
    expect(item.product ?? null).toBeNull()
    await resetCrm()
  }, 300_000)
})
