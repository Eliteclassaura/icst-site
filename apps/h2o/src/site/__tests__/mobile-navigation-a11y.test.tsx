// @vitest-environment happy-dom

/**
 * H2O Phase 2D R2.1 §7 — the small-screen navigation, tested as an accessibility contract.
 *
 * R2 built the menu from a visually hidden checkbox and two labels. It worked with a pointer and
 * broke with a keyboard in two specific ways, and both are now assertions rather than prose:
 *
 *   DESKTOP — the checkbox stayed in the tab order above the breakpoint while the visible Menu
 *   label was `display: none`. A sighted keyboard user tabbed onto a control that was not on the
 *   screen. The fix is structural: the control is a <summary> inside the <details> that the media
 *   query hides, so hiding the menu hides the control. A hidden <input> is still focusable; a
 *   <summary> inside a `display: none` ancestor is not.
 *
 *   MOBILE — the visible Menu label carried aria-hidden and the accessible control was the
 *   checkbox. The thing that looked like a button was not the thing that was operated. The fix is
 *   the same one: the visible control and the operated control are now the same element, it takes
 *   its accessible name from its own text, and <details> carries expanded/collapsed natively.
 *
 * These tests assert the DOM contract and the stylesheet that makes it true. The behavioural half
 * — real Tab order at 1440, Enter and Space at 390, visible focus — is measured in a real browser
 * by the R2.1 accessibility harness and reported in the evidence pack; jsdom does not apply an
 * external stylesheet and cannot answer it here.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cohort } from '../cohort'
import { SiteChrome } from '../SiteChrome'

const CSS = readFileSync(path.join(process.cwd(), 'src', 'app', '(site)', 'site.css'), 'utf8')

let host: HTMLDivElement
let root: Root

const page = cohort().find((p) => p.canonicalPath === '/') as ReturnType<typeof cohort>[number]

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <SiteChrome page={page}>
        <p>body</p>
      </SiteChrome>,
    )
  })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

const disclosure = (): HTMLDetailsElement => {
  const el = host.querySelector('details.nav-disclosure')
  expect(el).not.toBeNull()
  return el as HTMLDetailsElement
}

/** Everything the platform puts in the tab order by default, plus anything given a tabindex. */
const FOCUSABLE = 'a[href],area[href],input,select,textarea,button,summary,iframe,object,embed,[tabindex],[contenteditable]'

describe('the menu control is a native disclosure, not a checkbox wearing a label', () => {
  it('renders <details> with a <summary> as the control', () => {
    const details = disclosure()
    const summary = details.querySelector(':scope > summary')
    expect(summary).not.toBeNull()
    expect((summary as HTMLElement).tagName).toBe('SUMMARY')
  })

  it('has no checkbox, no label-for, and no scripted toggle anywhere in the chrome', () => {
    expect(host.querySelector('input[type="checkbox"]')).toBeNull()
    expect(host.querySelector('label[for]')).toBeNull()
    expect(host.querySelector('#nav-toggle')).toBeNull()
    expect(host.querySelector('[onclick]')).toBeNull()
  })

  it('starts collapsed, and <details> is what reports the state', () => {
    const details = disclosure()
    expect(details.open).toBe(false)
    // Native semantics: no author-supplied aria-expanded to drift out of sync with reality.
    expect(details.querySelector('[aria-expanded]')).toBeNull()
  })

  it('opens and closes through the element the user sees', () => {
    const details = disclosure()
    const summary = details.querySelector('summary') as HTMLElement
    act(() => {
      summary.click()
    })
    expect(details.open).toBe(true)
    act(() => {
      summary.click()
    })
    expect(details.open).toBe(false)
  })
})

describe('the control that is visible is the control that is operated', () => {
  it('gives the summary an accessible name from its own text', () => {
    const summary = disclosure().querySelector('summary') as HTMLElement
    expect(summary.hasAttribute('aria-hidden')).toBe(false)
    expect(summary.textContent?.trim()).toBe('Menu')
    expect((summary.textContent ?? '').trim().length).toBeGreaterThan(0)
  })

  it('hides only decoration from assistive technology, never a control', () => {
    for (const el of Array.from(host.querySelectorAll('[aria-hidden="true"]'))) {
      // A decorative element may not be focusable and may not contain anything focusable.
      expect(el.matches(FOCUSABLE)).toBe(false)
      expect(el.querySelector(FOCUSABLE)).toBeNull()
    }
  })

  it('makes the bars and the scrim decoration, not unlabelled controls', () => {
    const bars = host.querySelector('.nav-bars') as HTMLElement
    expect(bars.getAttribute('aria-hidden')).toBe('true')
    expect(bars.matches(FOCUSABLE)).toBe(false)
    const scrim = host.querySelector('.nav-scrim') as HTMLElement
    expect(scrim.tagName).toBe('SPAN')
    expect(scrim.getAttribute('aria-hidden')).toBe('true')
    expect(scrim.matches(FOCUSABLE)).toBe(false)
  })
})

describe('no control sits in the tab order without a visible counterpart', () => {
  it('puts every focusable element of the disclosure inside the element the media query hides', () => {
    const details = disclosure()
    const focusable = Array.from(details.querySelectorAll(FOCUSABLE))
    // The summary and the drawer links, and nothing else.
    expect(focusable.length).toBeGreaterThan(1)
    for (const el of focusable) expect(details.contains(el)).toBe(true)
    // None of them is positioned out of the layout while staying focusable — the defect the
    // visually hidden checkbox had.
    expect(details.querySelector('.visually-hidden')).toBeNull()
  })

  it('gives no element in the chrome a positive or author-set tabindex', () => {
    for (const el of Array.from(host.querySelectorAll('[tabindex]'))) {
      expect(el.getAttribute('tabindex')).toBe('-1')
    }
  })

  it('reaches every small-screen destination from inside the drawer', () => {
    const details = disclosure()
    act(() => {
      ;(details.querySelector('summary') as HTMLElement).click()
    })
    const links = Array.from(details.querySelectorAll('.nav-drawer a[href]')) as HTMLAnchorElement[]
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^\//)
      expect((a.textContent ?? '').trim().length).toBeGreaterThan(0)
    }
  })
})

describe('the stylesheet hides the control, not only its label', () => {
  const block = (selector: string): string => {
    const at = CSS.indexOf(`\n${selector} {`)
    expect(at).toBeGreaterThanOrEqual(0)
    return CSS.slice(at, CSS.indexOf('}', at))
  }

  it('hides the whole disclosure above the breakpoint, which takes the summary with it', () => {
    expect(block('.nav-disclosure')).toContain('display: none')
  })

  it('shows it again below the breakpoint', () => {
    const query = CSS.slice(CSS.indexOf('@media (max-width: 40rem) {', CSS.indexOf('.nav-disclosure {')))
    expect(query).toContain('.nav-disclosure {')
    expect(query.slice(query.indexOf('.nav-disclosure {'), query.indexOf('}', query.indexOf('.nav-disclosure {')))).toContain('display: block')
  })

  it('gives the control a visible focus ring', () => {
    expect(CSS).toContain('.nav-button:focus-visible')
    const at = CSS.indexOf('.nav-button:focus-visible')
    expect(CSS.slice(at, CSS.indexOf('}', at))).toContain('outline: 3px solid')
  })

  it('never lets the scrim swallow a tap meant for the control', () => {
    /*
      With <details>, the summary is also the close control. The first R2.1 cut put a fixed,
      full-viewport scrim over it and a drawer pinned to the top of the window, which left no
      pointer path back: a real browser click on the Menu button timed out against both. The scrim
      is now decoration only and the control is raised above the panel.
    */
    const media = CSS.indexOf('@media (max-width: 40rem) {', CSS.indexOf('.nav-disclosure {'))
    const at = CSS.indexOf('.nav-scrim {', media)
    const scrim = CSS.slice(at, CSS.indexOf('}', at))
    expect(scrim).toContain('pointer-events: none')
    expect(scrim).toContain('position: absolute')
    expect(scrim).not.toContain('position: fixed')
    // Some `.nav-button {` block inside the media query raises the control above the panel.
    const blocks: string[] = []
    for (let at = CSS.indexOf('.nav-button {', media); at !== -1; at = CSS.indexOf('.nav-button {', at + 1)) {
      blocks.push(CSS.slice(at, CSS.indexOf('}', at)))
    }
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.some((b) => b.includes('z-index: 10') && b.includes('position: relative'))).toBe(true)
  })

  it('anchors the panel below the header rather than over it', () => {
    const media = CSS.indexOf('@media (max-width: 40rem) {', CSS.indexOf('.nav-disclosure {'))
    const at = CSS.indexOf('.nav-panel {', media)
    const panel = CSS.slice(at, CSS.indexOf('}', at))
    expect(panel).toContain('inset-block-start: 100%')
    expect(panel).toContain('position: absolute')
  })

  it('no longer carries the checkbox rules at all', () => {
    expect(CSS).not.toContain('.nav-toggle')
    expect(CSS).not.toContain(':checked ~ .nav-panel')
  })
})
