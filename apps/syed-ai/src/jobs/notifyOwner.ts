import type { TaskConfig } from 'payload'
import { maskEmail } from '@factory/agency-core/intake'

/**
 * Owner notification for a brief submission (C6). Idempotent on `notify:<submissionId>` through the
 * outbox unique key. Provider is the mock until Release 7; the message body names the lead by masked
 * address only — the full record is one click away in admin, and no address travels in email or logs
 * more than it has to (ADR-028 §10). Suppressed contacts never trigger mail.
 */
export const notifyOwner: TaskConfig<'notifyOwner'> = {
  slug: 'notifyOwner',
  retries: 3,
  inputSchema: [{ name: 'submissionId', type: 'text', required: true }],
  outputSchema: [
    { name: 'outboxId', type: 'text' },
    { name: 'status', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const idempotencyKey = `notify:${input.submissionId}`
    const existing = await payload.find({
      collection: 'outbox',
      where: { idempotencyKey: { equals: idempotencyKey } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs[0])
      return { output: { outboxId: String(existing.docs[0].id), status: existing.docs[0].status } }

    const submission = await payload.findByID({
      collection: 'submissions',
      id: input.submissionId,
      depth: 1,
      overrideAccess: true,
    })
    const integrations = await payload.findGlobal({ slug: 'integrations', overrideAccess: true })
    const to = integrations.email?.notifyEmail
    const contact = typeof submission.contact === 'object' ? submission.contact : null
    const leadId = typeof submission.lead === 'object' ? submission.lead?.id : submission.lead

    let status: 'sent' | 'suppressed' | 'failed' = 'sent'
    let error: string | undefined
    if (!to) {
      status = 'failed'
      error = 'integrations.email.notifyEmail is not set'
    } else if (contact?.suppressed) {
      status = 'suppressed'
    }

    const doc = await payload.create({
      collection: 'outbox',
      data: {
        to: to ?? 'unset@invalid',
        subject: `New brief from ${maskEmail(submission.email)}${submission.company ? ` (${submission.company})` : ''}`,
        kind: 'notify-owner',
        provider: integrations.email?.provider ?? 'mock',
        idempotencyKey,
        status,
        error,
        sentAt: status === 'sent' ? new Date().toISOString() : undefined,
        lead: leadId ? String(leadId) : undefined,
      },
      overrideAccess: true,
    })
    if (leadId) {
      await payload.create({
        collection: 'activities',
        data: {
          type: 'notification',
          lead: String(leadId),
          contact: contact ? String(contact.id) : undefined,
          submission: String(submission.id),
          summary: `Owner notification ${status}`,
          data: { outboxId: String(doc.id), provider: doc.provider },
        },
        overrideAccess: true,
      })
    }
    if (status === 'failed') throw new Error(error)
    return { output: { outboxId: String(doc.id), status } }
  },
}
