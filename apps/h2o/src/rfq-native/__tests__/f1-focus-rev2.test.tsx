// @vitest-environment happy-dom
/**
 * 1.3a-F1 revision 2 (INTEGRATOR blocker, 2026-10-15): the early email check on blur must not move focus. After an invalid email,
 * moving on to the next field kept snapping focus back to the email field (the first-error focus effect followed ANY change of
 * the errors, and the blur check replaces them). Focus now goes to the first error only after a check of the whole form
 * ("Review and send" with errors) or a server refusal; the error text and aria attributes still appear on blur.
 * Real focus moves (element.focus()), not only synthetic blur events.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry } from '../registry'
import { NativeRfq } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const NO_WAIT = { sleep: async () => {} }
const reg = fixtureRegistry()
const loader = async () => reg
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const api = () => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok' }) : json(200, { ok: true, rfqNumber: 'RFQ-F1', replay: false })))
const s = (k: string) => reg.strings[k]!
let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const focus = async (el: HTMLElement) => { await act(async () => { el.focus() }); await flush() }
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }

beforeEach(() => { sessionStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const renderForm = async () => {
  await act(async () => root.render(<NativeRfqForm loader={loader} timing={NO_WAIT} fetcher={api() as never}/>))
  await flush()
  return host.querySelector('form') as HTMLFormElement
}
const field = (form: Element, name: string) => form.querySelector(`[name="${name}"]`) as HTMLInputElement
const errorOf = (form: Element, name: string) => form.querySelector(`[data-rfq-field="${name}"] p[class*="error"]`)?.textContent ?? null
const submit = (form: Element) => form.querySelector('button[type="submit"]') as HTMLButtonElement

describe('1.3a-F1 rev2 inline form: leaving an invalid email never takes focus back', () => {
  it('moving on to the next input, twice, keeps focus there; the error text and aria attributes are on the email field', async () => {
    const form = await renderForm()
    for (let round = 0; round < 2; round++) {
      await focus(field(form, 'email'))
      await type(field(form, 'email'), 'notanemail')
      await focus(field(form, 'first_name')) // a real focus move: the email field loses focus to the next input
      expect(document.activeElement, `round ${round + 1}`).toBe(field(form, 'first_name'))
      expect(errorOf(form, 'email')).toBe(s('err.email'))
      expect(field(form, 'email').getAttribute('aria-invalid')).toBe('true')
      const errorId = form.querySelector('[data-rfq-field="email"] p[class*="error"]')!.id
      expect(field(form, 'email').getAttribute('aria-describedby')).toContain(errorId)
    }
  })
  it('the visitor can keep going: next input, then the one after, with the email error still shown and focus where they put it', async () => {
    const form = await renderForm()
    await focus(field(form, 'email'))
    await type(field(form, 'email'), 'notanemail')
    await focus(field(form, 'first_name'))
    await type(field(form, 'first_name'), 'Ana')
    await focus(field(form, 'last_name'))
    expect(document.activeElement).toBe(field(form, 'last_name'))
    await focus(field(form, 'company'))
    expect(document.activeElement).toBe(field(form, 'company'))
    expect(errorOf(form, 'email')).toBe(s('err.email'))
  })
  it('focus going to the Review button keeps the existing exception: no early check, focus stays on the button', async () => {
    const form = await renderForm()
    await focus(field(form, 'email'))
    await type(field(form, 'email'), 'notanemail')
    await focus(submit(form))
    expect(document.activeElement).toBe(submit(form))
    expect(errorOf(form, 'email')).toBeNull() // the submit checks everything itself
  })
  it('submitting with errors still focuses the FIRST invalid field (email), and only then', async () => {
    const form = await renderForm()
    await focus(field(form, 'first_name'))
    await type(field(form, 'email'), 'notanemail')
    await focus(submit(form))
    await click(submit(form))
    expect(errorOf(form, 'email')).toBe(s('err.email'))
    expect(document.activeElement).toBe(field(form, 'email'))
    // after that the visitor moves on freely: leaving the email again (still invalid) does not pull focus back
    await focus(field(form, 'first_name'))
    expect(document.activeElement).toBe(field(form, 'first_name'))
  })
  it('editing one field while another is still in error does not move focus to the other', async () => {
    const form = await renderForm()
    await type(field(form, 'email'), 'notanemail')
    await focus(submit(form))
    await click(submit(form)) // several fields now in error; focus on the first
    await focus(field(form, 'first_name'))
    await type(field(form, 'first_name'), 'Ana') // clears first_name's own error; email's stays
    expect(document.activeElement).toBe(field(form, 'first_name'))
  })
})

describe('1.3a-F1 rev2 chat: the same pattern is absent (the chat\'s focus follows the step, never the errors)', () => {
  it('after an invalid email is flagged on blur, focus is not pulled back to the input', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const d = host.querySelector('[role="dialog"]') as HTMLElement
    const input = () => d.querySelector('[data-rfq-step] input') as HTMLInputElement
    await focus(input())
    await type(input(), 'notanemail')
    await act(async () => { input().blur() })
    await flush()
    expect(d.querySelector('[role="alert"]')?.textContent).toBe(reg.strings['chat.err.email'])
    expect(document.activeElement).not.toBe(input())
  })
})
