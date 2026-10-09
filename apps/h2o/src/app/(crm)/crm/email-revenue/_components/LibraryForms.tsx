'use client'

import { t } from '../../../../../crm/library/ui-strings'
import { ActionForm, Field } from '../../../../../crm/workspace/ui/ActionForm'
import { stepUpAction } from '../../settings/actions'
import { approvalModeAction, importLibraryAction } from '../actions'

/** Confirm with an app code; admin changes in the Library then work for 5 minutes in this session. */
export function StepUpPanel({ secondsLeft }: { secondsLeft: number }) {
  return (
    <section className="c-panel is-settings" aria-labelledby="er-stepup-h">
      <div className="c-panel-head">
        <h2 id="er-stepup-h">Confirm it’s you</h2>
      </div>
      <div className="c-panel-body is-padded">
        <p className="c-hint">
          {secondsLeft > 0
            ? `Confirmed. Changes are allowed for about ${Math.max(1, Math.round(secondsLeft / 60))} more minute${secondsLeft > 90 ? 's' : ''}.`
            : 'Importing the library or changing an approval mode needs a fresh code from your authenticator app. It lasts 5 minutes.'}
        </p>
        <ActionForm action={stepUpAction} submitLabel="Confirm" submitClassName="c-btn">
          <Field name="code" label="Code from your authenticator app">
            {(a) => (
              <input
                className="c-input"
                {...a}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
              />
            )}
          </Field>
        </ActionForm>
      </div>
    </section>
  )
}

export function ApprovalModeForm({ id, current }: { id: string; current: string }) {
  return (
    <ActionForm
      action={approvalModeAction}
      hidden={{ id }}
      submitLabel="Change approval mode"
      submitClassName="c-btn"
    >
      <Field name="mode" label="Approval mode">
        {(a) => (
          <select className="c-input" {...a} defaultValue={current}>
            <option value="AUTO">{t('ers.approval.auto.label')}</option>
            <option value="RULE_BASED">Rule-based · sends without per-email approval when the rules allow, and waits for review when they do not</option>
            <option value="REQUIRED">{t('ers.approval.required.label')}</option>
          </select>
        )}
      </Field>
      <Field name="reason" label="Why is it changing?">
        {(a) => <input className="c-input" {...a} maxLength={300} />}
      </Field>
    </ActionForm>
  )
}

export function ImportForm({ disabledReason }: { disabledReason?: string }) {
  if (disabledReason) return <p className="c-hint">{disabledReason}</p>
  return (
    <ActionForm
      action={importLibraryAction}
      submitLabel="Import library"
      submitClassName="c-btn is-primary"
    />
  )
}
