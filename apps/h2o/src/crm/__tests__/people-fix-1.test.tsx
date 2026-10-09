// @vitest-environment happy-dom
/**
 * PEOPLE-FIX-1 (CRM launch review L04): a People-page result must survive its dialog closing, name the person, announce itself, and
 * keep the "we could not email them" instruction as a visible warning.
 */
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionState } from '../workspace/ui/actionState'
import { ActionForm } from '../workspace/ui/ActionForm'
import { FeedbackHost } from '../workspace/ui/FeedbackHost'
import { dismissFeedback } from '../workspace/ui/feedback'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let result: ActionState = {}
vi.mock('../../app/(crm)/crm/settings/actions', () => ({ peopleMfaAction: async () => result }))
import { PersonActions } from '../../app/(crm)/crm/_components/PeopleForms'

let host: HTMLDivElement
let root: Root
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); dismissFeedback() })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

/** A form in a "dialog" that is removed on success, exactly as the real dialog closes, next to the page's feedback host. */
let closed = false
function Page() {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <FeedbackHost />
      {open ? <ActionForm action={async () => result} submitLabel="Go" announce="" onSuccess={() => { closed = true; setOpen(false) }} /> : null}
    </div>
  )
}
async function submit() {
  closed = false
  await act(async () => root.render(<Page />))
  await act(async () => { host.querySelector('form')!.requestSubmit() })
  await flush()
  return { v: !closed }
}

describe('L04: the result stays on the page after the dialog closes', () => {
  it('a success names the person and is announced politely (role=status)', async () => {
    result = { ok: true, message: 'Two-step sign-in reset for Ana Ruiz. They set it up again at their next sign-in.', nonce: 1 }
    const open = await submit()
    expect(open.v).toBe(false)
    expect(host.querySelector('form')).toBeNull()
    const banner = host.querySelector('.c-feedback [role="status"]')!
    expect(banner.textContent).toContain('Two-step sign-in reset for Ana Ruiz')
    expect(host.querySelector('.c-feedback [role="alert"]')).toBeNull()
  })
  it('a failed notice is a visible warning, announced assertively (role=alert, warning style)', async () => {
    result = { ok: true, warn: true, message: 'Two-step sign-in turned off for Ana Ruiz. We could not email them. Tell them directly.', nonce: 2 }
    await submit()
    const banner = host.querySelector('.c-feedback [role="alert"]')!
    expect(banner.className).toContain('is-warning')
    expect(banner.textContent).toContain('We could not email them. Tell them directly.')
    expect(banner.querySelector('button')!.textContent).toBe('Dismiss')
  })
  it('a plain success is NOT styled as a warning', async () => {
    result = { ok: true, message: 'Two-step sign-in turned back on for Ana Ruiz.', nonce: 3 }
    await submit()
    expect(host.querySelector('.c-feedback .c-banner')!.className).not.toContain('is-warning')
  })
})

describe('L05: admin rows', () => {
  it('an admin row offers Reset only and says "Always on for admins"; never "Turn back on" or "Turn off"', async () => {
    await act(async () => root.render(<PersonActions id="a1" name="Admin One" exempt={false} admin isSelf={false} />))
    const text = host.textContent ?? ''
    expect(text).toContain('Always on for admins')
    expect(text).toContain('Reset two-step sign-in')
    expect(text).not.toContain('Turn back on')
    expect(text).not.toMatch(/Turn off/)
  })
})
