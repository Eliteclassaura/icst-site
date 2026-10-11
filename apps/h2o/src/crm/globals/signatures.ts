import type { Access, GlobalConfig } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'

/**
 * SIGNATURES-1: the organisation's standard email signature (Settings → Signatures, admins). One short block of plain
 * text, "ICS Sales Team" + "Industrial Cooling Solutions" by default (no host, phone or address), seeded by the migration so nothing is ever held for a missing signature. Never a
 * phone number or street address by default (owner rule 2026-10-06). Written only through the settings page (trusted
 * server code: sanitised, audited with lengths); the Payload admin screen is read-only.
 */
const admins: Access = ({ req }) => hasRole(req, ADMINS)
const nobody: Access = () => false

export const STANDARD_SIGNATURE_DEFAULT = 'ICS Sales Team\nIndustrial Cooling Solutions'

export const CrmSignatures: GlobalConfig = {
  slug: 'crm-signatures',
  label: 'CRM signatures',
  admin: { group: 'CRM', description: 'The standard email signature. Change it in the CRM: Settings → Signatures.' },
  access: { read: admins, update: nobody },
  fields: [{ name: 'standard_text', type: 'textarea', label: 'Standard signature', maxLength: 600 }],
}
