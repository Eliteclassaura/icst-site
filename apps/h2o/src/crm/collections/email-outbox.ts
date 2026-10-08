import type { CollectionConfig } from 'payload'
import { crmAdmin, crmAdminField, noOne } from '../access'
import { crmCollection } from '../collection'
import { kindAllowed } from '../../email/config'
import { appendOnly, CrmInvariantError } from '../guards'
import { EMAIL_EVENT, EMAIL_KIND, EMAIL_OUTBOX_STATUS, options } from '../vocabulary'

/**
 * Notification outbox (CRM email M1). One row per message per recipient, keyed by `idempotency_key`
 * (unique), so a replayed webhook, a retried hook or a second worker can never queue the same message twice.
 *
 * Rows are written in the same transaction as the business event that caused them (the RFQ), so a rolled
 * back RFQ never leaves a message behind. A suppressed message is recorded as a terminal row with no address
 * and no body — the RFQ shows why nothing was sent, and nothing personal is kept for it.
 *
 * Written only by trusted server code. Admins read (the row holds the recipient address and body); nobody
 * creates, edits or deletes through REST or the admin UI.
 */
export const CrmEmailOutbox: CollectionConfig = crmCollection(
  {
    slug: 'crm-email-outbox',
    disableDuplicate: true,
    labels: { singular: 'Outgoing email', plural: 'Outgoing email' },
    access: { read: crmAdmin, create: noOne, update: noOne },
    admin: {
      useAsTitle: 'kind',
      description:
        'Queued and sent notifications. Written by the system; retried with backoff; failures end in DEAD. No hand edits.',
      defaultColumns: ['createdAt', 'kind', 'status', 'rfq', 'attempts', 'last_error_code', 'sent_at'],
    },
    defaultSort: '-createdAt',
    hooks: {
      beforeChange: [
        // SEND-FIX-1a (review R2-02): the queue-time backstop. Whatever path queues it, a message of a kind outside the
        // allowed set (launch: RFQ alert + T1) is never written as sendable. Suppressed records stay allowed.
        ({ data, operation }) => {
          if (operation === 'create' && data && ['PENDING', 'RETRY'].includes(String(data.status)) && !kindAllowed(String(data.kind)))
            throw new CrmInvariantError('EMAIL_KIND_NOT_ALLOWED', 'This kind of email is switched off on this environment.', 403)
          return data
        },
      ],
    },
    fields: [
      {
        name: 'idempotency_key',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'kind',
        type: 'select',
        required: true,
        options: options(EMAIL_KIND),
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: options(EMAIL_OUTBOX_STATUS),
        index: true,
        admin: { readOnly: true },
      },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true, admin: { readOnly: true } },
      // CRM email M2: the conversation message this row delivers (RFQ_REPLY only).
      {
        name: 'conversation_message',
        type: 'relationship',
        relationTo: 'crm-email-messages',
        index: true,
        admin: { readOnly: true },
      },
      {
        name: 'recipient_ref',
        type: 'text',
        required: true,
        index: true,
        admin: {
          readOnly: true,
          description: 'Keyed hash of the recipient. Not reversible without the server secret.',
        },
      },
      // Personal data: present only while a message can still be sent or after it was sent; admin-only.
      { name: 'to_address', type: 'text', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'subject', type: 'text', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'body_text', type: 'textarea', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'body_html', type: 'textarea', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'message_id', type: 'text', unique: true, admin: { readOnly: true } },
      { name: 'attempts', type: 'number', required: true, defaultValue: 0, admin: { readOnly: true } },
      { name: 'next_attempt_at', type: 'date', index: true, admin: { readOnly: true } },
      { name: 'lease_until', type: 'date', admin: { readOnly: true } },
      { name: 'last_error_code', type: 'text', admin: { readOnly: true } },
      { name: 'sent_at', type: 'date', index: true, admin: { readOnly: true } },
      // Revenue Engine slice 1: a sequence email's enrollment and step; the recipient's domain (per-domain cap); the
      // copy-risk lint of the final render and the AUTO approval decision (E0.1 approval record); a later DSN bounce.
      { name: 'enrollment', type: 'relationship', relationTo: 'crm-enrollments', index: true, admin: { readOnly: true } },
      { name: 'step_key', type: 'text', admin: { readOnly: true } },
      { name: 'recipient_domain', type: 'text', index: true, admin: { readOnly: true } },
      { name: 'lint', type: 'json', admin: { readOnly: true } },
      { name: 'approval_decision', type: 'select', options: options(['AUTO_AUTHORIZED', 'BLOCKED'] as const), admin: { readOnly: true } },
      { name: 'bounced_at', type: 'date', index: true, admin: { readOnly: true } },
      { name: 'reply_to', type: 'text', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'list_unsubscribe', type: 'text', access: { read: crmAdminField }, admin: { readOnly: true } },
      // SEND-FIX-1a (review R2-03): the claim that owns this row's lease (fencing: a worker whose lease expired can no
      // longer move the row), the transport identity of the latest attempt (no secret: host, port, account, TLS name,
      // envelope sender, From, profile), and the mail server's acceptance reply.
      { name: 'lease_owner', type: 'text', admin: { readOnly: true, hidden: true } },
      { name: 'attempt_identity', type: 'json', access: { read: crmAdminField }, admin: { readOnly: true } },
      { name: 'submitted_at', type: 'date', admin: { readOnly: true } },
      { name: 'accepted_response', type: 'text', admin: { readOnly: true } },
      // SEND-FIX-1a (ER-07): for a message to several people (the team alert), which addresses the server accepted and
      // which it refused. The row is SENT once any address is accepted, and it is never handed over again.
      { name: 'recipient_results', type: 'json', access: { read: crmAdminField }, admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Outgoing email is a durable record of what was (or was not) sent.' },
)

/**
 * Email audit trail: one append-only row per decision or attempt (queued, sent, failed, suppressed,
 * dead-lettered), for the outbox and for Payload's own auth mail (password reset). Ids, codes and a keyed
 * recipient reference only — never an address, a subject, a body, a link or a token.
 */
export const CrmEmailEvents: CollectionConfig = crmCollection(
  {
    slug: 'crm-email-events',
    disableDuplicate: true,
    labels: { singular: 'Email event', plural: 'Email events' },
    access: { read: crmAdmin, create: noOne, update: noOne },
    admin: {
      useAsTitle: 'event',
      description: 'Append-only audit of every email decision and attempt. No personal data.',
      defaultColumns: ['occurred_at', 'event', 'kind', 'code', 'rfq', 'attempt'],
    },
    defaultSort: '-occurred_at',
    hooks: { beforeChange: [appendOnly('crm-email-events')] },
    fields: [
      { name: 'event', type: 'select', required: true, options: options(EMAIL_EVENT), index: true },
      { name: 'kind', type: 'text', required: true, index: true },
      {
        name: 'code',
        type: 'text',
        admin: { description: 'Outcome or failure code. Never a message text.' },
      },
      { name: 'outbox', type: 'relationship', relationTo: 'crm-email-outbox', index: true },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true },
      { name: 'recipient_ref', type: 'text', index: true },
      { name: 'attempt', type: 'number' },
      { name: 'occurred_at', type: 'date', required: true, index: true },
    ],
  },
  { deleteAlternative: 'The email audit trail is append-only.' },
)
