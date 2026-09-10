import { defineBlock } from '../types'
import { fixtures } from './fixture'
import { SectionHead } from '../shared/SectionHead'
import './brief-form.css'

export type SelectField = { name: string; label: string; options: string[]; defaultValue?: string }

export type BriefFormProps = {
  eyebrow?: string
  title: string
  lede?: string
  /** Where the native POST goes; C6 provides `/api/forms/brief`. */
  action: string
  /** Select options come from the `form-config` global so chat and form agree (R19). */
  selects: SelectField[]
  briefPlaceholder?: string
  optIn?: { name: string; label: string; text: string; defaultChecked?: boolean }
  submitLabel: string
  /** Public Turnstile site key; when set, the widget mounts client-side (Release 2). Never the secret. */
  turnstileSiteKey?: string
  /** Rendered after a native (no-JS) submit. */
  status?: { kind: 'ok' | 'error'; message: string }
}

/**
 * Native HTML form. Works with JavaScript disabled (server answers with an HTML page); JS enhances to
 * inline validation and fetch submit in C6. Field names mirror the legacy `send.php` payload so the
 * import and CRM mapping stay one-to-one.
 */
export function BriefFormBlock({
  eyebrow,
  title,
  lede,
  action,
  selects,
  briefPlaceholder,
  optIn,
  submitLabel,
  turnstileSiteKey,
  status,
}: BriefFormProps) {
  return (
    <div className="blk-brief" id="contact">
      <SectionHead eyebrow={eyebrow} title={title} lede={lede} />
      <form
        className="blk-brief__form"
        action={action}
        method="post"
        noValidate
        aria-describedby={status ? 'brief-status' : undefined}
      >
        <div className="blk-brief__row">
          <div className="ds-field">
            <label htmlFor="fName">Your name</label>
            <input id="fName" name="name" autoComplete="name" required />
          </div>
          <div className="ds-field">
            <label htmlFor="fEmail">Email</label>
            <input id="fEmail" name="email" type="email" autoComplete="email" required />
          </div>
        </div>
        <div className="blk-brief__row">
          <div className="ds-field">
            <label htmlFor="fCompany">Company</label>
            <input id="fCompany" name="company" autoComplete="organization" />
          </div>
          <div className="ds-field">
            <label htmlFor="fSite">Website</label>
            <input id="fSite" name="site" placeholder="example.com" inputMode="url" />
          </div>
        </div>
        <div className="blk-brief__row blk-brief__row--3">
          {selects.map((s) => (
            <div key={s.name} className="ds-field">
              <label htmlFor={`f-${s.name}`}>{s.label}</label>
              <select id={`f-${s.name}`} name={s.name} defaultValue={s.defaultValue ?? s.options[0]}>
                {s.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="ds-field">
          <label htmlFor="fBrief">What is the gap?</label>
          <textarea id="fBrief" name="brief" rows={5} placeholder={briefPlaceholder} required />
        </div>
        {optIn && (
          <label className="blk-brief__opt" htmlFor={`f-${optIn.name}`}>
            <input
              type="checkbox"
              id={`f-${optIn.name}`}
              name={optIn.name}
              value="1"
              defaultChecked={optIn.defaultChecked ?? false}
            />
            <span>
              <b>{optIn.label}</b> {optIn.text}
            </span>
          </label>
        )}
        {/* Honeypot: hidden from everyone, so anything in it is a bot. Out of the tab order and the a11y tree. */}
        <div className="blk-brief__hp" aria-hidden="true">
          <label htmlFor="website_url">Leave this field empty</label>
          <input id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {/* Dwell timer + Turnstile mount points. The Turnstile widget is only requested when a site key exists. */}
        <input type="hidden" name="t0" value="" data-dwell />
        {turnstileSiteKey && (
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
        )}
        <div className="blk-brief__actions">
          <button className="ds-btn ds-btn--solid" type="submit">
            {submitLabel}
          </button>
          <p
            className="blk-brief__status"
            id="brief-status"
            role="status"
            aria-live="polite"
            data-kind={status?.kind}
          >
            {status?.message}
          </p>
        </div>
      </form>
    </div>
  )
}

export const briefForm = defineBlock<BriefFormProps>({
  slug: 'briefForm',
  label: 'Brief form',
  kind: 'layout',
  interactive: true,
  Component: BriefFormBlock,
  a11y: [
    'Every control has a visible <label> bound by id; required fields use the required attribute, not colour.',
    'Works without JavaScript: a native POST to `action` and an HTML response; the status line has role=status / aria-live for the enhanced path.',
    'The honeypot is aria-hidden with tabindex=-1 and visually removed, so it never traps keyboard users.',
    'Select options come from `form-config`, so the chat intake and this form offer identical labels (R19).',
    'Turnstile mounts only when a public site key is present; the secret never reaches the client (R38, ADR-023).',
  ],
  fixtures,
})
