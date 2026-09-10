import type { TaskConfig } from 'payload'
export const sendMockEmail: TaskConfig<'sendMockEmail'> = {
  slug: 'sendMockEmail',
  retries: 2,
  inputSchema: [
    { name: 'to', type: 'text', required: true },
    { name: 'subject', type: 'text', required: true },
    { name: 'body', type: 'text' },
    { name: 'idempotencyKey', type: 'text', required: true },
  ],
  outputSchema: [{ name: 'outboxId', type: 'text' }],
  handler: async ({ input, req }) => {
    const existing = await req.payload.find({
      collection: 'outbox', where: { idempotencyKey: { equals: input.idempotencyKey } }, limit: 1,
    })
    if (existing.docs[0]) return { output: { outboxId: String(existing.docs[0].id) } }
    const doc = await req.payload.create({
      collection: 'outbox',
      data: { to: input.to, subject: input.subject, body: input.body, idempotencyKey: input.idempotencyKey, status: 'sent', sentAt: new Date().toISOString() },
    })
    return { output: { outboxId: String(doc.id) } }
  },
}
