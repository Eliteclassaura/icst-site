// @vitest-environment happy-dom
/**
 * RFQ-FIX-1 (quote-form audit R1, seal 2b1bd3a7): the fixes and the audit's test gaps 1–5, 10, 11. Synthetic values only;
 * the server pieces run as plain functions (no database), the components in happy-dom.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fixtureRegistry, RFQ_FIX_1_STRINGS } from '../registry'
import { normalizePhone, stripControls, submittedAnswers, validate } from '../flow'
import { submitRfq, TOKEN_MARGIN_MS } from '../submission'
import { NativeRfq, QUOTE_FORM_ID } from '../NativeRfq'
import { NativeRfqForm, NativeRfqFormSection } from '../NativeRfqForm'
import { DRAFT_KEY } from '../draft'
import { DRAFT_DEBOUNCE_MS } from '../useRfqSession'
import { checkFormToken, issueFormToken, MIN_SECONDS_TO_SUBMIT } from '../../crm/intake/native/token'
import { MAX_BODY_BYTES, readCapped, servedRegistry } from '../../crm/intake/native/handlers'
import { resolveSalesAddress } from '../../email/config'
import { parseEnvelope, toDelivery } from '../../crm/intake/native/normalize'
import { proxy } from '../../proxy'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const reg = fixtureRegistry()
const q = (id: string) => reg.questions.find((x) => x.id === id)!
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const NO_WAIT = { sleep: async () => {} }
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }

beforeAll(() => {
  process.env.PAYLOAD_SECRET ??= 'unit-test-only-synthetic-secret-0000000000'
})

describe('R2: the first "Send request" with a real form token', () => {
  /** The real token endpoint and the real token check, on one fake clock that only the send's own wait moves. */
  function server(start: number) {
    let clock = start
    const sent: string[] = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/rfq/token/') return json(200, issueFormToken(new Date(clock)))
      const tok = (JSON.parse(String(init!.body)) as { antiAbuse: { formToken: string } }).antiAbuse.formToken
      const state = checkFormToken(tok, new Date(clock))
      sent.push(state)
      return state === 'OK' ? json(200, { ok: true, rfqNumber: 'RFQ-20261008-SYNTH01', replay: false }) : json(409, { ok: false, code: 'TOKEN_INVALID' })
    })
    const timing = { now: () => clock, sleep: async (ms: number) => { clock += ms } }
    return { fetcher, timing, sent, advance: (ms: number) => { clock += ms }, at: () => clock }
  }
  const request = { submissionId: '01920000-0000-4000-8000-000000000001', source: 'NATIVE_FORM' as const, registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'other' }, context: {}, attribution: {}, hp: '' }

  it('never fetched: the send fetches a token, waits out the minimum age, and the server accepts the first try', async () => {
    const s = server(Date.parse('2026-10-08T03:00:00Z'))
    const r = await submitRfq(s.fetcher as never, request, null, undefined, s.timing)
    expect(r.outcome).toEqual({ kind: 'sent', rfqNumber: 'RFQ-20261008-SYNTH01' })
    expect(s.sent).toEqual(['OK'])
  })
  it('a token fetched a moment ago (a fast visitor) waits too; one older than 90 minutes is replaced, not sent stale', async () => {
    const s = server(Date.parse('2026-10-08T03:00:00Z'))
    const held = { formToken: issueFormToken(new Date(s.at())).formToken, fetchedAt: s.at() }
    s.advance(1000)
    expect((await submitRfq(s.fetcher as never, request, held, undefined, s.timing)).outcome.kind).toBe('sent')
    expect(s.sent).toEqual(['OK'])
    // a page left open for 2 h 30 min: the held token would be EXPIRED; it is refreshed first
    const old = { formToken: issueFormToken(new Date(s.at())).formToken, fetchedAt: s.at() }
    s.advance(150 * 60_000)
    expect((await submitRfq(s.fetcher as never, request, old, undefined, s.timing)).outcome.kind).toBe('sent')
    expect(s.sent).toEqual(['OK', 'OK'])
    expect(s.fetcher.mock.calls.filter((c) => c[0] === '/api/rfq/token/')).toHaveLength(1)
  })
  it('TOKEN_INVALID → a new token, then a wait of at least the minimum age before the one resend (never TOO_FAST)', async () => {
    const s = server(Date.parse('2026-10-08T03:00:00Z'))
    const bogus = { formToken: 'v1.bogus', fetchedAt: s.at() - 10_000 }
    const t0 = s.at()
    const r = await submitRfq(s.fetcher as never, request, bogus, undefined, s.timing)
    expect(r.outcome.kind).toBe('sent')
    expect(s.sent).toEqual(['MALFORMED', 'OK'])
    expect(s.at() - t0).toBeGreaterThanOrEqual(MIN_SECONDS_TO_SUBMIT * 1000 + TOKEN_MARGIN_MS)
  })
  it('without the wait the same flow is refused as too fast (the audit\'s failure, reproduced)', async () => {
    const s = server(Date.parse('2026-10-08T03:00:00Z'))
    const r = await submitRfq(s.fetcher as never, request, null, undefined, { now: s.timing.now, sleep: async () => {} })
    expect(r.outcome).toEqual({ kind: 'error', key: 'err.server' })
    expect(s.sent).toEqual(['TOO_FAST', 'TOO_FAST'])
  })
})

describe('R3: phone numbers', () => {
  it('extensions and full-width digits are accepted and travel in ASCII; a bad number says err.phone (OGCS), not "required"', () => {
    for (const ok of ['+1 (303) 555-0100 x12', '+1 303 555 0100 ext. 4', '+1 303 555 0100 extension 22', '０３－１２３４－５６７８', '+662-661-7723', '03/1234/5678'])
      expect(validate(reg, q('phone'), ok), ok).toBeNull()
    for (const bad of ['call me', 'ext. 4', '12', '+1 303 555 0100 x', 'x'.repeat(10), '(1) 2-3', '+ () - . /', '12 x 3456']) expect(validate(reg, q('phone'), bad), bad).toEqual({ key: 'err.phone' })
    expect(validate(reg, q('phone'), '')).toBeNull()
    expect(reg.strings['err.phone']).toBe(RFQ_FIX_1_STRINGS['err.phone'])
    expect(normalizePhone('０３－１２３４－５６７８')).toBe('03-1234-5678')
    expect(submittedAnswers(reg, { purpose: 'other', other_need: 'x', notes: '', name: 'A', company: 'B', email: 'a@b.co', phone: '０３－１２３４ ５６７８', country: 'JP' }).phone).toBe('03-1234 5678')
  })
  it('the server accepts the same numbers and stores the normalised form', () => {
    const r = parseEnvelope({ submissionId: '01920000-0000-4000-8000-000000000002', source: 'NATIVE_FORM', registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'other', other_need: 'x', name: 'A', company: 'B', email: 'a@b.co', phone: '＋８１ ３－１２３４－５６７８', country: 'JP' }, context: {}, attribution: {}, antiAbuse: {} })!
    expect(toDelivery(reg, r, new Date()).delivery.mapped.phone).toBe('+81 3-1234-5678')
  })
})

describe('R4 + R9: size and characters', () => {
  it('the longest flow in Thai (3 bytes a character) with full context and attribution fits the body limit', () => {
    const th = (n: number) => 'ก'.repeat(n)
    const answers: Record<string, string> = { purpose: 'upgrade', towers_type: 'crossflow', towers_cells: '11_plus', notes: th(2000), name: th(120), company: th(160), email: `${'a'.repeat(240)}@b.example`, phone: '+66 2 000 0000 ext. 123456', country: 'TH' }
    for (const x of reg.questions) if (x.type === 'text' || x.type === 'textarea' || x.type === 'number_or_text') answers[x.id] ??= th(x.validation.maxLength)
    const body = JSON.stringify({ submissionId: '01920000-0000-4000-8000-000000000003', source: 'NATIVE_CHAT', registryVersion: reg.registryVersion, locale: 'en', answers, context: { page_path: `/${'p'.repeat(511)}`, product_path: `/${'p'.repeat(511)}`, product_title: th(160), product_slug: 's'.repeat(128), product_id: 'i'.repeat(64), context_id: 'c'.repeat(64), context_type: 'product', cta_placement: 'c'.repeat(64) }, attribution: Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'ga_client_id', 'landing_page', 'referrer'].map((k) => [k, 'x'.repeat(256)])), antiAbuse: { formToken: 'v1.'.padEnd(120, 'x'), hp: '' } })
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThan(MAX_BODY_BYTES)
    expect(reg.limits.maxBodyBytes).toBe(MAX_BODY_BYTES)
  })
  it('NUL, other controls and bidi overrides are removed on both sides; newlines and tabs stay', () => {
    expect(stripControls('a\u0000b\u0007c\r\nd\te‮f⁦g\u0085h')).toBe('abc\nd\tefgh')
    const r = parseEnvelope({ submissionId: '01920000-0000-4000-8000-000000000004', source: 'NATIVE_FORM', answers: { name: 'Ana\u0000 Ruiz', notes: 'line1\r\nline2' }, context: { product_title: 'Fan\u0000' }, antiAbuse: {} })!
    expect(r.answers).toEqual({ name: 'Ana Ruiz', notes: 'line1\nline2' })
    expect(r.context.product_title).toBe('Fan')
  })
  it('a body is read only up to the limit: a chunked oversize body stops early and is refused', async () => {
    let pulled = 0
    const big = new ReadableStream<Uint8Array>({ pull(c) { pulled++; if (pulled > 50) c.close(); else c.enqueue(new Uint8Array(16 * 1024)) } })
    expect(await readCapped(new Request('http://x/', { method: 'POST', body: big, duplex: 'half' } as RequestInit), MAX_BODY_BYTES)).toBeNull()
    expect(pulled).toBeLessThanOrEqual(4)
    expect(await readCapped(new Request('http://x/', { method: 'POST', body: '{"a":"ก"}' }), MAX_BODY_BYTES)).toBe('{"a":"ก"}')
  })
})

describe('R15: the confirmation lines the server serves (OGCS a4b21326)', () => {
  const env = (extra: Record<string, string>) => ({ ...process.env, ...extra }) as NodeJS.ProcessEnv
  it('promise on (default) / off; acknowledgement on / off with the configured sales address', () => {
    const on = servedRegistry(env({ H2O_EMAIL_CUSTOMER_ACK: 'on' })).strings
    expect(on['confirm.body']).toBe(RFQ_FIX_1_STRINGS['confirm.body.promise_on'])
    expect(on['confirm.attachments']).toBe(RFQ_FIX_1_STRINGS['confirm.attachments.ack_on'])
    expect(on['confirm.response_time']).toBeUndefined()
    const off = servedRegistry(env({ H2O_EMAIL_CUSTOMER_ACK: 'off', H2O_EMAIL_RESPONSE_PROMISE: 'off' })).strings
    expect(off['confirm.body']).toBe(RFQ_FIX_1_STRINGS['confirm.body.promise_off'])
    expect(off['confirm.attachments']).toBe('You can email photos or drawings to sales@h2ocooling.com. Please include your RFQ number, {{rfq_number}}.')
    expect(servedRegistry(env({ H2O_RFQ_SALES_EMAIL: 'quotes@example.test' })).strings['confirm.attachments']).toContain('quotes@example.test')
    expect(resolveSalesAddress(env({ H2O_RFQ_SALES_EMAIL: 'not an address<script>' }))).toBe('sales@h2ocooling.com')
  })
})

describe('MFA-UX-1 auditor note: two-factor pages are never stored by a cache', () => {
  it('GET /crm/mfa/ and its server-action POST both get private, no-store', () => {
    for (const method of ['GET', 'POST']) expect(proxy(new NextRequest('http://localhost:3000/crm/mfa/', { method })).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('rendered', () => {
  let host: HTMLDivElement
  let root: Root
  const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
  const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text || b.getAttribute('aria-label') === text) as HTMLButtonElement
  const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
  const s = (k: string, v: Record<string, string> = {}) => reg.strings[k]!.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '')
  beforeEach(() => {
    sessionStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })
  async function filledForm(fetcher: unknown) {
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await flush()
    const form = host.querySelector('form')!
    await click(form.querySelector('input[value="other"]'))
    for (const [n, v] of [['other_need', 'Basin repair'], ['name', 'A'], ['company', 'B'], ['email', 'a@b.co']] as const) await type(form.querySelector(`[name="${n}"]`) as HTMLInputElement, v)
    await act(async () => { const sel = form.querySelector('select[name="country"]') as HTMLSelectElement; sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { form.requestSubmit() })
    await flush()
    return form
  }
  const api = (submit: () => Response) => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok', issuedAt: 'x' }) : submit()))

  it('R4: a server 422 on the inline form goes back to the fields, shows the error there and focuses it', async () => {
    await filledForm(api(() => json(422, { ok: false, code: 'VALIDATION', fields: { email: 'err.email' } })))
    await click(button(s('review.send')))
    const form = host.querySelector('form')!
    expect(form).not.toBeNull()
    expect(form.textContent).toContain(s('err.email'))
    expect((document.activeElement as HTMLInputElement).name).toBe('email')
    expect(form.querySelector('[name="email"]')!.getAttribute('aria-invalid')).toBe('true')
  })
  it('R4: a 413 lands on the longest answer; an error no field owns shows as the send failure on the form', async () => {
    await filledForm(api(() => json(413, { ok: false, code: 'TOO_LARGE' })))
    await click(button(s('review.send')))
    expect(host.querySelector('form')!.textContent).toContain(s('err.too_long', { max: String(q('other_need').validation.maxLength) }))
    await act(async () => root.unmount())
    sessionStorage.clear()
    root = createRoot(host)
    await filledForm(api(() => json(422, { ok: false, code: 'VALIDATION', fields: {} })))
    await click(button(s('review.send')))
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(s('err.server', { offices_link: s('offices.link_text') }))
  })
  it('R10 + R18 + QA S5: POST form, browser length limits, a counter under text areas, the choice group marked invalid', async () => {
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await flush()
    const form = host.querySelector('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect((form.querySelector('[name="name"]') as HTMLInputElement).maxLength).toBe(q('name').validation.maxLength)
    await act(async () => { form.requestSubmit() })
    await flush()
    const group = form.querySelector('[data-rfq-field="purpose"] [role="radiogroup"]')!
    expect([group.getAttribute('aria-invalid'), group.getAttribute('aria-required'), document.getElementById(group.getAttribute('aria-labelledby')!)?.tagName]).toEqual(['true', 'true', 'LEGEND'])
    await click(form.querySelector('input[value="other"]'))
    await type(form.querySelector('[name="other_need"]') as HTMLTextAreaElement, 'Basin')
    expect(form.textContent).toContain(`5 / ${q('other_need').validation.maxLength}`)
  })
  it('R11: what is typed on the inline form is kept for a refresh (debounced), before "Continue"', async () => {
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await flush()
    await type(host.querySelector('[name="company"]') as HTMLInputElement, 'Northwind Thermal (synthetic)')
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    await act(async () => { await new Promise((r) => setTimeout(r, DRAFT_DEBOUNCE_MS + 50)) })
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).answers.company).toBe('Northwind Thermal (synthetic)')
  })
  it('R7: a registry that failed to load is tried again when the panel is opened again', async () => {
    let n = 0
    const loader = async () => (n++ === 0 ? null : reg)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(host.querySelector('[data-phase]')!.getAttribute('data-phase')).toBe('unavailable')
    await click(button(LAUNCHER.aria))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(host.querySelector('[data-phase]')!.getAttribute('data-phase')).toBe('asking')
    expect(n).toBe(2)
  })
  it('R16: the launcher steps aside while the page\'s quote form is on screen, and returns when it scrolls away', async () => {
    let fire: (visible: boolean) => void = () => {}
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) { fire = (v) => cb([{ isIntersecting: v }]) }
      observe() {}
      disconnect() {}
    })
    await act(async () => root.render(<><NativeRfqFormSection loader={async () => reg} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/><NativeRfq launcher={LAUNCHER} loader={async () => reg} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/></>))
    await flush()
    expect(host.querySelector(`#${QUOTE_FORM_ID}`)).not.toBeNull()
    const launcher = host.querySelector('[data-rfq-launcher]') as HTMLButtonElement
    expect(launcher.hidden).toBe(false)
    await act(async () => fire(true))
    expect(launcher.hidden).toBe(true)
    await act(async () => fire(false))
    expect(launcher.hidden).toBe(false)
  })
  it('R15: with no RFQ number, a line that needs one is left out', async () => {
    const served = { ...reg, strings: { ...reg.strings, 'confirm.attachments': servedRegistry({ ...process.env, H2O_EMAIL_CUSTOMER_ACK: 'off' } as NodeJS.ProcessEnv).strings['confirm.attachments']! } }
    await act(async () => root.render(<NativeRfqForm loader={async () => served} timing={NO_WAIT} fetcher={api(() => json(200, { ok: true, rfqNumber: null, replay: false })) as never}/>))
    await flush()
    const form = host.querySelector('form')!
    await click(form.querySelector('input[value="other"]'))
    for (const [n, v] of [['other_need', 'x'], ['name', 'A'], ['company', 'B'], ['email', 'a@b.co']] as const) await type(form.querySelector(`[name="${n}"]`) as HTMLInputElement, v)
    await act(async () => { const sel = form.querySelector('select[name="country"]') as HTMLSelectElement; sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { form.requestSubmit() })
    await flush()
    await click(button(s('review.send')))
    expect(host.textContent).toContain(s('confirm.body_no_number'))
    expect(host.textContent).not.toContain('sales@h2ocooling.com')
  })
})
