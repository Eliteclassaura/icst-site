import type { CollectionConfig } from 'payload'
// Proves a job can write a durable, inspectable record (stand-in for the mock email provider).
export const Outbox: CollectionConfig = {
  slug: 'outbox',
  admin: { useAsTitle: 'subject' },
  fields: [
    { name: 'to', type: 'email', required: true },
    { name: 'subject', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    { name: 'status', type: 'select', options: ['queued', 'sent', 'failed'], defaultValue: 'queued' },
    { name: 'idempotencyKey', type: 'text', unique: true, index: true },
    { name: 'sentAt', type: 'date' },
  ],
}
