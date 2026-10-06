'use client'

import { useState } from 'react'
import { ActionForm, Field, useFormOutcome } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../settings/actions'

/**
 * Patch C — CRM settings forms (admins). The server repeats every check; these forms only collect input. Passwords are
 * write-only: the field is always empty, and leaving it empty keeps the stored password.
 */

/** Confirm with an app code; the settings below then work for 5 minutes in this session. */
export function StepUpForm({ secondsLeft }: { secondsLeft: number }) {
  return (
    <section className="c-panel is-settings" aria-labelledby="stepup-h">
      <div className="c-panel-head">
        <h2 id="stepup-h">Confirm it’s you</h2>
      </div>
      <div className="c-panel-body is-padded">
        <p className="c-hint">
          {secondsLeft > 0
            ? `Confirmed. Changes are allowed for about ${Math.max(1, Math.round(secondsLeft / 60))} more minute${secondsLeft > 90 ? 's' : ''}.`
            : 'Changing sending settings, checking a connection or sending a test needs a fresh code from your authenticator app. It lasts 5 minutes.'}
        </p>
        <ActionForm action={A.stepUpAction} submitLabel="Confirm" submitClassName="c-btn">
          <Field name="code" label="Code from your authenticator app">
            {(a) => <input className="c-input" {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" />}
          </Field>
        </ActionForm>
      </div>
    </section>
  )
}

export type ProfileValues = {
  id?: string
  name?: string
  preset?: string
  use?: string
  host?: string
  port?: number
  tls_servername?: string
  username?: string
  from_address?: string
  from_name?: string
  password_set?: boolean
}

/** Profile fields whose errors open the Advanced section, so a server error is never hidden in a closed disclosure. */
const ADVANCED_FIELDS = ['host', 'port', 'tls_servername'] as const
const ADVANCED_CODES = /^(PROFILE_(HOST|PORT|TLS)|HOST_|ETLS|ESOCKET)/

/**
 * Polish R1 (CT brief must-have 4): a sending profile shows Provider, Mailbox, Password and Send as by default. Server
 * host, port and certificate name are under Advanced; the provider fills them in when they are left empty.
 */
export function ProfileForm({ values, presets }: { values: ProfileValues; presets: Array<{ value: string; label: string; hint: string }> }) {
  const editing = Boolean(values.id)
  const [preset, setPreset] = useState(values.preset ?? 'GMAIL')
  const hint = presets.find((p) => p.value === preset)?.hint
  return (
    <ActionForm action={A.saveProfileAction} hidden={{ id: values.id }} submitLabel={editing ? 'Save profile' : 'Add profile'}>
      <Field name="name" label="Profile name" required>
        {(a) => <input className="c-input" {...a} defaultValue={values.name ?? ''} maxLength={80} autoComplete="off" />}
      </Field>
      <Field name="preset" label="Provider" hint={hint}>
        {(a) => (
          <select className="c-select" {...a} value={preset} onChange={(e) => setPreset(e.target.value)}>
            {presets.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field name="use" label="Sends">
        {(a) => (
          <select className="c-select" {...a} defaultValue={values.use ?? 'TRANSACTIONAL'}>
            <option value="TRANSACTIONAL">Inquiry email (alerts, acknowledgements, replies, password resets)</option>
            <option value="REVENUE">Revenue Engine sequences</option>
          </select>
        )}
      </Field>
      <Field name="username" label="Mailbox" required hint={preset === 'GMAIL' ? 'The full mailbox address, e.g. sales@ your domain.' : 'The user name the mail server expects.'}>
        {(a) => <input className="c-input" {...a} defaultValue={values.username ?? ''} maxLength={254} autoComplete="off" spellCheck={false} />}
      </Field>
      <Field
        name="password"
        label={editing ? 'New password' : 'Password'}
        required={!editing}
        hint={
          editing && values.password_set
            ? 'A password is stored. Leave this empty to keep it. It is never shown again.'
            : 'For Google Workspace, an app password (16 letters). Stored encrypted; never shown again.'
        }
      >
        {(a) => <input className="c-input" {...a} type="password" autoComplete="new-password" maxLength={256} />}
      </Field>
      <Field name="from_address" label="Send as (address)" required hint="An address at h2ocooling.org or h2ocooling.com that this mailbox may send as.">
        {(a) => <input className="c-input" {...a} type="email" defaultValue={values.from_address ?? ''} maxLength={254} autoComplete="off" />}
      </Field>
      <Field name="from_name" label="Send as (name)" hint="The name customers see, e.g. Rhonda Miller.">
        {(a) => <input className="c-input" {...a} defaultValue={values.from_name ?? ''} maxLength={80} autoComplete="off" />}
      </Field>
      <AdvancedServer values={values} />
    </ActionForm>
  )
}

function AdvancedServer({ values }: { values: ProfileValues }) {
  const outcome = useFormOutcome()
  const mustOpen = Boolean(ADVANCED_FIELDS.some((f) => outcome.fields?.[f]) || (outcome.code && ADVANCED_CODES.test(outcome.code)))
  return (
    <details className="c-advanced is-wide" key={mustOpen ? 'open' : 'closed'} open={mustOpen || undefined}>
      <summary>Advanced: server, port and certificate</summary>
      <p className="c-hint">Leave these empty to use the provider’s settings. Change them only for another mail service.</p>
      <div className="c-form-grid">
        <Field name="host" label="Server host name" hint="Empty: the provider’s default host.">
          {(a) => <input className="c-input" {...a} defaultValue={values.host ?? ''} maxLength={253} autoComplete="off" spellCheck={false} />}
        </Field>
        <Field name="port" label="Port" hint="587 (STARTTLS) or 465 (TLS).">
          {(a) => (
            <select className="c-select" {...a} defaultValue={String(values.port ?? 587)}>
              <option value="587">587</option>
              <option value="465">465</option>
            </select>
          )}
        </Field>
        <Field name="tls_servername" label="Certificate name" wide hint="The name on the server’s certificate. Empty: the provider’s default, else the host name.">
          {(a) => <input className="c-input" {...a} defaultValue={values.tls_servername ?? ''} maxLength={253} autoComplete="off" spellCheck={false} />}
        </Field>
      </div>
    </details>
  )
}

export function ProfileActions({ id, active }: { id: string; active: boolean }) {
  return (
    <div className="c-actions">
      <ActionForm inline action={A.checkProfileAction} hidden={{ id }} submitLabel="Check connection" submitClassName="c-btn" />
      <ActionForm inline action={A.testProfileAction} hidden={{ id }} submitLabel="Send a test to me" submitClassName="c-btn" />
      <ActionForm
        inline
        action={A.activateProfileAction}
        hidden={{ id, on: active ? '0' : '1' }}
        submitLabel={active ? 'Turn off' : 'Turn on'}
        submitClassName={active ? 'c-btn' : 'c-btn is-primary'}
      />
      {active ? null : <ActionForm inline action={A.deleteProfileAction} hidden={{ id }} submitLabel="Delete" submitClassName="c-btn is-ghost" />}
    </div>
  )
}

/** Patch C: edit a template's wording. Saving a changed text withdraws its approval (it is approved again after review). */
export function TemplateForm({ id, name, purpose, subject, body, locked }: { id: string; name: string; purpose: string; subject: string; body: string; locked: boolean }) {
  return (
    <ActionForm action={A.saveTemplateAction} hidden={{ id }} submitLabel="Save template">
      <Field name="name" label="Name" required>
        {(a) => <input className="c-input" {...a} defaultValue={name} maxLength={120} autoComplete="off" />}
      </Field>
      <Field name="purpose" label="Kind" hint={locked ? 'T1 is the automatic acknowledgement and stays transactional.' : 'Marketing templates must include {{unsubscribe_url}}.'}>
        {(a) => (
          <select className="c-select" {...a} defaultValue={purpose} disabled={locked}>
            <option value="TRANSACTIONAL">Transactional (about an inquiry)</option>
            <option value="MARKETING">Marketing (Revenue Engine)</option>
            <option value="SEQUENCE">Sequence step (Revenue Engine; the engine adds the unsubscribe footer)</option>
          </select>
        )}
      </Field>
      {locked ? <input type="hidden" name="purpose" value="TRANSACTIONAL" /> : null}
      <Field name="subject" label="Subject" required>
        {(a) => <input className="c-input" {...a} defaultValue={subject} maxLength={200} autoComplete="off" />}
      </Field>
      <Field name="body" label="Message" required wide hint="Plain text. Merge fields like {{rfq_number}}; a choice the sender makes: {{choice:call|site visit}}.">
        {(a) => <textarea className="c-textarea" {...a} defaultValue={body} maxLength={20000} rows={18} spellCheck />}
      </Field>
    </ActionForm>
  )
}

export function ApproveTemplateForm({ id, hash, approved }: { id: string; hash: string; approved: boolean }) {
  return approved ? (
    <ActionForm inline action={A.approveTemplateAction} hidden={{ id, approve: '0' }} submitLabel="Withdraw approval" submitClassName="c-btn" />
  ) : (
    <ActionForm inline action={A.approveTemplateAction} hidden={{ id, approve: '1', hash }} submitLabel="Approve this wording" submitClassName="c-btn is-primary" />
  )
}
