'use client'
/**
 * Native RFQ: the inline form (brief §Scope 2) on /contact-us/ — the same registry, questions and rules as the chat, shown
 * all at once as a normal form: fieldsets with radio chips, labelled inputs, a native country select. "Check your request"
 * validates everything (errors beside each field, focus on the first), then the review and an explicit "Send request".
 * Source NATIVE_FORM (contract §4).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { searchCountries } from './countries'
import { Confirmation, ErrorText, FailureNote, Honeypot, PrivacyNote, ReviewList, UnavailableNote } from './fields'
import { questionsFor } from './flow'
import { t, type Question, type Registry } from './model'
import { cleanContext } from './submission'
import { fetchRegistry, useRfqSession, type RegistryLoader } from './useRfqSession'
import styles from './NativeRfq.module.css'

function Field({ reg, q, value, error, onChange }: { reg: Registry; q: Question; value: string; error?: { key: string; values?: Record<string, string> }; onChange: (v: string) => void }) {
  const id = `rfq-form-${q.id}`, errorId = useId(), hintId = useId()
  const described = [error ? errorId : '', q.hintKey ? hintId : ''].filter(Boolean).join(' ') || undefined
  const label = t(reg, q.labelKey)
  if (q.type === 'chips') return <fieldset className={styles.fieldset} aria-describedby={described} data-rfq-field={q.id}>
    <legend className={styles.label}>{label}</legend>
    <div className={styles.chips}>
      {(q.chips ?? []).map((c) => <label key={c.value} className={styles.radioChip}><input type="radio" name={id} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)}/><span>{t(reg, c.labelKey)}</span></label>)}
    </div>
    <ErrorText reg={reg} id={errorId} error={error}/>
  </fieldset>
  const common = { id, name: q.id, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value), 'aria-describedby': described, 'aria-invalid': error ? true : undefined, required: q.required, className: styles.input }
  return <div className={styles.field} data-rfq-field={q.id}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    {q.hintKey ? <p className={styles.hint} id={hintId}>{t(reg, q.hintKey)}</p> : null}
    {q.type === 'textarea' ? <textarea {...common} rows={4} placeholder={t(reg, q.placeholderKey) || undefined}/>
      : q.type === 'country' ? <select {...common} autoComplete="country"><option value="">{t(reg, 'contact.country.search_ph')}</option>{searchCountries(reg.countries, '', reg.locale).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
      : <input {...common} type={q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text'} placeholder={t(reg, q.placeholderKey) || undefined} autoComplete={q.id === 'name' ? 'name' : q.id === 'company' ? 'organization' : q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'off'}/>}
    <ErrorText reg={reg} id={errorId} error={error}/>
  </div>
}

export function NativeRfqForm({ pagePath = '/contact-us/', locale = 'en', loader = fetchRegistry, fetcher }: { pagePath?: string; locale?: string; loader?: RegistryLoader; fetcher?: typeof fetch }) {
  const s = useRfqSession('NATIVE_FORM', locale, loader, fetcher)
  const [hp, setHp] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)
  const headingId = useId()
  // contract §2: the registry loads when the inline form mounts; §3: the token on first use (the session fetches it at start)
  const { setContext, start } = s
  useEffect(() => { setContext(cleanContext({ page_path: pagePath, context_type: 'page', cta_placement: 'contact_form' })); start() }, [setContext, start, pagePath])
  // after "Check your request" with errors: focus the first field in error
  const errorIds = Object.keys(s.errors).join(',')
  useEffect(() => {
    if (!errorIds || s.phase !== 'asking') return
    const first = s.registry?.questions.find((q) => q.id in s.errors)
    formRef.current?.querySelector<HTMLElement>(`[data-rfq-field="${first?.id}"] input, [data-rfq-field="${first?.id}"] textarea, [data-rfq-field="${first?.id}"] select`)?.focus()
  }, [errorIds, s.phase, s.registry, s.errors])

  const reg = s.registry
  if (s.phase === 'unavailable') return reg ? <div className={styles.form}><UnavailableNote reg={reg}/></div> : null
  if (!reg) return <div className={styles.form} aria-busy="true"/>
  if (s.phase === 'sent') return <section className={styles.form} aria-live="polite"><Confirmation reg={reg} rfqNumber={s.rfqNumber}/></section>
  if (s.phase === 'review' || s.phase === 'sending') return <section className={styles.form} aria-labelledby={headingId}>
    <h3 id={headingId} className={styles.formHeading}>{t(reg, 'review.heading')}</h3>
    <ReviewList reg={reg} answers={s.answers} onEdit={s.edit}/>
    <FailureNote reg={reg} failure={s.failure}/>
    <Honeypot reg={reg} value={hp} onChange={setHp}/>
    <button type="button" className={styles.primary} disabled={s.phase === 'sending'} aria-busy={s.phase === 'sending'} onClick={() => void s.send(hp)}>{t(reg, s.phase === 'sending' ? 'review.sending' : 'review.send')}</button>
  </section>
  const questions = questionsFor(reg, s.answers)
  return <form ref={formRef} className={styles.form} noValidate aria-labelledby={headingId} onSubmit={(e) => { e.preventDefault(); s.review() }}>
    <h3 id={headingId} className={styles.formHeading}>{t(reg, 'panel.title')}</h3>
    {questions.map((q) => <Field key={q.id} reg={reg} q={q} value={s.answers[q.id] ?? ''} error={s.errors[q.id]} onChange={(v) => s.setAll({ ...s.answers, [q.id]: v })}/>)}
    <Honeypot reg={reg} value={hp} onChange={setHp}/>
    <PrivacyNote reg={reg}/>
    <button type="submit" className={styles.primary}>{t(reg, 'form.continue')}</button>
  </form>
}

/** The inline form as its own page section (the /contact-us/ quote request; the #request-a-quote anchor RFQ links fall back to). */
export function NativeRfqFormSection(props: Parameters<typeof NativeRfqForm>[0]) {
  return <section id="request-a-quote" className={styles.formSection}><NativeRfqForm {...props}/></section>
}
