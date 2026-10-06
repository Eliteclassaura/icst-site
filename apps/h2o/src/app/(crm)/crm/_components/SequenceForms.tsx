'use client'

import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../sequences/actions'

/** Revenue Engine slice 1 — forms for the sequence pages. The server repeats every check. */

export function EngineSwitch({ on }: { on: boolean }) {
  return (
    <ActionForm
      inline
      action={A.engineSwitchAction}
      hidden={{ on: on ? '0' : '1' }}
      submitLabel={on ? 'Turn the Revenue Engine off' : 'Turn the Revenue Engine on'}
      submitClassName={on ? 'c-btn' : 'c-btn is-primary'}
    />
  )
}

export function ResumeHealth() {
  return <ActionForm inline action={A.resumeHealthAction} submitLabel="Resume sequence sending" submitClassName="c-btn is-primary" />
}

export function SequenceActions({ sequenceId, runState, draftVersionId, canActivate }: { sequenceId: string; runState: string; draftVersionId: string | null; canActivate: boolean }) {
  return (
    <div className="c-actions">
      {draftVersionId ? <ActionForm inline action={A.publishAction} hidden={{ versionId: draftVersionId }} submitLabel="Publish the draft" submitClassName="c-btn" /> : null}
      {runState === 'ACTIVE' ? (
        <ActionForm inline action={A.pauseAction} hidden={{ sequenceId }} submitLabel="Pause" submitClassName="c-btn" />
      ) : canActivate ? (
        <ActionForm inline action={A.activateAction} hidden={{ sequenceId }} submitLabel={runState === 'PAUSED' ? 'Resume' : 'Start the sequence'} submitClassName="c-btn is-primary" />
      ) : null}
      {draftVersionId ? null : <ActionForm inline action={A.duplicateAction} hidden={{ sequenceId }} submitLabel="Duplicate to edit" submitClassName="c-btn is-ghost" />}
    </div>
  )
}

export function DraftSteps({ versionId, steps }: { versionId: string; steps: string }) {
  return (
    <ActionForm action={A.saveStepsAction} hidden={{ versionId }} submitLabel="Save draft steps">
      <Field name="steps" label="Steps, one per line" wide hint="WAIT 3 · EMAIL E11_QUAL_1 · TASK 1 Call the customer. Waits are business days on the inquiry office’s calendar.">
        {(a) => <textarea className="c-textarea c-mono" {...a} defaultValue={steps} rows={Math.max(6, steps.split('\n').length + 2)} spellCheck={false} />}
      </Field>
    </ActionForm>
  )
}

export function EnrollConfirm({ hidden, items, count }: { hidden: Record<string, string>; items: string[]; count: number }) {
  return (
    <ActionForm action={A.enrollAction} hidden={hidden} submitLabel={count === 1 ? 'Enroll this contact' : `Enroll ${count} contacts`}>
      {items.map((i) => (
        <input key={i} type="hidden" name="items" value={i} />
      ))}
    </ActionForm>
  )
}

export function EnrollmentControls({ enrollmentId, status, isAdmin }: { enrollmentId: string; status: string; isAdmin: boolean }) {
  return (
    <div className="c-actions">
      {status === 'PAUSED' && isAdmin ? <ActionForm inline action={A.resumeEnrollmentAction} hidden={{ enrollmentId }} submitLabel="Resume" submitClassName="c-btn" /> : null}
      {['ACTIVE', 'AWAITING_SEND', 'PAUSED'].includes(status) ? (
        <ActionForm inline action={A.stopEnrollmentAction} hidden={{ enrollmentId }} submitLabel="Stop" submitClassName="c-btn is-ghost" />
      ) : null}
    </div>
  )
}
