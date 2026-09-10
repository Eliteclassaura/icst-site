import type { AiProvider, AiRequest, AiUsage } from './types'

/**
 * Deterministic mock provider (master prompt: "A deterministic mock/no-AI provider for tests").
 * Same input → same output, no network, no clock. It exists so the whole AI path can be exercised in CI
 * without a key, and so a failing test means a real defect rather than provider variance.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock'
  readonly model = 'mock-deterministic-1'

  async complete(req: AiRequest): Promise<{ raw: unknown; usage: AiUsage; confidence?: number | null }> {
    const text = JSON.stringify(req.input)
    const usage: AiUsage = { inputTokens: Math.ceil(text.length / 4), outputTokens: 40, costUsd: 0 }
    const confidence = Number((0.5 + (hash(text) % 41) / 100).toFixed(2)) // 0.50–0.90, stable per input

    if (req.promptId === 'lead-summary') {
      const focus = str(req.input.focus) ?? 'an unstated focus'
      const timeline = str(req.input.timeline) ?? 'no stated timeline'
      const budget = str(req.input.budget) ?? 'no stated budget'
      return {
        raw: {
          summary: `Enquiry about ${focus}. Stated timeline: ${timeline}. Stated budget: ${budget}. Details are limited to the submitted fields.`,
          nextAction: 'Reply with two clarifying questions and a scoping call slot.',
          confidence,
        },
        usage,
        confidence,
      }
    }
    if (req.promptId === 'lead-classification') {
      const revenue = str(req.input.revenue) ?? ''
      const segment = /\$1M\+/.test(revenue)
        ? 'enterprise'
        : /\$250K/.test(revenue)
          ? 'mid-market'
          : revenue
            ? 'small'
            : 'unclear'
      return {
        raw: {
          segment,
          rationale: `Derived from the supplied revenue band (${revenue || 'not supplied'}).`,
          confidence,
        },
        usage,
        confidence,
      }
    }
    // Unknown prompt: return something the schema will reject, so the gateway's validation is exercised
    // rather than the mock quietly inventing a shape.
    return { raw: { unsupportedPrompt: req.promptId }, usage, confidence: null }
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
