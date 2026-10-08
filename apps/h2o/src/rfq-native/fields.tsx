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

/** `live` (LEGAL-FIX-1 L08, WCAG 4.1.3): announce the error as it appears — the chat, where focus stays in the answer field.
 * The inline form moves focus to the first field in error instead, whose description carries the message. */
export function ErrorText({ reg, id, error, live = false }: { reg: Registry; id: string; error?: { key: string; values?: Record<string, string> }; live?: boolean }) {
  if (!error) return null
  return <p className={styles.error} id={id} role={live ? 'alert' : undefined}>{t(reg, error.key, error.values)}</p>
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

/**
 * The hidden field (contract §4): visually hidden, out of the tab order and the accessibility tree; its value is sent as `hp`.
 * RFQ-FIX-1 (audit R5): a name no autofill profile knows, and the password managers' "ignore" markers, so a person's browser
 * never fills it (a filled one is kept for an admin to check, never silently dropped).
 */
export function Honeypot({ reg, value, onChange }: { reg: Registry; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return <div className={styles.hp} aria-hidden="true">
    <label htmlFor={id}>{t(reg, 'honeypot.label')}</label>
    <input id={id} name="h2o_hp_x" type="text" tabIndex={-1} autoComplete="off" data-1p-ignore="" data-lpignore="true" data-bwignore="" data-form-type="other" value={value} onChange={(e) => onChange(e.target.value)}/>
  </div>
}

/** A registry string with one placeholder rendered as a link (its text is a registry string too). */
export function Linked({ reg, textKey, placeholder, href, linkTextKey }: { reg: Registry; textKey: string; placeholder: string; href: string; linkTextKey: string }) {
  const parts = (reg.strings[textKey] ?? '').split(`{{${placeholder}}}`)
  return <>{parts.map((part, i) => <span key={i}>{part}{i < parts.length - 1 ? <a href={href}>{t(reg, linkTextKey)}</a> : null}</span>)}</>
}

/** FORM-NOTICE-1: the only links the notice may carry (the two legal pages); anything else stays plain text. */
const NOTICE_LINKS = new Set(['/privacy-policy/', '/cookie-notice/'])
/** One line of the approved notice: **bold** and [text](/allowed/) only; everything else is text (React escapes it). */
export function NoticeLine({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let at = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > at) parts.push(text.slice(at, m.index))
    if (m[1] !== undefined) parts.push(<strong key={m.index}>{m[1]}</strong>)
    else parts.push(NOTICE_LINKS.has(m[3]!) ? <a key={m.index} href={m[3]}>{m[2]}</a> : `[${m[2]}](${m[3]})`)
    at = m.index + m[0].length
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

/**
 * The collection notice (FORM-NOTICE-1, approved copy): the short notice with the Privacy Notice link, and the full notice
 * behind a native "How we use your details" disclosure (no script). Shown directly above "Send request".
 */
export function PrivacyNote({ reg }: { reg: Registry }) {
  const items = (reg.strings['privacy.details.items'] ?? '').split('\n').filter(Boolean)
  return <div className={styles.privacy}>
    <p><Linked reg={reg} textKey="privacy.note" placeholder="privacy_policy_link" href="/privacy-policy/" linkTextKey="privacy.link_text"/></p>
    {items.length ? <details className={styles.privacyDetails}>
      <summary>{t(reg, 'privacy.details.link')}</summary>
      <ul>{items.map((line, i) => <li key={i}><NoticeLine text={line}/></li>)}</ul>
    </details> : null}
  </div>
}

/** The intake is switched off (registry `enabled: false`): the line pointing to the offices (CT Round 5 ruling 1). */
export function UnavailableNote({ reg }: { reg: Registry }) {
  return <p className={styles.failure} role="status"><Linked reg={reg} textKey="panel.unavailable" placeholder="offices_link" href={OFFICES_HREF} linkTextKey="offices.link_text"/></p>
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

/** A send failure: its message, with `{{offices_link}}` as the link to the office telephones (CT Round 5 ruling 1). */
export function FailureNote({ reg, failure }: { reg: Registry; failure: { key: string; values?: Record<string, string> } | null }) {
  if (!failure) return null
  return <p className={styles.failure} role="alert"><Linked reg={{ ...reg, strings: { ...reg.strings, [failure.key]: t(reg, failure.key, { ...failure.values, offices_link: '{{offices_link}}' }) } }} textKey={failure.key} placeholder="offices_link" href={OFFICES_HREF} linkTextKey="offices.link_text"/></p>
}

/** The confirmation: the RFQ number when there is one (contract amendment (a): the no-number line otherwise), then the
 * response promise (owner-confirmed, CT 2026-10-05) and the attachments line. RFQ-FIX-1 (audit R15): the server serves the
 * body and attachments lines that match its configuration (promise on/off, customer acknowledgement on/off); a line that
 * needs the RFQ number is left out when there is none. */
export function Confirmation({ reg, rfqNumber, children }: { reg: Registry; rfqNumber: string | null; children?: ReactNode }) {
  const attachments = reg.strings['confirm.attachments'] ?? ''
  return <div className={styles.confirm}>
    <h3 className={styles.confirmHeading}>{t(reg, 'confirm.heading')}</h3>
    <p>{rfqNumber ? t(reg, 'confirm.body', { rfq_number: rfqNumber }) : t(reg, 'confirm.body_no_number')}</p>
    {reg.strings['confirm.response_time'] ? <p>{t(reg, 'confirm.response_time')}</p> : null}
    {attachments && (rfqNumber || !attachments.includes('{{rfq_number}}')) ? <p>{t(reg, 'confirm.attachments', { rfq_number: rfqNumber ?? '' })}</p> : null}
    {children}
  </div>
}

/** The send button: "Sending…" in flight; disabled with the time left while a rate limit's Retry-After runs. */
export function SendButton({ reg, phase, retryIn, onSend }: { reg: Registry; phase: string; retryIn: number; onSend: () => void }) {
  const sending = phase === 'sending'
  const wait = retryIn > 0 ? ` (${Math.floor(retryIn / 60)}:${String(retryIn % 60).padStart(2, '0')})` : ''
  return <div className={styles.actionBar}><button type="button" className={styles.primary} disabled={sending || retryIn > 0} aria-busy={sending} onClick={onSend}>{t(reg, sending ? 'review.sending' : 'review.send')}{wait}</button></div>
}
