// @vitest-environment happy-dom
/**
 * CHAT-COPY-1: the corner chat asks in OGCS's friendly voice (chat.<key>); the inline /contact-us/ form keeps its labels; strings only.
 */
import { createHash } from 'node:crypto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry, CHAT_COPY_1_STRINGS } from '../registry'
import { NativeRfq } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'
import { Confirmation } from '../fields'
import { tc } from '../model'
import { DRAFT_KEY } from '../draft'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const reg = fixtureRegistry()
const NO_WAIT = { sleep: async () => {} }
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const api = () => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok' }) : json(200, { ok: true, rfqNumber: 'RFQ-1', replay: false })))
let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
const type = async (el: HTMLInputElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }) }
beforeEach(() => { sessionStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('the approved rows', () => {
  it('are exactly OGCS\'s 33 rows (pinned by content hash) and the headline questions read as asked', () => {
    expect(Object.keys(CHAT_COPY_1_STRINGS)).toHaveLength(33)
    expect(createHash('sha256').update(JSON.stringify(CHAT_COPY_1_STRINGS)).digest('hex').slice(0, 12)).toBe('758060f420ac')
    const s = reg.strings
    expect(s['chat.contact.email.q']).toBe("What's your email address?")
    expect(s['chat.contact.first_name.q']).toBe('And your first name?')
    expect(s['chat.contact.last_name.q']).toBe('And your last name? You can skip this.')
    expect(s['chat.contact.company.q']).toBe('Which company are you with?')
    expect(s['chat.purpose.q']).toBe('What can we help you with?')
    expect(s['chat.contact.phone.q']).toBe("What's the best phone number to reach you? This is optional.")
    expect(s['chat.contact.country.q']).toBe('Which country are you in?')
    expect(s['chat.confirm.body']).toBe('Your RFQ number is {{rfq_number}}. A member of our team will review your request and be in touch.')
  })
  it('no exclamation marks or emoji; placeholders intact; skippable questions say "You can skip this"; no response-time promise; the privacy note and err.phone are untouched', () => {
    for (const [k, v] of Object.entries(CHAT_COPY_1_STRINGS)) {
      expect(v, k).not.toMatch(/!|\p{Extended_Pictographic}/u)
      expect(v, k).not.toMatch(/business day|within \d|hours?\b/i)
    }
    expect(CHAT_COPY_1_STRINGS['chat.confirm.body']).toContain('{{rfq_number}}')
    expect(CHAT_COPY_1_STRINGS['chat.err.too_long']).toContain('{{max}}')
    expect(CHAT_COPY_1_STRINGS['chat.err.rate_limited']).toContain('{{offices_link}}')
    for (const q of reg.questions.filter((x) => x.skippable)) { const v = reg.strings[`chat.${q.labelKey}`]; if (v) expect(v, q.id).toMatch(/skip|optional/i) }
    expect(Object.keys(CHAT_COPY_1_STRINGS).filter((k) => /privacy|err\.phone|err\.server|response_time|chip|input|launcher|panel/.test(k))).toEqual([])
  })
  it('tc falls back to the shared text when a chat row does not exist', () => {
    expect(tc(reg, 'towers.type.q')).toBe(reg.strings['towers.type.q'])
    expect(tc(reg, 'err.phone')).toBe(reg.strings['err.phone'])
    expect(tc(reg, 'contact.email.q')).toBe("What's your email address?")
  })
})

describe('the chat speaks; the inline form does not change', () => {
  it('chat: the first question is the friendly email prompt, the greeting is warmer, the skippable last-name prompt says so', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const log = () => host.querySelector('[role="log"]')!.textContent ?? ''
    expect(log()).toContain(reg.strings['chat.greeting'])
    expect(log()).toContain("What's your email address?")
    const input = host.querySelector('[role="dialog"] input:not([type="hidden"]):not([tabindex="-1"])') as HTMLInputElement
    await type(input, 'ana@gmail.com')
    await click(host.querySelector(`button[aria-label="${reg.strings['input.send.aria']}"]`))
    expect(log()).toContain('And your first name?')
    await type(host.querySelector('[role="dialog"] input:not([type="hidden"]):not([tabindex="-1"])') as HTMLInputElement, 'Ana')
    await click(host.querySelector(`button[aria-label="${reg.strings['input.send.aria']}"]`))
    expect(log()).toContain('And your last name? You can skip this.')
  })
  it('chat: a bad email shows the warmer error; translate="no" and the roots are untouched', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await type(host.querySelector('[role="dialog"] input:not([type="hidden"]):not([tabindex="-1"])') as HTMLInputElement, 'nope')
    await click(host.querySelector(`button[aria-label="${reg.strings['input.send.aria']}"]`))
    expect(host.querySelector('[role="alert"]')!.textContent).toBe(reg.strings['chat.err.email'])
    expect(host.querySelector('[role="dialog"]')!.getAttribute('translate')).toBe('no')
  })
  it('inline form: labels are exactly as before', async () => {
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await flush()
    const labels = [...host.querySelectorAll('legend, label')].map((l) => l.textContent)
    for (const key of ['contact.email.q', 'contact.first_name.q', 'contact.last_name.q', 'contact.company.q', 'purpose.q']) expect(labels.some((l) => l?.startsWith(reg.strings[key]!)), key).toBe(true)
    expect(labels.join('|')).not.toMatch(/What's your email address|Which company are you with|And your first name/)
  })
  it('chat confirmation uses the warmer lines; with the customer acknowledgement OFF the "email us at" attachments line is kept (a reply would not reach us)', async () => {
    await act(async () => root.render(<Confirmation reg={reg} rfqNumber="RFQ-1" chat/>))
    expect(host.textContent).toContain(reg.strings['chat.confirm.heading'])
    expect(host.textContent).toContain('Your RFQ number is RFQ-1. A member of our team will review your request and be in touch.')
    const off = { ...reg, strings: { ...reg.strings, 'confirm.attachments': 'You can email photos or drawings to {{sales_email}}. Please include your RFQ number, {{rfq_number}}.' } }
    await act(async () => root.render(<Confirmation reg={off} rfqNumber="RFQ-1" chat/>))
    expect(host.textContent).not.toContain('replying to our email')
    expect(host.textContent).toContain('You can email photos or drawings to')
  })
  void DRAFT_KEY
})
