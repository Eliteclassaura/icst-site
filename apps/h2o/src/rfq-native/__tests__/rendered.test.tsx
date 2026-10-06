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
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={fetcher as never}/>))
    const launcher = host.querySelector('[data-rfq-launcher]') as HTMLButtonElement
    expect(launcher.getAttribute('aria-label')).toBe(s('launcher.aria'))
    expect(launcher.textContent).toBe(s('launcher.label'))
    await click(launcher)
    expect(panel()?.getAttribute('aria-modal')).toBe('true')
    expect(panel()?.querySelector('h2')?.textContent).toBe(s('panel.title'))
    expect(host.querySelector('[role="log"]')?.getAttribute('aria-live')).toBe('polite')
    expect(log()).toContain(s('greeting'))
    expect(log()).toContain(s('purpose.q'))
    // focus moved into the panel (the first answer chip)
    expect(panel()!.contains(document.activeElement)).toBe(true)
    await click(button(s('purpose.chip.parts')))
    expect(log()).toContain(s('parts.part.q'))
    const box = panel()!.querySelector('input[type="text"]') as HTMLInputElement
    expect(document.activeElement).toBe(box)
    await type(box, '')
    await key(box, 'Enter')
    expect(panel()!.textContent).toContain(s('err.required')) // required: not accepted empty
    await type(box, 'Fan blades')
    await key(box, 'Enter')
    await click(button(s('chip.skip'))) // model
    await click(button(s('chip.skip'))) // quantity
    await click(button(s('chip.skip'))) // notes
    expect(log()).toContain(s('contact.intro'))
    for (const v of ['A Person', 'Plant Co']) { const i = panel()!.querySelector('input[type="text"]') as HTMLInputElement; await type(i, v); await key(i, 'Enter') }
    const email = panel()!.querySelector('input[type="email"]') as HTMLInputElement
    await type(email, 'not-an-email'); await key(email, 'Enter')
    expect(panel()!.textContent).toContain(s('err.email'))
    await type(email, 'a@gmail.com'); await key(email, 'Enter')
    // phone: optional and skippable (CT Round 5 ruling 2): a Skip chip
    await click(button(s('chip.skip')))
    const search = panel()!.querySelector('input[type="search"]') as HTMLInputElement
    await type(search, 'thai')
    await click(button('Thailand'))
    // review: every answer read back, each with its Edit control; nothing has been posted yet
    expect(panel()!.textContent).toContain(s('review.heading'))
    expect(panel()!.textContent).toContain('Fan blades')
    expect(panel()!.textContent).toContain('Thailand')
    expect(host.querySelectorAll(`button[aria-label^="${s('review.edit')}:"]`).length).toBe(6)
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/api/rfq/token/'])
    await click(button(s('review.send')))
    const body = JSON.parse((fetcher.mock.calls.find((c) => c[0] === '/api/rfq/submit/') as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ source: 'NATIVE_CHAT', registryVersion: reg.registryVersion, locale: 'en', answers: { purpose: 'parts', parts_part: 'Fan blades', name: 'A Person', company: 'Plant Co', email: 'a@gmail.com', country: 'TH' }, context: { page_path: '/', context_type: 'page', cta_placement: 'launcher' }, antiAbuse: { formToken: 'tok', hp: '' } })
    expect(Object.keys(body.answers)).not.toContain('parts_model')
    expect(panel()!.textContent).toContain(s('confirm.body', { rfq_number: 'RFQ-20261005-7K3M9QX2' }))
    expect(panel()!.textContent).toContain(s('confirm.attachments'))
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('an RFQ control opens the panel with its context (shown once, never asked); Escape closes and focus returns to it', async () => {
    await act(async () => root.render(<><NativeRfqTrigger placement="rfq_page" context={{ context_type: 'product', context_id: '4765', product_id: '4765', product_slug: 'site-assembly', page_path: '/product/site-assembly/' }} contextLabel="Site Assembly">Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} fetcher={api(() => json(500, {})) as never}/></>))
    const link = host.querySelector('a[data-rfq-native]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/contact-us/#request-a-quote')
    link.focus()
    await click(link)
    expect(panel()).not.toBeNull()
    expect(log()).toContain(s('context.note', { context_label: 'Site Assembly' }))
    await key(panel()!, 'Escape')
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(link)
  })

  it('Tab stays inside the panel', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const items = [...panel()!.querySelectorAll<HTMLElement>('button, input:not([tabindex="-1"]), a[href]')]
    items.at(-1)!.focus()
    await key(items.at(-1)!, 'Tab')
    expect(document.activeElement).toBe(items[0])
    await key(items[0]!, 'Tab', true)
    expect(document.activeElement).toBe(items.at(-1))
  })

  it('closing keeps the draft; reopening offers to continue or start over', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(s('purpose.chip.repair')))
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toMatchObject({ answers: { purpose: 'repair' }, source: 'NATIVE_CHAT' })
    await click(button(s('panel.close.aria')))
    expect(panel()).toBeNull()
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(log()).toContain(s('resume.prompt'))
    await click(button(s('resume.continue')))
    expect(log()).toContain(s('service.issue.q'))
  })

  it('a send in flight cannot be sent twice; a failure keeps the draft and says so; the honeypot is hidden from people', async () => {
    let release: (r: Response) => void = () => {}
    const fetcher = api(() => new Promise<Response>((r) => { release = r }))
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: 'sub-1', registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'Basin repair', notes: '', name: 'A', company: 'B', email: 'a@b.co', phone: '', country: 'US' }, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(s('resume.continue')))
    const hp = panel()!.querySelector('input[name="company_website"]') as HTMLInputElement
    expect(hp.tabIndex).toBe(-1)
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull()
    const send = button(s('review.send'))
    await act(async () => { send.click() })
    expect(button(s('review.sending')).disabled).toBe(true)
    await act(async () => { button(s('review.sending')).click() })
    expect(fetcher.mock.calls.filter((c) => c[0] === '/api/rfq/submit/')).toHaveLength(1)
    await act(async () => { release(json(500, { ok: false, code: 'SERVER' })) })
    await flush()
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(s('err.server', { offices_link: s('offices.link_text') }))
    expect(panel()!.querySelector('[role="alert"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
    expect(panel()!.querySelector('[role="alert"] a')?.textContent).toBe(s('offices.link_text'))
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).submissionId).toBe('sub-1')
  })

  it('a null RFQ number shows the no-number confirmation (contract amendment (a))', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: 'sub-2', registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'X', notes: '', name: 'A', company: 'B', email: 'a@b.co', phone: '', country: 'US' }, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={api(() => json(200, { ok: true, rfqNumber: null, replay: false })) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(s('resume.continue')))
    await click(button(s('review.send')))
    expect(panel()!.textContent).toContain(s('confirm.body_no_number'))
  })

  it('a registry that is off shows the unavailable line with the offices link (R5.1); unreachable shows no question', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => ({ ...reg, enabled: false })} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(log()).not.toContain(s('purpose.q'))
    expect(log()).toBe(s('panel.unavailable', { offices_link: s('offices.link_text') }))
    expect(panel()!.querySelector('[role="log"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => null} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(log()).not.toContain(s('purpose.q'))
    expect(panel()!.querySelector('[role="log"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
  })

  it('first touch survives navigation: the landing page’s tags are sent from a later page (R5.1)', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-3', replay: false }))
    window.history.replaceState(null, '', '/fans/?utm_source=ads&utm_campaign=q4&gclid=abc')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={fetcher as never}/>))
    expect(JSON.parse(sessionStorage.getItem('h2o.rfq.attr.v1')!)).toMatchObject({ utm_source: 'ads', utm_campaign: 'q4', gclid: 'abc', landing_page: '/fans/' })
    expect(fetcher).not.toHaveBeenCalled() // nothing is sent before submit
    // a later page in the same session
    await act(async () => root.unmount())
    window.history.replaceState(null, '', '/contact-us/')
    root = createRoot(host)
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: 'sub-3', registryVersion: reg.registryVersion, step: 'review', answers: { purpose: 'other', other_need: 'X', notes: '', name: 'A', company: 'B', email: 'a@b.co', phone: '', country: 'US' }, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} fetcher={fetcher as never}/>))
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
    await act(async () => root.render(<><main><h1>Cooling Tower   Fans</h1></main><NativeRfqTrigger placement="editorial_inline" context={{ context_type: 'page', page_path: '/fans/' }}>Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} fetcher={fetcher as never}/></>))
    await click(host.querySelector('a[data-rfq-native]'))
    expect(log()).toContain(s('context.note', { context_label: 'Cooling Tower Fans' }))
  })
})

describe('inline form (NATIVE_FORM)', () => {
  it('validates everything at once (form wording, focus on the first error), then reviews and sends as NATIVE_FORM', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-9', replay: false }))
    await act(async () => root.render(<NativeRfqForm loader={loader} fetcher={fetcher as never}/>))
    await flush()
    const form = host.querySelector('form')!
    expect([...form.querySelectorAll('legend, label')].map((l) => l.textContent)).toContain(s('purpose.q'))
    await click(button(s('review.heading')) ?? form.querySelector('button[type="submit"]'))
    expect(form.textContent).toContain(s('err.required.form'))
    expect((document.activeElement as HTMLInputElement).name).toBe('rfq-form-purpose')
    await click(form.querySelector('input[value="new_tower"]'))
    await click(form.querySelector('input[name="rfq-form-towers_type"][value="crossflow"]'))
    for (const [n, v] of [['name', 'A'], ['company', 'B'], ['email', 'a@b.co']]) await type(form.querySelector(`[name="${n}"]`) as HTMLInputElement, v)
    await act(async () => { const sel = form.querySelector('select[name="country"]') as HTMLSelectElement; sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { form.requestSubmit() })
    await flush()
    expect(host.querySelector('h3')?.textContent).toBe(s('review.heading'))
    expect(host.textContent).toContain('Crossflow')
    await click(button(s('review.send')))
    const body = JSON.parse((fetcher.mock.calls.find((c) => c[0] === '/api/rfq/submit/') as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ source: 'NATIVE_FORM', answers: { purpose: 'new_tower', towers_type: 'crossflow', name: 'A', company: 'B', email: 'a@b.co', country: 'US' }, context: { page_path: '/contact-us/', cta_placement: 'contact_form' } })
    expect(host.textContent).toContain(s('confirm.body', { rfq_number: 'RFQ-9' }))
  })
})

it('the open event is the only coupling between a control and the panel', () => {
  expect(RFQ_OPEN_EVENT).toBe('h2o:rfq-open')
})
