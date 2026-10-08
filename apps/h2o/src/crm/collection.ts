import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { capListForNonAdmins, crmCollectionAccess } from './access'
import { crmAuditAfterChange, crmAuditAfterDelete } from './audit'
import { canonicalIdField } from './fields'
import { assignCanonicalId, forbidDelete, isServerContext } from './guards'

/**
 * Provenance stamp for records created through a client request (REST / admin UI).
 *
 * A person may cite a source record or evidence, but may not *claim* a machine origin: the source system of
 * a hand-made record is `MANUAL_ENTRY`, whatever the request body says. Only trusted server code (intake,
 * a future importer) running through the Local API with `context.crmServer` may record another source.
 */
export const stampProvenance: CollectionBeforeValidateHook = ({ context, data, operation, originalDoc, req }) => {
  if (!data || isServerContext(context)) return data
  // SEC-CRM-1: after create, provenance (incl. the import batch an admin can undo) is evidence — a non-admin edit
  // keeps the stored value whatever the request says.
  if (operation === 'update') {
    if ('provenance' in data && !hasRole(req, ADMINS)) (data as Record<string, unknown>).provenance = (originalDoc as Record<string, unknown> | undefined)?.provenance
    return data
  }
  if (operation !== 'create') return data
  const prov = ((data as Record<string, unknown>).provenance ?? {}) as Record<string, unknown>
  prov.source_system = 'MANUAL_ENTRY'
  if (req.user && !prov.first_seen_at) prov.first_seen_at = new Date().toISOString()
  ;(data as Record<string, unknown>).provenance = prov
  return data
}

type Options = {
  /** Description of what to do instead of deleting, shown in the refusal. */
  deleteAlternative: string
  /** Allow admins to delete (notes only). Default: nobody, on every path. */
  adminDelete?: boolean
}

/**
 * Wrap a CRM collection with the invariants every CRM-1 collection shares:
 *
 *   - `canonical_id` UUIDv7, server-assigned, immutable;
 *   - CRM-user access, no anonymous access, no `Where` allow;
 *   - bounded list pages for non-admins;
 *   - PII-safe audit on create/update(/delete);
 *   - delete refused in a hook (holds for the Local API too), unless `adminDelete`.
 *
 * The collection's own hooks run after the shared ones, in the order given.
 */
export function crmCollection(config: CollectionConfig, opts: Options): CollectionConfig {
  const hooks = config.hooks ?? {}
  return {
    ...config,
    access: { ...crmCollectionAccess, ...(config.access ?? {}) },
    admin: { group: 'CRM', ...(config.admin ?? {}) },
    fields: [canonicalIdField(), ...config.fields],
    hooks: {
      ...hooks,
      beforeOperation: [capListForNonAdmins, ...(hooks.beforeOperation ?? [])],
      beforeValidate: [assignCanonicalId, ...(hooks.beforeValidate ?? [])],
      beforeDelete: opts.adminDelete
        ? (hooks.beforeDelete ?? [])
        : [forbidDelete(config.slug, opts.deleteAlternative), ...(hooks.beforeDelete ?? [])],
      afterChange: [...(hooks.afterChange ?? []), crmAuditAfterChange],
      afterDelete: [...(hooks.afterDelete ?? []), crmAuditAfterDelete],
    },
  }
}
