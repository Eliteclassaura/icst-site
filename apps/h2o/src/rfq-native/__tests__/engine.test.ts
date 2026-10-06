/**
 * Native RFQ engine (contract H2O_NATIVE_RFQ_REGISTRY_CONTRACT_R1): the registry fixture matches the contract's seeded
 * structure; every branch asks its questions in order; validation; draft migration; the submit client follows the §4.1
 * response table; attribution never carries a query string or, without consent, the GA client id.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fixtureRegistry, CT_STRING_AMENDMENTS } from '../registry'
import { answer, complete, migrate, nextQuestion, questionsFor, reopen, reviewGroups, submittedAnswers, validate, validateAll, type Answers } from '../flow'
import { cleanContext, formToken, submitRfq } from '../submission'
import { readAttribution, sessionAttribution } from '../attribution'
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft } from '../draft'
import { searchCountries } from '../countries'

const reg = fixtureRegistry()
const ids = (a: Answers) => questionsFor(reg, a).map((q) => q.id)
const run = (pairs: Array<[string, string]>): Answers => pairs.reduce<Answers>((a, [k, v]) => answer(reg, a, k, v), {})
const contact: Array<[string, string]> = [['name', 'A Person'], ['company', 'Plant Co'], ['email', 'a@plant.example'], ['phone', ''], ['country', 'TH']]

describe('registry fixture = contract §1.1 seeded structure, strings from the OGCS table (97e83b3d) + CT amendments', () => {
  it('ships the CT-accepted OGCS copy byte for byte', () => {
    const tsv = readFileSync(path.join(process.cwd(), 'content/rfq/ogcs-native-rfq-copy-r1.tsv'))
    expect(createHash('sha256').update(tsv).digest('hex').slice(0, 8)).toBe('97e83b3d')
  })
  it('has the contract question ids, types, required flags and limits; every key it names has a string', () => {
    expect(reg.questions.map((q) => [q.id, q.type, q.required, q.validation.maxLength])).toEqual([
      ['purpose', 'chips', true, 16], ['parts_part', 'text', true, 200], ['parts_model', 'text', false, 120], ['parts_qty', 'number_or_text', false, 60],
      ['towers_type', 'chips', true, 16], ['towers_cells', 'chips', false, 16], ['towers_site', 'text', false, 160],
      ['service_issue', 'textarea', true, 2000], ['service_issue_upgrade', 'textarea', false, 2000], ['service_timing', 'chips', false, 16],
      ['other_need', 'textarea', true, 2000], ['notes', 'textarea', false, 2000],
      ['name', 'text', true, 120], ['company', 'text', true, 160], ['email', 'email', true, 254], ['phone', 'tel', false, 40], ['country', 'country', true, 2],
    ])
    expect(reg.purposes.map((p) => [p.value, p.branch, p.extraQuestions ?? []])).toEqual([['new_tower', 'towers', []], ['repair', 'service', []], ['upgrade', 'towers', ['service_issue_upgrade']], ['inspection', 'service', []], ['rebuild', 'towers', []], ['parts', 'parts', []], ['other', 'other', []]])
    for (const q of reg.questions) for (const key of [q.labelKey, q.placeholderKey, q.hintKey, ...(q.chips ?? []).map((c) => c.labelKey)]) if (key) expect(reg.strings[key], `${q.id} ${key}`).toBeTruthy()
    expect(reg.questions.find((q) => q.id === 'towers_cells')!.chips!.map((c) => c.value)).toEqual(['1', '2_4', '5_10', '11_plus', 'not_sure'])
    expect(reg.registryVersion).toMatch(/^rfq-r1-[0-9a-f]{8}$/)
  })
  it('carries the CT amendments: "Email" with its hint, and the no-number confirmation', () => {
    expect(CT_STRING_AMENDMENTS).toEqual({ 'contact.email.q': 'Email', 'contact.email.hint': 'A work email helps us reach the right team', 'confirm.body_no_number': 'Request sent. Thank you. A member of our team will review your request and contact you.' })
    for (const [k, v] of Object.entries(CT_STRING_AMENDMENTS)) expect(reg.strings[k]).toBe(v)
  })
})

describe('flow', () => {
  it('each purpose asks its branch, then its extra questions, then notes, then contact', () => {
    const tail = ['notes', 'name', 'company', 'email', 'phone', 'country']
    expect(ids({})).toEqual(['purpose', 'name', 'company', 'email', 'phone', 'country'])
    expect(ids({ purpose: 'parts' })).toEqual(['purpose', 'parts_part', 'parts_model', 'parts_qty', ...tail])
    for (const p of ['new_tower', 'rebuild']) expect(ids({ purpose: p })).toEqual(['purpose', 'towers_type', 'towers_cells', 'towers_site', ...tail])
    expect(ids({ purpose: 'upgrade' })).toEqual(['purpose', 'towers_type', 'towers_cells', 'towers_site', 'service_issue_upgrade', ...tail])
    for (const p of ['repair', 'inspection']) expect(ids({ purpose: p })).toEqual(['purpose', 'service_issue', 'service_timing', ...tail])
    expect(ids({ purpose: 'other' })).toEqual(['purpose', 'other_need', ...tail])
  })
  it('a skipped optional answer is asked once and omitted from the submission; changing purpose prunes the old branch', () => {
    let a = run([['purpose', 'parts'], ['parts_part', 'Fan blades'], ['parts_model', ''], ['parts_qty', ''], ['notes', '']])
    expect(nextQuestion(reg, a)?.id).toBe('name')
    a = run([...Object.entries(a), ...contact])
    expect(complete(reg, a)).toBe(true)
    expect(submittedAnswers(reg, a)).toEqual({ purpose: 'parts', parts_part: 'Fan blades', name: 'A Person', company: 'Plant Co', email: 'a@plant.example', country: 'TH' })
    const changed = answer(reg, a, 'purpose', 'repair')
    expect(Object.keys(changed)).not.toContain('parts_part')
    expect(nextQuestion(reg, changed)?.id).toBe('service_issue')
  })
  it('validates required, length, email, phone, country and chip values; the form uses its own "required" wording', () => {
    const q = (id: string) => reg.questions.find((x) => x.id === id)!
    expect(validate(reg, q('company'), '')).toEqual({ key: 'err.required' })
    expect(validate(reg, q('company'), '', 'form')).toEqual({ key: 'err.required.form' })
    expect(validate(reg, q('phone'), '')).toBeNull()
    expect(validate(reg, q('email'), 'not-an-email')).toEqual({ key: 'err.email' })
    expect(validate(reg, q('email'), 'a@gmail.com')).toBeNull() // free mail accepted (CT)
    expect(validate(reg, q('parts_part'), 'x'.repeat(201))).toEqual({ key: 'err.too_long', values: { max: '200' } })
    expect(validate(reg, q('country'), 'XX')).not.toBeNull()
    expect(validate(reg, q('towers_type'), 'pyramid')).not.toBeNull()
    expect(validate(reg, q('phone'), '+66 2 123 4567')).toBeNull()
    expect(Object.keys(validateAll(reg, { purpose: 'other' }, 'form'))).toEqual(['other_need', 'name', 'company', 'email', 'country'])
  })
  it('review groups read back chip labels and country names; reopen asks again', () => {
    const a = run([['purpose', 'new_tower'], ['towers_type', 'crossflow'], ['towers_cells', '2_4'], ['towers_site', 'Rayong'], ['notes', ''], ...contact])
    const [request, person] = reviewGroups(reg, a)
    expect(request!.items.map((i) => i.value)).toEqual(['New cooling tower', 'Crossflow', '2–4', 'Rayong'])
    expect(person!.items.find((i) => i.id === 'country')!.value).toBe('Thailand')
    expect(nextQuestion(reg, reopen(a, 'towers_site'))?.id).toBe('towers_site')
  })
  it('a draft from another registry version keeps the answers that still exist and continues at the first unanswered', () => {
    const old = { purpose: 'towers_only_old', name: 'A', retired_q: 'x' } as Answers
    expect(migrate(reg, old)).toEqual({ name: 'A' })
    expect(migrate(reg, { purpose: 'repair', service_issue: 'Vibration', retired_q: 'x' })).toEqual({ purpose: 'repair', service_issue: 'Vibration' })
  })
  it('the country picker searches the registry list by name or code', () => {
    expect(searchCountries(reg.countries, 'thai').map((c) => c.code)).toEqual(['TH'])
    expect(searchCountries(reg.countries, 'us')[0]).toBeDefined()
    expect(searchCountries(reg.countries, 'zzzz')).toEqual([])
  })
})

describe('submit client: contract §4.1', () => {
  const request = { submissionId: 'sub-1', source: 'NATIVE_CHAT' as const, registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'other' }, context: { page_path: '/x/' }, attribution: {}, hp: '' }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const token = { formToken: 'tok-1', fetchedAt: Date.now() }
  it('200 → sent with the RFQ number; a null number (honeypot) → sent, no number', async () => {
    const f = vi.fn(async () => json(200, { ok: true, rfqNumber: 'RFQ-20261005-7K3M9QX2', replay: false }))
    expect((await submitRfq(f as never, request, token)).outcome).toEqual({ kind: 'sent', rfqNumber: 'RFQ-20261005-7K3M9QX2' })
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(sent).toEqual({ submissionId: 'sub-1', source: 'NATIVE_CHAT', registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'other' }, context: { page_path: '/x/' }, attribution: {}, antiAbuse: { formToken: 'tok-1', hp: '' } })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/rfq/submit/')
    const g = vi.fn(async () => json(200, { ok: true, rfqNumber: null, replay: false }))
    expect((await submitRfq(g as never, request, token)).outcome).toEqual({ kind: 'sent', rfqNumber: null })
  })
  it('409 TOKEN_INVALID → one new token and one resend; a second 409 → err.server', async () => {
    const calls: string[] = []
    const f = vi.fn(async (url: string) => { calls.push(url); return url === '/api/rfq/token/' ? json(200, { formToken: 'tok-2', issuedAt: 'x' }) : json(409, { ok: false, code: 'TOKEN_INVALID' }) })
    expect((await submitRfq(f as never, request, token)).outcome).toEqual({ kind: 'error', key: 'err.server' })
    expect(calls).toEqual(['/api/rfq/submit/', '/api/rfq/token/', '/api/rfq/submit/'])
  })
  it('409 SUBMISSION_CONFLICT → a new submissionId, reported to the caller, and one resend', async () => {
    let n = 0
    const f = vi.fn(async () => (n++ === 0 ? json(409, { ok: false, code: 'SUBMISSION_CONFLICT' }) : json(200, { ok: true, rfqNumber: 'RFQ-2', replay: false })))
    const seen: string[] = []
    const r = await submitRfq(f as never, request, token, (id) => seen.push(id))
    expect(r.outcome).toEqual({ kind: 'sent', rfqNumber: 'RFQ-2' })
    expect(seen).toHaveLength(1)
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).submissionId).toBe(seen[0])
  })
  it('422 → field errors; 429 → rate limited; 413 → too long; 503 → disabled; 500 → server; network → offline', async () => {
    const one = (status: number, body: unknown) => submitRfq(vi.fn(async () => json(status, body)) as never, request, token).then((r) => r.outcome)
    expect(await one(422, { ok: false, code: 'VALIDATION', fields: { email: 'err.email' } })).toEqual({ kind: 'invalid', fields: { email: 'err.email' } })
    expect(await one(429, { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: 60 })).toEqual({ kind: 'error', key: 'err.rate_limited' })
    expect(await one(413, { ok: false, code: 'TOO_LARGE' })).toEqual({ kind: 'error', key: 'err.too_long' })
    expect(await one(503, { ok: false, code: 'INTAKE_DISABLED' })).toEqual({ kind: 'error', key: 'err.server', disabled: true })
    expect(await one(500, { ok: false, code: 'SERVER' })).toEqual({ kind: 'error', key: 'err.server' })
    expect((await submitRfq(vi.fn(async () => { throw new TypeError('offline') }) as never, request, token)).outcome).toEqual({ kind: 'error', key: 'err.offline' })
  })
  it('the token is reused while younger than 90 minutes', async () => {
    const f = vi.fn(async () => json(200, { formToken: 'fresh' }))
    expect(await formToken(f as never, { formToken: 'held', fetchedAt: 1000 }, 1000 + 89 * 60_000)).toEqual({ formToken: 'held', fetchedAt: 1000 })
    expect((await formToken(f as never, { formToken: 'held', fetchedAt: 1000 }, 1000 + 91 * 60_000))?.formToken).toBe('fresh')
  })
  it('context: known keys within limits; paths without a query; a search context carries no term or id', () => {
    expect(cleanContext({ page_path: '/product/x/', cta_placement: 'editorial_inline', product_title: 'Fan', evil: 'x', email: 'a@b.c' })).toEqual({ page_path: '/product/x/', cta_placement: 'editorial_inline', product_title: 'Fan' })
    expect(cleanContext({ page_path: '/search/?q=fan', context_type: 'search', context_id: 'fan blades' })).toEqual({ context_type: 'search' })
    expect(cleanContext({ product_title: 'x'.repeat(161) })).toEqual({})
  })
})

describe('attribution and draft', () => {
  it('first page tags and paths only; GA client id only with consent', () => {
    const a = readAttribution('https://h2ocooling.com/fans/?utm_source=google&utm_campaign=q4&gclid=abc&email=a@b.c', 'https://www.google.com/search?q=cooling+tower+parts', 'x=1; _ga=GA1.1.123456.789012', false)
    expect(a).toEqual({ utm_source: 'google', utm_campaign: 'q4', gclid: 'abc', landing_page: '/fans/', referrer: 'https://www.google.com/search' })
    expect(readAttribution('https://h2ocooling.com/', '', '_ga=GA1.1.123456.789012', true).ga_client_id).toBe('123456.789012')
  })
  it('first touch wins for the session; consent is read now, never stored', () => {
    const store = new Map<string, string>()
    const sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage
    const win = (href: string, consent?: string) => ({ location: { href }, sessionStorage, document: { referrer: '', cookie: '_ga=GA1.1.1.2', documentElement: { dataset: consent ? { analyticsConsent: consent } : {} } } })
    expect(sessionAttribution(win('https://h2ocooling.com/a/?utm_source=x', 'granted'))).toEqual({ utm_source: 'x', landing_page: '/a/', ga_client_id: '1.2' })
    expect(JSON.parse(store.get('h2o.rfq.attribution.v1')!)).toEqual({ utm_source: 'x', landing_page: '/a/' })
    expect(sessionAttribution(win('https://h2ocooling.com/b/'))).toEqual({ utm_source: 'x', landing_page: '/a/' })
  })
  it('the draft lives under h2o.rfq.draft.v1 and survives a blocked store', () => {
    const store = new Map<string, string>()
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    const d = { submissionId: 'id', registryVersion: reg.registryVersion, step: 'details' as const, answers: { purpose: 'parts' }, source: 'NATIVE_CHAT' as const }
    saveDraft(s, d)
    expect([...store.keys()]).toEqual([DRAFT_KEY])
    expect(loadDraft(s)).toEqual(d)
    clearDraft(s)
    expect(loadDraft(s)).toBeNull()
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(() => saveDraft(blocked, d)).not.toThrow()
    expect(loadDraft(blocked)).toBeNull()
  })
})
