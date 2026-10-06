import type { CollectionConfig } from 'payload'

/**
 * Patch C (IMAP inbound): how far the CRM has read each mailbox — the mailbox's UIDVALIDITY and the last UID stored.
 * IMAP is read-only (nothing is marked in the mailbox), so this is the "already read" record. `key` is a hash of the
 * mailbox identity (never an address). No access for anyone: only the inbound poller (trusted server code) uses it.
 */
const nobody = () => false

export const CrmMailCursor: CollectionConfig = {
  slug: 'crm-mail-cursor',
  labels: { singular: 'Mailbox cursor', plural: 'Mailbox cursors' },
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'uidvalidity', type: 'number', required: true },
    { name: 'last_uid', type: 'number', required: true },
  ],
}
