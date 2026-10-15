// @vitest-environment happy-dom
/**
 * 1.3a-F1 (CT-1, 2026-10-15): the quote form's email is checked when the visitor leaves the field (inline form and chat), with
 * the registry's own message; required questions are marked and optional ones say "(optional)"; the inline form's first button
 * says "Review and send" (it opens the review screen, whose button sends) and the chat's last button says "Send request".
 * No change to questions, their order, the answers sent, the honeypot or the intake API.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry } from '../registry'
import { NativeRfq } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'
import { questionsFor } from '../flow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const NO_WAIT = { sleep: async () => {} }
const reg = fixtureRegistry()
const loader = async () => reg
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const api = () => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok' }) : json(200, { ok: true, rfqNumber: 'RFQ-F1', replay: false })))
const s = (k: string, v: Record<string, string> = {}) => reg.strings[k]!.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '')
let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
/** React's onBlur listens to `focusout`; `to` is where focus is going (a button, say). */
const leave = async (el: Element, to: Element | null = null) => { await act(async () => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to })) }); await flush() }
const key = async (target: Element, k: string) => { await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) }); await flush() }

beforeEach(() => { sessionStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const renderForm = async (fetcher = api()) => {
  await act(async () => root.render(<NativeRfqForm loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
  await flush()
  return host.querySelector('form') as HTMLFormElement
}
const emailField = (form: Element) => form.querySelector('[name="email"]') as HTMLInputElement
// the error line is the field's paragraph with the error class (the hint paragraph carries an id too)
const errorEl = (form: Element, name: string) => form.querySelector(`[data-rfq-field="${name}"] p[class*="error"]`)
const errorOf = (form: Element, name: string) => errorEl(form, name)?.textContent ?? null

describe('1.3a-F1 inline form: the email is checked when the visitor leaves the field', () => {
  it('a mistyped address shows the registry message on blur, tied to the field, and not the "required" message', async () => {
    const form = await renderForm()
    await type(emailField(form), 'notanemail')
    expect(errorOf(form, 'email')).toBeNull() // nothing while typing
    await leave(emailField(form))
    expect(errorOf(form, 'email')).toBe(s('err.email'))
    expect(s('err.email')).toBe('Please enter a valid email address, for example name@company.com.')
    expect(errorOf(form, 'email')).not.toContain('required')
    const input = emailField(form)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain(errorEl(form, 'email')!.id)
  })

  it('a blank email is not flagged on blur (it waits for the submit); a good one is never flagged', async () => {
    const form = await renderForm()
    await leave(emailField(form))
    expect(errorOf(form, 'email')).toBeNull()
    await type(emailField(form), 'a@b.co')
    await leave(emailField(form))
    expect(errorOf(form, 'email')).toBeNull()
    expect(emailField(form).getAttribute('aria-invalid')).toBeNull()
  })

  it('editing the field clears its message; leaving it again re-checks; a good address leaves no message', async () => {
    const form = await renderForm()
    await type(emailField(form), 'notanemail')
    await leave(emailField(form))
    expect(errorOf(form, 'email')).toBe(s('err.email'))
    await type(emailField(form), 'notanemail2')
    expect(errorOf(form, 'email')).toBeNull() // cleared as it is edited
    await leave(emailField(form))
    expect(errorOf(form, 'email')).toBe(s('err.email'))
    await type(emailField(form), 'name@company.com')
    await leave(emailField(form))
    expect(errorOf(form, 'email')).toBeNull()
  })

  it('only the email is checked early: another field left blank or badly filled shows nothing until the submit', async () => {
    const form = await renderForm()
    const company = form.querySelector('[name="company"]') as HTMLInputElement
    await leave(company)
    expect(errorOf(form, 'company')).toBeNull()
    const phone = form.querySelector('[name="phone"]') as HTMLInputElement
    await type(phone, 'abc')
    await leave(phone)
    expect(errorOf(form, 'phone')).toBeNull()
  })

  it('focus moving straight to a button (the submit) skips the early check: the submit checks it, and nothing shifts under the click', async () => {
    const form = await renderForm()
    await type(emailField(form), 'notanemail')
    await leave(emailField(form), form.querySelector('button[type="submit"]'))
    expect(errorOf(form, 'email')).toBeNull()
    await act(async () => { form.requestSubmit() })
    await flush()
    expect(errorOf(form, 'email')).toBe(s('err.email'))
  })

  it('the submit gives a mistyped address the format message, and a blank one the required message (the right message for the right problem)', async () => {
    const form = await renderForm()
    await type(emailField(form), 'notanemail')
    await act(async () => { form.requestSubmit() })
    await flush()
    expect(errorOf(form, 'email')).toBe(s('err.email'))
    expect(errorOf(form, 'email')).not.toBe(s('err.required.form'))
    expect((document.activeElement as HTMLInputElement).name).toBe('email') // focus goes to the first field in error
    await type(emailField(form), '')
    await act(async () => { form.requestSubmit() })
    await flush()
    expect(errorOf(form, 'email')).toBe(s('err.required.form'))
  })
})

describe('1.3a-F1 inline form: required and optional marks, and the button', () => {
  it('every required question carries the star (aria-hidden) and every optional one says "(optional)" exactly once', async () => {
    const form = await renderForm()
    expect(form.textContent).toContain(s('form.required.note'))
    const check = async () => {
      for (const q of questionsFor(reg, answersNow)) {
        const field = form.querySelector(`[data-rfq-field="${q.id}"]`)!
        const label = field.querySelector('label, legend')!
        const star = label.querySelector('[aria-hidden="true"]')
        const text = (label.textContent ?? '').trim()
        if (q.required) {
          expect(star?.textContent?.trim(), `${q.id} star`).toBe(s('form.required.mark'))
          expect(text, q.id).not.toMatch(/optional/i)
        } else {
          expect(star, `${q.id} has no star`).toBeNull()
          expect((text.match(/\(optional\)/gi) ?? []).length, `${q.id} says (optional) once`).toBe(1)
        }
      }
    }
    let answersNow: Record<string, string> = {}
    await check() // the questions asked before a purpose is chosen
    for (const purpose of ['parts', 'new_tower', 'repair', 'other']) {
      await click(form.querySelector(`input[name="rfq-form-purpose"][value="${purpose}"]`))
      answersNow = { purpose }
      await check()
    }
  })

  it('known fields: email, name, company, country and the purpose are starred; last name, phone and notes are optional (phone not doubled)', async () => {
    const form = await renderForm()
    const label = (name: string) => (form.querySelector(`[data-rfq-field="${name}"] label, [data-rfq-field="${name}"] legend`)?.textContent ?? '').trim()
    for (const n of ['email', 'first_name', 'company', 'country', 'purpose']) expect(label(n), n).toContain('*')
    expect(label('last_name')).toBe(`${s('contact.last_name.q')} ${s('form.optional.suffix')}`)
    expect(label('phone')).toBe(s('contact.phone.q')) // its own label already says "(optional)"
    expect(s('contact.phone.q')).toContain('(optional)')
    await click(form.querySelector('input[name="rfq-form-purpose"][value="other"]'))
    expect(label('notes')).toContain('(optional)')
    expect(label('other_need')).toContain('*')
  })

  it('the first button says "Review and send" and opens the review; the review screen\'s own button is "Send request" and sends', async () => {
    expect(s('form.continue')).toBe('Review and send')
    const fetcher = api()
    const form = await renderForm(fetcher)
    expect(form.querySelector('button[type="submit"]')!.textContent).toBe('Review and send')
    expect([...form.querySelectorAll('button')].some((b) => b.textContent === 'Send request')).toBe(false)
    await click(form.querySelector('input[name="rfq-form-purpose"][value="other"]'))
    for (const [n, v] of [['first_name', 'A'], ['company', 'B'], ['email', 'a@b.co'], ['other_need', 'Basin repair']]) await type(form.querySelector(`[name="${n}"]`) as HTMLInputElement, v)
    await act(async () => { const sel = form.querySelector('select[name="country"]') as HTMLSelectElement; sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { form.requestSubmit() })
    await flush()
    expect(host.querySelector('h3')?.textContent).toBe(s('review.heading'))
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/api/rfq/token/']) // nothing sent yet
    const send = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Send request')!
    expect(send).toBeDefined()
    await click(send)
    const body = JSON.parse((fetcher.mock.calls.find((c) => c[0] === '/api/rfq/submit/') as unknown as [string, RequestInit])[1].body as string)
    // the answers sent are exactly the questions asked: no new key
    expect(Object.keys(body.answers).sort()).toEqual(['company', 'country', 'email', 'first_name', 'other_need', 'purpose'])
    expect(host.textContent).toContain(s('confirm.body', { rfq_number: 'RFQ-F1' }))
  })

  it('the marks are registry strings only: the questions, their order and the notice are unchanged', () => {
    const base = questionsFor(reg, {}).map((q) => `${q.id}:${q.required}`)
    expect(base).toEqual(['email:true', 'first_name:true', 'last_name:false', 'company:true', 'purpose:true', 'phone:false', 'country:true'])
    expect(reg.noticeVersion).toMatch(/^notice-[0-9a-f]{8}$/)
  })
})

describe('1.3a-F1 chat: the email is checked when the visitor leaves the field, and the last button says "Send request"', () => {
  const openChat = async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    return host.querySelector('[role="dialog"]') as HTMLElement
  }
  const input = (d: Element) => d.querySelector('[data-rfq-step] input') as HTMLInputElement

  it('a mistyped address is flagged on blur with the chat\'s message, announced; a good one clears it', async () => {
    const d = await openChat()
    await type(input(d), 'notanemail')
    expect(d.querySelector('[role="alert"]')).toBeNull()
    await leave(input(d))
    expect(d.querySelector('[role="alert"]')?.textContent).toBe(reg.strings['chat.err.email'])
    expect(input(d).getAttribute('aria-invalid')).toBe('true')
    await type(input(d), 'name@company.com')
    await leave(input(d))
    expect(d.querySelector('[role="alert"]')).toBeNull()
  })

  it('a blank email is not flagged on blur; focus going to OK skips the early check (OK checks it itself)', async () => {
    const d = await openChat()
    await leave(input(d))
    expect(d.querySelector('[role="alert"]')).toBeNull()
    await type(input(d), 'notanemail')
    const ok = [...d.querySelectorAll('button')].find((b) => b.textContent === s('chatflow.ok'))!
    await leave(input(d), ok)
    expect(d.querySelector('[role="alert"]')).toBeNull()
    await click(ok)
    expect(d.querySelector('[role="alert"]')?.textContent).toBe(reg.strings['chat.err.email'])
    await key(input(d), 'Enter')
    expect(d.querySelector('[data-rfq-step="email"]')).not.toBeNull() // still on the email step
  })

  it('the chat\'s final button is "Send request" (was "Submit")', async () => {
    expect(s('chatflow.submit')).toBe('Send request')
    const d = await openChat()
    const fill = async (v: string) => { await type(d.querySelector('[data-rfq-step] input, [data-rfq-step] textarea') as HTMLInputElement, v); await key(d.querySelector('[data-rfq-step] input, [data-rfq-step] textarea')!, 'Enter') }
    await fill('a@b.co'); await fill('Ana'); await fill('Ruiz')
    await click([...d.querySelectorAll('button')].find((b) => b.textContent === s('chatflow.skip'))!) // company
    await click([...d.querySelectorAll('button')].find((b) => b.textContent === s('chatflow.purpose.chip.repair'))!)
    for (let i = 0; i < 3; i++) await click([...d.querySelectorAll('button')].find((b) => b.textContent === s('chatflow.skip'))!) // details, phone, country
    expect(d.querySelector('[data-rfq-step="notes"]')).not.toBeNull()
    const labels = [...d.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toContain('Send request')
    expect(labels).not.toContain('Submit')
  })
})
