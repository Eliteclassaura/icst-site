import type { CollectionConfig } from 'payload'

/**
 * Native intake rate-limit events (counts only). Each row is one counted request in one bucket:
 *   `ip:<hmac>`     a client IP, as a keyed HMAC — never the address itself
 *   `email:<hmac>`  a submitted email match key, as a keyed HMAC — never the address itself
 *   `token:<hmac>`  form-token requests per IP
 * No access for anyone: only the intake adapter (trusted server code, overrideAccess) reads and writes it. Rows older
 * than two days are pruned by the adapter as it writes.
 */
const nobody = () => false

export const CrmIntakeRate: CollectionConfig = {
  slug: 'crm-intake-rate',
  labels: { singular: 'Intake rate event', plural: 'Intake rate events' },
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  timestamps: false,
  fields: [
    { name: 'bucket', type: 'text', required: true, index: true },
    { name: 'at', type: 'date', required: true, index: true },
  ],
}
