// @vitest-environment happy-dom
/**
 * Native RFQ, rendered (happy-dom): the corner panel and the inline form driven like a visitor would, against the registry
 * fixture and a mock of the contract §3–§4 endpoints. Keyboard, focus, live region, resume, double submit, honeypot,
 * confirmation with and without an RFQ number.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry } from '../registry'
import { NativeRfq, RFQ_OPEN_EVENT } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'
import { NativeRfqTrigger } from '../NativeRfqTrigger'
import { DRAFT_KEY } from '../draft'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
/** RFQ-FIX-1: the send's token-age wait (R2) is skipped here; engine.test covers it with a clock. */
const NO_WAIT = { sleep: async () => {} }
const reg = fixtureRegistry()
const loader = async () => reg
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const api = (submit: () => Response | Promise<Response>) => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok', issuedAt: 'x' }) : submit()))
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text || b.getAttribute('aria-label') === text) as HTMLButtonElement
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const key = async (target: Element, k: string, shiftKey = false) => { await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })) }); await flush() }
const panel = () => host.querySelector('[role="dialog"]') as HTMLElement | null
const log = () => host.querySelector('[role="log"]')!.textContent ?? ''
/** CHAT-COPY-1: the chat's own wording (chat.<key>), else the shared text */
const sc = (k: string, v: Record<string, string> = {}) => (reg.strings[`chat.${k}`] ?? reg.strings[k]!).replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '')
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
})

describe('corner panel (NATIVE_CHAT)', () => {
  it('a parts request from the launcher: chips, text, skip, contact, review, send → the RFQ number; nothing sent before Send', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-20261005-7K3M9QX2', replay: false }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    const launcher = host.querySelector('[data-rfq-launcher]') as HTMLButtonElement
    expect(launcher.getAttribute('aria-label')).toBe(sc('launcher.aria'))
    expect(launcher.textContent).toBe(sc('launcher.label'))
    await click(launcher)
    expect(panel()?.getAttribute('aria-modal')).toBe('true')
    expect(panel()?.querySelector('h2')?.textContent).toBe(sc('panel.title'))
    expect(host.querySelector('[role="log"]')?.getAttribute('aria-live')).toBe('polite')
    expect(log()).toContain(sc('greeting'))
    // RFQ-FIX-1.1 (owner order): email first, then first and last name, then company
    expect(log()).toContain(sc('contact.email.q'))
    expect(log()).not.toContain(sc('contact.intro'))
    const email = panel()!.querySelector('input[type="email"]') as HTMLInputElement
    expect(document.activeElement).toBe(email)
    expect(email.autocomplete).toBe('email')
    await type(email, 'not-an-email'); await key(email, 'Enter')
    expect(panel()!.textContent).toContain(sc('err.email'))
    await type(email, 'a@gmail.com'); await key(email, 'Enter')
    for (const [v, ac] of [['A', 'given-name'], ['Person', 'family-name'], ['Plant Co', 'organization']] as const) {
      const i = panel()!.querySelector('input[type="text"]') as HTMLInputElement
      expect(i.autocomplete).toBe(ac)
      await type(i, v); await key(i, 'Enter')
    }
    expect(log()).toContain(sc('purpose.q'))
    await click(button(sc('purpose.chip.parts')))
    expect(log()).toContain(sc('parts.part.q'))
    const box = panel()!.querySelector('input[type="text"]') as HTMLInputElement
    expect(document.activeElement).toBe(box)
    await type(box, '')
    await key(box, 'Enter')
    expect(panel()!.textContent).toContain(sc('err.required')) // required: not accepted empty
    await type(box, 'Fan blades')
    await key(box, 'Enter')
    await click(button(sc('chip.skip'))) // model
    await click(button(sc('chip.skip'))) // quantity
    // phone: optional and skippable (CT Round 5 ruling 2): a Skip chip
    await click(button(sc('chip.skip')))
    const search = panel()!.querySelector('input[type="search"]') as HTMLInputElement
    await type(search, 'thai')
    await click(button('Thailand'))
    await click(button(sc('chip.skip'))) // notes (the message), last
    // review: every answer read back, each with its Edit control; nothing has been posted yet
    expect(panel()!.textContent).toContain(sc('review.heading'))
    expect(panel()!.textContent).toContain('Fan blades')
    expect(panel()!.textContent).toContain('Thailand')
    expect(host.querySelectorAll(`button[aria-label^="${sc('review.edit')}:"]`).length).toBe(7)
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/api/rfq/token/'])
    await click(button(sc('review.send')))
    const body = JSON.parse((fetcher.mock.calls.find((c) => c[0] === '/api/rfq/submit/') as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ source: 'NATIVE_CHAT', registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'parts', parts_part: 'Fan blades', first_name: 'A', last_name: 'Person', company: 'Plant Co', email: 'a@gmail.com', country: 'TH' }, context: { page_path: '/', context_type: 'page', cta_placement: 'launcher' }, antiAbuse: { formToken: 'tok', hp: '' } })
    expect(Object.keys(body.answers)).not.toContain('parts_model')
    expect(panel()!.textContent).toContain(sc('confirm.body', { rfq_number: 'RFQ-20261005-7K3M9QX2' }))
    expect(panel()!.textContent).toContain(sc('confirm.attachments'))
    // the response promise sits directly under the RFQ number line
    expect([...panel()!.querySelectorAll('p')].map((p) => p.textContent).join('|')).toContain(`${sc('confirm.body', { rfq_number: 'RFQ-20261005-7K3M9QX2' })}|${sc('confirm.response_time')}|${sc('confirm.attachments')}`)
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('an RFQ control opens the panel with its context (shown once, never asked); Escape closes and focus returns to it', async () => {
    await act(async () => root.render(<><NativeRfqTrigger placement="rfq_page" context={{ context_type: 'product', context_id: '4765', product_id: '4765', product_slug: 'site-assembly', page_path: '/product/site-assembly/' }} contextLabel="Site Assembly">Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/></>))
    const link = host.querySelector('a[data-rfq-native]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/contact-us/#request-a-quote')
    link.focus()
    await click(link)
    expect(panel()).not.toBeNull()
    expect(log()).toContain(sc('context.note', { context_label: 'Site Assembly' }))
    await key(panel()!, 'Escape')
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(link)
  })

  it('Tab stays inside the panel', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const items = [...panel()!.querySelectorAll<HTMLElement>('button, input:not([tabindex="-1"]), a[href]')]
    items.at(-1)!.focus()
    await key(items.at(-1)!, 'Tab')
    expect(document.activeElement).toBe(items[0])
    await key(items[0]!, 'Tab', true)
    expect(document.activeElement).toBe(items.at(-1))
  })

  it('closing keeps the draft; reopening offers to continue or start over', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const email = panel()!.querySelector('input[type="email"]') as HTMLInputElement
    await type(email, 'a@b.co'); await key(email, 'Enter')
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toMatchObject({ answers: { email: 'a@b.co' }, source: 'NATIVE_CHAT' })
    await click(button(sc('panel.close.aria')))
    expect(panel()).toBeNull()
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(log()).toContain(sc('resume.prompt'))
    await click(button(sc('resume.continue')))
    expect(log()).toContain(sc('contact.first_name.q'))
  })

  it('a send in flight cannot be sent twice; a failure keeps the draft and says so; the honeypot is hidden from people', async () => {
    let release: (r: Response) => void = () => {}
    const fetcher = api(() => new Promise<Response>((r) => { release = r }))
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: 'sub-1', registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'Basin repair', notes: '', first_name: 'A', last_name: '', company: 'B', email: 'a@b.co', phone: '', country: 'US' }, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    // RFQ-FIX-1 (audit R5): a name no autofill profile knows, with the password managers' "ignore" markers
    expect(panel()!.querySelector('input[name="company_website"]')).toBeNull()
    const hp = panel()!.querySelector('input[name="h2o_hp_x"]') as HTMLInputElement
    expect(hp.tabIndex).toBe(-1)
    expect([hp.autocomplete, hp.getAttribute('data-1p-ignore'), hp.getAttribute('data-lpignore')]).toEqual(['off', '', 'true'])
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull()
    const send = button(sc('review.send'))
    await act(async () => { send.click() })
    expect(button(sc('review.sending')).disabled).toBe(true)
    await act(async () => { button(sc('review.sending')).click() })
    expect(fetcher.mock.calls.filter((c) => c[0] === '/api/rfq/submit/')).toHaveLength(1)
    await act(async () => { release(json(500, { ok: false, code: 'SERVER' })) })
    await flush()
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.server', { offices_link: sc('offices.link_text') }))
    expect(panel()!.querySelector('[role="alert"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
    expect(panel()!.querySelector('[role="alert"] a')?.textContent).toBe(sc('offices.link_text'))
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).submissionId).toBe('sub-1')
  })

  const reviewDraft = (id: string, extra: Record<string, string> = {}) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: id, registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'Basin repair', notes: '', first_name: 'A', last_name: '', company: 'B', email: 'a@b.co', phone: '', country: 'US', ...extra }, source: 'NATIVE_CHAT' }))
  const openToReview = async (fetcher: unknown) => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
  }

  it('R5.2: a 429 disables Send with the Retry-After countdown, then allows the retry; the draft is kept', async () => {
    let n = 0
    const fetcher = api(() => (n++ === 0 ? new Response(JSON.stringify({ ok: false, code: 'RATE_LIMITED', retryAfterSeconds: 1 }), { status: 429, headers: { 'retry-after': '1' } }) : json(200, { ok: true, rfqNumber: 'RFQ-5', replay: false })))
    reviewDraft('sub-429')
    await openToReview(fetcher)
    await click(button(sc('review.send')))
    const waiting = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(sc('review.send')))!
    expect(waiting.disabled).toBe(true)
    expect(waiting.textContent).toBe(`${sc('review.send')} (0:01)`)
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.rate_limited', { offices_link: sc('offices.link_text') }))
    await act(async () => { waiting.click() })
    expect(fetcher.mock.calls.filter((c) => c[0] === '/api/rfq/submit/')).toHaveLength(1)
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)) })
    await flush()
    expect(button(sc('review.send')).disabled).toBe(false)
    await click(button(sc('review.send')))
    expect(panel()!.textContent).toContain(sc('confirm.body', { rfq_number: 'RFQ-5' }))
    const bodies = fetcher.mock.calls.filter((c) => c[0] === '/api/rfq/submit/').map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).submissionId)
    expect(bodies).toEqual(['sub-429', 'sub-429']) // the retry is the same submission
  })

  it('R5.2: a 200 replay shows the same confirmation with the returned RFQ number', async () => {
    reviewDraft('sub-replay')
    await openToReview(api(() => json(200, { ok: true, rfqNumber: 'RFQ-ORIGINAL', replay: true })))
    await click(button(sc('review.send')))
    expect(panel()!.textContent).toContain(sc('confirm.body', { rfq_number: 'RFQ-ORIGINAL' }))
    expect(panel()!.textContent).toContain(sc('confirm.response_time'))
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('R5.2: a 422 too-long error names the limit ({max} from the registry); a 413 lands on the longest answer', async () => {
    reviewDraft('sub-422')
    await openToReview(api(() => json(422, { ok: false, code: 'VALIDATION', fields: { other_need: 'err.too_long' } })))
    await click(button(sc('review.send')))
    // the chat goes back to the failing question, its error filled with the field's own limit
    expect(log()).toContain(sc('other.q'))
    expect(panel()!.textContent).toContain(sc('err.too_long', { max: '2000' }))
    await act(async () => root.unmount())
    root = createRoot(host)
    sessionStorage.clear()
    reviewDraft('sub-413', { notes: 'x'.repeat(1900) })
    await openToReview(api(() => json(413, { ok: false, code: 'TOO_LARGE' })))
    await click(button(sc('review.send')))
    expect(log()).toContain(sc('notes.q'))
    expect(panel()!.textContent).toContain(sc('err.too_long', { max: '2000' }))
  })

  it('a null RFQ number shows the no-number confirmation (contract amendment (a))', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: 'sub-2', registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'X', notes: '', first_name: 'A', last_name: '', company: 'B', email: 'a@b.co', phone: '', country: 'US' }, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(200, { ok: true, rfqNumber: null, replay: false })) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(sc('review.send')))
    expect(panel()!.textContent).toContain(sc('confirm.body_no_number'))
    expect(panel()!.textContent).toContain(sc('confirm.response_time'))
  })

  it('a registry that is off shows the unavailable line with the offices link (R5.1); unreachable shows no question', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => ({ ...reg, enabled: false })} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(log()).not.toContain(sc('purpose.q'))
    expect(log()).toBe(sc('panel.unavailable', { offices_link: sc('offices.link_text') }))
    expect(panel()!.querySelector('[role="log"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => null} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(log()).not.toContain(sc('purpose.q'))
    expect(panel()!.querySelector('[role="log"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
  })

  it('first touch survives navigation: the landing page’s tags are sent from a later page (R5.1)', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-3', replay: false }))
    window.history.replaceState(null, '', '/fans/?utm_source=ads&utm_campaign=q4&gclid=abc')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    expect(JSON.parse(sessionStorage.getItem('h2o.rfq.attr.v1')!)).toMatchObject({ utm_source: 'ads', utm_campaign: 'q4', gclid: 'abc', landing_page: '/fans/' })
    expect(fetcher).not.toHaveBeenCalled() // nothing is sent before submit
    // a later page in the same session
    await act(async () => root.unmount())
    window.history.replaceState(null, '', '/contact-us/')
    root = createRoot(host)
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: 'sub-3', registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'X', notes: '', first_name: 'A', last_name: '', company: 'B', email: 'a@b.co', phone: '', country: 'US' }, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(s('resume.continue')))
    await click(button(s('review.send')))
    const body = JSON.parse((fetcher.mock.calls.find((c) => c[0] === '/api/rfq/submit/') as unknown as [string, RequestInit])[1].body as string)
    expect(body.attribution).toMatchObject({ utm_source: 'ads', utm_campaign: 'q4', gclid: 'abc', landing_page: '/fans/' })
    expect(body.attribution.ga_client_id).toBeUndefined()
    expect(body.context).toMatchObject({ page_path: '/contact-us/' })
  })

  it('a page-level control shows the page’s own H1 in the context note (R5.1); it is not sent', async () => {
    const fetcher = api(() => json(500, {}))
    await act(async () => root.render(<><main><h1>Cooling Tower   Fans</h1></main><NativeRfqTrigger placement="editorial_inline" context={{ context_type: 'page', page_path: '/fans/' }}>Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/></>))
    await click(host.querySelector('a[data-rfq-native]'))
    expect(log()).toContain(s('context.note', { context_label: 'Cooling Tower Fans' }))
  })
})

describe('inline form (NATIVE_FORM)', () => {
  it('validates everything at once (form wording, focus on the first error), then reviews and sends as NATIVE_FORM', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-9', replay: false }))
    await act(async () => root.render(<NativeRfqForm loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await flush()
    const form = host.querySelector('form')!
    expect([...form.querySelectorAll('legend, label')].map((l) => l.textContent)).toContain(s('purpose.q'))
    await click(button(s('review.heading')) ?? form.querySelector('button[type="submit"]'))
    expect(form.textContent).toContain(s('err.required.form'))
    // RFQ-FIX-1.1: the first field in error in the visual order is the email
    expect((document.activeElement as HTMLInputElement).name).toBe('email')
    await click(form.querySelector('input[value="new_tower"]'))
    await click(form.querySelector('input[name="rfq-form-towers_type"][value="crossflow"]'))
    for (const [n, v] of [['first_name', 'A'], ['company', 'B'], ['email', 'a@b.co']]) await type(form.querySelector(`[name="${n}"]`) as HTMLInputElement, v)
    await act(async () => { const sel = form.querySelector('select[name="country"]') as HTMLSelectElement; sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { form.requestSubmit() })
    await flush()
    expect(host.querySelector('h3')?.textContent).toBe(s('review.heading'))
    expect(host.textContent).toContain('Crossflow')
    await click(button(s('review.send')))
    const body = JSON.parse((fetcher.mock.calls.find((c) => c[0] === '/api/rfq/submit/') as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ source: 'NATIVE_FORM', answers: { purpose: 'new_tower', towers_type: 'crossflow', first_name: 'A', company: 'B', email: 'a@b.co', country: 'US' }, context: { page_path: '/contact-us/', cta_placement: 'contact_form' } })
    expect(host.textContent).toContain(s('confirm.body', { rfq_number: 'RFQ-9' }))
  })
})

it('the open event is the only coupling between a control and the panel', () => {
  expect(RFQ_OPEN_EVENT).toBe('h2o:rfq-open')
})
