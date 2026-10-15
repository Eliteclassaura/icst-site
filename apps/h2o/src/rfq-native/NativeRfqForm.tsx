'use client'
/**
 * Native RFQ: the inline form (brief §Scope 2) on /contact-us/ — the same registry, questions and rules as the chat, shown
 * all at once as a normal form: fieldsets with radio chips, labelled inputs, a native country select. "Check your request"
 * validates everything (errors beside each field, focus on the first), then the review and an explicit "Send request".
 * Source NATIVE_FORM (contract §4).
 */
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react'
import { searchCountries } from './countries'
import { EmailTypoHint } from './EmailTypoHint'
import { Confirmation, ErrorText, FailureNote, Honeypot, PrivacyNote, ReviewList, SendButton, UnavailableNote } from './fields'
import { autocompleteFor, questionsFor } from './flow'
import { t, type Question, type Registry } from './model'
import { cleanContext, type SendTiming } from './submission'
import { fetchRegistry, useRfqSession, type RegistryLoader } from './useRfqSession'
import styles from './NativeRfq.module.css'

function Field({ reg, q, value, error, onChange, onLeave }: { reg: Registry; q: Question; value: string; error?: { key: string; values?: Record<string, string> }; onChange: (v: string) => void; onLeave: () => void }) {
  const id = `rfq-form-${q.id}`, errorId = useId(), hintId = useId(), legendId = useId()
  const described = [error ? errorId : '', q.hintKey ? hintId : ''].filter(Boolean).join(' ') || undefined
  const label = t(reg, q.labelKey)
  // 1.3a-F1: every question says whether it is required ("*", visual only: the control itself is marked required) or optional
  // ("(optional)", unless its own label already says so)
  const mark = q.required
    ? <span className={styles.requiredMark} aria-hidden="true"> {t(reg, 'form.required.mark')}</span>
    : /\(optional\)/i.test(label) ? null : <span className={styles.optionalMark}> {t(reg, 'form.optional.suffix')}</span>
  // 1.3a-F1: leaving the field checks it. Focus moving straight to a button (the submit) skips the check: the submit checks
  // everything itself, and an error line appearing under the field would move the button out from under the click.
  const onBlur = (e: FocusEvent) => { if (!(e.relatedTarget instanceof HTMLButtonElement)) onLeave() }
  if (q.type === 'chips') return <fieldset className={styles.fieldset} aria-describedby={described} data-rfq-field={q.id}>
    <legend id={legendId} className={styles.label}>{label}{mark}</legend>
    {/* RFQ-FIX-1 (audit R18): the choice group carries the invalid state (radio inputs cannot) */}
    <div className={styles.chips} role="radiogroup" aria-labelledby={legendId} aria-required={q.required || undefined} aria-invalid={error ? true : undefined}>
      {(q.chips ?? []).map((c) => <label key={c.value} className={styles.radioChip}><input type="radio" name={id} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)}/><span>{t(reg, c.labelKey)}</span></label>)}
    </div>
    <ErrorText reg={reg} id={errorId} error={error}/>
  </fieldset>
  // RFQ-FIX-1 (audit R10): the browser stops input at the question's own limit (the server checks it again)
  const common = { id, name: q.id, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value), 'aria-describedby': described, 'aria-invalid': error ? true : undefined, required: q.required, onBlur, className: styles.input, ...(q.type === 'country' ? {} : { maxLength: q.validation.maxLength }) }
  return <div className={styles.field} data-rfq-field={q.id}>
    <label className={styles.label} htmlFor={id}>{label}{mark}</label>
    {q.hintKey ? <p className={styles.hint} id={hintId}>{t(reg, q.hintKey)}</p> : null}
    {q.type === 'textarea' ? <><textarea {...common} rows={4} placeholder={t(reg, q.placeholderKey) || undefined}/><span className={styles.counter} aria-hidden="true">{value.length} / {q.validation.maxLength}</span></>
      : q.type === 'country' ? <select {...common} autoComplete="country"><option value="">{t(reg, 'contact.country.search_ph')}</option>{searchCountries(reg.countries, '', reg.locale).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
      : <input {...common} type={q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text'} placeholder={t(reg, q.placeholderKey) || undefined} autoComplete={autocompleteFor(q)}/>}
    {q.type === 'email' ? <EmailTypoHint reg={reg} value={value} onUse={onChange}/> : null}
    <ErrorText reg={reg} id={errorId} error={error}/>
  </div>
}

export function NativeRfqForm({ pagePath = '/contact-us/', locale = 'en', loader = fetchRegistry, fetcher, timing }: { pagePath?: string; locale?: string; loader?: RegistryLoader; fetcher?: typeof fetch; timing?: SendTiming }) {
  const s = useRfqSession('NATIVE_FORM', locale, loader, fetcher, timing)
  const [hp, setHp] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const sentRef = useRef<HTMLElement | null>(null)
  const editing = useRef<string | null>(null)
  const headingId = useId()
  // contract §2: the registry loads when the inline form mounts; §3: the token on first use (the session fetches it at start)
  const { setContext, start } = s
  useEffect(() => { setContext(cleanContext({ page_path: pagePath, context_type: 'page', cta_placement: 'contact_form' })); start() }, [setContext, start, pagePath])
  // the questions in their visual order (changes only when the purpose changes the flow, not on every keystroke)
  const flowOrder = s.registry ? questionsFor(s.registry, s.answers).map((q) => q.id).join(',') : ''
  // Focus goes to the first field in error ONLY after a check of the whole form: "Review and send" (submit) with errors, or a server
  // refusal that sends the visitor back from the review screen to the questions. It must never follow an error that appears or
  // disappears while the visitor is typing or leaving a field (1.3a-F1 rev2): the early email check on blur replaces the errors
  // too, and moving focus then would snap it back to the email field every time the visitor tried to continue.
  const focusFirstError = useRef(false)
  const prevPhase = useRef(s.phase)
  useEffect(() => {
    if ((prevPhase.current === 'review' || prevPhase.current === 'sending') && s.phase === 'asking' && !editing.current) focusFirstError.current = true
    prevPhase.current = s.phase
  }, [s.phase])
  const errorIds = Object.keys(s.errors).join(',')
  useEffect(() => {
    if (!focusFirstError.current) return
    if (s.phase === 'review' || s.phase === 'sending' || s.phase === 'sent') { focusFirstError.current = false; return }
    // RFQ-FIX-1 (audit R18): also when a resumed draft is checked
    if (s.phase !== 'asking' && s.phase !== 'resume') return
    focusFirstError.current = false
    if (!errorIds) return
    // RFQ-FIX-1.1: the first error in the visual order (email and name first)
    const first = flowOrder.split(',').find((id) => id in s.errors)
    formRef.current?.querySelector<HTMLElement>(`[data-rfq-field="${first}"] input, [data-rfq-field="${first}"] textarea, [data-rfq-field="${first}"] select`)?.focus()
  }, [errorIds, s.phase, s.errors, flowOrder])
  // LEGAL-FIX-1 (L08, WCAG 2.4.3): the form's content is replaced at each step, so focus moves with it — to the review heading,
  // to the confirmation once sent, and back to the field being edited from the review.
  useEffect(() => {
    if (s.phase === 'review') reviewHeadingRef.current?.focus()
    else if (s.phase === 'sent') sentRef.current?.focus()
    else if (s.phase === 'asking' && editing.current) {
      const id = editing.current
      editing.current = null
      formRef.current?.querySelector<HTMLElement>(`[data-rfq-field="${id}"] input, [data-rfq-field="${id}"] textarea, [data-rfq-field="${id}"] select`)?.focus()
    }
  }, [s.phase])
  const { edit } = s
  const onEdit = (id: string) => { editing.current = id; edit(id) }

  const reg = s.registry
  if (s.phase === 'unavailable') return reg ? <div className={`${styles.form} notranslate`} translate="no"><UnavailableNote reg={reg}/></div> : null
  if (!reg) return <div className={`${styles.form} notranslate`} translate="no" aria-busy="true"/>
  if (s.phase === 'sent') return <section ref={sentRef} className={`${styles.form} notranslate`} translate="no" aria-live="polite" tabIndex={-1}><Confirmation reg={reg} rfqNumber={s.rfqNumber}/></section>
  if (s.phase === 'review' || s.phase === 'sending') return <section className={`${styles.form} notranslate`} translate="no" aria-labelledby={headingId}>
    <h3 id={headingId} ref={reviewHeadingRef} className={styles.formHeading} tabIndex={-1}>{t(reg, 'review.heading')}</h3>
    <ReviewList reg={reg} answers={s.answers} onEdit={onEdit}/>
    <FailureNote reg={reg} failure={s.failure}/>
    <Honeypot reg={reg} value={hp} onChange={setHp}/>
    {/* FORM-NOTICE-1: the collection notice sits directly above "Send request" */}
    <PrivacyNote reg={reg}/>
    <SendButton reg={reg} phase={s.phase} retryIn={s.retryIn} onSend={() => void s.send(hp)}/>
  </section>
  const questions = questionsFor(reg, s.answers)
  // method="post" (QA pre-pass S5): even without the script nothing typed here could ever reach a URL
  return <form ref={formRef} className={`${styles.form} notranslate`} translate="no" method="post" noValidate aria-labelledby={headingId} onSubmit={(e) => { e.preventDefault(); focusFirstError.current = true; s.review() }}>
    <h3 id={headingId} className={styles.formHeading}>{t(reg, 'panel.title')}</h3>
    <p className={styles.requiredNote}>{t(reg, 'form.required.note')}</p>
    {questions.map((q) => <Field key={q.id} reg={reg} q={q} value={s.answers[q.id] ?? ''} error={s.errors[q.id]} onChange={(v) => s.setAll({ ...s.answers, [q.id]: v }, q.id)} onLeave={() => s.checkField(q.id)}/>)}
    <Honeypot reg={reg} value={hp} onChange={setHp}/>
    <FailureNote reg={reg} failure={s.failure}/>
    <PrivacyNote reg={reg}/>
    <button type="submit" className={styles.primary}>{t(reg, 'form.continue')}</button>
  </form>
}

/** The inline form as its own page section (the /contact-us/ quote request; the #request-a-quote anchor RFQ links fall back to). */
export function NativeRfqFormSection(props: Parameters<typeof NativeRfqForm>[0]) {
  return <section id="request-a-quote" className={styles.formSection}><NativeRfqForm {...props}/></section>
}
