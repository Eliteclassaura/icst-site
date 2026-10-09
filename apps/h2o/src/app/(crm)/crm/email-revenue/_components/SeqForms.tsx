'use client'

import type { ReactNode } from 'react'
import { ActionDialog } from '../../../../../crm/workspace/ui/ActionDialog'
import { ActionForm, Field } from '../../../../../crm/workspace/ui/ActionForm'
import {
  activateGatedAction,
  approveSimulationAction,
  changeSequenceModeAction,
  recordReplyCheckAction,
  setReplyModeAction,
  createFromPrebuiltAction,
  markReadyAction,
  saveTriggerAction,
  setTriggerAction,
} from '../actions'
import { pauseAction } from '../../sequences/actions'

/** Forms for SEQ-BUILD-1. Every action re-checks the role, step-up and gates on the server. */
export function CreateFromThis({ code }: { code: string }) {
  return <ActionForm action={createFromPrebuiltAction} hidden={{ code }} submitLabel="Create from this" submitClassName="c-btn is-primary" />
}

export function MarkReady({ sequenceId }: { sequenceId: string }) {
  return <ActionForm inline action={markReadyAction} hidden={{ sequenceId }} submitLabel="Mark as Ready" submitClassName="c-btn" />
}

/** The activation dialog. With an unmet gate the only action is Mark as Ready; there is no "activate anyway". */
export function ActivateDialog({ sequenceId, allMet, fingerprint, children }: { sequenceId: string; allMet: boolean; fingerprint: string; children: ReactNode }) {
  return (
    <ActionDialog
      label="Activate…"
      title="Activate this sequence"
      action={allMet ? activateGatedAction : markReadyAction}
      hidden={{ sequenceId, seen: fingerprint }}
      submitLabel={allMet ? 'Activate' : 'Mark as Ready'}
      submitClassName="c-btn is-primary"
      buttonClassName="c-btn is-primary"
    >
      {children}
      {allMet ? (
        <Field name="code" label="Verification code">
          {(a) => <input className="c-input" {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" />}
        </Field>
      ) : null}
    </ActionDialog>
  )
}

export function ApproveSimulation({ sequenceId, snapshotHash }: { sequenceId: string; snapshotHash: string }) {
  return <ActionForm inline action={approveSimulationAction} hidden={{ sequenceId, snapshotHash }} submitLabel="Approve this simulation" submitClassName="c-btn" />
}

export function TriggerSwitch({ keyName, enabled, disabledReason }: { keyName: string; enabled: boolean; disabledReason?: string }) {
  if (!enabled && disabledReason) return <p className="c-hint">Off · {disabledReason}</p>
  return (
    <ActionForm
      inline
      action={setTriggerAction}
      hidden={{ key: keyName, enabled: enabled ? '0' : '1' }}
      submitLabel={enabled ? 'Turn off' : 'Turn on'}
      submitClassName="c-btn"
    />
  )
}

export function TriggerConfig({ keyName, sequences, sequenceId, idleDays }: { keyName: string; sequences: Array<{ id: string; name: string }>; sequenceId: string | null; idleDays: number | null }) {
  return (
    <ActionForm action={saveTriggerAction} hidden={{ key: keyName }} submitLabel="Save rule" submitClassName="c-btn">
      <Field name="sequenceId" label="Sequence to start">
        {(a) => (
          <select className="c-input" {...a} defaultValue={sequenceId ?? ''}>
            <option value="">Choose…</option>
            {sequences.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {keyName === 'NO_ACTIVITY' ? (
        <Field name="idleDays" label="No activity for this many days (7 to 365)">
          {(a) => <input className="c-input" {...a} type="number" min={7} max={365} defaultValue={idleDays ?? 30} />}
        </Field>
      ) : null}
    </ActionForm>
  )
}

/** Pausing is one click and never gated: stopping must always be easy. */
export function PauseSequence({ sequenceId }: { sequenceId: string }) {
  return <ActionForm inline action={pauseAction} hidden={{ sequenceId }} submitLabel="Pause" submitClassName="c-btn" />
}

/** The owner (or an admin) records a reply check with one confirmation. It does not read any mailbox. */
export function RecordReplyCheck({ sequenceId }: { sequenceId: string }) {
  return (
    <ActionForm action={recordReplyCheckAction} hidden={{ sequenceId, confirmed: '1' }} submitLabel="Record reply check" submitClassName="c-btn">
      <p className="c-hint">By recording, you confirm: I checked the reply mailbox and logged every reply and stop request.</p>
    </ActionForm>
  )
}

export function ReplyModeForm({ sequenceId, owners, current }: { sequenceId: string; owners: Array<{ id: string; name: string }>; current: { ownerId: string | null; days: string; startHour: number | null; endHour: number | null; zone: string; batch: number | null } }) {
  return (
    <ActionForm action={setReplyModeAction} hidden={{ sequenceId, mode: 'MANUAL' }} submitLabel="Turn on manual reply handling" submitClassName="c-btn">
      <Field name="ownerId" label="Reply owner">
        {(a) => (
          <select className="c-input" {...a} defaultValue={current.ownerId ?? ''}>
            <option value="">Choose…</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field name="days" label="Coverage days">
        {(a) => (
          <select className="c-input" {...a} defaultValue={current.days}>
            <option value="MON_FRI">Monday to Friday</option>
            <option value="EVERY_DAY">Every day</option>
          </select>
        )}
      </Field>
      <Field name="startHour" label="From hour (0–23)">
        {(a) => <input className="c-input" {...a} type="number" min={0} max={23} defaultValue={current.startHour ?? 9} />}
      </Field>
      <Field name="endHour" label="To hour (1–24)">
        {(a) => <input className="c-input" {...a} type="number" min={1} max={24} defaultValue={current.endHour ?? 17} />}
      </Field>
      <Field name="zone" label="Time zone (for example America/Denver)">
        {(a) => <input className="c-input" {...a} defaultValue={current.zone} maxLength={64} />}
      </Field>
      <Field name="initialBatch" label="First emails released (1–500)">
        {(a) => <input className="c-input" {...a} type="number" min={1} max={500} defaultValue={current.batch ?? 10} />}
      </Field>
    </ActionForm>
  )
}

export function SequenceModeForm({ sequenceId, current }: { sequenceId: string; current: string }) {
  return (
    <ActionForm action={changeSequenceModeAction} hidden={{ sequenceId }} submitLabel="Change approval mode" submitClassName="c-btn">
      <Field name="mode" label="Approval mode">
        {(a) => (
          <select className="c-input" {...a} defaultValue={current}>
            <option value="AUTO">Automatic sending · no per-email approval</option>
            <option value="REQUIRED">Approval required · each email waits for review</option>
          </select>
        )}
      </Field>
      <Field name="reason" label="Why is it changing?">
        {(a) => <input className="c-input" {...a} maxLength={300} />}
      </Field>
    </ActionForm>
  )
}
