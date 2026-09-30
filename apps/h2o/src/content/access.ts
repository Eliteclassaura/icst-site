import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'

/**
 * Editorial access for the public content bridge.
 *
 * Editorial privileges are deliberately separate from CRM privileges. `sales` (a CRM role) and `viewer`
 * are treated exactly like an anonymous visitor here: they read published public content only and write
 * nothing. The shared `CONTENT_READERS` group (which includes `sales`) is intentionally *not* used for
 * draft access, so a Sales user cannot read unpublished public drafts through the admin, REST or the
 * Local API.
 *
 *   - editorial writers / publishers: platform-admin, client-admin, editor
 *   - editorial draft readers: the writers plus search-analyst (read-only SEO review)
 *   - disposition, canonical and route identity: admins only (holds, indexability, URLs)
 */
export const EDITORIAL_WRITERS = [...ADMINS, 'editor'] as const
export const EDITORIAL_READERS = [...EDITORIAL_WRITERS, 'search-analyst'] as const

export const isEditorialWriter = (req: PayloadRequest): boolean => hasRole(req, [...EDITORIAL_WRITERS])
export const isEditorialReader = (req: PayloadRequest): boolean => hasRole(req, [...EDITORIAL_READERS])
export const isContentAdmin = (req: PayloadRequest): boolean => hasRole(req, ADMINS)

/** Anonymous (and every non-editorial role): published, PUBLIC, exported records only. */
export const PUBLISHED_PUBLIC: Where = {
  and: [
    { _status: { equals: 'published' } },
    { 'disposition.state': { equals: 'PUBLIC' } },
    { 'disposition.export': { equals: true } },
  ],
}

/**
 * Editorial readers see everything (drafts included). Everyone else — anonymous, sales, viewer — reads only
 * published PUBLIC records, and only through the server's Local API (the website render and the snapshot
 * build). The public REST/GraphQL surface does not list page records at all: the website *is* the public
 * surface, and record internals (provenance, dispositions, hashes) are not a public API.
 */
export const readPublicRoutes: Access = ({ req }) => {
  if (isEditorialReader(req)) return true
  if (req.payloadAPI !== 'local') return false
  return PUBLISHED_PUBLIC
}
export const writeEditorial: Access = ({ req }) => isEditorialWriter(req)
export const adminOnly: Access = ({ req }) => isContentAdmin(req)
export const nobody: Access = () => false
export const readVersionsEditorial: Access = ({ req }) => isEditorialReader(req)

/** Field-level: only content admins may set it (create and update are separate operations). */
export const adminField: FieldAccess = ({ req }) => isContentAdmin(req)
