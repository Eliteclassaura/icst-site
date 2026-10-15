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
import { ATTR_KEY } from '../attribution'

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

/** CHAT-FLOW-1: the step on screen — its question id, its question text, its answer field */
const stepId = () => panel()?.querySelector('[data-rfq-step]')?.getAttribute('data-rfq-step') ?? null
const question = () => (panel()?.querySelector('[data-rfq-step] h3 span:last-child')?.textContent ?? '').replace(/\*$/, '')
const field = () => panel()!.querySelector('[data-rfq-step] textarea, [data-rfq-step] input:not([type="search"])') as HTMLInputElement
const position = () => panel()?.querySelector('[data-rfq-step] p[id]')?.textContent ?? ''
const say = async (value: string) => { const f = field(); await type(f, value); await key(f, 'Enter') }
const submitted = (fetcher: { mock: { calls: unknown[][] } }) => fetcher.mock.calls.filter((c) => c[0] === '/api/rfq/submit/').map((c) => JSON.parse((c[1] as RequestInit).body as string))
/** a chat draft with every step answered (CHAT-FLOW-1 ids): reopening lands on Submit */
const fullDraft = (id: string, extra: Record<string, string> = {}) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: id, registryVersion: reg.registryVersion, step: 'review', answers: { email: 'a@b.co', first_name: 'A', last_name: 'Lee', company: 'B', purpose: 'other', details: 'Basin repair', phone: '', country: 'US', notes: '', ...extra }, source: 'NATIVE_CHAT' }))

describe('corner panel (NATIVE_CHAT), CHAT-FLOW-1: one numbered question per step, like the Typeform', () => {
  it('opens straight on question 1 (email, required) with the one-line notice; a parts request step by step; Back keeps answers; the last OK submits', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-20261009-7K3M9QX2', replay: false }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    const launcher = host.querySelector('[data-rfq-launcher]') as HTMLButtonElement
    expect(launcher.getAttribute('aria-label')).toBe(sc('launcher.aria'))
    await click(launcher)
    expect(panel()?.getAttribute('aria-modal')).toBe('true')
    expect(panel()?.querySelector('h2')?.textContent).toBe(sc('panel.title'))
    // no greeting and no privacy block up front: the first thing is question 1
    expect(panel()!.textContent).not.toContain(sc('greeting'))
    expect(panel()!.querySelector('details')).toBeNull()
    expect(stepId()).toBe('email')
    expect(question()).toBe(s('chatflow.email.q'))
    expect(panel()!.querySelector('[data-rfq-step] h3')?.textContent).toContain('*')
    expect(position()).toBe(s('chatflow.progress', { n: '1', total: '9' }))
    const email = field()
    expect(document.activeElement).toBe(email)
    expect([email.type, email.autocomplete, email.getAttribute('aria-required')]).toEqual(['email', 'email', 'true'])
    // the just-in-time notice under the email field: its "Privacy Notice" link opens the policy in a new tab
    const notice = panel()!.querySelector(`#${CSS.escape(email.getAttribute('aria-describedby')!.split(' ').at(-1)!)}`)!
    expect(notice.textContent).toBe(s('chatflow.email.notice', { privacy_policy_link: s('privacy.link_text') }))
    const link = notice.querySelector('a')!
    expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel'), link.textContent]).toEqual(['/privacy-policy/', '_blank', 'noopener noreferrer', 'Privacy Notice'])
    // email is the one required answer: no Skip; empty and malformed are refused in the chat's own words
    expect(button(s('chatflow.skip'))).toBeUndefined()
    await say('')
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.required'))
    await say('not-an-email')
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.email'))
    await say('a@gmail.com')
    expect(stepId()).toBe('first_name')
    expect(question()).toBe(s('chatflow.first_name.q'))
    expect(position()).toBe(s('chatflow.progress', { n: '2', total: '9' }))
    expect(field().autocomplete).toBe('given-name')
    // owner 2026-10-09: first and last name are required too (no Skip; empty is refused)
    expect(button(s('chatflow.skip'))).toBeUndefined()
    await say('')
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.required'))
    await say('Avery')
    expect(button(s('chatflow.skip'))).toBeUndefined()
    await say('Quinn')
    expect(question()).toBe(s('chatflow.company.q', { first: 'Avery' }))
    await say('Plant Co')
    expect(question()).toBe(s('chatflow.purpose.q', { first: 'Avery' }))
    expect(button(s('chatflow.skip'))).toBeUndefined() // the service is required
    // choices answer and move on (no OK needed); a parts request adds the part and the urgency steps
    await click(button(s('chatflow.purpose.chip.parts')))
    expect(stepId()).toBe('parts_part')
    expect(position()).toBe(s('chatflow.progress', { n: '6', total: '11' }))
    // Back: the previous step with its answer kept
    await click(button(s('chatflow.back')))
    expect(stepId()).toBe('purpose')
    expect(button(s('chatflow.purpose.chip.parts')).getAttribute('aria-pressed')).toBe('true')
    await click(button(s('chatflow.purpose.chip.parts')))
    expect(button(s('chatflow.skip'))).toBeUndefined() // so is the part, for a parts request
    await click(button(s('chatflow.parts_part.chip.fans')))
    expect(question()).toBe(s('chatflow.details.q', { subject: 'Fans' }))
    expect(field().tagName).toBe('TEXTAREA')
    await say('Model 3000, 12 ft')
    expect(question()).toBe(s('chatflow.urgent.q'))
    await click(button(s('chatflow.urgent.chip.yes')))
    expect(stepId()).toBe('phone')
    await click(button(s('chatflow.skip')))
    expect(stepId()).toBe('country')
    await type(panel()!.querySelector('input[type="search"]') as HTMLInputElement, 'thai')
    await click(button('Thailand'))
    // the last step's OK reads "Submit"; nothing has been posted yet
    expect(stepId()).toBe('notes')
    expect(button(s('chatflow.submit'))).toBeDefined()
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/api/rfq/token/'])
    await say('Please call first')
    const [body] = submitted(fetcher)
    expect(body).toMatchObject({ source: 'NATIVE_CHAT', registryVersion: reg.registryVersion, noticeVersion: reg.noticeVersion, locale: 'en', context: { page_path: '/', context_type: 'page', cta_placement: 'launcher' }, antiAbuse: { formToken: 'tok', hp: '' } })
    expect(body.answers).toEqual({ email: 'a@gmail.com', first_name: 'Avery', last_name: 'Quinn', company: 'Plant Co', purpose: 'parts', parts_part: 'fans', details: 'Model 3000, 12 ft', urgent: 'yes', country: 'TH', notes: 'Please call first' })
    // the end: "Thank you {first}!", the response promise, the RFQ number, how to send files
    expect(panel()!.querySelector('h3')?.textContent).toBe(s('chatflow.done.heading', { first: 'Avery' }))
    expect(panel()!.textContent).toContain(s('confirm.response_time'))
    expect(panel()!.textContent).toContain(s('chatflow.done.number', { rfq_number: 'RFQ-20261009-7K3M9QX2' }))
    expect(panel()!.querySelector('.notranslate, [translate="no"] span[translate="no"]')).not.toBeNull()
    // owner 2026-10-09: no upload step; files come by reply
    expect(panel()!.textContent).toContain(s('chatflow.done.attachments'))
    expect(panel()!.querySelector('input[type="file"]')).toBeNull()
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('owner 2026-10-09: email, first and last name, the service and the part are required; everything else can be skipped', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-2', replay: false }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await say('a@b.co')
    await say('Ana')
    await say('Ruiz')
    expect(question()).toBe(s('chatflow.company.q', { first: 'Ana' }))
    await click(button(s('chatflow.skip'))) // company
    await click(button(s('chatflow.purpose.chip.parts')))
    await click(button(s('chatflow.parts_part.chip.motors')))
    expect(question()).toBe(s('chatflow.details.q', { subject: 'Motors' }))
    await say('') // Enter on an empty optional field is a skip
    await click(button(s('chatflow.skip'))) // urgent
    await click(button(s('chatflow.skip'))) // phone
    await click(button(s('chatflow.skip'))) // country
    expect(stepId()).toBe('notes')
    await click(button(s('chatflow.skip'))) // notes: the last step — skipping it submits
    expect(submitted(fetcher)[0].answers).toEqual({ email: 'a@b.co', first_name: 'Ana', last_name: 'Ruiz', purpose: 'parts', parts_part: 'motors' })
    expect(panel()!.querySelector('h3')?.textContent).toBe(s('chatflow.done.heading', { first: 'Ana' }))
  })

  it('Security Auditor condition 1: nothing typed reaches the server before Submit (no per-step call, no email check, no autosave); the draft stays in this tab', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-9', replay: false }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    const typed = 'zq.private@b.co'
    const carries = () => fetcher.mock.calls.filter((c) => JSON.stringify(c).includes(typed) || JSON.stringify(c).includes(encodeURIComponent(typed)))
    await type(field(), typed)
    await flush()
    expect(carries()).toEqual([])
    await key(field(), 'Enter')
    for (const v of ['Zed', 'Quill']) await say(v)
    await click(button(s('chatflow.skip')))
    await click(button(s('chatflow.purpose.chip.other')))
    for (let i = 0; i < 3 && stepId() !== 'notes'; i++) await click(button(s('chatflow.skip')))
    expect(stepId()).toBe('notes')
    // every step answered or skipped: the only request so far is the form token, and it carries nothing typed
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/api/rfq/token/'])
    expect(carries()).toEqual([])
    expect(sessionStorage.getItem(DRAFT_KEY)).toContain(typed) // browser-only draft (allowed)
    await click(button(s('chatflow.skip')))
    expect(carries().map((c) => c[0])).toEqual(['/api/rfq/submit/'])
  })

  it('Security Auditor condition 2: a submit refused with NOTICE_CHANGED reloads the registry past the cache and shows the email step with the current line; answers are kept and the resend records the new version', async () => {
    const changed = { ...reg, noticeVersion: 'notice-0000abcd', strings: { ...reg.strings, 'chatflow.email.notice': 'Updated line. {{privacy_policy_link}}' } }
    const loads: (boolean | undefined)[] = []
    const load = async (_l: string, fresh?: boolean) => { loads.push(fresh); return fresh ? changed : reg }
    let n = 0
    const fetcher = api(() => (n++ === 0 ? json(409, { ok: false, code: 'NOTICE_CHANGED' }) : json(200, { ok: true, rfqNumber: 'RFQ-7', replay: false })))
    fullDraft('sub-notice')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={load} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(s('chatflow.submit')))
    expect(loads).toEqual([undefined, true])
    expect(stepId()).toBe('email')
    expect(field().value).toBe('a@b.co')
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.notice_changed'))
    expect(panel()!.textContent).toContain('Updated line. Privacy Notice')
    await key(field(), 'Enter')
    // straight back to Submit: every other answer stands
    await click(button(s('chatflow.submit')))
    const bodies = submitted(fetcher)
    expect(bodies.map((b) => b.noticeVersion)).toEqual([reg.noticeVersion, 'notice-0000abcd'])
    expect(bodies[1].answers).toEqual(bodies[0].answers)
    expect(panel()!.textContent).toContain(s('chatflow.done.number', { rfq_number: 'RFQ-7' }))
  })

  it('an RFQ control opens the panel with its context (shown once, above question 1, never asked); Escape closes and focus returns to it', async () => {
    await act(async () => root.render(<><NativeRfqTrigger placement="rfq_page" context={{ context_type: 'product', context_id: '4765', product_id: '4765', product_slug: 'site-assembly', page_path: '/product/site-assembly/' }} contextLabel="Site Assembly">Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/></>))
    const link = host.querySelector('a[data-rfq-native]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/contact-us/#request-a-quote')
    link.focus()
    await click(link)
    expect(panel()!.querySelector('[data-rfq-context]')?.textContent).toBe(sc('context.note', { context_label: 'Site Assembly' }))
    await say('a@b.co')
    expect(panel()!.querySelector('[data-rfq-context]')).toBeNull() // once
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

  it('closing keeps the draft (this tab only, never sent); reopening offers to continue or start over', async () => {
    const fetcher = api(() => json(500, {}))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await say('a@b.co')
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toMatchObject({ answers: { email: 'a@b.co' }, source: 'NATIVE_CHAT' })
    await click(button(sc('panel.close.aria')))
    expect(panel()).toBeNull()
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(panel()!.textContent).toContain(sc('resume.prompt'))
    await click(button(sc('resume.continue')))
    expect(stepId()).toBe('first_name')
    expect(submitted(fetcher)).toEqual([])
  })

  it('a send in flight cannot be sent twice; a failure keeps the draft, says so and offers a retry; the honeypot is hidden from people', async () => {
    let release: (r: Response) => void = () => {}
    const fetcher = api(() => new Promise<Response>((r) => { release = r }))
    fullDraft('sub-1')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    const hp = panel()!.querySelector('input[name="h2o_hp_x"]') as HTMLInputElement
    expect(hp.tabIndex).toBe(-1)
    expect([hp.autocomplete, hp.getAttribute('data-1p-ignore'), hp.getAttribute('data-lpignore')]).toEqual(['off', '', 'true'])
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull()
    // every step answered: Submit
    await act(async () => { button(s('chatflow.submit')).click() })
    expect(panel()!.textContent).toContain(s('chatflow.submitting'))
    expect(button(s('chatflow.submit'))).toBeUndefined()
    expect(submitted(fetcher)).toHaveLength(1)
    await act(async () => { release(json(500, { ok: false, code: 'SERVER' })) })
    await flush()
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.server', { offices_link: sc('offices.link_text') }))
    expect(panel()!.querySelector('[role="alert"] a')?.getAttribute('href')).toBe('/contact-us/#offices')
    expect(button(s('chatflow.retry'))).toBeDefined()
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).submissionId).toBe('sub-1')
  })

  it('R5.2: a 429 disables Retry with the Retry-After countdown, then allows it; the retry is the same submission', async () => {
    let n = 0
    const fetcher = api(() => (n++ === 0 ? new Response(JSON.stringify({ ok: false, code: 'RATE_LIMITED', retryAfterSeconds: 1 }), { status: 429, headers: { 'retry-after': '1' } }) : json(200, { ok: true, rfqNumber: 'RFQ-5', replay: false })))
    fullDraft('sub-429')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(s('chatflow.submit')))
    const waiting = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(s('chatflow.retry')))!
    expect(waiting.disabled).toBe(true)
    expect(waiting.textContent).toBe(`${s('chatflow.retry')} (0:01)`)
    expect(panel()!.querySelector('[role="alert"]')?.textContent).toBe(sc('err.rate_limited', { offices_link: sc('offices.link_text') }))
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)) })
    await flush()
    expect(button(s('chatflow.retry')).disabled).toBe(false)
    await click(button(s('chatflow.retry')))
    expect(panel()!.textContent).toContain(s('chatflow.done.number', { rfq_number: 'RFQ-5' }))
    expect(submitted(fetcher).map((b) => b.submissionId)).toEqual(['sub-429', 'sub-429'])
  })

  it('R5.2: a 200 replay shows the same thank-you with the returned RFQ number', async () => {
    fullDraft('sub-replay')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(200, { ok: true, rfqNumber: 'RFQ-ORIGINAL', replay: true })) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(s('chatflow.submit')))
    expect(panel()!.textContent).toContain(s('chatflow.done.number', { rfq_number: 'RFQ-ORIGINAL' }))
    expect(panel()!.textContent).toContain(s('confirm.response_time'))
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('R5.2: a 422 too-long error goes back to that step with the limit ({max}); a 413 lands on the longest answer', async () => {
    fullDraft('sub-422')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(422, { ok: false, code: 'VALIDATION', fields: { details: 'err.too_long' } })) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(s('chatflow.submit')))
    expect(stepId()).toBe('details')
    expect(panel()!.textContent).toContain(sc('err.too_long', { max: '2000' }))
    await act(async () => root.unmount())
    root = createRoot(host)
    sessionStorage.clear()
    fullDraft('sub-413', { notes: 'x'.repeat(1900) })
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(413, { ok: false, code: 'TOO_LARGE' })) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(s('chatflow.submit')))
    expect(stepId()).toBe('notes')
    expect(panel()!.textContent).toContain(sc('err.too_long', { max: '2000' }))
  })

  it('a null RFQ number (honeypot): the thank-you without a number line (contract amendment (a))', async () => {
    fullDraft('sub-2')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={api(() => json(200, { ok: true, rfqNumber: null, replay: false })) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(sc('resume.continue')))
    await click(button(s('chatflow.submit')))
    expect(panel()!.querySelector('h3')?.textContent).toBe(s('chatflow.done.heading', { first: 'A' }))
    expect(panel()!.textContent).not.toContain('RFQ number')
    expect(panel()!.textContent).toContain(s('confirm.response_time'))
  })

  it('a registry that is off shows the unavailable line with the offices link (R5.1); unreachable shows no question', async () => {
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => ({ ...reg, enabled: false })} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(stepId()).toBeNull()
    expect(panel()!.textContent).toContain(sc('panel.unavailable', { offices_link: sc('offices.link_text') }))
    expect(panel()!.querySelector('[data-rfq-focus] a')?.getAttribute('href')).toBe('/contact-us/#offices')
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => null} timing={NO_WAIT} fetcher={api(() => json(500, {})) as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(stepId()).toBeNull()
    expect(panel()!.querySelector('[data-rfq-focus] a')?.getAttribute('href')).toBe('/contact-us/#offices')
  })

  it('first touch survives navigation: the landing page’s tags are sent from a later page (R5.1)', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-3', replay: false }))
    window.history.replaceState(null, '', '/fans/?utm_source=ads&utm_campaign=q4&gclid=abc')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    expect(JSON.parse(sessionStorage.getItem(ATTR_KEY)!)).toMatchObject({ utm_source: 'ads', utm_campaign: 'q4', gclid: 'abc', landing_page: '/fans/' })
    expect(fetcher).not.toHaveBeenCalled() // nothing is sent before submit
    await act(async () => root.unmount())
    window.history.replaceState(null, '', '/contact-us/')
    root = createRoot(host)
    fullDraft('sub-3')
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(s('resume.continue')))
    await click(button(s('chatflow.submit')))
    const [body] = submitted(fetcher)
    expect(body.attribution).toMatchObject({ utm_source: 'ads', utm_campaign: 'q4', gclid: 'abc', landing_page: '/fans/' })
    expect(body.attribution.ga_client_id).toBeUndefined()
    expect(body.context).toMatchObject({ page_path: '/contact-us/' })
  })

  it('a page-level control shows the page’s own H1 in the context note (R5.1); it is not sent', async () => {
    const fetcher = api(() => json(500, {}))
    await act(async () => root.render(<><main><h1>Cooling Tower   Fans</h1></main><NativeRfqTrigger placement="editorial_inline" context={{ context_type: 'page', page_path: '/fans/' }}>Request a Quote</NativeRfqTrigger><NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/></>))
    await click(host.querySelector('a[data-rfq-native]'))
    expect(panel()!.querySelector('[data-rfq-context]')?.textContent).toBe(s('context.note', { context_label: 'Cooling Tower Fans' }))
  })
})

describe('inline form (NATIVE_FORM)', () => {
  it('validates everything at once (form wording, focus on the first error), then reviews and sends as NATIVE_FORM', async () => {
    const fetcher = api(() => json(200, { ok: true, rfqNumber: 'RFQ-9', replay: false }))
    await act(async () => root.render(<NativeRfqForm loader={loader} timing={NO_WAIT} fetcher={fetcher as never}/>))
    await flush()
    const form = host.querySelector('form')!
    // 1.3a-F1: a required question's label carries the star after its text
    expect([...form.querySelectorAll('legend, label')].some((l) => l.textContent?.startsWith(s('purpose.q')))).toBe(true)
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
