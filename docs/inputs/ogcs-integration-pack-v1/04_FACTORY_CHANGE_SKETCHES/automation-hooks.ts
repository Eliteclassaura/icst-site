// packages/agency-core/src/cms/hooks/automation.ts  (sketch — P4/P6, ADR-026)
import type { CollectionBeforeChangeHook } from 'payload'
import { hasRole } from '../access'
import { ADMINS } from '../access/roles'

const isServiceAccount = (req: any) => req.user?.collection === 'service-accounts'

/** Lane B may not change URLs — that is a redirect, which is Lane A (page-decisions → blueprint). */
export const refuseSlugChangeForAutomation: CollectionBeforeChangeHook = ({ data, originalDoc, req, operation }) => {
  if (operation === 'update' && isServiceAccount(req) && originalDoc && data.slug && data.slug !== originalDoc.slug) {
    throw new Error('Slug changes are structural; submit a page-decisions run instead (ADR-026 Lane A).')
  }
  if (operation === 'update' && isServiceAccount(req) && originalDoc && data.parent !== undefined && String(data.parent) !== String(originalDoc.parent)) {
    throw new Error('Parent changes are structural; submit a page-decisions run instead.')
  }
  return data
}

/** ADR-016 made verification a launch gate; this enforces it for everyone, human or machine. */
export const requireVerifiedToPublish: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const becomingPublished = data._status === 'published' && originalDoc?._status !== 'published'
  const status = data.verification?.status ?? originalDoc?.verification?.status
  if (becomingPublished && status !== 'verified') {
    throw new Error(`Cannot publish: verification.status is "${status ?? 'unverified'}" (ADR-016).`)
  }
  return data
}

/** seo.lock protects indexability and canonical from non-admin changes. */
export const protectLockedSeo: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const locked = originalDoc?.seo?.lock === true
  if (!locked || hasRole(req, ADMINS)) return data
  const noindexTurnedOn = data.seo?.noindex === true && originalDoc?.seo?.noindex !== true
  const canonicalChanged = data.seo?.canonical !== undefined && data.seo.canonical !== originalDoc?.seo?.canonical
  if (noindexTurnedOn || canonicalChanged) {
    throw new Error('This page is SEO-locked; noindex/canonical changes need an admin or a page-decisions run.')
  }
  return data
}

/** Redirects created by automation are advisory and must say so. */
export const stampAutomationRedirectSource: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation === 'create' && isServiceAccount(req)) data.source = 'automation'
  return data
}

// Wire in pages/posts: hooks.beforeChange: [refuseSlugChangeForAutomation, protectLockedSeo, requireVerifiedToPublish]
// Wire in redirects:   hooks.beforeChange: [stampAutomationRedirectSource]
// audit.ts: read req.headers.get('x-ogcs-run-id') and store as `runId` on the audit row (new optional text field).
// Also add `seo.lock` (checkbox, admin-only) to seoFields() if not already present — the decision contract's `seo_lock` maps to it.
