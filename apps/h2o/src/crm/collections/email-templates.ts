import type { Access, CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { CrmInvariantError } from '../guards'
import { options } from '../vocabulary'
import { lintTemplate, templateHash, TEMPLATE_PURPOSES } from '../../email/templates'

/**
 * Patch C: email templates (T1–T6 seeded from the CT-accepted OGCS copy; more later for the Revenue Engine).
 *
 *   - Read by every CRM user (Sales start replies from them); written only by the settings pages (admins, trusted
 *     server code) — the collection has no API write access.
 *   - Approval is tied to the exact wording: `approved_hash` must equal the hash of purpose + subject + body. Any edit
 *     clears the approval (this hook), so an unapproved text is never sent. T1 is the automatic acknowledgement: it is
 *     sent only while approved (the owner's wording approval) and H2O_EMAIL_CUSTOMER_ACK=on.
 *   - Audited: field names plus approval, purpose and version transitions.
 */
const crmUsers: Access = ({ req }) => hasRole(req, CRM_USERS)
const nobody: Access = () => false

const rules: CollectionBeforeChangeHook = ({ data, operation, originalDoc: original }) => {
  // Payload passes an empty original on create; only an update has a previous wording.
  const originalDoc = operation === 'update' ? original : undefined
  const d = data as Record<string, unknown>
  const merged = { ...(originalDoc ?? {}), ...d } as Record<string, unknown>
  const text = { subject: String(merged.subject ?? ''), body: String(merged.body ?? ''), purpose: String(merged.purpose ?? '') }
  const problems = lintTemplate(text)
  if (problems.length) throw new CrmInvariantError(problems[0]!.code, problems.map((p) => p.message).join(' '))
  const hash = templateHash(text)
  if (originalDoc && hash !== templateHash({ subject: String(originalDoc.subject ?? ''), body: String(originalDoc.body ?? ''), purpose: String(originalDoc.purpose ?? '') }))
    d.version = Number(originalDoc.version ?? 1) + 1
  // Approved only for this exact text; otherwise the approval is cleared.
  if (merged.approved === true && merged.approved_hash !== hash) Object.assign(d, { approved: false, approved_hash: null, approved_by: null, approved_at: null })
  return data
}

export const CrmEmailTemplates: CollectionConfig = crmCollection(
  {
    slug: 'crm-email-templates',
    labels: { singular: 'Email template', plural: 'Email templates' },
    access: { read: crmUsers, create: nobody, update: nobody, delete: nobody },
    admin: {
      useAsTitle: 'name',
      description: 'Email templates (Patch C). Edit and approve them in the CRM: Settings → Email templates.',
      defaultColumns: ['code', 'name', 'purpose', 'approved', 'version'],
    },
    hooks: { beforeChange: [rules] },
    fields: [
      { name: 'code', type: 'text', required: true, unique: true, index: true, maxLength: 24 },
      { name: 'name', type: 'text', required: true, maxLength: 120 },
      { name: 'purpose', type: 'select', required: true, options: options(TEMPLATE_PURPOSES), defaultValue: 'TRANSACTIONAL' },
      { name: 'locale', type: 'text', required: true, defaultValue: 'en', maxLength: 8 },
      { name: 'subject', type: 'text', required: true, maxLength: 200 },
      { name: 'body', type: 'textarea', required: true, maxLength: 20000 },
      { name: 'version', type: 'number', required: true, defaultValue: 1 },
      { name: 'approved', type: 'checkbox', defaultValue: false, index: true },
      { name: 'approved_hash', type: 'text', maxLength: 64 },
      userRelation('approved_by', 'Who approved this wording.'),
      { name: 'approved_at', type: 'date' },
    ],
  },
  { deleteAlternative: 'Templates are kept; edit the text or leave it unapproved.' },
)
