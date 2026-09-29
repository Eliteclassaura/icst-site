import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { crmAdmin } from '../access'
import { crmCollection } from '../collection'
import { CrmInvariantError, merged, writeOnce } from '../guards'
import {
  IDENTITY_REVIEW_REASON,
  IDENTITY_REVIEW_STATE,
  IDENTITY_REVIEW_SUBJECT,
  options,
} from '../vocabulary'

/**
 * POSSIBLE_DUPLICATE / identity-conflict queue.
 *
 * Automation never merges. When identity is uncertain — an exact email with a different name, a name that
 * matches someone with another address, a company string that looks like an account without a verified
 * domain, a verified domain claimed twice — the intake keeps the records apart and opens a review here.
 * `CONFIRMED_DUPLICATE_PENDING_MERGE` is a human conclusion; the merge itself (auditable, reversible,
 * permission-controlled) is DEFERRED beyond CRM-1 and nothing here executes one.
 */
const resolution: CollectionBeforeChangeHook = ({ data: incoming, originalDoc, req }) => {
  const data = merged(incoming, originalDoc)
  if (data.state !== 'OPEN') {
    if (!String(data.resolution_note ?? '').trim())
      throw new CrmInvariantError(
        'IDENTITY_REVIEW_RESOLUTION_NOTE_REQUIRED',
        'Say how the review was resolved.',
      )
    if (originalDoc?.state === 'OPEN' || !originalDoc) {
      incoming.resolved_at = new Date().toISOString()
      incoming.resolved_by = req.user ? req.user.id : null
    }
  }
  return incoming
}

export const CrmIdentityReviews: CollectionConfig = crmCollection(
  {
    slug: 'crm-identity-reviews',
    labels: { singular: 'Identity review', plural: 'Identity reviews' },
    // UI-1 (Control Tower frozen): CRM users see the queue; resolving a review is admin-only. Automation
    // opens reviews through trusted server code (overrideAccess), which this does not affect.
    access: { update: crmAdmin },
    admin: {
      useAsTitle: 'reason',
      description:
        'Possible duplicates and identity conflicts. Automation opens these instead of guessing; people resolve them. No automatic merges.',
      defaultColumns: ['createdAt', 'subject_type', 'reason', 'state', 'rfq'],
    },
    hooks: {
      beforeChange: [
        writeOnce('crm-identity-reviews', ['subject_type', 'reason', 'subject_ids', 'dedupe_key']),
        resolution,
      ],
    },
    fields: [
      {
        name: 'subject_type',
        type: 'select',
        required: true,
        options: options(IDENTITY_REVIEW_SUBJECT),
        index: true,
      },
      {
        name: 'reason',
        type: 'select',
        required: true,
        options: options(IDENTITY_REVIEW_REASON),
        index: true,
      },
      {
        name: 'state',
        type: 'select',
        required: true,
        defaultValue: 'OPEN',
        options: options(IDENTITY_REVIEW_STATE),
        index: true,
      },
      {
        name: 'subject_ids',
        type: 'json',
        required: true,
        admin: { description: 'Canonical/row ids of the records involved. No personal data.' },
      },
      {
        name: 'dedupe_key',
        type: 'text',
        unique: true,
        index: true,
        admin: { readOnly: true, description: 'One open review per conflict.' },
      },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts' },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts' },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs' },
      { name: 'intake_event', type: 'relationship', relationTo: 'crm-intake-events' },
      { name: 'resolution_note', type: 'textarea' },
      { name: 'resolved_at', type: 'date', admin: { readOnly: true } },
      { name: 'resolved_by', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Resolve the review (DISMISSED / CONFIRMED_DISTINCT) with a note.' },
)
