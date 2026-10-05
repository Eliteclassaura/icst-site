import type { CollectionConfig } from 'payload'
import { crmAdmin, crmAdminField, crmUser, noOne } from '../access'
import { crmCollection } from '../collection'
import { EMAIL_DIRECTION, EMAIL_MESSAGE_STATUS, options } from '../vocabulary'

/**
 * The RFQ conversation (CRM email M2/M3): every message written to the customer from the CRM, and (M3) every
 * reply that comes back and matches the RFQ's reply token. One row per message: who, when, subject, body,
 * Message-ID and threading headers.
 *
 * CRM users read it with the RFQ (the same people who already read the RFQ's submitted address and message).
 * Nobody writes it through REST or the admin UI: an outbound row is created only by the compose action, inside
 * the RFQ row lock, as the user (src/crm/reply.ts); its status is advanced by the outbox worker.
 */
export const CrmEmailMessages: CollectionConfig = crmCollection(
  {
    slug: 'crm-email-messages',
    disableDuplicate: true,
    labels: { singular: 'Email message', plural: 'Email messages' },
    access: { read: crmUser, create: noOne, update: noOne },
    admin: {
      useAsTitle: 'subject',
      description:
        'Emails with the customer on an RFQ. Written by the CRM (outbound) and the reply poller (inbound). No hand edits.',
      defaultColumns: ['occurred_at', 'direction', 'status', 'subject', 'rfq', 'author'],
    },
    defaultSort: '-occurred_at',
    fields: [
      {
        name: 'direction',
        type: 'select',
        required: true,
        options: options(EMAIL_DIRECTION),
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'rfq',
        type: 'relationship',
        relationTo: 'crm-rfqs',
        required: true,
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: options(EMAIL_MESSAGE_STATUS),
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'status_code',
        type: 'text',
        admin: { readOnly: true, description: 'Why it was not sent, or the failure code.' },
      },
      { name: 'author', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
      { name: 'from_address', type: 'text', admin: { readOnly: true } },
      { name: 'to_address', type: 'text', admin: { readOnly: true } },
      { name: 'reply_to', type: 'text', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'subject', type: 'text', required: true, maxLength: 200, admin: { readOnly: true } },
      { name: 'body_text', type: 'textarea', required: true, admin: { readOnly: true } },
      { name: 'body_html', type: 'textarea', admin: { readOnly: true } },
      { name: 'message_id', type: 'text', unique: true, index: true, admin: { readOnly: true } },
      { name: 'in_reply_to', type: 'text', admin: { readOnly: true } },
      { name: 'references', type: 'textarea', admin: { readOnly: true } },
      { name: 'idempotency_key', type: 'text', unique: true, index: true, admin: { readOnly: true } },
      {
        name: 'occurred_at',
        type: 'date',
        required: true,
        index: true,
        admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
      },
      { name: 'sent_at', type: 'date', admin: { readOnly: true } },
      // M3 (inbound only): the sender's display name as given (never used to link), the mailbox message id,
      // and attachment metadata (name, type, size). Attachment content is never stored.
      { name: 'from_name', type: 'text', admin: { readOnly: true } },
      { name: 'source_ref', type: 'text', unique: true, index: true, admin: { readOnly: true } },
      { name: 'attachments_withheld', type: 'json', admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Emails with a customer are part of the RFQ record.' },
)

/**
 * Per-RFQ reply tokens (CRM email M2). Outbound replies carry `Reply-To: <role>+<token>@<domain>`; the token is
 * 130 bits of randomness (26 base32 characters), unguessable, and maps to exactly one RFQ. M3 matches inbound
 * mail by this token only — never by name, subject or sender. One token per RFQ, reused by every reply; it
 * expires a year after its last use and can be revoked. Admin-read only: a token is a capability to add a
 * message to an RFQ, so it is not shown to everyone who can read the RFQ.
 */
export const CrmReplyTokens: CollectionConfig = crmCollection(
  {
    slug: 'crm-reply-tokens',
    disableDuplicate: true,
    labels: { singular: 'Reply token', plural: 'Reply tokens' },
    access: { read: crmAdmin, create: noOne, update: noOne },
    admin: {
      useAsTitle: 'issued_at',
      description: 'Reply-To tokens that route customer replies to an RFQ. Issued by the system.',
      defaultColumns: ['issued_at', 'rfq', 'last_used_at', 'expires_at', 'revoked_at'],
    },
    defaultSort: '-issued_at',
    fields: [
      { name: 'token', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
      {
        name: 'rfq',
        type: 'relationship',
        relationTo: 'crm-rfqs',
        required: true,
        unique: true,
        index: true,
        admin: { readOnly: true },
      },
      { name: 'issued_at', type: 'date', required: true, admin: { readOnly: true } },
      { name: 'last_used_at', type: 'date', admin: { readOnly: true } },
      { name: 'expires_at', type: 'date', required: true, index: true, admin: { readOnly: true } },
      { name: 'revoked_at', type: 'date', admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Revoke a reply token instead of deleting it.' },
)
