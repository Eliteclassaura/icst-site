// @vitest-environment happy-dom
/**
 * LANG-2 B1 (Auditor): visitor-typed values must never go to, or be rewritten by, in-page machine translation. The panel and
 * form roots, the review values, the chat answers and the echoed reference number carry translate="no" statically; labels
 * stay translatable. Also: the chat's close control is a 44px target.
 */
import { act } from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry } from '../registry'
import { NativeRfq } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'
import { DRAFT_KEY } from '../draft'
import { Confirmation, ReviewList } from '../fields'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const reg = fixtureRegistry()
const NO_WAIT = { sleep: async () => {} }
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const api = () => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok' }) : json(200, { ok: true, rfqNumber: 'RFQ-20261008-ABCD1234', replay: false })))
const answers = { email: 'a@b.co', first_name: 'Ana', last_name: 'Lee', company: 'Basin Co', purpose: 'other', other_need: 'Basin repair', phone: '+1 555 0100', country: 'US', notes: 'Please call' }
const reviewDraft = { submissionId: 'sub-t', registryVersion: reg.registryVersion, step: 'review', answers }
let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement
const noTranslate = (el: Element | null) => el?.getAttribute('translate') === 'no' && el.classList.contains('notranslate')
beforeEach(() => { sessionStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('translate="no" (LANG-2 B1)', () => {
  it('review step values carry it and the labels do not', async () => {
    await act(async () => root.render(<ReviewList reg={reg} answers={answers} onEdit={() => {}}/>))
    const dds = [...host.querySelectorAll('dd')]
    expect(dds.length).toBeGreaterThan(5)
    for (const dd of dds) expect(noTranslate(dd.querySelector('span'))).toBe(true)
    const texts = dds.map((d) => d.querySelector('span')!.textContent)
    expect(texts).toEqual(expect.arrayContaining(['a@b.co', 'Basin Co']))
    for (const dt of host.querySelectorAll('dt')) expect(dt.closest('[translate="no"]')).toBeNull()
  })
  it('chat: panel root, overlay, transcript and review values are not translatable', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...reviewDraft, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(reg.strings['resume.continue']!))
    expect(noTranslate(host.querySelector('[role="dialog"]'))).toBe(true)
    expect(noTranslate(host.querySelector('[role="dialog"]')!.parentElement)).toBe(true)
    expect(noTranslate(host.querySelector('[role="log"]'))).toBe(true)
    for (const dd of host.querySelectorAll('dd')) expect(dd.querySelector('span')!.closest('[translate="no"]')).not.toBeNull()
    expect(host.querySelector('[data-rfq-launcher]')!.closest('[translate="no"]')).toBeNull() // the launcher label may be translated
  })
  it('chat: each echoed answer in the transcript is marked', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const input = host.querySelector('[role="dialog"] input:not([type="hidden"]):not([tabindex="-1"])') as HTMLInputElement
    await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!.call(input, 'ana@gmail.com'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await click(host.querySelector(`button[aria-label="${reg.strings['input.send.aria']}"]`))
    const me = [...host.querySelectorAll('[role="log"] p')].filter((p) => p.textContent === 'ana@gmail.com')
    expect(me.length).toBe(1)
    expect(noTranslate(me[0]!)).toBe(true)
  })
  it('inline form: every root (form, review, confirmation) is not translatable', async () => {
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await flush()
    expect(noTranslate(host.querySelector('form'))).toBe(true)
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...reviewDraft, source: 'NATIVE_FORM' }))
    await act(async () => root.unmount()); root = createRoot(host)
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await flush()
    await act(async () => { host.querySelector('form')!.requestSubmit() })
    await flush()
    expect(noTranslate(host.querySelector('section'))).toBe(true)
    await click(button(reg.strings['review.send']!))
    expect(host.textContent).toContain('RFQ-20261008-ABCD1234')
    expect(noTranslate(host.querySelector('section'))).toBe(true)
  })
  it('confirmation: the reference number is wrapped, the sentence stays translatable', async () => {
    await act(async () => root.render(<Confirmation reg={reg} rfqNumber="RFQ-20261008-ABCD1234"/>))
    const span = host.querySelector('span[translate="no"]')!
    expect(span.textContent).toBe('RFQ-20261008-ABCD1234')
    expect(span.className).toContain('notranslate')
    expect(host.querySelector('.notranslate')).toBe(span)
  })
})

describe('chat close control', () => {
  it('is a 44x44 target', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/rfq-native/NativeRfq.module.css'), 'utf8')
    const rule = css.match(/\n\.close \{([^}]*)\}/)![1]!
    expect(rule).toMatch(/inline-size:\s*44px/)
    expect(rule).toMatch(/block-size:\s*44px/)
  })
})
