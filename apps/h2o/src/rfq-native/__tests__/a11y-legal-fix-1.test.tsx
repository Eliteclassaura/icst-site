// @vitest-environment happy-dom
/**
 * LEGAL-FIX-1 (legal/accessibility review L08; WCAG 2.4.3 Focus Order, 4.1.2 Name/Role/Value, 4.1.3 Status Messages): the
 * native RFQ panel makes the rest of the page inert while it is open and restores it on close (Escape returns focus to the
 * opener); the review step moves focus to its heading in the panel and in the inline form; the inline form returns focus to
 * the edited field and moves it to the confirmation once sent; chat errors are announced.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry } from '../registry'
import { NativeRfq } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'
import { NativeRfqTrigger } from '../NativeRfqTrigger'

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
const key = async (target: Element, k: string) => { await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }); await flush() }
const panel = () => host.querySelector('[role="dialog"]') as HTMLElement | null
const s = (k: string) => reg.strings[k]!
/** CHAT-COPY-1: the chat's own wording */
const sc = (k: string) => reg.strings[`chat.${k}`] ?? reg.strings[k]!

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

describe('corner panel', () => {
  it('while open, the page around it is inert; Escape restores it and returns focus to the opener', async () => {
    const outside = document.createElement('main')
    outside.innerHTML = '<a href="/x">Page link</a>'
    document.body.insertBefore(outside, host)
    await act(async () => root.render(<><NativeRfqTrigger placement="rfq_page" context={{ context_type: 'page', page_path: '/contact-us/' }}>Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/></>))
    const trigger = host.querySelector('a[data-rfq-native]') as HTMLAnchorElement
    trigger.focus()
    await click(trigger)
    expect(panel()?.getAttribute('aria-modal')).toBe('true')
    expect(outside.inert).toBe(true)
    expect(trigger.inert).toBe(true)
    expect(panel()!.inert).toBe(false)
    expect(panel()!.closest('[inert]')).toBeNull()
    await key(panel()!, 'Escape')
    expect(panel()).toBeNull()
    expect(outside.inert).toBe(false)
    expect(trigger.inert).toBe(false)
    expect(document.activeElement).toBe(trigger)
    outside.remove()
  })
  it('a chat answer error is announced (role="alert"); the review step takes focus on its heading', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    // RFQ-FIX-1.1: email, first name, last name and company come first
    const emailBox = panel()!.querySelector('input[type="email"]') as HTMLInputElement
    await type(emailBox, 'a@b.co'); await key(emailBox, 'Enter')
    for (const v of ['A', 'B', 'Plant Co']) { const i = panel()!.querySelector('input[type="text"]') as HTMLInputElement; await type(i, v); await key(i, 'Enter') }
    await click(button(s('purpose.chip.parts')))
    const box = panel()!.querySelector('input[type="text"]') as HTMLInputElement
    await type(box, '')
    await key(box, 'Enter')
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.required'))
    await type(box, 'Fan blades'); await key(box, 'Enter')
    for (let i = 0; i < 3; i++) await click(button(s('chip.skip'))) // model, quantity, phone
    const search = panel()!.querySelector('input[type="search"]') as HTMLInputElement
    await type(search, 'thai')
    await click(button('Thailand'))
    await click(button(s('chip.skip'))) // notes (the message), last
    expect(document.activeElement?.tagName).toBe('H3')
    expect(document.activeElement?.textContent).toBe(sc('review.heading'))
  })
})

describe('inline form', () => {
  it('review takes focus on its heading; Edit returns focus to that field; the confirmation takes focus once sent', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-9', replay: false }))
    await act(async () => root.render(<NativeRfqForm loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await flush()
    const form = () => host.querySelector('form')!
    await click(form().querySelector('input[value="new_tower"]'))
    await click(form().querySelector('input[name="rfq-form-towers_type"][value="crossflow"]'))
    for (const [n, v] of [['first_name', 'A'], ['company', 'B'], ['email', 'a@b.co']]) await type(form().querySelector(`[name="${n}"]`) as HTMLInputElement, v)
    await act(async () => { const sel = form().querySelector('select[name="country"]') as HTMLSelectElement; sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { form().requestSubmit() })
    await flush()
    expect(document.activeElement?.tagName).toBe('H3')
    expect(document.activeElement?.textContent).toBe(s('review.heading'))
    // Edit "Company": back to the form with focus on that field
    await click(host.querySelector(`button[aria-label="${s('review.edit')}: ${s('contact.company.q')}"]`))
    expect((document.activeElement as HTMLInputElement).name).toBe('company')
    // (Edit re-asks the question, so the field is answered again)
    await type(document.activeElement as HTMLInputElement, 'B2')
    await act(async () => { form().requestSubmit() })
    await flush()
    await click(button(s('review.send')))
    expect(document.activeElement?.tagName).toBe('SECTION')
    expect(document.activeElement?.getAttribute('aria-live')).toBe('polite')
    expect(document.activeElement?.textContent).toContain('RFQ-9')
  })
})
