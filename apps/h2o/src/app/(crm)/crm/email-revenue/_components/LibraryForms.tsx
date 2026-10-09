'use client'

import { t } from '../../../../../crm/library/ui-strings'
import { ActionForm, Field } from '../../../../../crm/workspace/ui/ActionForm'
import { stepUpAction } from '../../settings/actions'
import { approvalModeAction, importLibraryAction } from '../actions'

/** STEP-UP-1: confirm with your password; the admin changes that need it then work for 30 minutes in this session. */
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
            : 'Enter your password to continue. It lasts 30 minutes.'}
        </p>
        <ActionForm action={stepUpAction} submitLabel="Confirm" submitClassName="c-btn">
          <Field name="password" label="Password">
            {(a) => <input className="c-input" {...a} type="password" autoComplete="current-password" />}
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
