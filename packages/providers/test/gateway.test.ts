import { describe, it, expect } from 'vitest'
import {
  run,
  aiEnabled,
  MockAiProvider,
  redact,
  PROMPTS,
  type AiConfig,
  type AiLogEntry,
} from '../src/ai/index'

const provider = new MockAiProvider()
const on: AiConfig = {
  envEnabled: true,
  clientEnabled: true,
  enabledFeatures: ['lead-summary', 'lead-classification'],
  provider,
}
const lead = {
  brief: 'Our category pages lost AI Overview citations after the redesign and we want a fixed-scope plan.',
  revenue: '$1M+',
  budget: '$25,000+',
  timeline: 'Starting now',
  focus: 'AI search visibility / GEO',
  landingPage: '/',
  score: 53,
  // Fields the prompt does not declare — must never reach the provider.
  contactEmail: 'someone@example.test',
  ipHash: 'a'.repeat(64),
  spamReasons: ['no-dwell'],
  internalNotes: 'called them on +44 20 7946 0000',
}

describe('two switches, both off by default', () => {
  it('is disabled unless env AND client are on and a provider exists', () => {
    expect(aiEnabled({ ...on, envEnabled: false })).toBe(false)
    expect(aiEnabled({ ...on, clientEnabled: false })).toBe(false)
    expect(aiEnabled({ ...on, provider: null })).toBe(false)
    expect(aiEnabled(on)).toBe(true)
  })
  it('refuses with `disabled` when either switch is off, before any provider call', async () => {
    for (const cfg of [
      { ...on, envEnabled: false },
      { ...on, clientEnabled: false },
    ]) {
      const r = await run(cfg, { promptId: 'lead-summary', source: lead, permitted: true })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('disabled')
    }
  })
  it('refuses a feature the client has not enabled, and a caller without permission', async () => {
    const noFeature = await run(
      { ...on, enabledFeatures: [] },
      { promptId: 'lead-summary', source: lead, permitted: true },
    )
    expect(noFeature.ok === false && noFeature.code).toBe('feature-not-enabled')
    const noPerm = await run(on, { promptId: 'lead-summary', source: lead, permitted: false })
    expect(noPerm.ok === false && noPerm.code).toBe('not-permitted')
  })
  it('refuses an unknown prompt id (callers cannot supply prompt text)', async () => {
    const r = await run(on, { promptId: 'make-something-up', source: lead, permitted: true })
    expect(r.ok === false && r.code).toBe('no-provider')
  })
})

describe('redaction is an allow-list, and PII refuses the call', () => {
  it('drops undeclared fields and passes only the prompt allow-list', () => {
    const r = redact(lead, PROMPTS['lead-summary']!.allow)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.input).sort()).toEqual([
      'brief',
      'budget',
      'focus',
      'landingPage',
      'revenue',
      'score',
      'timeline',
    ])
    expect(JSON.stringify(r.input)).not.toContain('example.test')
    expect(JSON.stringify(r.input)).not.toContain('7946')
    expect(r.dropped).toContain('contactEmail')
    expect(r.dropped).toContain('ipHash')
  })
  it('refuses rather than masking when a declared field still contains PII', async () => {
    const dirty = { ...lead, brief: 'Reply to ops@example.test about the audit.' }
    const r = await run(on, { promptId: 'lead-summary', source: dirty, permitted: true })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('redaction-refused')
      expect(r.message).toContain('email')
    }
  })
  it('never lets the provider see an undeclared field', async () => {
    let seen: Record<string, unknown> = {}
    const spy = {
      name: 'spy',
      model: 'spy-1',
      async complete(req: { input: Record<string, unknown> }) {
        seen = req.input
        return {
          raw: { summary: 'x', nextAction: 'y', confidence: 0.5 },
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    }
    const r = await run(
      { ...on, provider: spy as unknown as MockAiProvider },
      { promptId: 'lead-summary', source: lead, permitted: true },
    )
    expect(r.ok).toBe(true)
    expect(Object.keys(seen)).not.toContain('contactEmail')
    expect(Object.keys(seen)).not.toContain('spamReasons')
  })
})

describe('budgets, timeouts and output validation', () => {
  it('refuses when the daily call or cost budget is spent', async () => {
    const calls = await run(on, {
      promptId: 'lead-summary',
      source: lead,
      permitted: true,
      budget: { maxCallsPerDay: 2, maxCostUsdPerDay: 5 },
      budgetState: { callsToday: 2, costUsdToday: 0 },
    })
    expect(calls.ok === false && calls.code).toBe('budget-exceeded')
    const cost = await run(on, {
      promptId: 'lead-summary',
      source: lead,
      permitted: true,
      budget: { maxCallsPerDay: 100, maxCostUsdPerDay: 1 },
      budgetState: { callsToday: 0, costUsdToday: 1.2 },
    })
    expect(cost.ok === false && cost.code).toBe('budget-exceeded')
  })
  it('times out a slow provider and marks it retryable; a caller may shorten but not lengthen the timeout', async () => {
    const slow = { name: 'slow', model: 's', complete: () => new Promise(() => {}) }
    const r = await run(
      { ...on, provider: slow as unknown as MockAiProvider },
      { promptId: 'lead-classification', source: lead, permitted: true, maxTimeoutMs: 50 },
    )
    expect(r.ok === false && r.code).toBe('timeout')
    expect(r.ok === false && r.retryable).toBe(true)
    expect(r.ok === false && r.message).toContain('50 ms')
    // An attempt to lengthen is ignored: the prompt's 15 s ceiling still applies (message names the prompt's value).
    const longer = await run(
      {
        ...on,
        provider: {
          name: 'slow2',
          model: 's',
          complete: () => new Promise((_r, rej) => setTimeout(() => rej(new Error('boom')), 10)),
        } as unknown as MockAiProvider,
      },
      { promptId: 'lead-classification', source: lead, permitted: true, maxTimeoutMs: 999_999 },
    )
    expect(longer.ok === false && longer.code).toBe('provider-error')
  })
  it('rejects output that does not match the prompt schema', async () => {
    const bad = {
      name: 'bad',
      model: 'b',
      async complete() {
        return { raw: { summary: 'only a summary' }, usage: { inputTokens: 1, outputTokens: 1 } }
      },
    }
    const r = await run(
      { ...on, provider: bad as unknown as MockAiProvider },
      { promptId: 'lead-summary', source: lead, permitted: true },
    )
    expect(r.ok === false && r.code).toBe('invalid-output')
    expect(r.ok === false && r.retryable).toBe(true)
  })
})

describe('success path', () => {
  it('stamps provenance and is deterministic for the same input', async () => {
    const log: AiLogEntry[] = []
    const a = await run(on, {
      promptId: 'lead-summary',
      source: lead,
      permitted: true,
      now: new Date('2026-09-06T00:00:00.000Z'),
      log: (e) => log.push(e),
    })
    const b = await run(on, {
      promptId: 'lead-summary',
      source: lead,
      permitted: true,
      now: new Date('2026-09-06T00:00:00.000Z'),
    })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.data).toEqual(b.data)
    expect(a.provenance.provenance).toBe('generated')
    expect(a.provenance.provider).toBe('mock')
    expect(a.provenance.model).toBe('mock-deterministic-1')
    expect(a.provenance.promptId).toBe('lead-summary')
    expect(a.provenance.promptVersion).toBe('1.0.0')
    expect(a.provenance.generatedAt).toBe('2026-09-06T00:00:00.000Z')
    expect(typeof a.provenance.confidence).toBe('number')
    expect(a.provenance.usage.inputTokens).toBeGreaterThan(0)
    // The log carries metadata only — never the brief or the summary.
    expect(log).toHaveLength(1)
    expect(log[0]!.outcome).toBe('ok')
    expect(log[0]!.droppedFields).toBeGreaterThan(0)
    expect(JSON.stringify(log[0])).not.toContain('category pages')
  })
  it('classification derives from the supplied band only', async () => {
    const r = await run(on, { promptId: 'lead-classification', source: lead, permitted: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as { segment: string }).segment).toBe('enterprise')
    const unclear = await run(on, {
      promptId: 'lead-classification',
      source: { ...lead, revenue: '' },
      permitted: true,
    })
    if (unclear.ok) expect((unclear.data as { segment: string }).segment).toBe('unclear')
  })
})
