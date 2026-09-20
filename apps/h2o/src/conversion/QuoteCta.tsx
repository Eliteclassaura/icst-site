'use client'

/**
 * H2O Phase 2C-min — the conversion CTA.
 *
 * Progressive enhancement, in that order:
 *
 *   - The markup is a real link to the form. With JavaScript unavailable, or before hydration, the
 *     CTA works: it opens the form in a new tab. There is no dead button at any point.
 *   - With JavaScript, the click is intercepted and the form opens in a dialog on the page. The
 *     iframe is created **on open**, so a visitor who never asks for a quote downloads nothing from
 *     Typeform and nothing blocks the initial render.
 *   - If the embed does not report itself ready inside the load budget, the dialog shows the same
 *     link and says so.
 *
 * No Typeform SDK is loaded. The adapter renders its own iframe and validates `postMessage` itself,
 * so no third-party script runs in the H2O origin and the only CSP allowance needed is `frame-src`.
 *
 * **Focus and analytics live outside the state updaters.** A React updater may run more than once
 * for a single update, so an effect that focuses or an emission that counts must not sit inside
 * one. Initial focus is an effect keyed on the open state, which runs after the dialog node exists —
 * on the first open there is no node to focus at the moment the state changes, which is precisely
 * the bug R1 shipped.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { TYPEFORM_IFRAME_REFERRER_POLICY, TYPEFORM_IFRAME_SANDBOX } from './csp'
import { closeDialog, handleKey, initialDialogState, openDialog, type FocusTarget } from './dialog'
import { createEventRecorder, type ConversionEventSink } from './events'
import { acceptMessage } from './messages'
import styles from './QuoteCta.module.css'

/** How long the embed has to report itself ready before the visitor is offered the direct link. */
export const EMBED_LOAD_TIMEOUT_MS = 8000

export type QuoteCtaProps = {
  /** Where on the page this CTA sits. Travels as `cta_placement`; already sanitised server-side. */
  ctaPlacement?: string
  /** The finished, validated form URL from `resolveQuoteCta`. Never assembled in the browser. */
  formUrl: string
  label?: string
  /** Analytics sink. Optional: with none, events are computed and discarded. */
  onEvent?: ConversionEventSink
  /** The exact origin the embed may speak from. Compared by string equality, never by pattern. */
  origin: string
  pagePath?: string
  productId?: string
  productSlug?: string
  /** Dialog heading. Quote/contact language only — this is not a checkout. */
  title?: string
}

type LoadState = 'failed' | 'loading' | 'ready'

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const QuoteCta = ({
  ctaPlacement,
  formUrl,
  label = 'Request a quote',
  onEvent,
  origin,
  pagePath,
  productId,
  productSlug,
  title = 'Request a quote',
}: QuoteCtaProps) => {
  const [state, setState] = useState(initialDialogState)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const fallbackRef = useRef<HTMLAnchorElement | null>(null)
  /** The exact control the visitor activated, captured from the click that opened the dialog. */
  const triggerRef = useRef<HTMLAnchorElement | null>(null)
  /** Where focus goes once the dialog has actually been removed from the document. */
  const restoreRef = useRef<FocusTarget | null>(null)
  const titleId = useId()

  const payload = {
    cta_placement: ctaPlacement,
    page_path: pagePath,
    product_id: productId,
    product_slug: productSlug,
  }

  // One recorder for the component's lifetime: submission dedupe is only meaningful if the state
  // that remembers a submission outlives the render that saw it. The sink is handed to each call
  // instead of captured once, so swapping the analytics handler never resets that dedupe state.
  const [recorder] = useState(() => createEventRecorder())

  const open = useCallback(() => {
    if (state.open) return
    recorder.record('form_opened', payload, onEvent)
    const options = { prefersReducedMotion: prefersReducedMotion(), returnFocusTo: triggerRef.current }
    setState((current) => openDialog(current, options))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, recorder, onEvent, ctaPlacement, pagePath, productId, productSlug])

  const close = useCallback(() => {
    if (!state.open) return
    recorder.record('form_closed', payload, onEvent)
    // Decided here, from state we already hold, so the updater stays pure.
    restoreRef.current = state.returnFocusTo ?? triggerRef.current
    setState((current) => closeDialog(current).state)
    setLoadState('loading')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.returnFocusTo, recorder, onEvent, ctaPlacement, pagePath, productId, productSlug])

  /**
   * Initial focus, after mount. This is the correction R1 needed: at the moment the open state
   * changes, the dialog node has not been created, so anything that focused there focused nothing.
   * By the time this effect runs, React has committed the DOM.
   */
  useEffect(() => {
    if (!state.open) return
    const target = closeRef.current ?? dialogRef.current
    target?.focus()
  }, [state.open])

  /** Return focus, after the dialog has been removed, so the browser cannot undo it. */
  useEffect(() => {
    if (state.open) return
    const target = restoreRef.current
    restoreRef.current = null
    target?.focus()
  }, [state.open])

  // Messages from the embed. Both the origin and the source window must match, and the listener
  // only exists while the dialog is open, so a message arriving at any other time is never heard.
  useEffect(() => {
    if (!state.open) return undefined
    const onMessage = (event: MessageEvent) => {
      const verdict = acceptMessage(
        { data: event.data, origin: event.origin, source: event.source },
        origin,
        frameRef.current?.contentWindow ?? null,
      )
      if (!verdict.accepted) return
      if (verdict.event === 'form_loaded') setLoadState('ready')
      if (verdict.event === 'form_submitted') {
        recorder.record(
          'form_submitted',
          { ...payload, submission_token: verdict.submissionToken ?? undefined },
          onEvent,
        )
        return
      }
      recorder.record(verdict.event, payload, onEvent)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, origin, recorder, onEvent, ctaPlacement, pagePath, productId, productSlug])

  // Load budget. An embed that never reports ready is a failure the visitor must be told about,
  // not a spinner that runs forever.
  useEffect(() => {
    if (!state.open || loadState !== 'loading') return undefined
    const timer = setTimeout(() => {
      setLoadState('failed')
      recorder.record('form_error', { ...payload, error_code: 'EMBED_LOAD_TIMEOUT' }, onEvent)
    }, EMBED_LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, loadState, recorder, onEvent, ctaPlacement, pagePath, productId, productSlug])

  useEffect(() => {
    if (loadState === 'failed') fallbackRef.current?.focus()
  }, [loadState])

  /**
   * Focusable controls the adapter itself owns, in tab order. The iframe's own contents are a
   * separate focus scope the browser manages; the trap wraps around our controls, which is what
   * keeps Tab from escaping the dialog into the page behind it.
   */
  const ownControls = (): Array<HTMLElement | null> =>
    loadState === 'failed' ? [closeRef.current, fallbackRef.current] : [closeRef.current, frameRef.current]

  /**
   * Escape and the Tab trap are bound to the dialog node itself rather than declared as a JSX
   * handler. A `role="dialog"` element is not an interactive control, so hanging key listeners off
   * it in markup is the wrong shape; the listener belongs to the dialog's lifetime, which is
   * exactly what an effect expresses.
   */
  useEffect(() => {
    const node = dialogRef.current
    if (!state.open || node === null) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      const controls = ownControls().filter((el): el is HTMLElement => el !== null)
      const index = controls.indexOf(event.target as HTMLElement)
      const position = index === 0 ? 'first' : index === controls.length - 1 && index !== -1 ? 'last' : 'middle'
      const outcome = handleKey(state, { key: event.key, shiftKey: event.shiftKey }, position)
      if (outcome === 'IGNORE') return
      event.preventDefault()
      if (outcome === 'CLOSE') {
        close()
        return
      }
      if (outcome === 'FOCUS_FIRST') {
        closeRef.current?.focus()
        return
      }
      const controlsNow = ownControls().filter((el): el is HTMLElement => el !== null)
      controlsNow[controlsNow.length - 1]?.focus()
    }
    node.addEventListener('keydown', onKeyDown)
    return () => node.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loadState, close])

  return (
    <>
      <a
        className={styles.cta}
        href={formUrl}
        onClick={(event) => {
          // Let the browser handle modified clicks and anything that is not a plain primary click,
          // so "open in new tab" keeps working exactly as a link should.
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          if (event.button !== 0) return
          event.preventDefault()
          triggerRef.current = event.currentTarget
          open()
        }}
        ref={triggerRef}
        rel="noopener noreferrer"
        target="_blank"
      >
        {label}
      </a>

      {state.open ? (
        <div className={styles.backdrop}>
          {/*
            Click-outside as a real button rather than a click handler on a div: it is a native
            interactive element with an accessible name, so assistive technology is not asked to
            guess. tabIndex -1 keeps it out of the tab order, because Escape and the visible close
            button already cover the keyboard and a second "Close" stop would only be noise.
          */}
          <button
            aria-label="Close"
            className={styles.scrim}
            onClick={close}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className={`${styles.dialog} ${state.animate ? styles.animated : ''}`}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className={styles.bar}>
              <h2 className={styles.title} id={titleId}>
                {title}
              </h2>
              <button className={styles.close} onClick={close} ref={closeRef} type="button">
                <span aria-hidden="true">&times;</span>
                <span className={styles.hidden}>Close</span>
              </button>
            </div>

            <div className={styles.body}>
              {loadState === 'failed' ? (
                <div className={styles.state}>
                  <p>The quote form could not be loaded here.</p>
                  <a
                    className={styles.cta}
                    href={formUrl}
                    onClick={() => recorder.record('fallback_opened', payload, onEvent)}
                    ref={fallbackRef}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open the quote form in a new tab
                  </a>
                </div>
              ) : null}
              <iframe
                className={loadState === 'failed' ? styles.hidden : styles.frame}
                onError={() => {
                  setLoadState('failed')
                  recorder.record('form_error', { ...payload, error_code: 'EMBED_LOAD_ERROR' }, onEvent)
                }}
                ref={frameRef}
                referrerPolicy={TYPEFORM_IFRAME_REFERRER_POLICY}
                sandbox={TYPEFORM_IFRAME_SANDBOX}
                src={formUrl}
                title={title}
              />
              {loadState === 'loading' ? (
                <p aria-live="polite" className={styles.state}>
                  Loading the quote form…
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
