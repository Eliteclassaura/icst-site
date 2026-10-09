import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { delaysSummary, parseTiming, planSteps, shortTitle } from '../seq/timing'

/** SEQ-BUILD-1: timing → steps, and the modules that must never write or send. */
describe('contract timing', () => {
  it('parses immediate and business-day offsets; refuses calendar days and human triggers', () => {
    expect(parseTiming('IMMEDIATE_AFTER_PERSISTENCE')).toEqual({ kind: 'IMMEDIATE' })
    expect(parseTiming('NEXT_BUSINESS_DAY_IF_UNRESOLVED')).toEqual({ kind: 'BUSINESS_DAYS', days: 1, after: 0 })
    expect(parseTiming('3_BUSINESS_DAYS_AFTER_STEP_1')).toEqual({ kind: 'BUSINESS_DAYS', days: 3, after: 1 })
    expect(parseTiming('7_CALENDAR_DAYS_AFTER_QUOTE_SENT_OR_NEXT_BUSINESS_DAY').kind).toBe('UNSUPPORTED')
    expect(parseTiming('AT_VERIFIED_NEXT_REVIEW_AT').kind).toBe('UNSUPPORTED')
  })

  it('plans the qualification sequence as wait 1, email, wait 3, email, wait 4, task (the contract delays)', () => {
    const plan = planSteps([
      { step: 1, type: 'EMAIL', step_code: 'Q1', timing: 'NEXT_BUSINESS_DAY_IF_UNRESOLVED' },
      { step: 2, type: 'EMAIL', step_code: 'Q2', timing: '3_BUSINESS_DAYS_AFTER_STEP_1' },
      { step: 3, type: 'TASK', step_code: 'Q3', timing: '7_BUSINESS_DAYS_AFTER_STEP_1', task_creation: 'Review it.' },
    ])
    expect(plan.ok && plan.steps.map((s) => `${s.type}${s.business_days ?? ''}`)).toEqual(['WAIT1', 'EMAIL', 'WAIT3', 'EMAIL', 'WAIT4', 'TASK'])
    expect(plan.ok && delaysSummary(plan.steps)).toBe('Email 1 after 1 business day, email 2 after 3 more business days')
  })

  it('refuses a delay shorter than the steps before it, or a step that waits on a later step', () => {
    expect(planSteps([{ step: 1, type: 'EMAIL', step_code: 'A', timing: '5_BUSINESS_DAYS_AFTER_STEP_2' }]).ok).toBe(false)
    expect(
      planSteps([
        { step: 1, type: 'EMAIL', step_code: 'A', timing: '5_BUSINESS_DAYS_AFTER_STEP_0' },
        { step: 2, type: 'EMAIL', step_code: 'B', timing: '3_BUSINESS_DAYS_AFTER_STEP_0' },
      ]).ok,
    ).toBe(false)
  })

  it('cuts a long task title at a sentence end, within 200 characters', () => {
    const long = `${'A sentence of reasonable length. '.repeat(12)}`
    expect(shortTitle(long).length).toBeLessThanOrEqual(200)
    expect(shortTitle('Short.')).toBe('Short.')
  })
})

describe('what the seq modules can and cannot do', () => {
  const dir = new URL('../seq/', import.meta.url)
  const src = (f: string) => readFileSync(new URL(f, dir), 'utf8')
  it('simulate.ts has no write call and imports no transport', () => {
    expect(src('simulate.ts')).not.toMatch(/payload\.(create|update|delete|updateGlobal)\(/)
    expect(src('simulate.ts')).not.toMatch(/email\/transport|nodemailer|sendMail|outbox-worker|crm-email-outbox/)
  })
  it('gates.ts only reads', () => {
    expect(src('gates.ts')).not.toMatch(/payload\.(create|update|delete|updateGlobal)\(/)
  })
  it('no seq module imports a transport or the outbox worker', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) expect(src(f), f).not.toMatch(/email\/transport|nodemailer|sendMail|outbox-worker/)
  })
  it('the only collections the seq modules write are sequences, versions, templates, triggers and simulation reviews', () => {
    const allowed = new Set(['crm-sequences', 'crm-sequence-versions', 'crm-email-templates', 'crm-sequence-triggers', 'crm-ers-simulations'])
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const text = src(f)
      for (const m of text.matchAll(/\.(?:create|update)\(\{\s*collection: '([a-z-]+)'/g)) expect(allowed.has(m[1]!), `${f}: ${m[1]}`).toBe(true)
    }
  })
  it('the email-revenue pages import no transport or outbox', () => {
    const root = new URL('../../app/(crm)/crm/email-revenue/', import.meta.url)
    const walk = (d: URL): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : /\.(ts|tsx)$/.test(e.name) ? [new URL(e.name, d).pathname] : []))
    for (const f of walk(root)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/email\/transport|outbox|nodemailer|sendMail/)
  })
})
