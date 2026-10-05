import type { CollectionConfig } from 'payload'
import { crmAdmin, noOne } from '../access'
import { crmCollection } from '../collection'
import { EMAIL_REVIEW_REASON, EMAIL_REVIEW_STATE, options } from '../vocabulary'

/**
 * Inbound email review queue (CRM email M3). Mail that arrived at the role mailbox but did not carry a live
 * reply token — no token, an unknown/expired/ambiguous one — or that is automatic (Auto-Submitted, bulk, a
 * loop from our own address) or spam-flagged. Nothing here is attached to an RFQ until an admin links it by
 * RFQ number. Content is untrusted: stored as plain text, never rendered as HTML; attachments are withheld
 * (metadata only). Admin-only.
 */
export const CrmEmailReview: CollectionConfig = crmCollection(
  {
    slug: 'crm-email-review',
    disableDuplicate: true,
    labels: { singular: 'Inbound email to review', plural: 'Inbound email to review' },
    access: { read: crmAdmin, create: noOne, update: noOne },
    admin: {
      useAsTitle: 'subject',
      description:
        'Inbound email that was not linked automatically. Link it to an RFQ or discard it in the Sales Workspace.',
      defaultColumns: ['received_at', 'reason', 'state', 'from_address', 'subject', 'rfq'],
    },
    defaultSort: '-received_at',
    fields: [
      {
        name: 'reason',
        type: 'select',
        required: true,
        options: options(EMAIL_REVIEW_REASON),
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'state',
        type: 'select',
        required: true,
        defaultValue: 'OPEN',
        options: options(EMAIL_REVIEW_STATE),
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'source_ref',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { readOnly: true, description: 'Mailbox message id.' },
      },
      { name: 'from_address', type: 'text', admin: { readOnly: true } },
      { name: 'from_name', type: 'text', admin: { readOnly: true } },
      { name: 'to_addresses', type: 'text', admin: { readOnly: true } },
      { name: 'subject', type: 'text', admin: { readOnly: true } },
      { name: 'body_text', type: 'textarea', admin: { readOnly: true } },
      { name: 'message_id', type: 'text', index: true, admin: { readOnly: true } },
      { name: 'in_reply_to', type: 'text', admin: { readOnly: true } },
      { name: 'references', type: 'textarea', admin: { readOnly: true } },
      { name: 'received_at', type: 'date', required: true, index: true, admin: { readOnly: true } },
      {
        name: 'attachments_withheld',
        type: 'json',
        admin: { readOnly: true, description: 'Name, type and size only; content not stored.' },
      },
      {
        name: 'rfq',
        type: 'relationship',
        relationTo: 'crm-rfqs',
        index: true,
        admin: {
          readOnly: true,
          description: 'The RFQ an expired token pointed at, or the one an admin linked.',
        },
      },
      { name: 'resolved_by', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      { name: 'resolved_at', type: 'date', admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Discard it instead; the record stays.' },
)
