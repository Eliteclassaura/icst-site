import type { Payload } from 'payload'
import { CATALOG_SEED_CONTEXT, comparable } from '../../collections/page-index'

/**
 * CRM go-live Pass 0 — one-way catalog seed from the accepted public product routes (Control Tower 2026-10-02).
 *
 * Reads the **published** `public-routes` records (the website's single source of truth) and writes an index
 * into the H2O catalog:
 *
 *   - `product-categories` — one per `/product-category/…` page (routeClass `product_cat`);
 *   - `products` — one per `/product/<slug>/` page (routeClass `product`): `slug` = the legacy product slug in
 *     the page address (exactly what the public quote button sends as `product_slug`, so CRM intake links by
 *     exact slug), the page title, `legacy_urls`, the evidenced categories, and the route link;
 *   - `manufacturers` — only for a brand term the product's own page states in its "Additional information"
 *     table (a `/brand/<slug>/` link). The term is recorded exactly as written (`corporate_status =
 *     RESEARCH_REQUIRED`). A product with no such term, or with more than one, gets no manufacturer and an
 *     UNKNOWN evidence state with the reason — never a guess. Every such product is listed in the report.
 *
 * One-way and idempotent:
 *   - a record is found by `source_route_id` (the authority route id); a rerun writes only what differs and
 *     reports every record as CREATE / UPDATE / UNCHANGED;
 *   - manufacturer fields are written on create only — a later reviewer's manufacturer work is never
 *     overwritten (a difference is reported as MANUFACTURER_KEPT);
 *   - a catalog record with the same slug that the seed did not create is never touched (HELD_CONFLICT);
 *   - nothing is deleted, and nothing in `public-routes` is written. The public site does not read the catalog.
 *
 * Category membership is taken only from evidence in the published pages themselves: the product links on
 * each category page, and the `product_cat-<slug>` classes the estate's product cards carry
 * (`post-<wordpressId> … product_cat-…`). The legacy category pages are paginated snapshots, so a product the
 * estate never shows under a category is left without one and listed as such.
 */

type Doc = Record<string, unknown>
export type SeedAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'HELD_CONFLICT'
export type SeedLine = {
  kind: 'product' | 'category' | 'manufacturer'
  sourceRouteId: string
  path: string
  slug: string
  title: string
  action: SeedAction
  changed: string[]
  categories: string[]
  categoryEvidence: string
  manufacturer: string
  manufacturerState: string
  note: string
}
export type SeedReport = {
  dryRun: boolean
  lines: SeedLine[]
  summary: Record<string, number>
  unlinkedManufacturer: Array<{ path: string; reason: string; terms: string }>
  withoutCategory: string[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim()

/** `/product/<slug>/` → slug; the same rule the site uses (`productSlug` in `src/site/Wave3Products.ts`). */
export const productSlugOf = (path: string): string | null => /^\/product\/([^/]+)\/$/.exec(path)?.[1] ?? null
const pathOf = (href: string): string | null => {
  try {
    return new URL(href, 'https://h2ocooling.com').pathname
  } catch {
    return null
  }
}
const lastSegment = (path: string): string => path.replace(/\/+$/, '').split('/').at(-1) ?? ''

type Route = { id: string; routeId: string; path: string; title: string; routeClass: string; document: Doc }

async function publishedRoutes(payload: Payload): Promise<Route[]> {
  const out: Route[] = []
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: 'public-routes',
      where: { _status: { equals: 'published' } },
      depth: 0,
      limit: 200,
      page,
      overrideAccess: true,
    })
    for (const r of res.docs as unknown as Doc[])
      out.push({
        id: String(r.id),
        routeId: String(r.routeId ?? ''),
        path: String(r.path ?? ''),
        title: String(r.title ?? ''),
        routeClass: String(r.routeClass ?? ''),
        document: (r.document ?? {}) as Doc,
      })
    if (!res.hasNextPage) break
  }
  return out
}

/** Brand terms the product's own "Additional information" table states (distinct, as written). */
export function ownBrandTerms(document: Doc): string[] {
  const links = (Array.isArray(document.links) ? document.links : []) as Doc[]
  const terms = links
    .filter((l) => l.section === 'Additional information' && /\/brand\/[^/]+\/?$/.test(String(l.href ?? '')))
    .map((l) => decodeEntities(String(l.text ?? '')))
    .filter(Boolean)
  return [...new Set(terms)]
}

export function categoryState(name: string, duplicateName: boolean, products: number): string {
  if (name.includes('|')) return 'MALFORMED_TERM_REVIEW_REQUIRED'
  if (duplicateName) return 'DUPLICATE_NAME_REVIEW_REQUIRED'
  if (products === 0) return 'EMPTY_TERM_REVIEW_REQUIRED'
  return 'USABLE'
}

export async function seedCatalog(
  payload: Payload,
  opts: { dryRun: boolean; log?: (m: string) => void } = { dryRun: true },
): Promise<SeedReport> {
  const log = opts.log ?? (() => undefined)
  const ctx = { [CATALOG_SEED_CONTEXT]: true }
  const lines: SeedLine[] = []
  const routes = await publishedRoutes(payload)
  const products = routes.filter((r) => r.routeClass === 'product' && productSlugOf(r.path))
  const cats = routes.filter((r) => r.routeClass === 'product_cat' && r.path.startsWith('/product-category/'))
  log(`published routes ${routes.length}: products ${products.length}, product categories ${cats.length}`)

  // ── category membership evidence ──────────────────────────────────────────────
  const productByPath = new Map(products.map((p) => [p.path, p]))
  const productByWpId = new Map(products.map((p) => [String(p.document.wordpressId ?? ''), p]))
  const catBySlug = new Map<string, Route[]>()
  for (const c of cats) catBySlug.set(lastSegment(c.path), [...(catBySlug.get(lastSegment(c.path)) ?? []), c])
  const membership = new Map<string, Map<string, Set<string>>>() // product path → category path → sources
  const add = (productPath: string, catPath: string, source: string) => {
    const m = membership.get(productPath) ?? new Map<string, Set<string>>()
    m.set(catPath, (m.get(catPath) ?? new Set()).add(source))
    membership.set(productPath, m)
  }
  for (const c of cats)
    for (const l of (Array.isArray(c.document.links) ? c.document.links : []) as Doc[]) {
      const p = pathOf(String(l.href ?? ''))
      if (p && productByPath.has(p)) add(p, c.path, 'CATEGORY_PAGE_LINK')
    }
  const ambiguousCatSlugs = new Set<string>()
  for (const r of routes) {
    const text = JSON.stringify(r.document)
    for (const m of text.matchAll(/post-(\d+) product type-product[^"\\]*/g)) {
      const prod = productByWpId.get(m[1]!)
      if (!prod) continue
      for (const cm of m[0].matchAll(/product_cat-([a-z0-9-]+)/g)) {
        const matches = catBySlug.get(cm[1]!) ?? []
        if (matches.length === 1) add(prod.path, matches[0]!.path, 'PRODUCT_CARD_CLASS')
        else if (matches.length > 1) ambiguousCatSlugs.add(cm[1]!)
      }
    }
  }

  // ── categories ────────────────────────────────────────────────────────────────
  const productsPerCat = new Map<string, number>()
  for (const m of membership.values()) for (const cp of m.keys()) productsPerCat.set(cp, (productsPerCat.get(cp) ?? 0) + 1)
  const nameCount = new Map<string, number>()
  for (const c of cats) nameCount.set(decodeEntities(c.title).toLowerCase(), (nameCount.get(decodeEntities(c.title).toLowerCase()) ?? 0) + 1)
  const catIdByPath = new Map<string, string>()
  const catDesired = (c: Route): Doc => {
    const name = decodeEntities(c.title)
    return {
      name,
      slug: lastSegment(c.path),
      page_route: c.id,
      source_route_id: c.routeId,
      state: categoryState(name, (nameCount.get(name.toLowerCase()) ?? 0) > 1, productsPerCat.get(c.path) ?? 0),
    }
  }
  const findBy = async (collection: 'products' | 'product-categories', field: string, value: string) =>
    ((await payload.find({ collection, where: { [field]: { equals: value } }, depth: 0, limit: 2, overrideAccess: true })).docs as unknown as Doc[])
  for (const c of [...cats].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))) {
    const desired = catDesired(c)
    const existing = (await findBy('product-categories', 'source_route_id', c.routeId))[0]
    const line: SeedLine = {
      kind: 'category', sourceRouteId: c.routeId, path: c.path, slug: String(desired.slug), title: String(desired.name),
      action: 'UNCHANGED', changed: [], categories: [], categoryEvidence: `${productsPerCat.get(c.path) ?? 0} products`,
      manufacturer: '', manufacturerState: '', note: String(desired.state),
    }
    if (!existing) {
      line.action = 'CREATE'
      line.changed = Object.keys(desired)
      if (!opts.dryRun) {
        const doc = await payload.create({ collection: 'product-categories', data: desired as never, context: ctx, overrideAccess: true, depth: 0 })
        catIdByPath.set(c.path, String(doc.id))
      } else catIdByPath.set(c.path, `dry:${c.routeId}`)
    } else {
      catIdByPath.set(c.path, String(existing.id))
      line.changed = Object.keys(desired).filter(
        (k) => JSON.stringify(comparable(desired[k], k === 'page_route')) !== JSON.stringify(comparable(existing[k], k === 'page_route')),
      )
      if (line.changed.length) {
        line.action = 'UPDATE'
        if (!opts.dryRun)
          await payload.update({ collection: 'product-categories', id: String(existing.id), data: Object.fromEntries(line.changed.map((k) => [k, desired[k]])) as never, context: ctx, overrideAccess: true, depth: 0 })
      }
    }
    lines.push(line)
  }
  // Parents: the category whose page address is the nearest ancestor of this one.
  for (const c of cats) {
    const parts = c.path.replace(/\/+$/, '').split('/')
    let parentPath: string | null = null
    for (let n = parts.length - 1; n > 2 && !parentPath; n--) {
      const candidate = `${parts.slice(0, n).join('/')}/`
      if (catIdByPath.has(candidate)) parentPath = candidate
    }
    const parent = parentPath ? catIdByPath.get(parentPath)! : null
    const line = lines.find((l) => l.kind === 'category' && l.sourceRouteId === c.routeId)!
    if (opts.dryRun && line.action === 'CREATE') {
      if (parent) line.changed.push('parent')
      continue
    }
    const current = (await findBy('product-categories', 'source_route_id', c.routeId))[0]
    if (!current) continue
    if (JSON.stringify(comparable(current.parent, true)) === JSON.stringify(comparable(parent, true))) continue
    if (!line.changed.includes('parent')) line.changed.push('parent')
    if (line.action === 'UNCHANGED') line.action = 'UPDATE'
    if (!opts.dryRun)
      await payload.update({ collection: 'product-categories', id: String(current.id), data: { parent } as never, context: ctx, overrideAccess: true, depth: 0 })
  }

  // ── manufacturers (only stated brand terms) ───────────────────────────────────
  const manufacturerIdByTerm = new Map<string, string>()
  const termsInUse = new Set<string>()
  for (const p of products) {
    const t = ownBrandTerms(p.document)
    if (t.length === 1) termsInUse.add(t[0]!)
  }
  for (const term of [...termsInUse].sort()) {
    const found = ((await payload.find({ collection: 'manufacturers', where: { estate_brand_term: { equals: term } }, depth: 0, limit: 2, overrideAccess: true })).docs as unknown as Doc[])[0]
    const line: SeedLine = {
      kind: 'manufacturer', sourceRouteId: '', path: '', slug: '', title: term, action: found ? 'UNCHANGED' : 'CREATE',
      changed: found ? [] : ['name', 'estate_brand_term', 'corporate_status'], categories: [], categoryEvidence: '',
      manufacturer: term, manufacturerState: found ? String(found.corporate_status ?? '') : 'RESEARCH_REQUIRED',
      note: 'brand term exactly as stated on the product pages',
    }
    if (found) manufacturerIdByTerm.set(term, String(found.id))
    else if (!opts.dryRun) {
      const doc = await payload.create({
        collection: 'manufacturers',
        data: { name: term, estate_brand_term: term, corporate_status: 'RESEARCH_REQUIRED' } as never,
        overrideAccess: true,
        depth: 0,
      })
      manufacturerIdByTerm.set(term, String(doc.id))
    } else manufacturerIdByTerm.set(term, `dry:${term}`)
    lines.push(line)
  }

  // ── products ──────────────────────────────────────────────────────────────────
  const unlinkedManufacturer: SeedReport['unlinkedManufacturer'] = []
  const withoutCategory: string[] = []
  for (const p of [...products].sort((a, b) => a.path.localeCompare(b.path))) {
    const slug = productSlugOf(p.path)!
    const catPaths = [...(membership.get(p.path)?.keys() ?? [])].sort()
    const sources = [...new Set([...(membership.get(p.path)?.values() ?? [])].flatMap((s) => [...s]))].sort()
    const categoryIds = catPaths.map((cp) => catIdByPath.get(cp)!).filter(Boolean).sort()
    if (catPaths.length === 0) withoutCategory.push(p.path)
    const terms = ownBrandTerms(p.document)
    const evidence =
      terms.length === 1
        ? { manufacturer: manufacturerIdByTerm.get(terms[0]!) ?? null, manufacturer_evidence: { state: 'LEGACY_ICS', estate_brand_term: terms[0], unknown_reason: null } }
        : {
            manufacturer: null,
            manufacturer_evidence: {
              state: 'UNKNOWN',
              estate_brand_term: terms.length ? terms.join(' | ') : null,
              unknown_reason: terms.length ? 'MULTIPLE_BRANDS_ON_ONE_RECORD' : 'NO_BRAND_TERM_IN_ESTATE',
            },
          }
    if (terms.length !== 1)
      unlinkedManufacturer.push({ path: p.path, reason: String(evidence.manufacturer_evidence.unknown_reason), terms: terms.join(' | ') })
    const desired: Doc = {
      title: decodeEntities(p.title),
      slug,
      page_route: p.id,
      source_route_id: p.routeId,
      legacy_urls: [{ path: p.path, redirect_type: 'KEEP', pre_existing_live_redirect: false }],
      categories: categoryIds,
    }
    const line: SeedLine = {
      kind: 'product', sourceRouteId: p.routeId, path: p.path, slug, title: String(desired.title), action: 'UNCHANGED', changed: [],
      categories: catPaths, categoryEvidence: sources.join('+') || 'NONE', manufacturer: terms.join(' | '),
      manufacturerState: String(evidence.manufacturer_evidence.state), note: '',
    }
    const existing = (await findBy('products', 'source_route_id', p.routeId))[0]
    if (!existing) {
      const clash = (await findBy('products', 'slug', slug))[0]
      if (clash) {
        line.action = 'HELD_CONFLICT'
        line.note = 'a catalog product with this slug exists and was not created by the seed; left untouched'
        lines.push(line)
        continue
      }
      line.action = 'CREATE'
      line.changed = [...Object.keys(desired), 'manufacturer', 'manufacturer_evidence']
      if (!opts.dryRun)
        await payload.create({
          collection: 'products',
          data: { ...desired, ...evidence, _status: 'published' } as never,
          context: ctx,
          overrideAccess: true,
          depth: 0,
        })
    } else {
      const rel = (k: string) => k === 'page_route' || k === 'categories'
      line.changed = Object.keys(desired).filter((k) => {
        const a = k === 'categories' ? [...((desired[k] as string[]) ?? [])].sort() : desired[k]
        const b = k === 'categories' ? (((existing[k] as unknown[]) ?? []).map((x) => String(comparable(x, true)))).sort() : existing[k]
        return JSON.stringify(comparable(a, rel(k))) !== JSON.stringify(comparable(b, rel(k)))
      })
      const mNow = JSON.stringify([comparable(existing.manufacturer, true), (existing.manufacturer_evidence as Doc | undefined)?.state])
      const mSeed = JSON.stringify([comparable(evidence.manufacturer, true), evidence.manufacturer_evidence.state])
      if (mNow !== mSeed) line.note = 'MANUFACTURER_KEPT: the record differs from the page evidence; reviewer work is not overwritten'
      if (line.changed.length) {
        line.action = 'UPDATE'
        if (!opts.dryRun)
          await payload.update({
            collection: 'products',
            id: String(existing.id),
            data: { ...Object.fromEntries(line.changed.map((k) => [k, desired[k]])), _status: 'published' } as never,
            context: ctx,
            overrideAccess: true,
            depth: 0,
          })
      }
    }
    lines.push(line)
  }

  const count = (kind: SeedLine['kind'], action?: SeedAction) => lines.filter((l) => l.kind === kind && (!action || l.action === action)).length
  const summary: Record<string, number> = {
    publishedRoutes: routes.length,
    productRoutes: products.length,
    categoryRoutes: cats.length,
    productsCreate: count('product', 'CREATE'),
    productsUpdate: count('product', 'UPDATE'),
    productsUnchanged: count('product', 'UNCHANGED'),
    productsHeldConflict: count('product', 'HELD_CONFLICT'),
    categoriesCreate: count('category', 'CREATE'),
    categoriesUpdate: count('category', 'UPDATE'),
    categoriesUnchanged: count('category', 'UNCHANGED'),
    manufacturersCreate: count('manufacturer', 'CREATE'),
    manufacturersExisting: count('manufacturer', 'UNCHANGED'),
    productsWithManufacturer: products.length - unlinkedManufacturer.length,
    productsWithoutManufacturer: unlinkedManufacturer.length,
    productsWithCategory: products.length - withoutCategory.length,
    productsWithoutCategory: withoutCategory.length,
    ambiguousCategorySlugs: ambiguousCatSlugs.size,
    changes: lines.filter((l) => l.action === 'CREATE' || l.action === 'UPDATE').length,
  }
  log(JSON.stringify(summary))
  return { dryRun: opts.dryRun, lines, summary, unlinkedManufacturer, withoutCategory }
}
