import type { AiFeature, AiProvider, AiResult } from './types'
import { promptFor } from './prompts'
import { redact } from './redact'

/**
 * The AI gateway (C7). Every runtime AI call passes through `run`, and `run` refuses before it reaches a
 * provider unless all of the following hold:
 *
 *   1. `AI_ENABLED` is true **and** `integrations.ai.enabled` is true (two switches, both off by default);
 *   2. the feature is in the client's enabled feature list;
 *   3. the caller has permission for that feature;
 *   4. the run is inside the budget;
 *   5. the prompt exists in the registry and the redacted input carries no PII the prompt did not declare.
 *
 * On the way back it validates the provider's output against the prompt's schema and stamps provenance
 * (`generated`, provider, model, prompt id + version, timestamp, confidence, usage). Nothing here can
 * write to a deterministic field: callers receive data and provenance, and the storage decision is theirs.
 */
export type AiConfig = {
  /** Process-level switch: `AI_ENABLED=true`. Absent or anything but 'true' means off. */
  envEnabled: boolean
  /** Client-level switch from the `integrations.ai` global. */
  clientEnabled: boolean
  enabledFeatures: AiFeature[]
  provider: AiProvider | null
}

export type BudgetState = { callsToday: number; costUsdToday: number }
export type Budget = { maxCallsPerDay: number; maxCostUsdPerDay: number }
export const DEFAULT_BUDGET: Budget = { maxCallsPerDay: 200, maxCostUsdPerDay: 5 }

export type RunOptions = {
  promptId: string
  /** The full record; the prompt's allow-list decides what survives redaction. */
  source: Record<string, unknown>
  /** Permission check performed by the caller's context (role, service account, job). */
  permitted: boolean
  budget?: Budget
  budgetState?: BudgetState
  now?: Date
  /** Callers may only *shorten* the prompt's timeout (a job with a tighter SLA), never lengthen it. */
  maxTimeoutMs?: number
  /** Structured log sink; receives metadata only — never the input or the output text. */
  log?: (entry: AiLogEntry) => void
}

export type AiLogEntry = {
  at: string
  promptId: string
  promptVersion: string
  feature: AiFeature
  provider: string | null
  outcome: 'ok' | AiResult<unknown> extends never ? never : string
  droppedFields: number
  usage?: { inputTokens: number; outputTokens: number; costUsd?: number }
  ms: number
}

export function aiEnabled(cfg: AiConfig): boolean {
  return cfg.envEnabled && cfg.clientEnabled && cfg.provider !== null
}

export async function run<T>(cfg: AiConfig, opts: RunOptions): Promise<AiResult<T>> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const prompt = promptFor(opts.promptId)
  const emit = (outcome: string, extra: Partial<AiLogEntry> = {}) =>
    opts.log?.({
      at: now.toISOString(),
      promptId: opts.promptId,
      promptVersion: prompt?.version ?? 'unknown',
      feature: prompt?.feature ?? ('lead-summary' as AiFeature),
      provider: cfg.provider?.name ?? null,
      outcome,
      droppedFields: 0,
      ms: Date.now() - started,
      ...extra,
    })

  if (!prompt) {
    emit('no-provider')
    return { ok: false, code: 'no-provider', message: `unknown prompt "${opts.promptId}"`, retryable: false }
  }
  if (!cfg.envEnabled || !cfg.clientEnabled) {
    emit('disabled')
    return { ok: false, code: 'disabled', message: 'runtime AI is disabled', retryable: false }
  }
  if (!cfg.enabledFeatures.includes(prompt.feature)) {
    emit('feature-not-enabled')
    return {
      ok: false,
      code: 'feature-not-enabled',
      message: `feature "${prompt.feature}" is not enabled for this client`,
      retryable: false,
    }
  }
  if (!opts.permitted) {
    emit('not-permitted')
    return { ok: false, code: 'not-permitted', message: 'caller may not use this feature', retryable: false }
  }
  if (!cfg.provider) {
    emit('no-provider')
    return { ok: false, code: 'no-provider', message: 'no AI provider configured', retryable: false }
  }
  const budget = opts.budget ?? DEFAULT_BUDGET
  const state = opts.budgetState ?? { callsToday: 0, costUsdToday: 0 }
  if (state.callsToday >= budget.maxCallsPerDay || state.costUsdToday >= budget.maxCostUsdPerDay) {
    emit('budget-exceeded')
    return { ok: false, code: 'budget-exceeded', message: 'daily AI budget reached', retryable: false }
  }

  const red = redact(opts.source, prompt.allow)
  if (!red.ok) {
    emit('redaction-refused')
    return {
      ok: false,
      code: 'redaction-refused',
      message: `refused: ${red.refusedFor} found at ${red.path} after redaction — widen the prompt's allow-list deliberately or remove the field`,
      retryable: false,
    }
  }

  const timeoutMs = Math.min(prompt.timeoutMs, opts.maxTimeoutMs ?? prompt.timeoutMs)
  let raw: unknown
  let usage: { inputTokens: number; outputTokens: number; costUsd?: number }
  let confidence: number | null
  try {
    const res = await withTimeout(
      cfg.provider.complete({
        feature: prompt.feature,
        promptId: prompt.id,
        promptVersion: prompt.version,
        input: red.input,
        schema: prompt.schema,
        timeoutMs,
        maxOutputTokens: prompt.maxOutputTokens,
      }),
      timeoutMs,
    )
    raw = res.raw
    usage = res.usage
    confidence = res.confidence ?? null
  } catch (e) {
    const timedOut = (e as Error)?.message === 'ai-timeout'
    emit(timedOut ? 'timeout' : 'provider-error', { droppedFields: red.dropped.length })
    return {
      ok: false,
      code: timedOut ? 'timeout' : 'provider-error',
      message: timedOut ? `provider exceeded ${timeoutMs} ms` : 'provider call failed',
      retryable: true,
    }
  }

  const parsed = prompt.schema.safeParse(raw)
  if (!parsed.success) {
    emit('invalid-output', { droppedFields: red.dropped.length, usage })
    return {
      ok: false,
      code: 'invalid-output',
      message: 'provider output did not match the prompt schema',
      retryable: true,
    }
  }
  emit('ok', { droppedFields: red.dropped.length, usage })
  return {
    ok: true,
    data: parsed.data as T,
    provenance: {
      provenance: 'generated',
      provider: cfg.provider.name,
      model: cfg.provider.model,
      promptId: prompt.id,
      promptVersion: prompt.version,
      generatedAt: now.toISOString(),
      confidence:
        typeof (parsed.data as { confidence?: number }).confidence === 'number'
          ? (parsed.data as { confidence: number }).confidence
          : confidence,
      usage,
    },
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ai-timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
