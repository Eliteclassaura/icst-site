'use client'
/**
 * Native RFQ: the pieces both surfaces render (chat panel and inline form). Every visible string is a registry key.
 * Targets are at least 44px (CSS); errors are tied to their control with aria-describedby; nothing is announced twice.
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { searchCountries } from './countries'
import { reviewGroups, type Answers } from './flow'
import { t, type Question, type Registry } from './model'
import styles from './NativeRfq.module.css'

/** The page that lists the ICS offices and their telephones ("call an ICS office"). */
export const OFFICES_HREF = '/contact-us/#offices'

export function ErrorText({ reg, id, error }: { reg: Registry; id: string; error?: { key: string; values?: Record<string, string> } }) {
  if (!error) return null
  return <p className={styles.error} id={id}>{t(reg, error.key, error.values)}</p>
}

/** Quick replies: one button per chip (and "Skip" for an optional question). */
export function ChipGroup({ reg, q, value, onPick, labelledBy, skippable = q.skippable }: { reg: Registry; q: Question; value?: string; onPick: (v: string) => void; labelledBy: string; skippable?: boolean }) {
  return <div className={styles.chips} role="group" aria-labelledby={labelledBy}>
    {(q.chips ?? []).map((c) => <button key={c.value} type="button" className={styles.chip} aria-pressed={value === c.value} onClick={() => onPick(c.value)}>{t(reg, c.labelKey)}</button>)}
    {skippable ? <button type="button" className={`${styles.chip} ${styles.skip}`} onClick={() => onPick('')}>{t(reg, 'chip.skip')}</button> : null}
  </div>
}

/** The country picker: a search box and the matching countries as buttons (the visitor picks one; its code travels). */
export function CountryPicker({ reg, value, onPick, labelId, describedBy }: { reg: Registry; value?: string; onPick: (code: string) => void; labelId: string; describedBy?: string }) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const matches = useMemo(() => searchCountries(reg.countries, query, reg.locale), [reg, query])
  return <div className={styles.country}>
    <input id={inputId} className={styles.input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(reg, 'contact.country.search_ph')} aria-labelledby={labelId} aria-describedby={describedBy} autoComplete="country-name"/>
    {matches.length ? <ul className={styles.countryList} aria-labelledby={labelId}>
      {matches.slice(0, query ? 12 : 8).map((c) => <li key={c.code}><button type="button" className={styles.countryOption} aria-pressed={value === c.code} onClick={() => onPick(c.code)}>{c.name}</button></li>)}
    </ul> : <p className={styles.hint} role="status">{t(reg, 'contact.country.empty')}</p>}
  </div>
}

/** The hidden field (contract §4): visually hidden, out of the tab order and the accessibility tree; its value is sent as `hp`. */
export function Honeypot({ reg, value, onChange }: { reg: Registry; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return <div className={styles.hp} aria-hidden="true">
    <label htmlFor={id}>{t(reg, 'honeypot.label')}</label>
    <input id={id} name="company_website" type="text" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)}/>
  </div>
}

/** "We use these details only to respond to your request. See our Privacy Policy." with the link in place. */
export function PrivacyNote({ reg }: { reg: Registry }) {
  const [before, after = ''] = (reg.strings['privacy.note'] ?? '').split('{{privacy_policy_link}}')
  return <p className={styles.privacy}>{before}<a href="/privacy-policy/">Privacy Policy</a>{after}</p>
}

/** The review list: each answer with its own "Edit" control. */
export function ReviewList({ reg, answers, onEdit }: { reg: Registry; answers: Answers; onEdit: (id: string) => void }) {
  return <div className={styles.review}>
    {reviewGroups(reg, answers).map((g) => <dl key={g.id} className={styles.reviewGroup}>
      {g.items.map((i) => <div key={i.id} className={styles.reviewItem}>
        <dt>{t(reg, i.labelKey)}</dt>
        <dd><span>{i.value}</span><button type="button" className={styles.edit} onClick={() => onEdit(i.id)} aria-label={`${t(reg, 'review.edit')}: ${t(reg, i.labelKey)}`}>{t(reg, 'review.edit')}</button></dd>
      </div>)}
    </dl>)}
  </div>
}

/** A send failure: its message, with the office telephones where the message points to them. */
export function FailureNote({ reg, failure }: { reg: Registry; failure: { key: string } | null }) {
  if (!failure) return null
  const text = t(reg, failure.key)
  const [lead, tail] = text.split(/(call an ICS office\.?)$/)
  return <p className={styles.failure} role="alert">{tail ? <>{lead}<a href={OFFICES_HREF}>{tail}</a></> : text}</p>
}

/** The confirmation: the RFQ number when there is one (contract amendment (a): the no-number line otherwise). */
export function Confirmation({ reg, rfqNumber, children }: { reg: Registry; rfqNumber: string | null; children?: ReactNode }) {
  return <div className={styles.confirm}>
    <h3 className={styles.confirmHeading}>{t(reg, 'confirm.heading')}</h3>
    <p>{rfqNumber ? t(reg, 'confirm.body', { rfq_number: rfqNumber }) : t(reg, 'confirm.body_no_number')}</p>
    <p>{t(reg, 'confirm.attachments')}</p>
    {children}
  </div>
}
