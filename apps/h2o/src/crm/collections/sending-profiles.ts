import type { Access, CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { crmCollection } from '../collection'
import { CrmInvariantError } from '../guards'
import { options } from '../vocabulary'
import { checkProfileShape, MAIL_PRESETS, SENDING_USES } from '../../email/profiles'

/**
 * Patch C: email sending profiles (admins only). One active profile per use:
 *   TRANSACTIONAL  RFQ alerts, the customer acknowledgement, replies, password resets
 *   REVENUE        Revenue Engine sequences (used once the engine exists; falls back to TRANSACTIONAL)
 * The active profile replaces the environment profile (the server's mail settings); with none active, the environment profile is used.
 * The send mode and allowlist (H2O_EMAIL_MODE) are environment-only and always apply.
 *
 *   - The password is sealed (AES-256-GCM, H2O_SETTINGS_KEY) and write-only: no API, admin screen or page ever reads it
 *     back; only the sending code opens it. `password_set` says whether one is stored.
 *   - Changes are made in the CRM settings pages, which ask for a fresh two-factor code (5 minutes) and check the host
 *     against the network guard. The Payload admin screen is read-only for this collection.
 *   - Audited: field names plus the active / use / preset / check transitions (never a host, user name or password).
 */
const admins: Access = ({ req }) => hasRole(req, ADMINS)
const never: FieldAccess = () => false
// Writes only through the settings actions (trusted server code after the step-up check), never through the API.
const nobody: Access = () => false

const shape: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
  // C-S1-2: the host allowlist applies when the host changes or the profile is turned on; it must never block turning a
  // profile OFF or recording a check on a profile whose host is no longer listed.
  const hostRule = data?.active === true || (data?.host !== undefined && data.host !== (originalDoc as Record<string, unknown> | undefined)?.host)
  const problem = checkProfileShape(merged, process.env, { hostRule })
  if (problem) throw new CrmInvariantError(problem.code, problem.message)
  return data
}

export const CrmSendingProfiles: CollectionConfig = crmCollection(
  {
    slug: 'crm-sending-profiles',
    labels: { singular: 'Sending profile', plural: 'Sending profiles' },
    access: { read: admins, create: nobody, update: nobody, delete: nobody },
    admin: {
      useAsTitle: 'name',
      description: 'Email sending profiles (Patch C). Manage them in the CRM: Settings → Sending profiles.',
      defaultColumns: ['name', 'use', 'preset', 'active', 'last_check_state'],
    },
    hooks: { beforeChange: [shape] },
    fields: [
      { name: 'name', type: 'text', required: true, maxLength: 80 },
      { name: 'preset', type: 'select', required: true, options: options(MAIL_PRESETS), defaultValue: 'GMAIL' },
      { name: 'use', type: 'select', required: true, options: options(SENDING_USES), defaultValue: 'TRANSACTIONAL', index: true },
      { name: 'active', type: 'checkbox', defaultValue: false, index: true },
      { name: 'host', type: 'text', required: true, maxLength: 253 },
      { name: 'port', type: 'number', required: true, defaultValue: 587 },
      { name: 'tls_servername', type: 'text', required: true, maxLength: 253 },
      { name: 'username', type: 'text', required: true, maxLength: 254 },
      { name: 'password_sealed', type: 'text', hidden: true, access: { read: never, create: never, update: never } },
      { name: 'password_set', type: 'checkbox', defaultValue: false, admin: { readOnly: true } },
      { name: 'from_address', type: 'text', required: true, maxLength: 254 },
      { name: 'from_name', type: 'text', maxLength: 80 },
      { name: 'last_check_state', type: 'select', options: options(['OK', 'FAILED'] as const) },
      { name: 'last_check_code', type: 'text', maxLength: 60 },
      { name: 'last_check_at', type: 'date' },
    ],
  },
  { deleteAlternative: '', adminDelete: true },
)
