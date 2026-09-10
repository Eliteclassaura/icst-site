import { z } from 'zod'
import type { AiFeature } from './types'

/**
 * Prompt registry (master prompt §AI providers: "prompt/version logging"). Prompts are code, versioned,
 * and each one declares the only fields it may receive (`allow`) plus the structured output it must
 * return. A caller names a prompt id; it cannot supply prompt text, and it cannot widen `allow`.
 */
export type PromptDef = {
  id: string
  version: string
  feature: AiFeature
  /** Dot paths the gateway may pass through redaction. Nothing else reaches the provider. */
  allow: string[]
  schema: z.ZodTypeAny
  timeoutMs: number
  maxOutputTokens: number
  /** System instruction. Deterministic text; no interpolation of caller data. */
  system: string
}

export const leadSummaryOutput = z.object({
  summary: z.string().min(1).max(600),
  nextAction: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
})

export const leadClassificationOutput = z.object({
  segment: z.enum(['enterprise', 'mid-market', 'small', 'unclear']),
  rationale: z.string().min(1).max(400),
  confidence: z.number().min(0).max(1),
})

export const PROMPTS: Record<string, PromptDef> = {
  'lead-summary': {
    id: 'lead-summary',
    version: '1.0.0',
    feature: 'lead-summary',
    // Deliberately no contact name, email, company domain, IP hash, spam internals or raw brief author data.
    allow: ['brief', 'revenue', 'budget', 'timeline', 'focus', 'landingPage', 'score'],
    schema: leadSummaryOutput,
    timeoutMs: 20_000,
    maxOutputTokens: 400,
    system:
      'You summarise an inbound enquiry for a consultant. Use only the supplied fields. State what the enquirer wants, what is unclear, and one concrete next action. Never invent facts, names, prices or dates. Return JSON matching the schema.',
  },
  'lead-classification': {
    id: 'lead-classification',
    version: '1.0.0',
    feature: 'lead-classification',
    allow: ['revenue', 'budget', 'timeline', 'focus', 'score'],
    schema: leadClassificationOutput,
    timeoutMs: 15_000,
    maxOutputTokens: 250,
    system:
      'You classify an enquiry by apparent size using only the supplied fields. If the fields do not support a classification, answer "unclear". Return JSON matching the schema.',
  },
}

export function promptFor(id: string): PromptDef | null {
  return PROMPTS[id] ?? null
}
