import type { TaskConfig } from 'payload'
import { run } from '@factory/providers/ai'
import { aiBudget, aiBudgetState, aiConfig } from '../lib/ai'

/**
 * Opt-in AI: a summary and suggested next action for a lead (C7; master prompt §"Potential opt-in AI
 * functions"). Everything policy-related lives in the gateway; this job only supplies the record, records
 * provenance on `aiInsight`, and writes an audit row.
 *
 * Three invariants this job must never break:
 *   1. With AI disabled it is a no-op that reports why — the lead is untouched and nothing fails.
 *   2. It never writes `score` or `scoreBreakdown`. The deterministic score is the authority (master
 *      prompt §CRM: "generated text never improves a score").
 *   3. `aiInsight` is labelled `provenance: generated` and awaits human review; it is never authoritative.
 */
export const leadSummary: TaskConfig<'leadSummary'> = {
  slug: 'leadSummary',
  retries: 2,
  inputSchema: [{ name: 'leadId', type: 'text', required: true }],
  outputSchema: [
    { name: 'status', type: 'text' },
    { name: 'reason', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const cfg = await aiConfig(payload)
    const lead = await payload.findByID({
      collection: 'leads',
      id: input.leadId,
      depth: 1,
      overrideAccess: true,
    })
    const fields = (lead.submittedFields ?? {}) as Record<string, unknown>

    const result = await run<{ summary: string; nextAction: string; confidence: number }>(cfg, {
      promptId: 'lead-summary',
      // The prompt's allow-list decides what survives; passing the whole record is safe by construction.
      source: { ...fields, landingPage: lead.attribution?.landingPage, score: lead.score },
      permitted: true, // a queued job runs as the system; human-triggered calls pass the caller's permission
      budget: aiBudget(),
      budgetState: await aiBudgetState(payload),
      log: (entry) =>
        void payload.create({
          collection: 'audit-log',
          data: {
            action: 'ai',
            collection: 'leads',
            docId: String(lead.id),
            actor: 'system:leadSummary',
            summary: `${entry.promptId}@${entry.promptVersion} → ${entry.outcome}`,
            detail: {
              provider: entry.provider,
              outcome: entry.outcome,
              droppedFields: entry.droppedFields,
              usage: entry.usage,
              ms: entry.ms,
            },
          },
          overrideAccess: true,
        }),
    })

    if (!result.ok) {
      // Disabled or refused is a normal outcome, not a failure: the CRM works without AI.
      payload.logger.info({ leadId: String(lead.id), code: result.code }, 'leadSummary skipped')
      if (result.retryable) throw new Error(`${result.code}: ${result.message}`)
      return { output: { status: 'skipped', reason: result.code } }
    }

    const before = { score: lead.score, scoreBreakdown: lead.scoreBreakdown }
    await payload.update({
      collection: 'leads',
      id: lead.id,
      data: {
        aiInsight: {
          summary: result.data.summary,
          nextAction: result.data.nextAction,
          provider: result.provenance.provider,
          model: result.provenance.model,
          promptVersion: `${result.provenance.promptId}@${result.provenance.promptVersion}`,
          generatedAt: result.provenance.generatedAt,
          confidence: result.provenance.confidence,
        },
      },
      overrideAccess: true,
    })
    const after = await payload.findByID({ collection: 'leads', id: lead.id, depth: 0, overrideAccess: true })
    if (after.score !== before.score)
      throw new Error('invariant: AI must never change the deterministic lead score')

    await payload.create({
      collection: 'activities',
      data: {
        type: 'ai-insight',
        lead: String(lead.id),
        contact: typeof lead.contact === 'object' ? String(lead.contact.id) : undefined,
        summary: `AI summary generated (${result.provenance.provider}, confidence ${result.provenance.confidence ?? 'n/a'}) — awaiting review`,
        data: {
          promptId: result.provenance.promptId,
          promptVersion: result.provenance.promptVersion,
          usage: result.provenance.usage,
        },
      },
      overrideAccess: true,
    })
    return { output: { status: 'generated', reason: '' } }
  },
}
