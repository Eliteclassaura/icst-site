/**
 * C7 acceptance: the platform works with AI disabled, and with the mock provider enabled a lead summary
 * is labelled with full provenance while the deterministic score is untouched.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload } from './helpers'
import { aiConfig, aiBudget, aiBudgetState, providerFromEnv } from '../src/lib/ai'

/** Earlier test files leave jobs queued; drain until the queue stops making progress so this file's
 *  assertions are about its own job and not someone else's backlog. */
async function drainJobs(p: Payload) {
  for (let i = 0; i < 12; i++) {
    const res = await p.jobs.run({ limit: 50 })
    if (Object.keys(res.jobStatus ?? {}).length === 0) return
  }
}

let p: Payload
let leadId: string
const env = { ...process.env }

beforeAll(async () => {
  p = await getTestPayload()
  const contact = await p.create({
    collection: 'contacts',
    data: {
      email: 'ai-lead@example.test',
      emailNormalized: 'ai-lead@example.test',
      name: 'AI Test',
      provenance: 'form',
    },
    overrideAccess: true,
  })
  const lead = await p.create({
    collection: 'leads',
    data: {
      title: 'AI Test — GEO',
      contact: contact.id,
      stage: 'new',
      source: 'form',
      attribution: { landingPage: '/' },
      submittedFields: {
        brief:
          'Our category pages lost AI Overview citations after the redesign; we want a fixed-scope plan.',
        revenue: '$1M+',
        budget: '$25,000+',
        timeline: 'Starting now',
        focus: 'AI search visibility / GEO',
        // Undeclared by the prompt — must be dropped before the provider is called.
        roadmapOptIn: true,
        internalNote: 'spoke to ai-lead@example.test on the phone',
      },
      score: 53,
      scoreBreakdown: [
        { rule: 'Revenue: $1M+', factor: 'budget', field: 'revenue', value: '$1M+', points: 25 },
      ],
    },
    overrideAccess: true,
  })
  leadId = String(lead.id)
  await drainJobs(p)
})
afterEach(() => {
  process.env = { ...env }
})

describe('AI is off by default (two switches)', () => {
  it('resolves disabled with no provider when AI_ENABLED is unset', async () => {
    delete process.env.AI_ENABLED
    await p.updateGlobal({
      slug: 'integrations',
      data: { ai: { enabled: true, features: ['lead-summary'] } },
      overrideAccess: true,
    })
    const cfg = await aiConfig(p)
    expect(cfg.envEnabled).toBe(false)
    expect(cfg.provider).toBeNull()
  })
  it('resolves disabled when the client switch is off even with AI_ENABLED=true', async () => {
    process.env.AI_ENABLED = 'true'
    await p.updateGlobal({
      slug: 'integrations',
      data: { ai: { enabled: false, features: [] } },
      overrideAccess: true,
    })
    const cfg = await aiConfig(p)
    expect(cfg.clientEnabled).toBe(false)
  })
  it('only the mock provider is available; an unknown provider name yields none', () => {
    expect(providerFromEnv({ AI_PROVIDER: 'mock' } as unknown as NodeJS.ProcessEnv)?.name).toBe('mock')
    expect(providerFromEnv({ AI_PROVIDER: 'anthropic' } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })
  it('the leadSummary job is a reported no-op with AI disabled; the lead is untouched', async () => {
    delete process.env.AI_ENABLED
    await p.updateGlobal({
      slug: 'integrations',
      data: { ai: { enabled: false, features: [] } },
      overrideAccess: true,
    })
    const before = await p.findByID({ collection: 'leads', id: leadId, overrideAccess: true })
    await p.jobs.queue({ task: 'leadSummary', input: { leadId } })
    await drainJobs(p)
    const after = await p.findByID({ collection: 'leads', id: leadId, overrideAccess: true })
    expect(after.aiInsight?.summary ?? null).toBeNull()
    expect(after.score).toBe(before.score)
    expect(after.updatedAt).toBe(before.updatedAt)
  })
})

describe('with the mock provider enabled', () => {
  it('writes a labelled aiInsight, leaves the deterministic score unchanged, and logs an audit row', async () => {
    process.env.AI_ENABLED = 'true'
    process.env.AI_PROVIDER = 'mock'
    await p.updateGlobal({
      slug: 'integrations',
      data: { ai: { enabled: true, features: ['lead-summary'] } },
      overrideAccess: true,
    })
    const before = await p.findByID({ collection: 'leads', id: leadId, overrideAccess: true })

    await p.jobs.queue({ task: 'leadSummary', input: { leadId } })
    await drainJobs(p)

    const after = await p.findByID({ collection: 'leads', id: leadId, overrideAccess: true })
    expect(after.aiInsight?.summary).toBeTruthy()
    expect(after.aiInsight?.nextAction).toBeTruthy()
    expect(after.aiInsight?.provider).toBe('mock')
    expect(after.aiInsight?.model).toBe('mock-deterministic-1')
    expect(after.aiInsight?.promptVersion).toBe('lead-summary@1.0.0')
    expect(after.aiInsight?.generatedAt).toBeTruthy()
    expect(typeof after.aiInsight?.confidence).toBe('number')
    expect(after.aiInsight?.reviewAction ?? null).toBeNull() // awaits human review

    // The deterministic score is the authority: generated text never improves it.
    expect(after.score).toBe(before.score)
    expect(JSON.stringify(after.scoreBreakdown)).toBe(JSON.stringify(before.scoreBreakdown))

    // The summary must not contain anything the prompt was not allowed to see.
    const text = `${after.aiInsight?.summary} ${after.aiInsight?.nextAction}`
    expect(text).not.toContain('ai-lead@example.test')
    expect(text).not.toContain('AI Test')

    const audit = await p.find({
      collection: 'audit-log',
      where: { and: [{ action: { equals: 'ai' } }, { docId: { equals: leadId } }] },
      overrideAccess: true,
    })
    expect(audit.totalDocs).toBeGreaterThanOrEqual(1)
    const detail = (audit.docs[0]!.detail ?? {}) as {
      outcome?: string
      usage?: { inputTokens?: number }
      droppedFields?: number
    }
    expect(detail.outcome).toBe('ok')
    expect(detail.usage?.inputTokens).toBeGreaterThan(0)
    expect(detail.droppedFields).toBeGreaterThan(0)
    // Metadata only: no prompt text, no completion text, no PII in the audit row.
    expect(JSON.stringify(audit.docs[0])).not.toContain('category pages')
    expect(JSON.stringify(audit.docs[0])).not.toContain('ai-lead@example.test')

    const activity = await p.find({
      collection: 'activities',
      where: { and: [{ type: { equals: 'ai-insight' } }, { lead: { equals: leadId } }] },
      overrideAccess: true,
    })
    expect(activity.totalDocs).toBe(1)
    expect(activity.docs[0]!.summary).toContain('awaiting review')
  })

  it("budget state counts today's AI audit rows and the budget comes from the environment", async () => {
    const state = await aiBudgetState(p)
    expect(state.callsToday).toBeGreaterThanOrEqual(1)
    expect(
      aiBudget({ AI_MAX_CALLS_PER_DAY: '7', AI_MAX_COST_USD_PER_DAY: '2.5' } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      maxCallsPerDay: 7,
      maxCostUsdPerDay: 2.5,
    })
    expect(aiBudget({} as unknown as NodeJS.ProcessEnv).maxCallsPerDay).toBe(200)
  })

  it('a feature not in the client list is refused even with both switches on', async () => {
    process.env.AI_ENABLED = 'true'
    await p.updateGlobal({
      slug: 'integrations',
      data: { ai: { enabled: true, features: ['content-brief'] } },
      overrideAccess: true,
    })
    const cfg = await aiConfig(p)
    expect(cfg.enabledFeatures).toEqual(['content-brief'])
  })
})
