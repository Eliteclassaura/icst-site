import type { Field, GlobalConfig, Payload, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { DEFAULT_SITE_CHROME, type SiteChrome } from '../site/site-chrome-content'
import { isEditorialReader, isEditorialWriter } from './access'
import { recordPublicationEvent } from './events'
import { PUBLISHING_QUEUE, SYNC_TASK } from './publishing'
import type { TxReq } from './snapshot'

/**
 * `site-chrome` global (R1B): the editable CONTENT of the shared header navigation and footer.
 *
 * Editors change labels, destinations and footer copy through ordinary fields, with drafts and publish.
 * Main Factory's layout and styling stay in code. Office phones, addresses and social profiles are owner
 * facts: they are not fields here and cannot be edited through this global.
 *
 * Validation: every link is an internal path (`/…/`); a destination that is not one of the accepted defaults
 * must resolve to an existing public route record, the privacy link included. External URLs, protocol-relative paths, `javascript:`, query-only or unknown paths
 * are refused. Publishing records a publication event, so the next release carries the new chrome.
 */
const link = (name: string, label: string): Field => ({
  name,
  type: 'array',
  label,
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'href', type: 'text', required: true, admin: { description: 'Internal path, e.g. /fans/' } },
  ],
})

let acceptedHrefs: Set<string> | null = null
function defaultHrefs(): Set<string> {
  if (acceptedHrefs) return acceptedHrefs
  const out = new Set<string>()
  for (const g of DEFAULT_SITE_CHROME.navigation) {
    if (g.href) out.add(g.href)
    for (const i of g.items ?? []) out.add(i.href)
    for (const s of g.sections ?? []) for (const i of s.items) out.add(i.href)
  }
  for (const c of DEFAULT_SITE_CHROME.footer.columns) for (const l of c.links) out.add(l.href)
  out.add(DEFAULT_SITE_CHROME.footer.privacyHref)
  acceptedHrefs = out
  return out
}

const INTERNAL = /^\/(?:[A-Za-z0-9._~%-]+\/)*$/

async function validateLinks(payload: Payload, data: Record<string, unknown>, req: unknown): Promise<void> {
  const hrefs = new Set<string>()
  const nav = (data.navigation as Array<Record<string, unknown>> | undefined) ?? []
  for (const g of nav) {
    if (g.href) hrefs.add(String(g.href))
    for (const i of (g.items as Array<{ href: string }> | undefined) ?? []) hrefs.add(i.href)
    for (const sct of (g.sections as Array<{ items?: Array<{ href: string }> }> | undefined) ?? []) for (const i of sct.items ?? []) hrefs.add(i.href)
  }
  const footer = (data.footer as Record<string, unknown> | undefined) ?? {}
  for (const c of (footer.columns as Array<{ links?: Array<{ href: string }> }> | undefined) ?? []) for (const l of c.links ?? []) hrefs.add(l.href)
  if (footer.privacyHref) hrefs.add(String(footer.privacyHref))
  const bad = [...hrefs].filter((h) => !INTERNAL.test(h))
  if (bad.length) throw new APIError(`Navigation and footer links must be internal site paths ending in "/" (refused: ${bad.slice(0, 3).join(', ')}).`, 400)
  // The accepted default destinations are authority (the renderer suppresses any whose route is not
  // publication-ready); a destination an editor adds must be an existing route.
  const accepted = defaultHrefs()
  const added = [...hrefs].filter((h) => !accepted.has(h))
  if (!added.length) return
  const found = await payload.find({
    collection: 'public-routes' as never,
    where: { path: { in: added } } as never,
    select: { path: true } as never,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req: req as never,
  })
  const known = new Set((found.docs as unknown as Array<{ path: string }>).map((d) => d.path))
  const unknown = added.filter((h) => !known.has(h))
  if (unknown.length) throw new APIError(`These link targets are not site routes: ${unknown.slice(0, 3).join(', ')}.`, 400)
}

export const SiteChromeGlobal: GlobalConfig = {
  slug: 'site-chrome',
  label: 'Navigation & footer',
  admin: { group: 'Website', description: 'Header navigation and footer text and links. Layout and styling are fixed by the site design; office phone numbers and social profiles come from the owner contact record.' },
  versions: { drafts: true, max: 25 },
  access: {
    read: ({ req }: { req: PayloadRequest }) => isEditorialReader(req),
    update: ({ req }: { req: PayloadRequest }) => isEditorialWriter(req),
    readVersions: ({ req }: { req: PayloadRequest }) => isEditorialReader(req),
    readDrafts: ({ req }: { req: PayloadRequest }) => isEditorialReader(req),
  } as never,
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        await validateLinks(req.payload, (data ?? {}) as Record<string, unknown>, req)
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        if ((doc as { _status?: string })._status !== 'published') return doc
        const seq = await recordPublicationEvent(req.payload, req, 'chrome', null)
        await req.payload.jobs.queue({ task: SYNC_TASK, queue: PUBLISHING_QUEUE, input: { reason: 'chrome', routeId: null, requestedAt: new Date().toISOString(), eventSeq: seq }, req } as never)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'navigation',
      type: 'array',
      label: 'Header navigation groups',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', admin: { description: 'Optional group landing page (internal path).' } },
        link('items', 'Menu links'),
        { name: 'sections', type: 'array', label: 'Menu sections', fields: [{ name: 'label', type: 'text', required: true }, link('items', 'Section links')] },
      ],
    },
    {
      name: 'footer',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text', required: true },
        { name: 'contactLabel', type: 'text', required: true },
        { name: 'description', type: 'textarea', required: true },
        { name: 'columns', type: 'array', fields: [{ name: 'title', type: 'text', required: true }, { name: 'ariaLabel', type: 'text', required: true }, link('links', 'Links')] },
        { name: 'officesTitle', type: 'text', required: true },
        { name: 'officesContactLabel', type: 'text', required: true },
        { name: 'copyright', type: 'text', required: true },
        { name: 'privacyLabel', type: 'text', required: true },
        { name: 'privacyHref', type: 'text', required: true },
      ],
    },
  ],
}

/** The seeded content for a never-edited global: the accepted defaults, as Payload field data. */
export const siteChromeSeed = (): Record<string, unknown> => structuredClone(DEFAULT_SITE_CHROME) as unknown as Record<string, unknown>

type Row = Record<string, unknown>
const strip = (links: unknown): Array<{ label: string; href: string }> =>
  ((links as Row[] | undefined) ?? []).map((l) => ({ label: String(l.label), href: String(l.href) }))

/** Published chrome content read inside the build transaction, in the renderer's shape; defaults when empty. */
export async function publishedSiteChrome(payload: Payload, tx: TxReq): Promise<SiteChrome> {
  let g: Row | null
  try {
    g = (await payload.findGlobal({ slug: 'site-chrome' as never, draft: false, depth: 0, overrideAccess: true, req: tx as never })) as unknown as Row
  } catch {
    g = null
  }
  const nav = (g?.navigation as Row[] | undefined) ?? []
  const footer = (g?.footer as Row | undefined) ?? null
  if (!nav.length || !footer?.heading || (g as { _status?: string } | null)?._status === 'draft') return DEFAULT_SITE_CHROME
  return {
    navigation: nav.map((n) => ({
      label: String(n.label),
      ...(n.href ? { href: String(n.href) } : {}),
      ...(Array.isArray(n.items) && n.items.length ? { items: strip(n.items) } : {}),
      ...(Array.isArray(n.sections) && n.sections.length ? { sections: (n.sections as Row[]).map((sct) => ({ label: String(sct.label), items: strip(sct.items) })) } : {}),
    })),
    footer: {
      heading: String(footer.heading), contactLabel: String(footer.contactLabel), description: String(footer.description),
      columns: ((footer.columns as Row[] | undefined) ?? []).map((c) => ({ title: String(c.title), ariaLabel: String(c.ariaLabel), links: strip(c.links) })),
      officesTitle: String(footer.officesTitle), officesContactLabel: String(footer.officesContactLabel), copyright: String(footer.copyright),
      privacyLabel: String(footer.privacyLabel), privacyHref: String(footer.privacyHref),
    },
  }
}
