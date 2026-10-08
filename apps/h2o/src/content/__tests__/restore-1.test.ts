/**
 * RESTORE-1 (CT 2026-10-07): the restore-path refill, against the real collection field configs. It reproduces what Payload
 * 3.90.2's field `beforeValidate` hands the collection hooks on a restore (denied fields deleted, no refill, named groups
 * re-created as `{}`) and checks that every field with a field-level update rule comes back to its CURRENT value. The DB
 * behaviour (restoreVersion end to end, the guard's 403) is in ../__dbtests__/restore-1.dbtest.ts.
 */
import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import { PublicRoutes } from '../collections/public-routes'
import { Products } from '../../collections/products'
import { SiteChromeGlobal } from '../site-chrome'
import { EDITORIAL_BLOCKS } from '../editorial'
import { restoredSectionsField } from '../restored-sections'
import { keepCurrent, restoreKeepsCurrent } from '../../hooks/restore-keeps-current'

type Doc = Record<string, unknown>
type F = Field & { name?: string; type: string; access?: { update?: unknown }; fields?: F[] }
/** Every path with a field-level update rule (no such field sits inside an array or block in these configs). */
const guarded = (fields: F[], at = ''): string[] =>
  fields.flatMap((f) => {
    const p = f.name ? (at ? `${at}.${f.name}` : f.name) : at
    if (f.name && f.access?.update) return [p]
    if (f.type === 'tabs') return ((f as { tabs?: Array<{ name?: string; fields: F[] }> }).tabs ?? []).flatMap((t) => guarded(t.fields, t.name ? (p ? `${p}.${t.name}` : t.name) : p))
    if (f.type === 'array' || f.type === 'blocks') return []
    return f.fields ? guarded(f.fields, p) : []
  })
const get = (d: Doc, p: string): unknown => p.split('.').reduce<unknown>((v, k) => (v as Doc | undefined)?.[k], d)
/** What Payload's restore-path field beforeValidate leaves for a non-admin: guarded fields gone, their groups `{}`. */
const strip = (d: Doc, paths: string[]): Doc => {
  const out = structuredClone(d)
  for (const p of paths) {
    const keys = p.split('.')
    let at = out
    for (const k of keys.slice(0, -1)) at = (at[k] ??= {}) as Doc
    delete at[keys.at(-1)!]
  }
  for (const p of paths) if (!p.includes('.') && out[p] === undefined && typeof d[p] === 'object') out[p] = {}
  return out
}
const run = (fields: () => Field[], data: Doc, originalDoc: Doc, isRestoringVersion = true) =>
  (restoreKeepsCurrent(fields) as unknown as (a: Doc) => Doc)({ context: { isRestoringVersion }, data, originalDoc, operation: 'update', req: {} })

const current: Doc = {
  routeId: 'SALMON-pages-1', path: '/a/', pathKey: '/a/', requestedPath: null, family: 'salmon', routeClass: 'pages',
  document: { tag: 'root', children: ['current tree'] }, title: 'Current title', contentSha256: 'c',
  seo: { title: 'Current SEO title', description: 'Current description', canonical: '/a/' },
  disposition: { state: 'PUBLIC', export: true, indexable: true, sitemap: true, searchable: true, redirect: null, matchedArticle: false, releaseOverride: 'CT-2026-10-07' },
  source: { sourceUrl: 'https://x/a/', sourceFile: 'documents/a.json', sourceSha256: 'abc', previousCanonical: null, sourceRobots: null, aliasOf: null, order: 1 },
}
const restored: Doc = {
  ...structuredClone(current), title: 'Old title', seo: { title: 'Old SEO title', description: 'Old description', canonical: '/old/' },
  disposition: { ...(current.disposition as Doc), state: 'REVIEW_HOLD', releaseOverride: null }, document: { tag: 'root', children: ['old tree'] },
}

describe('RESTORE-1 restore-path refill', () => {
  const routeFields = () => PublicRoutes.fields
  const paths = guarded(PublicRoutes.fields as F[])
  it('covers every guarded public-routes field', () => {
    expect(paths.sort()).toEqual(['contentSha256', 'disposition', 'document', 'family', 'path', 'pathKey', 'requestedPath', 'routeClass', 'routeId', 'seo.canonical', 'source'].sort())
  })
  it('editor restore: guarded fields return to their CURRENT values; editable content stays the restored version', () => {
    const out = run(routeFields, strip(restored, paths), current)
    for (const p of paths) expect(get(out, p), p).toEqual(get(current, p))
    expect(out.title).toBe('Old title')
    expect((out.seo as Doc).title).toBe('Old SEO title')
    expect((out.seo as Doc).description).toBe('Old description')
  })
  it('admin restore (fields pass access, so the old version values arrive): still the CURRENT values (CT ruling 1)', () => {
    const out = run(routeFields, structuredClone(restored), current)
    expect(out.disposition).toEqual(current.disposition)
    expect((out.seo as Doc).canonical).toBe('/a/')
    expect(out.document).toEqual(current.document)
    expect(out.source).toEqual(current.source)
  })
  it('the refill is a copy: later writes to the data never touch the stored document', () => {
    const out = run(routeFields, strip(restored, paths), current)
    ;(out.disposition as Doc).state = 'X'
    expect((current.disposition as Doc).state).toBe('PUBLIC')
  })
  it('does nothing outside the restore path (ordinary updates keep their own access rules)', () => {
    const data = strip(restored, paths)
    expect(run(routeFields, data, current, false)).toEqual(strip(restored, paths))
  })
  it('a field the current record does not have is not invented', () => {
    const out: Doc = { requestedPath: '/x/' }
    keepCurrent(PublicRoutes.fields as never, out, {})
    expect('requestedPath' in out).toBe(false)
  })
})

describe('RESTORE-1 other versioned collections', () => {
  it('products: price and truth states keep their CURRENT values on a restore', () => {
    const paths = guarded(Products.fields as F[])
    expect(paths.sort()).toEqual(['identifiers.identifier_state', 'manufacturer_evidence.state', 'public_price', 'truth_status'].sort())
    const cur: Doc = { title: 'Gear', truth_status: 'VERIFIED_ICS', public_price: null, manufacturer_evidence: { state: 'VERIFIED_ICS', estate_brand_term: 'Amarillo' }, identifiers: { mpn: 'M1', identifier_state: 'VERIFIED_ICS' } }
    const old: Doc = { title: 'Old gear', truth_status: 'LEGACY_ICS', manufacturer_evidence: { state: 'UNKNOWN', estate_brand_term: 'Amarillo' }, identifiers: { mpn: 'M1', identifier_state: 'UNKNOWN' } }
    const out = run(() => Products.fields, structuredClone(old), cur)
    expect(out.title).toBe('Old gear')
    expect(out.truth_status).toBe('VERIFIED_ICS')
    expect(out.public_price).toBeNull()
    expect((out.manufacturer_evidence as Doc).state).toBe('VERIFIED_ICS')
    expect((out.manufacturer_evidence as Doc).estate_brand_term).toBe('Amarillo')
    expect((out.identifiers as Doc).identifier_state).toBe('VERIFIED_ICS')
  })
  it('site-chrome (the other versioned config) has no field-level update rule, so its restores are unaffected', () => {
    expect(guarded(SiteChromeGlobal.fields as F[])).toEqual([])
  })
  it('both affected collections run the refill as a collection beforeValidate hook', () => {
    expect(PublicRoutes.hooks?.beforeValidate?.length).toBe(1)
    expect(Products.hooks?.beforeValidate?.length).toBe(1)
  })
})

describe('RESTORE-1.1 (Security Auditor gap 2): no field-level update rule inside an array or block', () => {
  // `keepCurrent` does not recurse into arrays or blocks (rows have no stable mapping between a version and the current
  // record). This fails the build the day such a rule appears there, so the restore path is revisited before it ships.
  type B = { slug: string; fields: F[] }
  const insideRows = (fields: F[], at: string, inRow: boolean, out: string[]) => {
    for (const f of fields) {
      const p = f.name ? (at ? `${at}.${f.name}` : f.name) : at
      if (inRow && f.name && f.access?.update) out.push(p)
      const blocks = (f as { blocks?: B[] }).blocks
      if (blocks) for (const b of blocks) insideRows(b.fields, `${p}[${b.slug}]`, true, out)
      const tabs = (f as { tabs?: Array<{ name?: string; fields: F[] }> }).tabs
      if (tabs) for (const t of tabs) insideRows(t.fields, t.name ? (p ? `${p}.${t.name}` : t.name) : p, inRow, out)
      if (f.fields) insideRows(f.fields, p, inRow || f.type === 'array', out)
    }
    return out
  }
  it('public-routes, products, the editorial blocks and the restored-section blocks carry none', () => {
    expect(insideRows(PublicRoutes.fields as F[], '', false, [])).toEqual([])
    expect(insideRows(Products.fields as F[], '', false, [])).toEqual([])
    expect(insideRows((EDITORIAL_BLOCKS as unknown as B[]).flatMap((b) => b.fields.map((f) => f)), 'sections', true, [])).toEqual([])
    expect(insideRows([restoredSectionsField as F], '', false, [])).toEqual([])
  })
  it('the walker is live: a rule planted inside a block or an array row is reported', () => {
    const planted = [{ name: 'rows', type: 'array', fields: [{ name: 'price', type: 'number', access: { update: () => false } }] }, { name: 'sections', type: 'blocks', blocks: [{ slug: 'x', fields: [{ name: 'flag', type: 'checkbox', access: { update: () => false } }] }] }] as unknown as F[]
    expect(insideRows(planted, '', false, []).sort()).toEqual(['rows.price', 'sections[x].flag'])
  })
})
