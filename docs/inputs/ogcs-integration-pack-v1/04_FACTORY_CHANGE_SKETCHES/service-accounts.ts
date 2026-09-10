// packages/agency-core/src/cms/collections/access-machine.ts  (sketch — P6, ADR-026)
import type { CollectionConfig } from 'payload'
import { isAdmin, isPlatformAdmin, selfOrAdmin, adminFieldOnly } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

/**
 * Service accounts — machine identities for OGCS (Lane B publishing).
 * API-key auth only; no password login; single fixed role `automation`.
 * One document per client per external system; disable or rotate to revoke instantly.
 */
export const ServiceAccounts: CollectionConfig = {
  slug: 'service-accounts',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true,        // no email/password, no sessions, no login route
  },
  admin: {
    useAsTitle: 'name',
    group: 'Access',
    defaultColumns: ['name', 'system', 'enabled', 'lastUsedAt'],
    description: 'Machine identities. Keys are shown once on creation; store them only in the calling system’s secret manager.',
  },
  access: {
    create: isAdmin,
    read: selfOrAdmin,
    update: isAdmin,
    delete: isPlatformAdmin,
    admin: () => false,                // service accounts never see the admin UI
  },
  hooks: {
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'system', type: 'select', required: true, options: [{ label: 'OGCS', value: 'ogcs' }] },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['automation'],
      options: [{ label: 'Automation', value: 'automation' }],
      access: { create: adminFieldOnly, update: adminFieldOnly },
      saveToJWT: true,
      admin: { readOnly: true, description: 'Fixed. Service accounts hold exactly one role.' },
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    { name: 'lastUsedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'dailyWriteBudget', type: 'number', defaultValue: 10, min: 0, admin: { description: 'Soft cap enforced by the caller; hard cap via rateLimit.' } },
    { name: 'notes', type: 'textarea' },
  ],
}

// payload.config.ts: add to `collections`; `admin.user` stays 'users'.
// security.ts: extend the rateLimit or add a per-key limiter keyed on req.user.id for 'service-accounts'.
// threat-model: SENSITIVE_COLLECTIONS += 'service-accounts'; add `enabled === false` → 401 test.
