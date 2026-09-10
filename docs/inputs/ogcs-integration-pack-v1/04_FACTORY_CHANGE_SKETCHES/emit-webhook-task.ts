// apps/<client>/src/jobs/emitWebhook.ts  (sketch — P8, v2 transport, ADR-026)
// Same idempotency pattern as sendMockEmail.ts: unique outbox.idempotencyKey + find-before-create.
import type { TaskConfig } from 'payload'
import { createHmac } from 'node:crypto'

export const emitWebhook: TaskConfig<'emitWebhook'> = {
  slug: 'emitWebhook',
  retries: { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } }, // ≈1m,2m,4m,8m,16m — or a custom schedule 1m/5m/30m/2h/12h via `waitUntil`
  inputSchema: [
    { name: 'kind', type: 'select', options: ['qa-report', 'deploy-event'], required: true },
    { name: 'runId', type: 'text', required: true },
    { name: 'body', type: 'json', required: true },          // the full contract artefact
  ],
  handler: async ({ input, req }) => {
    const idempotencyKey = `ogcs:${input.kind}:${input.runId}`
    const dup = await req.payload.find({ collection: 'outbox', where: { idempotencyKey: { equals: idempotencyKey } }, limit: 1 })
    if (dup.docs[0]?.status === 'sent') return { output: { skipped: true } }

    const secret = process.env.OGCS_WEBHOOK_SECRET
    const integrations = await req.payload.findGlobal({ slug: 'integrations' })
    const base = integrations.searchIntelligence?.ogcsBaseUrl
    const projectId = integrations.searchIntelligence?.ogcsProjectId
    if (!secret || !base || !projectId) throw new Error('OGCS webhook not configured (fail closed).')   // like turnstileReadiness()

    const body = JSON.stringify(input.body)
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    const url = `${base}/v1/projects/${projectId}/${input.kind === 'qa-report' ? 'qa-reports' : 'deploy-events'}`

    const row = dup.docs[0] ?? (await req.payload.create({ collection: 'outbox', data: { kind: 'webhook', to: url, subject: input.kind, idempotencyKey, status: 'queued' } }))
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig, 'x-run-id': input.runId }, body })
    await req.payload.update({ collection: 'outbox', id: row.id, data: { status: res.ok ? 'sent' : 'failed', provider: 'ogcs', providerMessageId: res.headers.get('x-receipt') ?? undefined, error: res.ok ? undefined : `${res.status}`, sentAt: res.ok ? new Date().toISOString() : undefined } })
    if (!res.ok) throw new Error(`OGCS ${res.status}`)   // triggers retry; final failure leaves status 'failed' as the dead letter
    return { output: { status: res.status } }
  },
}
// Register in payload.config.ts jobs.tasks; outbox.kind gains 'webhook'; ADR-011: route fetch through the SSRF-guarded fetcher when it exists.
