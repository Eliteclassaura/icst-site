import { createHash } from 'node:crypto'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Field,
} from 'payload'
import { APIError } from 'payload'
import { withheldIdsFor, withheldNodesIn } from '../public-exclusions'
import { lexicalParts, validateSlots, validateServiceSlots, type ContentSlot, type LexicalState } from '../content-slots'
import { EDITORIAL_BLOCKS, editorialPathProblem, RESTRICTED_RICH_TEXT } from '../editorial'
import { adminField, adminOnly, isContentAdmin as isContentAdminReq, isEditorialWriter, readPublicRoutes, readVersionsEditorial, writeEditorial } from '../access'
import { isStructural } from '../structural'
import { restoredSectionsField, validateRestoredSections, type RestoredGroup } from '../restored-sections'
import { applyContentSlots } from '../content-slots'
import { publicFileExists } from '../public-files'
import { notePublicChange } from '../publishing'
import { restoreKeepsCurrent } from '../../hooks/restore-keeps-current'

/**
 * `public-routes` — one record per public route identity of the accepted release authority.
 *
 * The record carries (a) the route's frozen identity (source id, path, source file and hash), (b) its
 * disposition from the accepted release ledger (PUBLIC / REVIEW_HOLD / PRIVATE_ARCHIVE / REDIRECT,
 * export, indexable, sitemap, searchable, canonical, redirect target) and (c) the editable content: title,
 * SEO title/description and the page document the accepted Main Factory templates render.
 *
 * Payload drafts/versions give the editorial lifecycle: edit → draft → private preview → publish →
 * edit again → unpublish. Public reads are anonymous and see only `_status = published` records whose
 * disposition is PUBLIC and exported (see `../access`).
 *
 * Guards that no role can talk past:
 *   - identity (routeId, path, family, source) is write-once; the importer sets it for imported routes, and the
 *     server sets it for a page created in Payload (family `editorial`) from the validated address;
 *   - the imported provenance tree (`document`) is hidden and import-only; editors edit typed page elements
 *     (`slots`, ../content-slots) or, on a new page, typed sections (../editorial), all validated server-side;
 *   - a record whose disposition is not PUBLIC/exported can never be published (held, private-archive and
 *     redirect records stay draft, whoever asks);
 *   - disposition, canonical and indexability are admin-only fields;
 *   - delete is admin-only; unpublish is the editorial withdrawal.
 */

export const FAMILIES = ['salmon', 'live', 'english-service', 'alias', 'search', 'editorial'] as const
export const STATES = ['PUBLIC', 'REVIEW_HOLD', 'PRIVATE_ARCHIVE', 'REDIRECT'] as const

type Doc = Record<string, unknown>
const IMPORT_CONTEXT = 'h2oContentImport'
export const importContext = { [IMPORT_CONTEXT]: true }
const isImport = (context: unknown): boolean => Boolean((context as Record<string, unknown> | undefined)?.[IMPORT_CONTEXT])

const WRITE_ONCE = ['routeId', 'path', 'pathKey', 'family'] as const


/** Stable content hash of what the public templates render (identity for the snapshot and search). */
export const contentHashOf = (doc: Doc): string => {
  const payload = JSON.stringify({
    title: doc.title ?? null,
    seo: doc.seo ?? null,
    document: doc.document ?? null,
    slots: doc.slots ?? null,
    lead: doc.lead ?? null,
    sections: doc.sections ?? null,
    // Restored sections (2026-10-05) are content; the key is present only when a record has them, so existing hashes are stable.
    ...(Array.isArray(doc.restoredSections) && doc.restoredSections.length ? { restoredSections: doc.restoredSections } : {}),
    disposition: doc.disposition ?? null,
    path: doc.path ?? null,
  })
  return createHash('sha256').update(payload).digest('hex')
}

/* ---------- editor write validation (R1B, Control Tower F1/C5) ---------- */
type Req = Parameters<CollectionBeforeChangeHook>[0]['req']
const SLOT_IMMUTABLE = ['kind', 'tag', 'elementId', 'sourceHash'] as const
const PRODUCT_ROUTE = /^SALMON-product-[0-9]+$/

/** Every current route path (drafts included: a link may point at a page published in the same release). */
async function knownPaths(req: Req): Promise<Set<string>> {
  const r = await req.payload.find({ collection: 'public-routes', pagination: false, depth: 0, select: { path: true } as never, overrideAccess: true, req })
  return new Set((r.docs as Doc[]).map((d) => String(d.path)))
}
/** Published, PUBLIC product routes: routeId → path. */
async function publicProducts(req: Req): Promise<Map<string, string>> {
  const r = await req.payload.find({
    collection: 'public-routes',
    pagination: false,
    depth: 0,
    select: { routeId: true, path: true } as never,
    where: { and: [{ routeId: { like: 'SALMON-product-' } }, { _status: { equals: 'published' } }, { 'disposition.state': { equals: 'PUBLIC' } }, { 'disposition.export': { equals: true } }] },
    overrideAccess: true,
    req,
  })
  return new Map((r.docs as Doc[]).filter((d) => PRODUCT_ROUTE.test(String(d.routeId))).map((d) => [String(d.routeId), String(d.path)]))
}
/** Denormalise an uploaded media item for the snapshot (the public site never queries Payload for media). */
async function mediaFacts(req: Req, id: unknown, publishing: boolean): Promise<{ url: string; width: number | null; height: number | null; alt: string }> {
  const m = (await req.payload.findByID({ collection: 'media', id: String(id), depth: 0, overrideAccess: true, req }).catch(() => null)) as Doc | null
  if (!m) throw new APIError('The selected image no longer exists.', 400)
  if (publishing && (m.rights === 'unknown' || !m.rights)) throw new APIError(`Image “${String(m.filename)}” has unknown usage rights and cannot be published.`, 400)
  const sizes = (m.sizes ?? {}) as Record<string, Doc>
  const best = sizes.w1600?.url ? sizes.w1600 : sizes.w1100?.url ? sizes.w1100 : null
  let url = String((best?.url as string) ?? m.url ?? '')
  try {
    url = new URL(url, 'http://h2o.invalid').pathname // Payload may return an absolute serverURL form
  } catch {
    url = ''
  }
  if (!url.startsWith('/api/media/file/')) throw new APIError('The selected image has no public file.', 400)
  return { url, width: Number(best?.width ?? m.width) || null, height: Number(best?.height ?? m.height) || null, alt: m.decorative ? '' : String(m.alt ?? '') }
}
const relId = (v: unknown) => (v && typeof v === 'object' ? (v as Doc).id : v)

async function checkSlots(req: Req, merged: Doc, before: Doc, slots: ContentSlot[], publishing: boolean): Promise<ContentSlot[]> {
  const original = ((before.slots ?? []) as ContentSlot[])
  const byKey = new Map(original.map((s) => [s.key, s]))
  if (slots.length !== original.length || slots.some((s) => !byKey.has(s.key)))
    throw new APIError('Page elements are fixed by the page layout: rows cannot be added, removed or re-keyed.', 400)
  const out: ContentSlot[] = []
  for (const s of slots) {
    const o = byKey.get(s.key)!
    const next: ContentSlot = { ...s }
    for (const k of SLOT_IMMUTABLE) (next as Doc)[k] = (o as Doc)[k] ?? null
    next.title = o.title ?? null
    if (next.kind === 'image') {
      const id = relId(next.image)
      if (id) {
        const f = await mediaFacts(req, id, publishing)
        Object.assign(next, { image: id, imageUrl: f.url, imageWidth: f.width, imageHeight: f.height, alt: next.alt || f.alt })
      } else Object.assign(next, { image: null, imageUrl: null, imageWidth: null, imageHeight: null })
    }
    out.push(next)
  }
  const family = String(merged.family)
  if (family === 'english-service') {
    const errors = validateServiceSlots((merged.document ?? {}) as Doc, out)
    if (errors.length) throw new APIError(`Content check failed: ${errors.slice(0, 5).join('; ')}`, 400)
    return out
  }
  const products = await publicProducts(req)
  for (const s of out)
    if (s.kind === 'action' && s.productRouteId) {
      const path = products.get(s.productRouteId)
      if (!path && s.productRouteId !== byKey.get(s.key)?.productRouteId) throw new APIError(`${s.key}: the product is not a published product`, 400)
      // A product relation owns the destination: the product's own page.
      if (path) s.href = path
    }
  const ctx = { knownPaths: await knownPaths(req), knownFile: publicFileExists, productRouteIds: new Set([...products.keys(), ...original.map((o) => o.productRouteId).filter(Boolean) as string[]]), withheldElementIds: withheldIdsFor(String(merged.source && (merged.source as Doc).aliasOf ? (merged.source as Doc).aliasOf : merged.routeId)) }
  const errors = validateSlots((merged.document ?? {}) as Doc, out, ctx, original)
  if (errors.length) throw new APIError(`Content check failed: ${errors.slice(0, 5).join('; ')}`, 400)
  return out
}

/** Images in restored sections are Payload media items (held, verified assets); the server records their delivery facts. */
async function checkRestoredImages(req: Req, groups: Doc[], publishing: boolean): Promise<Doc[]> {
  const out: Doc[] = []
  for (const g of groups) {
    const blocks: Doc[] = []
    for (const b of (g.blocks as Doc[] | undefined) ?? []) {
      if (b.blockType !== 'restoredImage') {
        blocks.push(b)
        continue
      }
      const id = relId(b.image)
      if (!id) throw new APIError('Every restored image needs a media item.', 400)
      const f = await mediaFacts(req, id, publishing)
      blocks.push({ ...b, image: id, imageUrl: f.url, imageWidth: f.width, imageHeight: f.height })
    }
    out.push({ ...g, blocks })
  }
  return out
}

const SAFE_HREF = /^(?:\/(?!\/)[^\s]*|#[^\s]*|https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?)$/
async function checkSections(req: Req, sections: Doc[], publishing: boolean): Promise<Doc[]> {
  let paths: Set<string> | null = null
  const out: Doc[] = []
  for (const s of sections) {
    const next = { ...s }
    if (s.blockType === 'image') {
      const id = relId(s.image)
      if (!id) throw new APIError('Every image block needs an image.', 400)
      const f = await mediaFacts(req, id, publishing)
      Object.assign(next, { image: id, imageUrl: f.url, imageWidth: f.width, imageHeight: f.height, mediaAlt: f.alt })
    }
    if (s.blockType === 'paragraph') {
      const { types, urls } = lexicalParts(s.content as LexicalState)
      if (types.some((t) => !['root', 'paragraph', 'text', 'link', 'linebreak'].includes(t))) throw new APIError('Paragraphs support bold, italic and links only.', 400)
      for (const u of urls) if (!SAFE_HREF.test(u)) throw new APIError(`Paragraph link ${u.slice(0, 80)}: use a site path (/…/) or an https link.`, 400)
    }
    if (s.blockType === 'button') {
      const href = String(s.href ?? '')
      if (s.intent !== 'quote') {
        if (!href) throw new APIError(`Button “${String(s.label)}” needs a destination.`, 400)
        if (!SAFE_HREF.test(href)) throw new APIError(`Button “${String(s.label)}”: use a site path (/…/) or an https link.`, 400)
        if (href.startsWith('/')) {
          paths ??= await knownPaths(req)
          if (!paths.has(href.split(/[?#]/)[0]!)) throw new APIError(`Button “${String(s.label)}”: ${href} is not a page on this site.`, 400)
        }
      }
    }
    out.push(next)
  }
  return out
}

/** Server-owned identity of a page created in Payload. The editor supplies a title and an address only. */
async function editorialIdentity(req: Req, d: Doc): Promise<void> {
  const path = String(d.requestedPath ?? '').trim()
  const problem = editorialPathProblem(path)
  if (problem) throw new APIError(`Page address: ${problem}`, 400)
  const taken = await req.payload.find({ collection: 'public-routes', where: { or: [{ path: { equals: path } }, { pathKey: { equals: path } }] }, limit: 1, depth: 0, overrideAccess: true, req })
  if (taken.totalDocs) throw new APIError(`Page address ${path} is already used by another page.`, 400)
  const redirect = await req.payload.find({ collection: 'public-redirects', where: { source: { in: [path, path.replace(/\/$/, '')] } }, limit: 1, depth: 0, overrideAccess: true, req })
  if (redirect.totalDocs) throw new APIError(`Page address ${path} is a reviewed redirect and cannot be reused.`, 400)
  const id = createHash('sha256').update(`${path}|${Date.now()}|${Math.random()}`).digest('hex').slice(0, 12)
  Object.assign(d, {
    routeId: `EDITORIAL-${id}`,
    path,
    pathKey: path,
    family: 'editorial',
    routeClass: 'editorial',
    disposition: { state: 'PUBLIC', export: true, indexable: true, sitemap: true, searchable: true, redirect: null, matchedArticle: false, releaseOverride: null },
    source: { sourceUrl: null, sourceFile: null, sourceSha256: null, previousCanonical: null, sourceRobots: null, aliasOf: null, order: 1_000_000 },
    seo: { ...((d.seo ?? {}) as Doc), canonical: path },
  })
}

const MAIN_BEFORE = 'h2oMainStatusBefore'
const guard: CollectionBeforeChangeHook = async ({ context, data, operation, originalDoc, req }) => {
  const d = data as Doc
  const before = (originalDoc ?? {}) as Doc
  const imported = isImport(context)
  // The published state of the MAIN row before this write. `originalDoc` is the latest version, which is a
  // draft whenever an unpublished draft is pending — so it cannot tell whether this write withdraws the page.
  if (operation === 'update' && before.id != null) (context as Doc)[MAIN_BEFORE] = await mainStatus(req, before.id)
  if (operation === 'update' && !imported) {
    for (const f of WRITE_ONCE)
      if (f in d && d[f] !== undefined && before[f] !== undefined && String(d[f]) !== String(before[f]))
        throw new APIError(`${f} is a frozen route identity and cannot change (URL changes are redirects, reviewed separately).`, 400)
    const src = (d.source ?? null) as Doc | null
    const was = (before.source ?? {}) as Doc
    if (src)
      for (const [k, v] of Object.entries(src))
        if (v !== undefined && (v ?? null) !== (was[k] ?? null)) throw new APIError('Source provenance is frozen.', 400)
    // The imported provenance tree is not editable by any editor path (only the reviewed import sets it).
    if (d.document !== undefined && JSON.stringify(d.document) !== JSON.stringify(before.document ?? null))
      throw new APIError('The imported page structure is frozen; edit the page elements instead.', 400)
  }
  if (operation === 'create' && !imported) {
    // New pages are editorial pages (typed blocks). Imported families need an authority row.
    if (!(req.user && isEditorialWriter(req))) throw new APIError('Only editors can create pages.', 403)
    await editorialIdentity(req, d)
  }
  // RESTORE-1: an empty or stateless disposition group never overrides the stored one (it is what Payload's restore path
  // produced before `restoreKeepsCurrent`); the authority decision below always reads a real state.
  if (d.disposition !== undefined && !(d.disposition && typeof d.disposition === 'object' && (d.disposition as Doc).state !== undefined)) delete d.disposition
  const merged = { ...before, ...d } as Doc
  const disp = (merged.disposition ?? {}) as Doc
  const publishing = d._status === 'published'
  if (publishing && !(disp.state === 'PUBLIC' && disp.export === true))
    throw new APIError(`A ${String(disp.state ?? 'non-public')} record cannot be published. Held, private and redirect records stay unpublished.`, 400)
  // Held / private / redirect records are frozen reference data: only an admin may change their content.
  if (operation === 'update' && !imported && disp.state !== 'PUBLIC' && !(req.user && isContentAdminReq(req)))
    throw new APIError('Held and private records are frozen; an admin must release them first.', 403)
  // Accepted Main Factory exclusions (../public-exclusions) cannot be reintroduced by any write path,
  // including an admin edit or a stale import fixture: the source change is a reviewed registry change.
  if (d.document !== undefined && d.document !== null && (merged.family === 'salmon' || merged.family === 'live')) {
    const nested = (d.document as Doc).routeId
    const own = (merged.source as Doc | undefined)?.aliasOf ?? merged.routeId
    if (nested !== undefined && String(nested) !== String(own))
      throw new APIError('The page document names a different route identity than this record. Identity comes from the record, never from nested data.', 400)
  }
  if (d.document !== undefined) {
    const withheld = withheldNodesIn(String(merged.source && (merged.source as Doc).aliasOf ? (merged.source as Doc).aliasOf : merged.routeId ?? ''), d.document)
    if (withheld.length)
      throw new APIError(`This document reintroduces withheld public content (${withheld.join(', ')}). Exclusions are changed only through the reviewed exclusion registry.`, 400)
  }
  if (!imported && Array.isArray(d.slots)) d.slots = await checkSlots(req, merged, before, d.slots as ContentSlot[], publishing)
  if (!imported && Array.isArray(d.sections)) d.sections = await checkSections(req, d.sections as Doc[], publishing)
  if (Array.isArray(d.restoredSections) && d.restoredSections.length) {
    if (merged.family !== 'salmon' && merged.family !== 'live') throw new APIError('Restored sections belong to imported pages only.', 400)
    d.restoredSections = await checkRestoredImages(req, d.restoredSections as Doc[], publishing)
    // Anchors resolve against the page as editors see it (the imported tree with the page elements applied).
    const page = applyContentSlots((merged.document ?? {}) as Doc, (merged.slots ?? null) as ContentSlot[] | null)
    const problems = validateRestoredSections(page, d.restoredSections as unknown as RestoredGroup[])
    if (problems.length) throw new APIError(`Restored sections check failed: ${problems.slice(0, 5).join('; ')}`, 400)
  }
  if (merged.family === 'editorial' && publishing && !((merged.sections as unknown[] | undefined) ?? []).length)
    throw new APIError('Add at least one section before publishing this page.', 400)
  d.contentSha256 = contentHashOf({ ...merged, ...d })
  return d
}

/**
 * The main row's status after the write. A draft save (`draft: true`) writes a version only and leaves the
 * main row published; publish writes the main row; unpublish sets the main row to draft. Hook arguments do
 * not say which of the three happened, so the row itself is read (same transaction).
 */
async function mainStatus(req: Parameters<CollectionAfterChangeHook>[0]['req'], id: unknown): Promise<string | null> {
  const row = (await req.payload.db.findOne({ collection: 'public-routes', where: { id: { equals: id } }, req } as never)) as Doc | null
  return row ? String(row._status ?? '') : null
}

const afterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context, operation }) => {
  const d = doc as Doc
  const recorded = (context as Doc | undefined)?.[MAIN_BEFORE]
  const before = operation === 'create' ? null : recorded !== undefined ? String(recorded ?? '') : String((previousDoc as Doc | undefined)?._status ?? '')
  const now = await mainStatus(req, d.id)
  const withdrawn = before === 'published' && now === 'draft'
  if (withdrawn && !isImport(context) && isStructural(d as never) && !(req.user && isContentAdminReq(req)))
    // Thrown inside the operation's transaction: the unpublish is rolled back.
    throw new APIError('This page is structural (other pages depend on it) and cannot be unpublished by an editor.', 403)
  const published = now === 'published' && (before !== 'published' || d._status === 'published')
  if (published || withdrawn)
    await notePublicChange(req, { reason: withdrawn ? 'unpublish' : 'publish', routeId: String(d.routeId), path: String(d.path ?? ''), bulk: isImport(context) })
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await notePublicChange(req, { reason: 'delete', routeId: String((doc as Doc).routeId), path: String((doc as Doc).path ?? '') })
  return doc
}

const identity = (name: string, extra: Partial<Field> = {}): Field =>
  ({
    name,
    type: 'text',
    required: true,
    index: true,
    access: { create: adminField, update: adminField },
    admin: { readOnly: true, position: 'sidebar', condition: (data) => Boolean(data?.routeId) },
    ...extra,
  }) as Field

export const PublicRoutes: CollectionConfig = {
  slug: 'public-routes',
  labels: { singular: 'Public page', plural: 'Public pages' },
  admin: {
    group: 'Website',
    useAsTitle: 'title',
    defaultColumns: ['title', 'path', 'family', '_status', 'updatedAt'],
    listSearchableFields: ['title', 'path', 'routeId'],
    description:
      'Public website pages. Edit the page elements (text, buttons, images), save a draft, preview it, then Publish. Unpublish withdraws a page. “Create new” starts a new page from sections. Held pages cannot be published.',
    // Private preview: an authenticated, no-store page on the site itself (no framing needed).
    preview: (doc) => `/api/preview/?path=${encodeURIComponent(String((doc as Doc).path ?? '/'))}`,
  },
  versions: { drafts: true, maxPerDoc: 25 },
  access: {
    read: readPublicRoutes,
    readVersions: readVersionsEditorial,
    create: writeEditorial,
    update: writeEditorial,
    delete: adminOnly,
  },
  hooks: { beforeValidate: [restoreKeepsCurrent(() => PublicRoutes.fields)], beforeChange: [guard], afterChange: [afterChange], afterDelete: [afterDelete] },
  fields: [
    { name: 'title', type: 'text', required: true },
    identity('routeId', { unique: true }),
    identity('path', { unique: true }),
    identity('pathKey', { unique: true, admin: { hidden: true } }),
    {
      name: 'requestedPath',
      type: 'text',
      label: 'Page address',
      access: { update: () => false },
      admin: {
        condition: (data) => !data?.routeId,
        placeholder: '/cooling-tower-news/',
        description: 'The address of the new page, e.g. /cooling-tower-news/. Cannot be changed after the page is created.',
      },
    },
    {
      name: 'family',
      type: 'select',
      required: true,
      options: [...FAMILIES],
      access: { create: adminField, update: adminField },
      admin: { readOnly: true, position: 'sidebar', condition: (data) => Boolean(data?.routeId) },
    },
    { name: 'routeClass', type: 'text', access: { create: adminField, update: adminField }, admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'document',
      type: 'json',
      // Restricted provenance (R1B, Control Tower F1): set by the reviewed import only, never shown to editors.
      access: { create: adminField, update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'slots',
      type: 'array',
      label: 'Page content',
      labels: { singular: 'Page element', plural: 'Page elements' },
      access: { create: adminField },
      admin: {
        condition: (data) => Boolean(data?.routeId) && data?.family !== 'editorial' && data?.family !== 'alias' && data?.family !== 'search',
        initCollapsed: false,
        isSortable: false,
        description: 'Every heading, paragraph, button, link and image on this page, in page order. Edit the words, links and images; the layout stays as designed. Save a draft, Preview, then Publish.',
      },
      fields: [
        { name: 'key', type: 'text', required: true, admin: { hidden: true } },
        { name: 'kind', type: 'select', required: true, options: ['heading', 'text', 'action', 'image', 'copy'], admin: { hidden: true } },
        { name: 'tag', type: 'text', admin: { hidden: true } },
        { name: 'elementId', type: 'text', admin: { hidden: true } },
        { name: 'title', type: 'text', label: 'Element', admin: { readOnly: true } },
        { name: 'sourceHash', type: 'text', admin: { hidden: true } },
        { name: 'heading', type: 'text', label: 'Heading', admin: { condition: (_d, s) => s?.kind === 'heading' } },
        { name: 'copy', type: 'textarea', label: 'Text', admin: { condition: (_d, s) => s?.kind === 'copy' } },
        { name: 'text', type: 'richText', label: 'Text', editor: RESTRICTED_RICH_TEXT, admin: { condition: (_d, s) => s?.kind === 'text' } },
        { name: 'label', type: 'text', label: 'Button / link text', admin: { condition: (_d, s) => s?.kind === 'action' } },
        {
          name: 'href',
          type: 'text',
          label: 'Goes to',
          admin: { condition: (_d, s) => s?.kind === 'action' && !s?.productRouteId, description: 'A page on this site (/contact-us/) or an https link.' },
        },
        {
          name: 'productRouteId',
          type: 'text',
          label: 'Product',
          admin: { condition: (_d, s) => s?.kind === 'action' && Boolean(s?.productRouteId), readOnly: true, description: 'This button belongs to a published product card; it opens that product’s quote.' },
        },
        {
          name: 'intent',
          type: 'select',
          label: 'Action',
          defaultValue: 'none',
          options: [{ label: 'Normal link', value: 'none' }, { label: 'Request a quote (approved quote form)', value: 'quote' }],
          admin: { condition: (_d, s) => s?.kind === 'action' },
        },
        { name: 'image', type: 'upload', relationTo: 'media', label: 'Replace image', admin: { condition: (_d, s) => s?.kind === 'image', description: 'Leave empty to keep the original image.' } },
        { name: 'alt', type: 'text', label: 'Alt text', admin: { condition: (_d, s) => s?.kind === 'image' } },
        { name: 'imageUrl', type: 'text', admin: { hidden: true } },
        { name: 'imageWidth', type: 'number', admin: { hidden: true } },
        { name: 'imageHeight', type: 'number', admin: { hidden: true } },
      ],
    },
    { name: 'lead', type: 'textarea', label: 'Introduction', admin: { condition: (d) => d?.family === 'editorial' || !d?.routeId, description: 'Shown under the page heading.' } },
    {
      name: 'sections',
      type: 'blocks',
      label: 'Sections',
      blocks: EDITORIAL_BLOCKS,
      admin: { condition: (d) => d?.family === 'editorial' || !d?.routeId, description: 'Build the page from headings, paragraphs, images, buttons and FAQs.' },
    },
    restoredSectionsField,
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', admin: { description: 'Browser/search title. Empty keeps the accepted source title.' } },
        { name: 'description', type: 'textarea', admin: { description: 'Meta description. Empty keeps the source description.' } },
        {
          name: 'canonical',
          type: 'text',
          access: { create: adminField, update: adminField },
          admin: { description: 'Canonical URL (admin-only; URL equity is never changed silently).' },
        },
      ],
    },
    {
      name: 'disposition',
      type: 'group',
      access: { create: adminField, update: adminField },
      admin: { description: 'From the accepted release authority. Admin-only.' },
      fields: [
        { name: 'state', type: 'select', required: true, options: [...STATES], defaultValue: 'REVIEW_HOLD', index: true },
        { name: 'export', type: 'checkbox', defaultValue: false, index: true },
        { name: 'indexable', type: 'checkbox', defaultValue: false },
        { name: 'sitemap', type: 'checkbox', defaultValue: false },
        { name: 'searchable', type: 'checkbox', defaultValue: false },
        { name: 'redirect', type: 'text' },
        { name: 'matchedArticle', type: 'checkbox', defaultValue: false },
        { name: 'releaseOverride', type: 'text' },
      ],
    },
    {
      name: 'source',
      type: 'group',
      access: { create: adminField, update: adminField },
      admin: { readOnly: true, description: 'Frozen provenance from the accepted snapshot.' },
      fields: [
        { name: 'sourceUrl', type: 'text' },
        { name: 'sourceFile', type: 'text' },
        { name: 'sourceSha256', type: 'text' },
        { name: 'previousCanonical', type: 'text' },
        { name: 'sourceRobots', type: 'text' },
        { name: 'aliasOf', type: 'text', admin: { description: 'For an alias route: the source route id whose document it renders.' } },
        { name: 'order', type: 'number', index: true, admin: { description: 'Position in the accepted route authority (templates read lists in this order).' } },
      ],
    },
    {
      name: 'contentSha256',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}
