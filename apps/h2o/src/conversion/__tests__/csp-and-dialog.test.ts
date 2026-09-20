import { describe, expect, it } from 'vitest'
import {
  mergeTypeformCsp,
  TYPEFORM_CSP_ADDITIONS,
  TYPEFORM_IFRAME_REFERRER_POLICY,
  TYPEFORM_IFRAME_SANDBOX,
} from '../csp'
import { closeDialog, handleKey, initialDialogState, openDialog, type FocusTarget } from '../dialog'

/** The H2O policy shape, modelled on the accepted syed-ai proxy policy. */
const BASE =
  "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
  "form-action 'self'; frame-ancestors 'none'"

describe('CSP contract', () => {
  it('needs exactly one directive, because no third-party script is loaded', () => {
    expect(Object.keys(TYPEFORM_CSP_ADDITIONS)).toEqual(['frame-src'])
    expect(TYPEFORM_CSP_ADDITIONS['frame-src']).toEqual(['https://form.typeform.com'])
  })

  it('adds frame-src without touching script-src or connect-src', () => {
    const merged = mergeTypeformCsp(BASE)
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(merged.policy).toContain('frame-src')
    expect(merged.policy).toContain('https://form.typeform.com')
    expect(merged.policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(merged.policy).toContain("connect-src 'self'")
  })

  it('never introduces a wildcard', () => {
    const merged = mergeTypeformCsp(BASE)
    expect(merged.ok && merged.policy).not.toContain('*')
  })

  it('preserves every directive the base policy already enforced', () => {
    const merged = mergeTypeformCsp(BASE)
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    for (const directive of BASE.split(';').map((d) => d.trim())) {
      if (directive.startsWith('frame-src')) continue
      expect(merged.policy).toContain(directive)
    }
    expect(merged.policy).toContain("frame-ancestors 'none'")
    expect(merged.policy).toContain("object-src 'none'")
  })

  it('seeds a missing frame-src from default-src rather than narrowing silently', () => {
    const merged = mergeTypeformCsp("default-src 'self'")
    expect(merged.ok && merged.policy).toBe("default-src 'self'; frame-src 'self' https://form.typeform.com")
  })

  it('is idempotent — merging twice adds nothing', () => {
    const once = mergeTypeformCsp(BASE)
    expect(once.ok).toBe(true)
    if (!once.ok) return
    const twice = mergeTypeformCsp(once.policy)
    expect(twice.ok && twice.policy).toBe(once.policy)
  })

  it.each([
    ['a wildcard host', ['https://*.typeform.com']],
    ['a bare wildcard', ['*']],
    ['unsafe-inline', ["'unsafe-inline'"]],
    ['unsafe-eval', ["'unsafe-eval'"]],
    ['a data URL source', ['data:']],
  ])('refuses an unsafe addition: %s', (_label, sources) => {
    const merged = mergeTypeformCsp(BASE, { 'frame-src': sources })
    expect(merged.ok).toBe(false)
    if (merged.ok) return
    expect(merged.reason).toBe('ADDITION_UNSAFE')
  })

  it('sandboxes the frame without letting it navigate the page', () => {
    expect(TYPEFORM_IFRAME_SANDBOX).not.toContain('allow-top-navigation')
    expect(TYPEFORM_IFRAME_SANDBOX).toContain('allow-scripts')
    expect(TYPEFORM_IFRAME_SANDBOX).toContain('allow-same-origin')
    expect(TYPEFORM_IFRAME_REFERRER_POLICY).toBe('strict-origin')
  })
})

/** A focusable test double. The state machine focuses nothing itself; this records intent. */
const target = (name: string): FocusTarget & { focused: number; name: string } => {
  const t = { focused: 0, focus: () => { t.focused += 1 }, name }
  return t
}

describe('dialog state machine — pure, no side effects', () => {
  it('focuses nothing itself: opening and closing move no focus', () => {
    const cta = target('cta')
    const opened = openDialog(initialDialogState(), { prefersReducedMotion: false, returnFocusTo: cta })
    const closed = closeDialog(opened)
    expect(cta.focused).toBe(0)
    expect(closed.restoreFocusTo).toBe(cta)
  })

  it('captures the exact opening control and hands it back on close', () => {
    const heroCta = target('product-hero')
    const footerCta = target('site-footer')
    const opened = openDialog(initialDialogState(), {
      prefersReducedMotion: false,
      returnFocusTo: footerCta,
    })
    expect(opened.returnFocusTo).toBe(footerCta)
    expect(closeDialog(opened).restoreFocusTo).toBe(footerCta)
    expect(closeDialog(opened).restoreFocusTo).not.toBe(heroCta)
  })

  it('clears the stored control once closed, so a stale element cannot be focused later', () => {
    const cta = target('cta')
    const opened = openDialog(initialDialogState(), { prefersReducedMotion: false, returnFocusTo: cta })
    const closed = closeDialog(opened)
    expect(closed.state.returnFocusTo).toBeNull()
    expect(closeDialog(closed.state).restoreFocusTo).toBeNull()
  })

  it('closes on Escape and only on Escape', () => {
    const state = openDialog(initialDialogState(), { prefersReducedMotion: false, returnFocusTo: null })
    expect(handleKey(state, { key: 'Escape' }, 'middle')).toBe('CLOSE')
    expect(handleKey(state, { key: 'Enter' }, 'middle')).toBe('IGNORE')
    expect(handleKey(state, { key: 'q' }, 'middle')).toBe('IGNORE')
  })

  it('ignores keys while closed', () => {
    expect(handleKey(initialDialogState(), { key: 'Escape' }, 'middle')).toBe('IGNORE')
  })

  it('wraps Tab at the edges and leaves it alone in the middle', () => {
    const state = openDialog(initialDialogState(), { prefersReducedMotion: false, returnFocusTo: null })
    expect(handleKey(state, { key: 'Tab' }, 'last')).toBe('FOCUS_FIRST')
    expect(handleKey(state, { key: 'Tab', shiftKey: true }, 'first')).toBe('FOCUS_LAST')
    expect(handleKey(state, { key: 'Tab' }, 'middle')).toBe('IGNORE')
    expect(handleKey(state, { key: 'Tab', shiftKey: true }, 'middle')).toBe('IGNORE')
    expect(handleKey(state, { key: 'Tab' }, 'first')).toBe('IGNORE')
  })

  it('is idempotent: opening an open dialog and closing a closed one change nothing', () => {
    const cta = target('cta')
    const opened = openDialog(initialDialogState(), { prefersReducedMotion: false, returnFocusTo: cta })
    expect(openDialog(opened, { prefersReducedMotion: false, returnFocusTo: target('other') })).toBe(opened)
    const closed = closeDialog(opened)
    expect(closeDialog(closed.state).state).toBe(closed.state)
  })

  it('skips the entrance animation when the visitor prefers reduced motion', () => {
    const open = (reduced: boolean) =>
      openDialog(initialDialogState(), { prefersReducedMotion: reduced, returnFocusTo: null })
    expect(open(true).animate).toBe(false)
    expect(open(false).animate).toBe(true)
  })
})
