// @vitest-environment happy-dom
/**
 * FORM-NOTICE-1 (CT 2026-10-08): the RFQ form carries the approved collection notice byte for byte (OGCS legal final,
 * FORM_NOTICE.md, sha256 b34433fb…): the short notice with the Privacy Notice link, directly above "Send request" in the
 * chat and the inline form, and the full notice behind a native "How we use your details" disclosure (no script).
 */
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORM_NOTICE_SHA256, fixtureRegistry, setRegistrySourceForTests } from '../registry'
import { NativeRfq } from '../NativeRfq'
import { NativeRfqForm } from '../NativeRfqForm'
import { DRAFT_KEY } from '../draft'
import { NoticeLine, PrivacyNote } from '../fields'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const reg = fixtureRegistry()
const source = readFileSync(path.join(process.cwd(), 'content/rfq/form-notice-source.md'))
const md = source.toString('utf8')
/** The approved markdown as a reader sees it: link and bold markup removed. */
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const shortNotice = md.split('\n').find((l) => l.startsWith('> '))!.slice(2)
const items = md.split('## Expanded notice')[1]!.split('\n## ')[0]!.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
const NO_WAIT = { sleep: async () => {} }
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const api = () => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok' }) : json(500, {})))
const reviewDraft = { submissionId: 'sub-n', registryVersion: reg.registryVersion, step: 'review', answers: { email: 'a@b.co', first_name: 'A', last_name: '', company: 'B', purpose: 'other', other_need: 'Basin repair', phone: '', country: 'US', notes: '' } }

let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement
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

describe('the approved source', () => {
  it('is the OGCS-sealed FORM_NOTICE.md byte for byte (and LEGAL-1\'s copy, once applied, is the same file)', () => {
    expect(createHash('sha256').update(source).digest('hex')).toBe(FORM_NOTICE_SHA256)
    const legal = path.join(process.cwd(), 'content/legal/form-notice.md')
    if (existsSync(legal)) expect(readFileSync(legal).equals(source)).toBe(true)
  })
  it('the registry strings are taken from it unchanged; the link text is "Privacy Notice"', () => {
    expect(reg.strings['privacy.note']).toBe(shortNotice.replace('[Privacy Notice](/privacy-policy/)', '{{privacy_policy_link}}'))
    expect(reg.strings['privacy.link_text']).toBe('Privacy Notice')
    expect(reg.strings['privacy.details.link']).toBe('How we use your details')
    expect(reg.strings['privacy.details.items']).toBe(items.join('\n'))
    // no phone number or postal address in the notice
    expect(md).not.toMatch(/\+\d|\d{3}[-\s]\d{3,4}|Suite|Street|Road\b/)
  })
})

describe('rendered', () => {
  const checkNotice = (scope: Element) => {
    const note = scope.querySelector('details')!.parentElement!
    expect(note.querySelector('p')!.textContent).toBe(plain(shortNotice))
    expect(note.querySelector('p a')!.getAttribute('href')).toBe('/privacy-policy/')
    expect(note.querySelector('summary')!.textContent).toBe('How we use your details')
    expect([...note.querySelectorAll('li')].map((li) => li.textContent)).toEqual(items.map(plain))
    expect([...note.querySelectorAll('li a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Privacy Notice', '/privacy-policy/'], ['Cookie Notice', '/cookie-notice/']])
    expect(note.querySelectorAll('script, input[type="checkbox"]')).toHaveLength(0) // no script, no pre-ticked box
    return note
  }
  it('inline form: the notice is directly above "Send request" on the review step', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...reviewDraft, source: 'NATIVE_FORM' }))
    await act(async () => root.render(<NativeRfqForm loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await flush()
    await act(async () => { host.querySelector('form')!.requestSubmit() })
    await flush()
    const send = button(reg.strings['review.send']!)
    expect(send).toBeTruthy()
    // FORM-NOTICE-1.1: the button sits in the action bar, which is what follows the notice
    expect(send.parentElement!.previousElementSibling).toBe(checkNotice(host))
  })
  it('chat: the notice is directly above "Send request" on the review step', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...reviewDraft, source: 'NATIVE_CHAT' }))
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={async () => reg} timing={NO_WAIT} fetcher={api() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    await click(button(reg.strings['resume.continue']!))
    const send = button(reg.strings['review.send']!)
    expect(send).toBeTruthy()
    expect(send.parentElement!.previousElementSibling).toBe(checkNotice(host.querySelector('[role="dialog"]')!))
  })
})

describe('NoticeLine', () => {
  it('renders only **bold** and links to the two legal pages; any other link stays plain text', async () => {
    await act(async () => root.render(<p><NoticeLine text={'**Why:** see [Privacy Notice](/privacy-policy/), [x](https://evil.example/), [y](/admin/) and [Cookie Notice](/cookie-notice/).'}/></p>))
    expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/privacy-policy/', '/cookie-notice/'])
    expect(host.querySelector('strong')!.textContent).toBe('Why:')
    expect(host.textContent).toContain('[x](https://evil.example/)')
    expect(host.textContent).toContain('[y](/admin/)')
  })
})

describe('FORM-NOTICE-1.1 (DD VISUAL_REVISE): the sticky action bar and the disclosure row', () => {
  const css = readFileSync(path.join(process.cwd(), 'src/rfq-native/NativeRfq.module.css'), 'utf8')
  const rule = (sel: string) => {
    const i = css.indexOf(`${sel} {`)
    expect(i, sel).toBeGreaterThanOrEqual(0)
    return css.slice(i, css.indexOf('}', i))
  }
  it('F1: the chat\'s sticky action bar has a solid panel-surface background, a hairline top border and bottom padding', () => {
    const r = rule('.panel:is([data-phase="review"], [data-phase="sending"]) .actionBar')
    expect(r).toContain('position: sticky')
    expect(r).toMatch(/background: var\(--df-white, rgb\(255 255 255\)\)/) // opaque: the panel's own surface token
    expect(r).toMatch(/border-block-start: 1px solid/)
    expect(r).toMatch(/padding-block: 12px max\(16px, env\(safe-area-inset-bottom\)\)/)
    expect(css).not.toMatch(/\.primary\s*\{[^}]*position: sticky/) // the old bare sticky button (no backing) is gone
    expect(rule('.panel')).toMatch(/background: var\(--df-white/) // same token as the panel
  })
  it('F1: the inline form keeps the bar in the page flow (no sticky outside the chat panel)', () => {
    expect(rule('.actionBar')).not.toContain('sticky')
  })
  it('F2: the summary is a full-width row of at least 44px with a visible chevron that turns when open, and a focus ring', () => {
    const r = rule('.privacyDetails summary')
    expect(r).toMatch(/inline-size: 100%/)
    expect(r).toMatch(/min-block-size: 44px/)
    expect(css).toMatch(/\.privacyDetails summary::before \{[^}]*content: ""/)
    expect(css).toMatch(/\.privacyDetails\[open\] summary::before \{[^}]*rotate\(45deg\)/)
    expect(rule('.privacyDetails summary:focus-visible')).toMatch(/outline: 3px solid/)
  })
  it('the grey notice sentence keeps at least 4.5:1 on the pale-blue panel (token --df-muted 110/110/110 on --df-step 242/246/250)', () => {
    const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
    const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    expect(ratio([110, 110, 110], [242, 246, 250])).toBeGreaterThanOrEqual(4.5)
    expect(css).toMatch(/--df-muted, rgb\(110 110 110\)/)
  })
})

describe('FORM-NOTICE-1.1 (Auditor N1, N2): the notice file never takes the form or the submissions down', () => {
  const disk = (rel: string) => readFileSync(path.join(process.cwd(), rel))
  const without = (bad: (rel: string) => Buffer | never) => (rel: string) => (rel.endsWith('form-notice-source.md') ? bad(rel) : disk(rel))
  afterEach(() => { setRegistrySourceForTests(); vi.restoreAllMocks() })

  it('a missing file falls back to the copy table\'s privacy.note (short notice + Privacy Policy link, no expanded list) and logs a code', () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    setRegistrySourceForTests(without(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) }))
    const reg = fixtureRegistry()
    expect(reg.strings['privacy.note']).toContain('{{privacy_policy_link}}')
    expect(reg.strings['privacy.details.items']).toBeUndefined()
    const html = renderToStaticMarkup(<PrivacyNote reg={reg} />)
    expect(html).toContain('Privacy Policy')
    expect(html).not.toContain('<details')
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('FORM_NOTICE_FALLBACK')
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/We use|collect/) // codes only, never content
  })

  it('a corrupt file (no sections) falls back the same way', () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    setRegistrySourceForTests(without(() => Buffer.from('not the notice at all\n')))
    const reg = fixtureRegistry()
    expect(reg.strings['privacy.details.items']).toBeUndefined()
    expect(renderToStaticMarkup(<PrivacyNote reg={reg} />)).toContain('Privacy Policy')
    const lines = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(lines).toContain('FORM_NOTICE_FALLBACK')
    expect(lines).toContain('FORM_NOTICE_SHA256_MISMATCH')
  })

  it('the form still validates answers with the fallback registry', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    setRegistrySourceForTests(without(() => { throw new Error('ENOENT') }))
    const reg = fixtureRegistry()
    expect(reg.registryVersion).toBe(registryVersionOnDisk())
    expect(reg.questions.length).toBeGreaterThan(5)
  })

  it('a file whose bytes differ from the approved hash is used as is and only logged (never throws)', () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const edited = Buffer.from(disk('content/rfq/form-notice-source.md').toString('utf8') + '\n')
    setRegistrySourceForTests(without(() => edited))
    const reg = fixtureRegistry()
    expect(reg.strings['privacy.details.items']).toBeTruthy() // the edited file still parses, so it is used
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain('FORM_NOTICE_SHA256_MISMATCH')
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain('FORM_NOTICE_FALLBACK')
  })

  it('4C-FIX.1 N3: a transient read failure is not cached: the next request serves the full notice', () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    let calls = 0
    const real = readFileSync
    setRegistrySourceForTests((rel) => {
      if (rel.endsWith('form-notice-source.md') && ++calls === 1) throw new Error('EAGAIN')
      return real(path.join(process.cwd(), rel))
    })
    const first = fixtureRegistry()
    expect(first.strings['privacy.details.items']).toBeUndefined() // fallback this time
    const second = fixtureRegistry()
    expect(second.strings['privacy.details.items']).toBeTruthy() // the file read is retried and succeeds
    expect(fixtureRegistry()).toBe(second) // a good load IS cached
    const lines = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(lines.match(/FORM_NOTICE_FALLBACK/g)).toHaveLength(1)
  })

  it('the approved file loads silently', () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    setRegistrySourceForTests()
    expect(fixtureRegistry().strings['privacy.details.items']).toBeTruthy()
    expect(log).not.toHaveBeenCalled()
  })
})

const registryVersionOnDisk = () => {
  setRegistrySourceForTests()
  const v = fixtureRegistry().registryVersion
  return v
}
