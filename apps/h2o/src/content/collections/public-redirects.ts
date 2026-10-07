import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { adminOnly, isEditorialReader } from '../access'
import { notePublicChange } from '../publishing'

/**
 * `public-redirects` — the reviewed redirect set (salmon + reconciled + R2 exact + owner-authorised).
 *
 * Redirects follow Payload state at runtime: the publishing runner writes the active set into the published
 * snapshot, and the proxy answers from that snapshot. Changing a redirect is an admin act (never silent:
 * "never silently change a ranking URL"); editors and SEO analysts can read the set, nobody else.
 */
type Doc = Record<string, unknown>

const hasControl = (v: string) => [...v].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)

const validate = ({ data }: { data?: Doc }) => {
  const d = (data ?? {}) as Doc
  for (const k of ['source', 'destination'] as const) {
    const v = d[k]
    // SEC-MAIN-1 (security audit R1, redirect.backslash-open-redirect): no backslash or control character either; a URL
    // parser reads a backslash as "/", so "/" + backslash + "evil.example" would leave the site.
    if (v !== undefined && (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || /[\s<>"\\]/.test(v) || hasControl(v)))
      throw new APIError(`${k} must be a site-relative path starting with a single "/".`, 400)
  }
  return d
}

const bulk = (context: unknown) => Boolean((context as Record<string, unknown> | undefined)?.h2oContentImport)
const changed: CollectionAfterChangeHook = async ({ doc, req, context }) => {
  if (bulk(context)) return doc
  await notePublicChange(req, { reason: 'redirect', routeId: String((doc as Doc).source) })
  return doc
}
const deleted: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await notePublicChange(req, { reason: 'redirect', routeId: String((doc as Doc).source) })
  return doc
}

export const PublicRedirects: CollectionConfig = {
  slug: 'public-redirects',
  labels: { singular: 'Redirect', plural: 'Redirects' },
  admin: { group: 'Website', useAsTitle: 'source', defaultColumns: ['source', 'destination', 'status', 'active'] },
  access: {
    read: ({ req }) => isEditorialReader(req),
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: { beforeValidate: [validate], afterChange: [changed], afterDelete: [deleted] },
  fields: [
    { name: 'source', type: 'text', required: true, unique: true, index: true },
    { name: 'destination', type: 'text', required: true },
    { name: 'status', type: 'select', required: true, options: ['301', '308'], defaultValue: '308' },
    { name: 'active', type: 'checkbox', defaultValue: true },
    { name: 'authority', type: 'text', admin: { description: 'Which reviewed authority this row came from.' } },
  ],
}
