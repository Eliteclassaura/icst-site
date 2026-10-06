import type { CollectionConfig, FieldAccess } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { OFFICES, OFFICE_LABEL, USER_TIME_ZONES } from './offices'

/**
 * Patch L1: every user has an office (US or TH; the queue they work and the calendar their quick dates use) and an
 * optional display time zone (blank = the office's zone). H2O-local: the shared `users` collection is wrapped, not
 * edited. Only an admin assigns an office; a user may choose their own display zone.
 */
const adminOnly: FieldAccess = ({ req }) => hasRole(req, ADMINS)
const selfOrAdmin: FieldAccess = ({ req, id, doc }) =>
  hasRole(req, ADMINS) || (req.user != null && String(req.user.id) === String(id ?? (doc as { id?: unknown } | undefined)?.id ?? ''))

export function withCrmProfile(collection: CollectionConfig): CollectionConfig {
  return {
    ...collection,
    fields: [
      ...collection.fields,
      {
        name: 'crm_office',
        type: 'select',
        defaultValue: 'US',
        options: OFFICES.map((o) => ({ label: OFFICE_LABEL[o], value: o })),
        access: { create: adminOnly, update: adminOnly },
        admin: { position: 'sidebar', description: 'CRM office: the queue this person works and the business calendar of their quick dates.' },
      },
      {
        // Patch C: the job title in email signatures ({{sales_rep_title}}). The person sets their own.
        name: 'crm_title',
        label: 'Job title',
        type: 'text',
        maxLength: 80,
        access: { update: selfOrAdmin },
        admin: { position: 'sidebar', description: 'Shown under your name in emails sent from the CRM templates.' },
      },
      {
        name: 'time_zone',
        type: 'select',
        options: USER_TIME_ZONES.map((z) => ({ label: z, value: z })),
        access: { update: selfOrAdmin },
        admin: { position: 'sidebar', description: 'Times in the CRM are shown in this zone. Blank = the office’s zone.' },
      },
    ],
  }
}
