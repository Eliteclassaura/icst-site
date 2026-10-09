'use client'
/**
 * Native RFQ: the corner launcher and chat panel (brief §Scope 1; contract §5). A launcher button bottom-right on every public
 * page opens a small panel (a full-height sheet on phones). Any RFQ control on the page opens the same panel with its page
 * context (the `h2o:rfq-open` event, ./NativeRfqTrigger).
 *
 * CHAT-FLOW-1 (owner, CT 2026-10-09): the panel asks like the old Typeform — one numbered question per step, with a progress
 * bar, OK (Enter), Back and Skip. Only the email is required. It opens straight on the email question; the just-in-time
 * privacy line sits under that field. The last OK submits (no review screen); a field the server refuses brings the visitor
 * back to that question.
 *
 * Accessibility: a modal dialog labelled by its title; focus moves into it on open and onto each new question's answer, Tab
 * stays inside, Escape closes it and focus returns to the control that opened it; each answer is labelled by its question and
 * its "Question n of total" position; errors are announced (role="alert"); targets are 44px; motion is off under
 * prefers-reduced-motion (CSS). No third-party script: everything is this bundle.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { captureFirstTouch } from './attribution'
import { EmailTypoHint } from './EmailTypoHint'
import { CountryPicker, ErrorText, FailureNote, Honeypot, OFFICES_HREF, UnavailableNote } from './fields'
import { autocompleteFor, questionText, questionsFor, validate, type Answers } from './flow'
import { t, tc, type Question, type Registry } from './model'
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

/** CHAT-FLOW-1: the just-in-time notice under the email field; its "Privacy Notice" link opens the policy in a new tab. */
function EmailNotice({ reg, id }: { reg: Registry; id: string }) {
  const [before, after = ''] = (reg.strings['chatflow.email.notice'] ?? '').split('{{privacy_policy_link}}')
  return <p className={styles.stepNotice} id={id}>{before}<a href="/privacy-policy/" target="_blank" rel="noopener noreferrer">{t(reg, 'privacy.link_text')}</a>{after}</p>
}

/** One question as a step: its number, the question, the answer control, OK / Enter, Back and Skip. */
function Step({ reg, q, n, total, answers, initial, error, last, onAnswer, onBack }: {
  reg: Registry; q: Question; n: number; total: number; answers: Answers; initial: string; last: boolean
  error?: { key: string; values?: Record<string, string> }; onAnswer: (v: string) => void; onBack?: () => void
}) {
  const [value, setValue] = useState(initial)
  const headingId = useId(), posId = useId(), errorId = useId(), hintId = useId(), noticeId = useId()
  const described = [error ? errorId : '', q.hintKey ? hintId : '', q.type === 'email' ? noticeId : ''].filter(Boolean).join(' ') || undefined
  const labelledBy = `${posId} ${headingId}`
  const submit = () => onAnswer(value)
  const onKey = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }
  const okLabel = t(reg, last ? 'chatflow.submit' : 'chatflow.ok')
  const common = { id: `rfq-chat-${q.id}`, className: styles.stepInput, value, 'aria-labelledby': labelledBy, 'aria-describedby': described, 'aria-invalid': error ? true : undefined, 'aria-required': q.required || undefined, placeholder: t(reg, q.placeholderKey) || t(reg, 'input.ph'), maxLength: q.validation.maxLength + 1 }
  return <div className={styles.step} role="group" aria-labelledby={labelledBy} data-rfq-step={q.id}>
    <p className={styles.srOnly} id={posId}>{t(reg, 'chatflow.progress', { n: String(n), total: String(total) })}</p>
    <h3 className={styles.stepQ} id={headingId}>
      <span className={styles.stepNumber} aria-hidden="true">{n}<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4 10.6 5.4 16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z"/></svg></span>
      <span>{questionText(reg, q, answers)}{q.required ? <span className={styles.stepRequired} aria-hidden="true">*</span> : null}</span>
    </h3>
    {q.hintKey ? <p className={styles.hint} id={hintId}>{t(reg, q.hintKey)}</p> : null}
    {q.type === 'chips'
      ? <div className={styles.stepChoices} role="group" aria-labelledby={labelledBy}>
          {(q.chips ?? []).map((c) => <button key={c.value} type="button" className={styles.choice} aria-pressed={value === c.value} onClick={() => { setValue(c.value); onAnswer(c.value) }}>{t(reg, c.labelKey)}</button>)}
        </div>
      : q.type === 'country'
        ? <CountryPicker reg={reg} value={value} onPick={(code) => { setValue(code); onAnswer(code) }} labelId={headingId} describedBy={described}/>
        : q.type === 'textarea'
          ? <textarea {...common} rows={3} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}/>
          : <input {...common} type={q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text'} autoComplete={autocompleteFor(q)} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}/>}
    {q.type === 'email' ? <EmailTypoHint reg={reg} value={value} onUse={setValue}/> : null}
    <ErrorText reg={reg} id={errorId} error={error} live chat/>
    {q.type === 'email' ? <EmailNotice reg={reg} id={noticeId}/> : null}
    <div className={styles.stepActions}>
      {q.type === 'chips' || q.type === 'country' ? null : <>
        <button type="button" className={styles.ok} onClick={submit}>{okLabel}</button>
        <span className={styles.enterHint} aria-hidden="true">{t(reg, 'chatflow.enter')}</span>
      </>}
    </div>
    <div className={styles.stepNav}>
      {onBack ? <button type="button" className={styles.navButton} onClick={onBack}>{t(reg, 'chatflow.back')}</button> : <span/>}
      {q.required ? null : <button type="button" className={styles.navButton} onClick={() => onAnswer('')}>{t(reg, 'chatflow.skip')}</button>}
    </div>
  </div>
}

export function NativeRfq({ launcher, locale = 'en', loader = fetchRegistry, fetcher, timing }: { launcher: LauncherStrings; locale?: string; loader?: RegistryLoader; fetcher?: typeof fetch; timing?: SendTiming }) {
  const s = useRfqSession('NATIVE_CHAT', locale, loader, fetcher, timing)
  const [open, setOpen] = useState(false)
  const [hp, setHp] = useState('')
  const [contextLabel, setContextLabel] = useState('')
  const [chatError, setChatError] = useState<{ id: string; key: string; values?: Record<string, string> } | null>(null)
  // CHAT-FLOW-1: the step on screen, an index into the chat's questions. `null` = the first step not yet answered or skipped:
  // where a new or resumed request starts, and where a field the server refused (the session reopens it) is asked again.
  const [cursorAt, setCursorAt] = useState<number | null>(null)
  // CHAT-FLOW-1 (Auditor condition 2): after a NOTICE_CHANGED refusal the chat goes back to the email step, where the current
  // privacy line is shown (adjusted while rendering, not in an effect)
  const [noticeSeen, setNoticeSeen] = useState(s.noticeRev)
  if (noticeSeen !== s.noticeRev) {
    setNoticeSeen(s.noticeRev)
    setCursorAt(0)
  }
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)
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
  // its landing tags here; nothing is sent until the request is submitted.
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
    if (phase === 'sent') { reset(); setCursorAt(null) }
  }, [phase, reset])

  const reg = s.registry
  const flow = reg ? questionsFor(reg, s.answers, 'chat') : []
  const firstOpen = flow.findIndex((q) => !(q.id in s.answers))
  const cursor = cursorAt ?? (firstOpen < 0 ? flow.length : firstOpen)
  const atEnd = cursor >= flow.length && flow.length > 0
  const current = reg && s.phase === 'asking' && !atEnd ? flow[cursor] : undefined

  // Focus: into the panel on open and onto each new step's answer; back to the opener on close (after the panel is gone).
  useEffect(() => {
    if (!open) return
    const node = dialogRef.current
    const scoped = FOCUSABLE.split(', ').map((sel) => `[data-rfq-focus] ${sel}`).join(', ')
    const target = node?.querySelector<HTMLElement>(scoped) ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
  }, [open, s.phase, cursor, current?.id])
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

  const onAnswer = (q: Question, v: string, isLast: boolean) => {
    if (!reg) return
    // each answer is checked as it is given (the server checks everything again)
    const err = validate(reg, q, v, 'chat')
    if (err) { setChatError({ id: q.id, ...err }); return }
    setChatError(null)
    if (q.id === 'email' && s.errors.email?.key === 'err.notice_changed') {
      // the visitor has seen the current line: every other answer stands, so go straight back to Submit
      s.answer(q.id, v)
      setCursorAt(null)
      return
    }
    if (isLast) {
      // the last OK submits: the session records the answer, checks everything and sends with it; a field the server
      // refuses is reopened, and `null` brings the visitor back to it
      setCursorAt(null)
      s.finish(hp, q.id, v)
      return
    }
    s.answer(q.id, v)
    setCursorAt(cursor + 1)
  }

  const progress = flow.length ? Math.round((Math.min(cursor, flow.length) / flow.length) * 100) : 0
  const sending = s.phase === 'sending'
  const first = (s.answers.first_name ?? '').trim()

  return <>
    <button ref={launcherRef} type="button" className={styles.launcher} aria-label={launcher.aria} title={launcher.tooltip} aria-haspopup="dialog" aria-expanded={open} data-rfq-launcher="" onClick={() => openWith({ trigger: launcherRef.current })} hidden={open || formInView}>
      <svg aria-hidden="true" className={styles.launcherIcon} viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg><span>{launcher.label}</span>
    </button>
    {open ? <div className={`${styles.overlay} notranslate`} translate="no">
      <div ref={dialogRef} className={`${styles.panel} notranslate`} translate="no" role="dialog" aria-modal="true" aria-labelledby={titleId} data-rfq-panel="" data-phase={s.phase}>
        <header className={styles.header}>
          <div><h2 id={titleId} className={styles.title}>{reg ? t(reg, 'panel.title') : launcher.label}</h2>{reg ? <p className={styles.subtitle}>{t(reg, 'panel.subtitle')}</p> : null}</div>
          <button type="button" className={styles.close} onClick={close} aria-label={reg ? t(reg, 'panel.close.aria') : launcher.aria}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg></button>
        </header>
        {reg && s.phase !== 'unavailable' && s.phase !== 'sent' ? <div className={styles.progress} aria-hidden="true"><span style={{ inlineSize: `${progress}%` }}/></div> : null}
        <div className={styles.stage} data-rfq-focus="">
          {s.phase === 'loading' ? <p className={styles.stepNotice} aria-busy="true"><span className={styles.dots} aria-hidden="true">…</span></p> : null}
          {s.phase === 'unavailable' ? (reg ? <UnavailableNote reg={reg}/> : <p><a href={OFFICES_HREF}>{launcher.label}</a></p>) : null}
          {reg && s.phase === 'resume' ? <div className={styles.step}>
            <h3 className={styles.stepQ}>{tc(reg, 'resume.prompt')}</h3>
            <div className={styles.stepChoices}>
              <button type="button" className={styles.choice} onClick={() => s.resume(true)}>{t(reg, 'resume.continue')}</button>
              <button type="button" className={styles.choice} onClick={() => { s.resume(false); setCursorAt(null) }}>{t(reg, 'resume.restart')}</button>
            </div>
          </div> : null}
          {/* CT R5.1: the page the visitor came from, shown once above the first question; never asked, never sent as text */}
          {reg && current && cursor === 0 && contextLabel ? <p className={styles.stepNotice} data-rfq-context="">{t(reg, 'context.note', { context_label: contextLabel })}</p> : null}
          {reg && current ? <Step key={`${current.id}:${cursor}`} reg={reg} q={current} n={cursor + 1} total={flow.length} answers={s.answers} initial={s.answers[current.id] ?? ''} last={cursor === flow.length - 1}
            error={chatError?.id === current.id ? chatError : s.errors[current.id]}
            onAnswer={(v) => onAnswer(current, v, cursor === flow.length - 1)}
            onBack={cursor > 0 ? () => { setChatError(null); setCursorAt(cursor - 1) } : undefined}/> : null}
          {reg && atEnd && s.phase !== 'sent' && s.phase !== 'resume' ? <div className={styles.step}>
            {s.failure ? <>
              <FailureNote reg={reg} failure={s.failure} chat/>
              <div className={styles.stepActions}><button type="button" className={styles.ok} disabled={s.retryIn > 0} onClick={() => void s.send(hp)}>{t(reg, 'chatflow.retry')}{s.retryIn > 0 ? ` (${Math.floor(s.retryIn / 60)}:${String(s.retryIn % 60).padStart(2, '0')})` : ''}</button></div>
              <div className={styles.stepNav}><button type="button" className={styles.navButton} onClick={() => setCursorAt(flow.length - 1)}>{t(reg, 'chatflow.back')}</button><span/></div>
            </> : sending ? <p className={styles.stepNotice} role="status" aria-busy="true">{t(reg, 'chatflow.submitting')}</p> : <>
              {/* every step answered but not sent yet (e.g. a resumed draft): Submit checks everything again, then sends */}
              <div className={styles.stepActions}><button type="button" className={styles.ok} onClick={() => { if (s.review()) void s.send(hp) }}>{t(reg, 'chatflow.submit')}</button></div>
              <div className={styles.stepNav}><button type="button" className={styles.navButton} onClick={() => setCursorAt(flow.length - 1)}>{t(reg, 'chatflow.back')}</button><span/></div>
            </>}
          </div> : null}
          {reg && s.phase === 'sent' ? <ChatDone reg={reg} first={first} rfqNumber={s.rfqNumber} onClose={close}/> : null}
          {reg ? <Honeypot reg={reg} value={hp} onChange={setHp}/> : null}
        </div>
      </div>
    </div> : null}
  </>
}

/** CHAT-FLOW-1: the end screen — "Thank you {first}!", the response promise when the server serves it, the RFQ number, and
 * how to send files (owner 2026-10-09: no upload step; "reply to our email with any drawings or PDFs"). With the customer
 * acknowledgement off there is no email to reply to, so the served "email us at … with your RFQ number" line is kept. The
 * served line is compared with the ack-on text: the server has already filled in the sales address, so it never still holds
 * the `{{sales_email}}` placeholder. */
function ChatDone({ reg, first, rfqNumber, onClose }: { reg: Registry; first: string; rfqNumber: string | null; onClose: () => void }) {
  const attachments = reg.strings['confirm.attachments'] ?? ''
  const ackOn = attachments !== '' && attachments === reg.strings['confirm.attachments.ack_on']
  const heading = first ? t(reg, 'chatflow.done.heading', { first }) : t(reg, 'chatflow.done.heading_anon')
  const numberParts = (reg.strings['chatflow.done.number'] ?? '').split('{{rfq_number}}')
  return <div className={styles.step} role="status">
    <h3 className={styles.stepQ}>{heading}</h3>
    {reg.strings['confirm.response_time'] ? <p>{t(reg, 'confirm.response_time')}</p> : null}
    {rfqNumber ? <p>{numberParts[0]}<span translate="no" className={`${styles.rfqNumber} notranslate`}>{rfqNumber}</span>{numberParts[1] ?? ''}</p> : null}
    {ackOn ? <p className={styles.stepNotice}>{t(reg, 'chatflow.done.attachments')}</p>
      : attachments && (rfqNumber || !attachments.includes('{{rfq_number}}')) ? <p className={styles.stepNotice}>{t(reg, 'confirm.attachments', { rfq_number: rfqNumber ?? '' })}</p> : null}
    <div className={styles.stepActions}><button type="button" className={styles.ok} onClick={onClose}>{t(reg, 'confirm.close')}</button></div>
  </div>
}
