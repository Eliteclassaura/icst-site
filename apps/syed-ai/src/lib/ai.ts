import type { Payload } from 'payload'
import {
  MockAiProvider,
  type AiConfig,
  type AiFeature,
  type AiProvider,
  type Budget,
  type BudgetState,
  DEFAULT_BUDGET,
} from '@factory/providers/ai'

/**
 * Resolves the runtime AI configuration for this deployment (C7). Two switches, both off by default:
 * `AI_ENABLED` in the environment and `integrations.ai.enabled` in the CMS. Provider keys are env-only and
 * never reach the browser or a Payload field. Only the mock provider exists until Release 6/7.
 */
export async function aiConfig(payload: Payload): Promise<AiConfig> {
  const envEnabled = process.env.AI_ENABLED === 'true'
  const integrations = await payload.findGlobal({ slug: 'integrations', overrideAccess: true })
  const ai = integrations.ai ?? {}
  return {
    envEnabled,
    clientEnabled: Boolean(ai.enabled),
    enabledFeatures: ((ai.features ?? []) as AiFeature[]) ?? [],
    provider: envEnabled ? providerFromEnv() : null,
  }
}

/** `AI_PROVIDER=mock` is the only supported value in Release 1–5 (ADR-030). Anything else yields no provider. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): AiProvider | null {
  const name = env.AI_PROVIDER ?? 'mock'
  if (name === 'mock') return new MockAiProvider()
  return null
}

export function aiBudget(env: NodeJS.ProcessEnv = process.env): Budget {
  const calls = Number(env.AI_MAX_CALLS_PER_DAY)
  const cost = Number(env.AI_MAX_COST_USD_PER_DAY)
  return {
    maxCallsPerDay: Number.isFinite(calls) && calls > 0 ? calls : DEFAULT_BUDGET.maxCallsPerDay,
    maxCostUsdPerDay: Number.isFinite(cost) && cost > 0 ? cost : DEFAULT_BUDGET.maxCostUsdPerDay,
  }
}

/**
 * Today's AI spend, counted from the audit log (the same rows that make AI actions auditable — master
 * prompt §Security). No new collection: `audit-log` already records every AI action with usage metadata.
 */
export async function aiBudgetState(payload: Payload, now = new Date()): Promise<BudgetState> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const rows = await payload.find({
    collection: 'audit-log',
    where: {
      and: [{ action: { equals: 'ai' } }, { createdAt: { greater_than_equal: dayStart.toISOString() } }],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  let costUsdToday = 0
  for (const r of rows.docs) {
    const detail = (r.detail ?? {}) as { usage?: { costUsd?: number } }
    costUsdToday += Number(detail.usage?.costUsd ?? 0)
  }
  return { callsToday: rows.totalDocs, costUsdToday }
}
