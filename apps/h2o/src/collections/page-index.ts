import { APIError, type CollectionBeforeChangeHook, type CollectionConfig, type Field } from 'payload'

/**
 * CRM go-live Pass 0 (Control Tower 2026-10-02): the H2O catalog as an **index of the public pages**.
 *
 * The public website renders products and product categories from `public-routes` records — that is the
 * single source of truth for what a visitor sees and what an editor edits. The catalog collections
 * (`products`, `product-categories`) are filled by the one-way catalog seed (`src/content/import/
 * catalog-seed.ts`) so that admins can browse products and the CRM can link an RFQ to a product by its exact
 * slug. A record the seed created carries `page_route` (the route record it indexes) and `source_route_id`
 * (the stable authority route id), and:
 *
 *   - shows an "Edit page content" link to its route record at the top of the form;
 *   - hides the catalog's own content fields (narrative, specifications, media, SEO, …), which the page
 *     owns — so nothing editable here can diverge from what the page shows;
 *   - refuses changes to its seed-owned identity fields (title, slug, address, route link, categories) from
 *     anyone but the seed. Catalog truth work (manufacturer evidence, identifiers, review states) stays
 *     editable as before.
 *
 * Records without `page_route` (authored directly in the catalog, or the synthetic test rows) behave exactly
 * as the frozen catalog contract defines; none of this applies to them.
 */
export const CATALOG_SEED_CONTEXT = 'h2oCatalogSeed'
const PAGE_LINK_FIELDS = ['source_route_id'] as const

const relId = (v: unknown): unknown =>
  v && typeof v === 'object' && 'id' in (v as Record<string, unknown>) ? String((v as Record<string, unknown>).id) : v

/** A comparable form of a field value: relationship objects become ids, array row ids are ignored. */
export function comparable(v: unknown, relation: boolean): unknown {
  if (v === undefined || v === '') return null
  if (Array.isArray(v)) return v.map((x) => comparable(x, relation))
  if (relation) return v === null ? null : String(relId(v))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      if (k !== 'id') out[k] = comparable(x, false)
    return out
  }
  return v
}

export function pageIndexGuard(opts: {
  seedOwned: readonly string[]
  pageOwned: readonly string[]
  relations: readonly string[]
  noun: string
}): CollectionBeforeChangeHook {
  return ({ data, originalDoc, operation, context, req }) => {
    if (context?.[CATALOG_SEED_CONTEXT] === true) return data
    const indexed = operation === 'update' ? (originalDoc as Record<string, unknown> | undefined)?.page_route : undefined
    const incomingRoute = (data as Record<string, unknown>)?.page_route
    // Only the seed links a record to a page (a hand-made link would make a second, unaudited index).
    if (operation === 'create' && incomingRoute) {
      throw new APIError(`A ${opts.noun} is linked to its public page only by the catalog seed.`, 400, undefined, true)
    }
    if (!indexed) {
      // SEC-MAIN-1 (security audit R1, catalog.page-index-link-forgeable-on-update): the link fields are the seed's on an
      // unindexed record too: no hand-made page link on update, and no authority route id the seed would need.
      const d = (data ?? {}) as Record<string, unknown>
      const o = (originalDoc ?? {}) as Record<string, unknown>
      const forged = PAGE_LINK_FIELDS.filter((k) => {
        if (!Object.prototype.hasOwnProperty.call(d, k)) return false
        const rel = false
        return JSON.stringify(comparable(d[k], rel)) !== JSON.stringify(comparable(operation === 'update' ? o[k] : undefined, rel))
      })
      if (forged.length > 0) {
        req?.payload?.logger?.info?.({ scope: 'catalog.page-index', code: 'PAGE_LINK_FIELD_REFUSED', fields: forged })
        throw new APIError(`A ${opts.noun}'s public page link (${forged.join(', ')}) is set only by the catalog seed.`, 400, undefined, true)
      }
      return data
    }
    const d = (data ?? {}) as Record<string, unknown>
    const o = (originalDoc ?? {}) as Record<string, unknown>
    const changed = [...opts.seedOwned, ...opts.pageOwned].filter((k) => {
      if (!Object.prototype.hasOwnProperty.call(d, k)) return false
      const rel = opts.relations.includes(k)
      return JSON.stringify(comparable(d[k], rel)) !== JSON.stringify(comparable(o[k], rel))
    })
    if (changed.length > 0) {
      req?.payload?.logger?.info?.({ scope: 'catalog.page-index', code: 'PAGE_OWNED_FIELD_REFUSED', fields: changed })
      throw new APIError(
        `This ${opts.noun} is an index of its public page, and these fields come from the page: ${changed.join(', ')}. Use "Edit page content" to change what visitors see.`,
        400,
        undefined,
        true,
      )
    }
    return data
  }
}

const hideWhenIndexed = (f: Field): Field => {
  if (!('name' in f)) return f
  const prior = (f.admin as { condition?: (d: unknown, s: unknown, x: unknown) => boolean } | undefined)?.condition
  return {
    ...f,
    admin: {
      ...(f.admin ?? {}),
      condition: (data: Record<string, unknown> | undefined, sibling: unknown, ctx: unknown) =>
        !data?.page_route && (prior ? prior(data, sibling, ctx) : true),
    },
  } as Field
}

function indexFields(noun: string): Field[] {
  return [
    {
      name: 'source_route_id',
      type: 'text',
      unique: true,
      index: true,
      label: 'Authority route id',
      admin: { position: 'sidebar', readOnly: true, description: 'Stable route id from the accepted route authority.' },
    },
  ]
}

export function productsAsPageIndex(c: CollectionConfig): CollectionConfig {
  const pageOwned = ['narrative', 'specifications', 'variants', 'media', 'documents', 'related_products', 'related_services', 'seo']
  const fields: Field[] = []
  for (const f of c.fields) {
    const name = 'name' in f ? f.name : null
    fields.push(name && pageOwned.includes(name) ? hideWhenIndexed(f) : f)
    if (name === 'family')
      fields.push({
        name: 'categories',
        type: 'relationship',
        relationTo: 'product-categories',
        hasMany: true,
        label: 'Product categories',
        admin: {
          description:
            'Categories evidenced by the public category pages. Set by the catalog seed for indexed products; empty means the estate shows no category for this product, not that it has none.',
        },
      })
  }
  return {
    ...c,
    labels: { singular: 'Product', plural: 'Products' },
    admin: {
      ...c.admin,
      group: 'Products',
      defaultColumns: ['title', 'slug', 'manufacturer', 'categories', 'updatedAt'],
      listSearchableFields: ['title', 'slug'],
      description:
        'An index of the products on the public website, for finding products and for linking quote requests in the CRM. The website shows each product from its page: to change what visitors see, open the product and use "Edit page content". Catalog truth work (manufacturer evidence, identifiers, review states) is recorded here.',
    },
    hooks: {
      ...c.hooks,
      beforeChange: [
        pageIndexGuard({
          seedOwned: ['title', 'slug', 'source_route_id', 'legacy_urls', 'categories'],
          pageOwned,
          relations: ['categories', 'variants', 'media', 'documents', 'related_products', 'related_services'],
          noun: 'product',
        }),
        ...(c.hooks?.beforeChange ?? []),
      ],
    },
    fields: [...indexFields('product'), ...fields],
  }
}

export function categoriesAsPageIndex(c: CollectionConfig): CollectionConfig {
  return {
    ...c,
    labels: { singular: 'Product category', plural: 'Product categories' },
    admin: {
      ...c.admin,
      group: 'Products',
      defaultColumns: ['name', 'slug', 'parent', 'state'],
      listSearchableFields: ['name', 'slug'],
      description:
        'The product categories of the public website (its /product-category/ pages). To change a category page, open it and use "Edit page content". State records the condition of the legacy term.',
    },
    hooks: {
      ...c.hooks,
      beforeChange: [
        pageIndexGuard({
          seedOwned: ['name', 'slug', 'parent', 'source_route_id'],
          pageOwned: [],
          relations: ['parent'],
          noun: 'product category',
        }),
        ...(c.hooks?.beforeChange ?? []),
      ],
    },
    fields: [...indexFields('product category'), ...c.fields],
  }
}
