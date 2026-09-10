import type { z } from 'zod'

/**
 * The AI provider interface (master prompt §AI providers, C7). Every runtime AI call in the platform goes
 * through this and nothing else: adapters never see the raw record, only what the gateway allows them to
 * see, and they never decide policy.
 */
export type AiFeature =
  | 'lead-summary'
  | 'follow-up-draft'
  | 'lead-classification'
  | 'content-brief'
  | 'schema-suggestions'
  | 'report-narrative'

export const AI_FEATURES: AiFeature[] = [
  'lead-summary',
  'follow-up-draft',
  'lead-classification',
  'content-brief',
  'schema-suggestions',
  'report-narrative',
]

export type AiRequest = {
  feature: AiFeature
  /** Prompt id + version from the registry; never a free-form prompt from a caller. */
  promptId: string
  promptVersion: string
  /** Already-redacted variables. The gateway builds this; adapters must not receive anything else. */
  input: Record<string, unknown>
  /** Structured output contract. The gateway validates the response against it and refuses on mismatch. */
  schema: z.ZodTypeAny
  timeoutMs: number
  maxOutputTokens: number
}

export type AiUsage = { inputTokens: number; outputTokens: number; costUsd?: number }

export type AiSuccess<T> = {
  ok: true
  data: T
  provenance: {
    provenance: 'generated'
    provider: string
    model: string
    promptId: string
    promptVersion: string
    generatedAt: string
    confidence: number | null
    usage: AiUsage
  }
}

export type AiFailure = {
  ok: false
  code:
    | 'disabled'
    | 'feature-not-enabled'
    | 'not-permitted'
    | 'budget-exceeded'
    | 'no-provider'
    | 'timeout'
    | 'invalid-output'
    | 'provider-error'
    | 'redaction-refused'
  message: string
  retryable: boolean
}

export type AiResult<T> = AiSuccess<T> | AiFailure

export interface AiProvider {
  readonly name: string
  readonly model: string
  /** Must be server-side, must honour the timeout, must never log the input. */
  complete(req: AiRequest): Promise<{ raw: unknown; usage: AiUsage; confidence?: number | null }>
}
