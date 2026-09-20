// @vitest-environment happy-dom

/**
 * Rendered component tests.
 *
 * R1 proved the dialog's focus rules as a state machine and marked rendered behaviour
 * `NOT_EXECUTED_FACTORY_ENVIRONMENT`. That gap is what hid the defect this revision corrects: the
 * state machine focused whatever ref it was handed, and on the **first** open that ref was `null`,
 * because the dialog node does not exist at the moment the open state changes. A state-machine test
 * cannot see that. A rendered one can, and does.
 *
 * Environment: `happy-dom`, already present in the frozen lockfile as vitest's resolved peer.
 * Nothing was added to any `package.json` and `pnpm-lock.yaml` is byte-identical to the 2A.3 seed.
 * If the workspace ever stops resolving it, vitest fails loudly with an unknown-environment error
 * rather than silently skipping these tests.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConversionEvent } from '../events'
import { QuoteCta } from '../QuoteCta'

const FORM_URL = 'https://form.typeform.com/to/aB3xY9Qz#product_slug=amarillo-cf83-425x'
const ORIGIN = 'https://form.typeform.com'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

const render = async (events: ConversionEvent[] = []) => {
  await act(async () => {
    root.render(
      <QuoteCta
        ctaPlacement="product-hero"
        formUrl={FORM_URL}
        onEvent={(event) => events.push(event)}
        origin={ORIGIN}
        pagePath="/products/amarillo-cf83-425x/"
        productId="4711"
        productSlug="amarillo-cf83-425x"
      />,
    )
  })
  return { events }
}

const cta = () => document.querySelector('a[href]') as HTMLAnchorElement
const dialog = () => document.querySelector('[role="dialog"]') as HTMLDivElement | null
const closeButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.className.includes('close')) as
    | HTMLButtonElement
    | undefined

const clickCta = async () => {
  const link = cta()
  link.focus()
  await act(async () => {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }))
  })
}

const pressEscapeInDialog = async () => {
  await act(async () => {
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }))
  })
}

describe('rendered CTA — before the dialog opens', () => {
  it('renders a real link to the form, so it works without JavaScript', async () => {
    await render()
    expect(cta().getAttribute('href')).toBe(FORM_URL)
    expect(cta().getAttribute('rel')).toBe('noopener noreferrer')
    expect(dialog()).toBeNull()
  })

  it('creates no iframe until the visitor asks for one', async () => {
    await render()
    expect(document.querySelector('iframe')).toBeNull()
  })
})

describe('rendered dialog — initial focus after mount', () => {
  it('moves focus into the dialog on the FIRST open, not only on later ones', async () => {
    await render()
    // A keyboard visitor reaches the CTA first; focus starts there, not in any dialog.
    cta().focus()
    expect(document.activeElement).toBe(cta())

    await clickCta()

    expect(dialog()).not.toBeNull()
    const close = closeButton()
    expect(close).toBeDefined()
    // The regression this revision fixes: on the first open R1 focused a ref that was still null,
    // so focus stayed on the CTA behind the modal.
    expect(document.activeElement).toBe(close)
    expect(document.activeElement).not.toBe(cta())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('does the same on a second open, so the fix is not a one-shot', async () => {
    await render()
    await clickCta()
    await pressEscapeInDialog()
    await clickCta()
    expect(document.activeElement).toBe(closeButton())
  })
})

describe('rendered dialog — Escape and focus restoration', () => {
  it('closes on Escape and returns focus to the exact triggering CTA', async () => {
    await render()
    const trigger = cta()
    await clickCta()
    expect(dialog()).not.toBeNull()

    await pressEscapeInDialog()

    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the CTA when the close button is used', async () => {
    await render()
    const trigger = cta()
    await clickCta()
    await act(async () => {
      closeButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('does not close on other keys', async () => {
    await render()
    await clickCta()
    await act(async () => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }))
    })
    expect(dialog()).not.toBeNull()
  })
})

describe('rendered dialog — markup and events', () => {
  it('marks the dialog as modal with an accessible name, and titles the iframe', async () => {
    await render()
    await clickCta()
    const node = dialog()
    expect(node?.getAttribute('aria-modal')).toBe('true')
    const labelledBy = node?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('Request a quote')
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    expect(frame.getAttribute('title')).toBe('Request a quote')
    expect(frame.getAttribute('src')).toBe(FORM_URL)
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation')
  })

  it('emits form_opened then form_closed, with non-PII payloads only', async () => {
    const events: ConversionEvent[] = []
    await render(events)
    await clickCta()
    await pressEscapeInDialog()
    expect(events.map((e) => e.name)).toEqual(['form_opened', 'form_closed'])
    for (const event of events) {
      expect(event.payload).toEqual({
        cta_placement: 'product-hero',
        page_path: '/products/amarillo-cf83-425x/',
        product_id: '4711',
        product_slug: 'amarillo-cf83-425x',
      })
      expect(event.redacted).toBe(0)
    }
  })

  it('emits exactly one form_opened per open, despite React re-rendering', async () => {
    const events: ConversionEvent[] = []
    await render(events)
    await clickCta()
    await clickCta()
    expect(events.filter((e) => e.name === 'form_opened')).toHaveLength(1)
  })

  it('ignores a forged message from another origin', async () => {
    const events: ConversionEvent[] = []
    await render(events)
    await clickCta()
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { responseId: 'forged', type: 'form-submit' },
          origin: 'https://form.typeform.com.evil.example',
        }),
      )
    })
    expect(events.map((e) => e.name)).toEqual(['form_opened'])
  })

  it('ignores a message from the right origin but a window that is not our embed', async () => {
    const events: ConversionEvent[] = []
    await render(events)
    await clickCta()
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { responseId: 'forged', type: 'form-submit' },
          origin: ORIGIN,
          source: window,
        }),
      )
    })
    expect(events.map((e) => e.name)).toEqual(['form_opened'])
  })

  it('hears nothing at all once the dialog is closed', async () => {
    const events: ConversionEvent[] = []
    await render(events)
    await clickCta()
    await pressEscapeInDialog()
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'form-ready' }, origin: ORIGIN, source: window }),
      )
    })
    expect(events.map((e) => e.name)).toEqual(['form_opened', 'form_closed'])
  })
})
