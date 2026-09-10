import type { TaskConfig } from 'payload'
import { crmProviderFor, toCrmPayload } from '@factory/agency-core/intake'

/**
 * crm.sync (docs/crm-sync.md, R45/R46): pushes the allow-listed contact payload to the configured
 * provider. Skipped when `integrations.crm.enabled` is false or no provider is configured; idempotent
 * on `crm:<leadId>`; failures are recorded on the lead and retried by the queue, never silently.
 */
export const crmSync: TaskConfig<'crmSync'> = {
  slug: 'crmSync',
  retries: 4,
  inputSchema: [{ name: 'leadId', type: 'text', required: true }],
  outputSchema: [{ name: 'status', type: 'text' }],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const lead = await payload.findByID({
      collection: 'leads',
      id: input.leadId,
      depth: 1,
      overrideAccess: true,
    })
    if (lead.sync?.status === 'synced') return { output: { status: 'synced' } }
    const integrations = await payload.findGlobal({ slug: 'integrations', overrideAccess: true })
    const providerName = integrations.crm?.enabled
      ? ((integrations.crm as { provider?: string | null }).provider ?? 'mock')
      : null
    const provider = crmProviderFor(providerName)
    const now = new Date().toISOString()
    if (!provider) {
      await payload.update({
        collection: 'leads',
        id: lead.id,
        data: { sync: { status: 'skipped', lastAttemptAt: now } },
        overrideAccess: true,
      })
      return { output: { status: 'skipped' } }
    }
    const contact = typeof lead.contact === 'object' ? lead.contact : null
    if (!contact) throw new Error('lead has no populated contact')
    if (contact.suppressed) {
      await payload.update({
        collection: 'leads',
        id: lead.id,
        data: { sync: { status: 'skipped', lastAttemptAt: now, error: 'contact suppressed' } },
        overrideAccess: true,
      })
      return { output: { status: 'skipped' } }
    }
    const body = toCrmPayload({
      email: contact.email,
      name: contact.name,
      company: (lead.submittedFields as { company?: string } | null)?.company,
      website: (lead.submittedFields as { site?: string } | null)?.site,
      source: (lead.source ?? 'form') as 'form',
      landingPage: lead.attribution?.landingPage,
      utm: lead.attribution?.utm,
      marketing: contact.preferences?.marketing,
    })
    const res = await provider.upsertContact(body, { idempotencyKey: `crm:${lead.id}` })
    const attempts = (lead.sync?.attempts ?? 0) + 1
    if (!res.ok) {
      await payload.update({
        collection: 'leads',
        id: lead.id,
        data: {
          sync: { status: 'failed', provider: res.provider, lastAttemptAt: now, attempts, error: res.error },
        },
        overrideAccess: true,
      })
      if (res.retryable) throw new Error(res.error)
      return { output: { status: 'failed' } }
    }
    await payload.update({
      collection: 'leads',
      id: lead.id,
      data: {
        sync: {
          status: 'synced',
          provider: res.provider,
          externalId: res.externalId,
          lastAttemptAt: now,
          attempts,
          error: null,
        },
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'activities',
      data: {
        type: 'crm-sync',
        lead: String(lead.id),
        contact: String(contact.id),
        summary: `Synced to ${res.provider} (${res.created ? 'created' : 'updated'})`,
        data: { externalId: res.externalId },
      },
      overrideAccess: true,
    })
    return { output: { status: 'synced' } }
  },
}
