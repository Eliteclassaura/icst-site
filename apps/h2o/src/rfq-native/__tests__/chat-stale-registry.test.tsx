// @vitest-environment happy-dom
/**
 * CHAT-FLOW-1.2: a browser can hold the registry from before CHAT-FLOW-1 (it is cacheable: max-age 300, stale-while-revalidate
 * 86400). The new chat must not run on it: with no `chatQuestions` and no `chatflow.*` strings it showed the form's wording
 * ("First name") and an empty OK button. The chat now asks for a fresh registry once, past the HTTP cache.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureRegistry } from '../registry'
import { NativeRfq } from '../NativeRfq'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const NO_WAIT = { sleep: async () => {} }
const reg = fixtureRegistry()
const stale = (() => {
  const { chatQuestions: _drop, noticeVersion: _nv, ...rest } = reg
  void _drop; void _nv
  return { ...rest, strings: Object.fromEntries(Object.entries(reg.strings).filter(([k]) => !k.startsWith('chatflow.'))) } as typeof reg
})()
const LAUNCHER = { label: reg.strings['launcher.label']!, aria: reg.strings['launcher.aria']!, tooltip: reg.strings['launcher.tooltip']! }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fetcher = () => vi.fn(async (url: string) => (url === '/api/rfq/token/' ? json(200, { formToken: 'tok' }) : json(500, {})))
let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click() }); await flush() }
const panel = () => host.querySelector('[role="dialog"]') as HTMLElement | null
const okButton = () => [...panel()!.querySelectorAll('button')].find((b) => b.textContent === reg.strings['chatflow.ok'])

beforeEach(() => { sessionStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('a stale cached registry', () => {
  it('is replaced by a fresh one before the first question: the chat wording and a labelled OK, not the form wording and an empty button', async () => {
    const loads: (boolean | undefined)[] = []
    const loader = async (_l: string, fresh?: boolean) => { loads.push(fresh); return fresh ? reg : stale }
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(loads).toEqual([undefined, true])
    expect(panel()!.querySelector('[data-rfq-step]')?.getAttribute('data-rfq-step')).toBe('email')
    expect(okButton()).toBeDefined()
    expect(panel()!.textContent).toContain(reg.strings['chatflow.enter'])
  })
  it('a current registry is loaded once, never twice', async () => {
    const loads: (boolean | undefined)[] = []
    const loader = async (_l: string, fresh?: boolean) => { loads.push(fresh); return reg }
    await act(async () => root.render(<NativeRfq launcher={LAUNCHER} loader={loader} timing={NO_WAIT} fetcher={fetcher() as never}/>))
    await click(host.querySelector('[data-rfq-launcher]'))
    expect(loads).toEqual([undefined])
  })
})
