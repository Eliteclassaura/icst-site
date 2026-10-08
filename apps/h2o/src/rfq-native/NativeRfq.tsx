'use client'
/**
 * Native RFQ: the corner launcher and chat panel (brief §Scope 1; contract §5). A launcher button bottom-right on every public
 * page opens a small panel (a full-height sheet on phones) that asks one question per bubble — chips where the registry has
 * them, a text box otherwise — then a review and an explicit "Send request". Any RFQ control on the page opens the same
 * panel with its page context (the `h2o:rfq-open` event, ./NativeRfqTrigger).
 *
 * Accessibility: a modal dialog labelled by its title; focus moves into it on open, Tab stays inside, Escape closes it and
 * focus returns to the control that opened it; the transcript is a polite live log, so each new question is announced once;
 * targets are 44px; motion is off under prefers-reduced-motion (CSS). No third-party script: everything is this bundle.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { captureFirstTouch } from './attribution'
import { ChipGroup, Confirmation, CountryPicker, ErrorText, FailureNote, Honeypot, OFFICES_HREF, PrivacyNote, ReviewList, SendButton, UnavailableNote } from './fields'
import { displayValue, nextQuestion, questionsFor, validate } from './flow'
import { t, type Question, type Registry } from './model'
import { cleanContext, type RfqContext, type SendTiming } from './submission'
import { fetchRegistry, useRfqSession, type RegistryLoader } from './useRfqSession'
import styles from './NativeRfq.module.css'

export const RFQ_OPEN_EVENT = 'h2o:rfq-open'
/** The inline quote form's section id (NativeRfqFormSection). */
export const QUOTE_FORM_ID = 'request-a-quote'
export type RfqOpenDetail = { context?: Record<string, unknown>; label?: string; trigger?: HTMLElement | null }
/** Launcher strings, rendered before the registry loads (server-supplied from the same registry keys). */
export type LauncherStrings = { label: string; aria: string; tooltip: string }

/**
 * The page's own name for the context note (CT R5.1, ruling 4): its H1, whitespace collapsed. Display only — the contract
 * carries the page as `page_path`; nothing here is sent.
 */
export const pageLabel = (): string => {
  const h1 = document.querySelector('main h1') ?? document.querySelector('h1')
  const text = (h1?.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text.length <= 120 ? text : ''
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** One question's answer box (chat): chips, the country picker, or a text box with a send button. */
function Answer({ reg, q, error, onAnswer }: { reg: Registry; q: Question; error?: { key: string; values?: Record<string, string> }; onAnswer: (v: string) => void }) {
  const [value, setValue] = useState('')
  const labelId = useId(), errorId = useId(), hintId = useId()
  const described = [error ? errorId : '', q.hintKey ? hintId : ''].filter(Boolean).join(' ') || undefined
  const label = <span id={labelId} className={styles.srOnly}>{t(reg, q.labelKey)}</span>
  if (q.type === 'chips') return <div className={styles.answer}>{label}<ChipGroup reg={reg} q={q} onPick={onAnswer} labelledBy={labelId}/><ErrorText reg={reg} id={errorId} error={error} live/></div>
  if (q.type === 'country') return <div className={styles.answer}>{label}<CountryPicker reg={reg} onPick={onAnswer} labelId={labelId} describedBy={described}/><ErrorText reg={reg} id={errorId} error={error} live/></div>
  const submit = () => onAnswer(value)
  const common = { id: `rfq-chat-${q.id}`, className: styles.input, value, 'aria-labelledby': labelId, 'aria-describedby': described, 'aria-invalid': error ? true : undefined, placeholder: t(reg, q.placeholderKey) || t(reg, 'input.ph'), maxLength: q.validation.maxLength + 1 }
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' && !(q.type === 'textarea' && e.shiftKey)) { e.preventDefault(); submit() } }
  return <div className={styles.answer}>
    {label}
    {q.hintKey ? <p className={styles.hint} id={hintId}>{t(reg, q.hintKey)}</p> : null}
    <div className={styles.composer}>
      {q.type === 'textarea'
        ? <textarea {...common} rows={2} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}/>
        : <input {...common} type={q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text'} inputMode={q.type === 'number_or_text' ? 'text' : undefined} autoComplete={q.id === 'name' ? 'name' : q.id === 'company' ? 'organization' : q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'off'} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}/>}
      <button type="button" className={styles.send} onClick={submit} aria-label={t(reg, 'input.send.aria')}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 20.5 21 12 3 3.5v6.6L15 12 3 13.9z"/></svg></button>
    </div>
    {q.skippable ? <div className={styles.chips}><button type="button" className={`${styles.chip} ${styles.skip}`} onClick={() => onAnswer('')}>{t(reg, 'chip.skip')}</button></div> : null}
    <ErrorText reg={reg} id={errorId} error={error} live/>
  </div>
}

export function NativeRfq({ launcher, locale = 'en', loader = fetchRegistry, fetcher, timing }: { launcher: LauncherStrings; locale?: string; loader?: RegistryLoader; fetcher?: typeof fetch; timing?: SendTiming }) {
  const s = useRfqSession('NATIVE_CHAT', locale, loader, fetcher, timing)
  const [open, setOpen] = useState(false)
  const [hp, setHp] = useState('')
  const [contextLabel, setContextLabel] = useState('')
  const [chatError, setChatError] = useState<{ id: string; key: string; values?: Record<string, string> } | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const titleId = useId()

  const { setContext, start } = s
  const openWith = useCallback((detail: RfqOpenDetail) => {
    const ctx: RfqContext = cleanContext(detail.context ?? { page_path: window.location.pathname, context_type: 'page', cta_placement: 'launcher' })
    setContext(ctx)
    setContextLabel(detail.label || pageLabel())
    returnTo.current = detail.trigger ?? (document.activeElement as HTMLElement | null)
    setOpen(true)
    start()
  }, [setContext, start])

  // First-touch attribution (CT R5.1): the launcher renders on every public page, so the session's first page load records
  // its landing tags here; nothing is sent until "Send request".
  useEffect(() => { captureFirstTouch(window) }, [])

  // RFQ-FIX-1 (audit R16, R4 F1 rule): while the page's own quote form (#request-a-quote) is on screen the launcher steps
  // aside, so it never covers a field or the Continue button; it comes back when the form scrolls away.
  const [formInView, setFormInView] = useState(false)
  useEffect(() => {
    const form = document.getElementById(QUOTE_FORM_ID)
    if (!form || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver((entries) => setFormInView(entries.some((e) => e.isIntersecting)))
    io.observe(form)
    return () => io.disconnect()
  }, [])

  // Any RFQ control on the page opens this panel with its own context.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = ((e as CustomEvent<RfqOpenDetail & { handled?: boolean }>).detail ?? {})
      detail.handled = true
      openWith(detail)
    }
    window.addEventListener(RFQ_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(RFQ_OPEN_EVENT, onOpen)
  }, [openWith])

  const { phase, reset } = s
  const close = useCallback(() => {
    setOpen(false)
    if (phase === 'sent') reset()
  }, [phase, reset])

  // Focus: into the panel on open and onto each new question; back to the opener on close (after the panel is gone).
  const current = s.registry && s.phase === 'asking' ? nextQuestion(s.registry, s.answers) : undefined
  useEffect(() => {
    if (!open) return
    const node = dialogRef.current
    // LEGAL-FIX-1 (L08): the review step is announced by moving focus to its heading
    if (s.phase === 'review') { reviewHeadingRef.current?.focus(); return }
    // the answer area first (each selector alternative scoped to it), else anything in the panel
    const scoped = FOCUSABLE.split(', ').map((sel) => `[data-rfq-focus] ${sel}`).join(', ')
    const target = node?.querySelector<HTMLElement>(scoped) ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
  }, [open, s.phase, current?.id])
  useEffect(() => {
    if (open) return
    const target = returnTo.current
    returnTo.current = null
    target?.focus()
  }, [open])

  // LEGAL-FIX-1 (L08, WCAG 2.4.3/4.1.2): while the panel is open the rest of the page is inert (out of the tab order and the
  // accessibility tree), at every level from the panel up to <body>; it comes back exactly as it was when the panel closes.
  useEffect(() => {
    const node = dialogRef.current
    if (!open || !node) return undefined
    const made: HTMLElement[] = []
    for (let el: HTMLElement | null = node.parentElement; el && el !== document.body && el.parentElement; el = el.parentElement) {
      for (const sibling of [...el.parentElement.children] as HTMLElement[]) {
        if (sibling === el || sibling.inert || ['SCRIPT', 'STYLE', 'TEMPLATE'].includes(sibling.tagName)) continue
        sibling.inert = true
        made.push(sibling)
      }
    }
    return () => { for (const sibling of made) sibling.inert = false }
  }, [open])

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    const node = dialogRef.current
    if (!open || !node) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) return
      const first = items[0]!, last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [open, close])

  // after the last question, straight to the review
  const readyForReview = s.phase === 'asking' && Boolean(s.registry) && !current
  const review = s.review
  useEffect(() => { if (readyForReview) review() }, [readyForReview, review])

  // the newest message stays in view
  const answeredCount = Object.keys(s.answers).length
  useEffect(() => { const l = logRef.current; if (l) l.scrollTop = l.scrollHeight }, [open, answeredCount, s.phase, chatError])

  const reg = s.registry
  const done = s.phase === 'review' || s.phase === 'sending' || s.phase === 'sent'
  const asked = reg ? questionsFor(reg, s.answers).filter((q) => q.id in s.answers) : []
  const firstContact = reg?.questions.find((q) => q.step === 'contact')?.id

  return <>
    <button ref={launcherRef} type="button" className={styles.launcher} aria-label={launcher.aria} title={launcher.tooltip} aria-haspopup="dialog" aria-expanded={open} data-rfq-launcher="" onClick={() => openWith({ trigger: launcherRef.current })} hidden={open || formInView}>
      <svg aria-hidden="true" className={styles.launcherIcon} viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg><span>{launcher.label}</span>
    </button>
    {open ? <div className={styles.overlay}>
      <div ref={dialogRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} data-rfq-panel="" data-phase={s.phase}>
        <header className={styles.header}>
          <div><h2 id={titleId} className={styles.title}>{reg ? t(reg, 'panel.title') : launcher.label}</h2>{reg ? <p className={styles.subtitle}>{t(reg, 'panel.subtitle')}</p> : null}</div>
          <button type="button" className={styles.close} onClick={close} aria-label={reg ? t(reg, 'panel.close.aria') : launcher.aria}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg></button>
        </header>
        <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-relevant="additions" hidden={done}>
          {s.phase === 'loading' ? <p className={styles.bot} aria-busy="true"><span className={styles.dots} aria-hidden="true">…</span></p> : null}
          {s.phase === 'unavailable' ? (reg ? <UnavailableNote reg={reg}/> : <p className={styles.bot}><a href={OFFICES_HREF}>{launcher.label}</a></p>) : !reg ? null : <>
            <p className={styles.bot}>{t(reg, 'greeting')}</p>
            {contextLabel ? <p className={styles.bot}>{t(reg, 'context.note', { context_label: contextLabel })}</p> : null}
            {s.phase === 'resume' ? <p className={styles.bot}>{t(reg, 'resume.prompt')}</p> : null}
            {s.phase !== 'resume' ? asked.map((q) => <div key={q.id}>
              {q.id === firstContact ? <p className={styles.bot}>{t(reg, 'contact.intro')}</p> : null}
              <p className={styles.bot}>{t(reg, q.labelKey)}</p>
              <p className={styles.me}>{s.answers[q.id] ? displayValue(reg, q, s.answers[q.id]) : t(reg, 'chip.skip')}</p>
            </div>) : null}
            {current ? <>
              {current.id === firstContact ? <p className={styles.bot}>{t(reg, 'contact.intro')}</p> : null}
              <p className={styles.bot}>{t(reg, current.labelKey)}</p>
            </> : null}
          </>}
        </div>
        {reg && s.phase !== 'unavailable' ? <div className={styles.footer} data-rfq-focus="">
          {s.phase === 'resume' ? <div className={styles.chips}>
            <button type="button" className={styles.chip} onClick={() => s.resume(true)}>{t(reg, 'resume.continue')}</button>
            <button type="button" className={styles.chip} onClick={() => s.resume(false)}>{t(reg, 'resume.restart')}</button>
          </div> : null}
          {s.phase === 'asking' && current ? <Answer key={current.id} reg={reg} q={current} error={chatError?.id === current.id ? chatError : s.errors[current.id]} onAnswer={(v) => {
            // the chat checks each answer as it is given (the server checks everything again)
            const err = validate(reg, current, v, 'chat')
            if (err) { setChatError({ id: current.id, ...err }); return }
            setChatError(null)
            s.answer(current.id, v)
          }}/> : null}
          {s.phase === 'review' || s.phase === 'sending' ? <>
            <h3 ref={reviewHeadingRef} className={styles.confirmHeading} tabIndex={-1}>{t(reg, 'review.heading')}</h3>
            <ReviewList reg={reg} answers={s.answers} onEdit={s.edit}/>
            <FailureNote reg={reg} failure={s.failure}/>
            <SendButton reg={reg} phase={s.phase} retryIn={s.retryIn} onSend={() => void s.send(hp)}/>
          </> : null}
          {s.phase === 'sent' ? <Confirmation reg={reg} rfqNumber={s.rfqNumber}><button type="button" className={styles.primary} onClick={close}>{t(reg, 'confirm.close')}</button></Confirmation> : null}
          {current?.step === 'contact' || s.phase === 'review' ? <PrivacyNote reg={reg}/> : null}
          <Honeypot reg={reg} value={hp} onChange={setHp}/>
        </div> : null}
      </div>
    </div> : null}
  </>
}
