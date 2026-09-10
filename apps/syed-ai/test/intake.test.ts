/**
 * C6 — the end-to-end lead (release-plan "Accept — the end-to-end lead"). Runs processBrief against the
 * migrated test database, then the jobs, and asserts the records, the anti-abuse behaviour and the
 * idempotency guarantees. No email addresses here belong to anyone: `.test` / `.local` only.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { Payload } from 'payload'
import { getTestPayload } from './helpers'
import { processBrief, LIMITS } from '@factory/agency-core/intake'

let p: Payload
const selects = [
  { name: 'revenue', options: ['Under $50K', '$50K – $250K', '$250K – $1M', '$1M+', 'Prefer not to say'] },
  {
    name: 'budget',
    options: ['Under $5,000', '$5,000 – $10,000', '$10,000 – $25,000', '$25,000+', 'Not sure yet'],
  },
  { name: 'timeline', options: ['Starting now', 'Next 30 days', 'This quarter', 'Just researching'] },
  { name: 'focus', options: ['AI search visibility / GEO', 'Organic search / SEO', 'Both'] },
]
const base = {
  name: 'Test Person',
  email: 'lead@example.test',
  company: 'Example Ltd',
  site: 'https://example.test/',
  revenue: '$1M+',
  budget: '$25,000+',
  timeline: 'Starting now',
  focus: 'AI search visibility / GEO',
  brief:
    'Our category pages have lost AI Overview citations since spring and the brief form is the only inbound channel we trust. We want a plan and a fixed scope for the next quarter.',
  want_plan: '1',
  t0: String(Date.now() - 20_000),
  page: '/',
  utm: { utm_source: 'newsletter', utm_campaign: 'spring' },
}
let ipN = 10
const nextIp = () => `203.0.113.${ipN++}`
const run = (body: Record<string, unknown>, ip = nextIp(), now?: Date) =>
  processBrief({
    payload: p,
    body,
    ip,
    userAgent: 'vitest',
    selects,
    formKey: 'brief',
    turnstile: { required: false },
    now,
  })

beforeAll(async () => {
  p = await getTestPayload()
  const form = await p.find({
    collection: 'forms',
    where: { key: { equals: 'brief' } },
    limit: 1,
    overrideAccess: true,
  })
  if (!form.docs[0])
    await p.create({
      collection: 'forms',
      data: {
        name: 'Brief',
        key: 'brief',
        fields: [{ name: 'brief', label: 'Brief', type: 'textarea', required: true }],
        submitLabel: 'Send',
      },
      overrideAccess: true,
    })
  await p.updateGlobal({
    slug: 'integrations',
    data: {
      email: { provider: 'mock', notifyEmail: 'owner@example.test' },
      crm: { enabled: true, provider: 'mock' },
    },
    overrideAccess: true,
  })
  for (const r of [
    { name: 'Revenue: $1M+', factor: 'budget', field: 'revenue', match: '$1M+', points: 25 },
    {
      name: 'Timeline: starting now',
      factor: 'timeline',
      field: 'timeline',
      match: 'Starting now',
      points: 20,
    },
    { name: 'Has website', factor: 'engagement', field: 'site', match: '/\\./', points: 8 },
    {
      name: 'Just researching',
      factor: 'negative',
      field: 'timeline',
      match: 'Just researching',
      points: -10,
    },
  ])
    await p.create({
      collection: 'lead-score-rules',
      data: { ...r, factor: r.factor as 'budget', active: true, verification: { status: 'verified' } },
      overrideAccess: true,
    })
})

describe('processBrief — the end-to-end lead', () => {
  it('creates contact, submission, lead, activity and queues the two jobs; a retry creates nothing new', async () => {
    const r = await run(base)
    expect(r.ok && !r.silent).toBe(true)
    if (!r.ok || r.silent) return
    expect(r.maskedEmail).toBe('l***@example.test')

    const sub = await p.findByID({ collection: 'submissions', id: r.submissionId, overrideAccess: true })
    expect(sub.status).toBe('processed')
    expect(sub.context?.ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(sub)).not.toContain('203.0.113.7')

    const lead = await p.findByID({ collection: 'leads', id: r.leadId, depth: 1, overrideAccess: true })
    expect(lead.source).toBe('form')
    expect(lead.stage).toBe('new')
    expect(lead.attribution?.utm).toEqual({ utm_source: 'newsletter', utm_campaign: 'spring' })
    expect(lead.score).toBe(25 + 20 + 8)
    expect(Array.isArray(lead.scoreBreakdown)).toBe(true)
    expect((lead.scoreBreakdown as unknown[]).length).toBe(3)

    const acts = await p.find({
      collection: 'activities',
      where: { lead: { equals: r.leadId } },
      overrideAccess: true,
    })
    expect(acts.docs.map((a) => a.type)).toContain('submission')

    const jobs = await p.find({
      collection: 'payload-jobs',
      where: { taskSlug: { in: ['notifyOwner', 'crmSync'] } },
      limit: 10,
      overrideAccess: true,
    })
    expect(jobs.docs.length).toBeGreaterThanOrEqual(2)

    // Same email + same brief inside the window: success answer, no new records.
    const before = await p.count({ collection: 'leads', overrideAccess: true })
    const again = await run(base)
    expect(again.ok && again.silent && again.reason === 'duplicate').toBe(true)
    const after = await p.count({ collection: 'leads', overrideAccess: true })
    expect(after.totalDocs).toBe(before.totalDocs)

    // A second brief from the same person reuses the contact.
    const r2 = await run({
      ...base,
      brief: 'A different question about the pricing page and how citations are counted there.',
    })
    expect(r2.ok && !r2.silent).toBe(true)
    const contacts = await p.find({
      collection: 'contacts',
      where: { email: { equals: 'lead@example.test' } },
      overrideAccess: true,
    })
    expect(contacts.totalDocs).toBe(1)
  })

  it('worker processes notifyOwner once (idempotent outbox) and crmSync marks the lead synced', async () => {
    const r = await run({
      ...base,
      email: 'worker@example.test',
      brief:
        'Worker path: we need a citation audit for our three product lines before the autumn launch window.',
    })
    if (!r.ok || r.silent) throw new Error('expected a lead')
    await p.jobs.run({ limit: 20 })
    await p.jobs.run({ limit: 20 }) // second pass must not send twice
    const outbox = await p.find({
      collection: 'outbox',
      where: { idempotencyKey: { equals: `notify:${r.submissionId}` } },
      overrideAccess: true,
    })
    expect(outbox.totalDocs).toBe(1)
    expect(outbox.docs[0]!.status).toBe('sent')
    expect(outbox.docs[0]!.subject).toContain('w***@example.test')
    expect(outbox.docs[0]!.subject).not.toContain('worker@example.test')
    const lead = await p.findByID({ collection: 'leads', id: r.leadId, overrideAccess: true })
    expect(lead.sync?.status).toBe('synced')
    expect(lead.sync?.externalId).toMatch(/^mock-/)
  })

  it('honeypot → silent, nothing stored', async () => {
    const before = await p.count({ collection: 'submissions', overrideAccess: true })
    const r = await run({
      ...base,
      email: 'bot@example.test',
      website_url: 'http://spam.example',
      brief: 'hello there this is a bot',
    })
    expect(r).toEqual({ ok: true, silent: true, reason: 'honeypot' })
    expect((await p.count({ collection: 'submissions', overrideAccess: true })).totalDocs).toBe(
      before.totalDocs,
    )
  })

  it('dwell < 3 s → 400; no timer (no-JS) is allowed', async () => {
    const fast = await run({ ...base, email: 'fast@example.test', t0: String(Date.now() - 500) })
    expect(!fast.ok && fast.status === 400 && fast.code === 'too-fast').toBe(true)
    const nojs = await run({
      ...base,
      email: 'nojs@example.test',
      t0: '',
      brief:
        'No JavaScript here: our contact page traffic fell after the redesign and we want the technical review first.',
    })
    expect(nojs.ok).toBe(true)
  })

  it('disposable domain → 422; typo → 422 with suggestion; email_ok=1 bypasses the typo layer only', async () => {
    const d = await run({ ...base, email: 'x@mailinator.com' })
    expect(!d.ok && d.status === 422 && d.code === 'email-disposable').toBe(true)
    const t = await run({ ...base, email: 'someone@gmial.com' })
    expect(!t.ok && t.status === 422 && t.code === 'email-typo' && t.suggestion === 'someone@gmail.com').toBe(
      true,
    )
    const ok = await run({
      ...base,
      email: 'someone@gmial.com',
      email_ok: '1',
      brief: 'Bypassed typo layer: the address really is at that domain and we still want the audit.',
    })
    expect(ok.ok).toBe(true)
    const still = await run({ ...base, email: 'y@mailinator.com', email_ok: '1' })
    expect(!still.ok && still.code === 'email-disposable').toBe(true)
  })

  it('spam score ≥ 5 → silent accept, nothing stored', async () => {
    const before = await p.count({ collection: 'submissions', overrideAccess: true })
    const r = await run({
      ...base,
      email: 'seo@example.test',
      brief: 'BUY BACKLINKS PACKAGE http://a.example http://b.example http://c.example increase your ranking',
    })
    expect(r).toEqual({ ok: true, silent: true, reason: 'spam' })
    expect((await p.count({ collection: 'submissions', overrideAccess: true })).totalDocs).toBe(
      before.totalDocs,
    )
  })

  it('6th send in an hour from one address → 429', async () => {
    const ip = '198.51.100.9'
    for (let i = 0; i < LIMITS.sendsPerIpPerHour; i++) {
      const r = await run(
        {
          ...base,
          email: `burst${i}@example.test`,
          brief: `Distinct brief number ${i}: we want to know why our glossary pages stopped being cited in answers.`,
        },
        ip,
      )
      expect(r.ok).toBe(true)
    }
    const r = await run(
      {
        ...base,
        email: 'burst-last@example.test',
        brief: 'One more distinct brief that should be refused by the hourly send cap.',
      },
      ip,
    )
    expect(!r.ok && r.status === 429 && r.code === 'ip-sends').toBe(true)
  })

  it('Turnstile required and token missing → 403', async () => {
    const r = await processBrief({
      payload: p,
      body: { ...base, email: 'ts@example.test' },
      ip: '192.0.2.1',
      selects,
      formKey: 'brief',
      turnstile: { required: true, verify: async () => false },
    })
    expect(!r.ok && r.status === 403 && r.code === 'turnstile-missing').toBe(true)
    const r2 = await processBrief({
      payload: p,
      body: { ...base, email: 'ts@example.test', 'cf-turnstile-response': 'tok' },
      ip: '192.0.2.1',
      selects,
      formKey: 'brief',
      turnstile: { required: true, verify: async () => false },
    })
    expect(!r2.ok && r2.code === 'turnstile-failed').toBe(true)
  })

  it('anonymous cannot read rate-events, submissions or leads', async () => {
    for (const c of ['rate-events', 'submissions', 'leads', 'contacts'] as const) {
      await expect(p.find({ collection: c, overrideAccess: false, user: null })).rejects.toThrow()
    }
  })
})
