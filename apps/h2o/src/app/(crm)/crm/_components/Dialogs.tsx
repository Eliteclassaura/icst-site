'use client'

import { useEffect, useState } from 'react'
import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../actions'

/**
 * Sales Workspace action controls. Each posts to a server action that re-authenticates and writes through
 * the validated mutation layer as the user. Controls that a role may not use are not rendered, and the
 * server refuses them anyway (UI hiding is courtesy, not authorization).
 */

type Person = { id: string; name: string }
const MOTIONS: Array<[string, string]> = [
  ['PARTS', 'Parts'],
  ['REPAIR', 'Repair'],
  ['REBUILD_REPLACEMENT', 'Rebuild / replacement'],
  ['NEW_TOWER', 'New tower'],
  ['UPGRADE_RETROFIT', 'Upgrade / retrofit'],
  ['MAINTENANCE_INSPECTION', 'Maintenance / inspection'],
  ['OTHER_APPROVED', 'Other (approved motion)'],
]
const today = () => new Date().toISOString().slice(0, 10)

export function AssignMe({ rfqId, updatedAt }: { rfqId: string; updatedAt: string }) {
  return (
    <ActionForm
      inline
      action={A.assignAction}
      hidden={{ rfqId, assigneeId: 'me', expectedUpdatedAt: updatedAt }}
      submitLabel="Assign to me"
      submitClassName="c-btn"
      shortcut="assign-me"
    />
  )
}

export function StartReview({ rfqId, updatedAt }: { rfqId: string; updatedAt: string }) {
  return (
    <ActionForm
      inline
      action={A.startReviewAction}
      hidden={{ rfqId, expectedUpdatedAt: updatedAt }}
      submitLabel="Start review"
      shortcut="start-review"
    />
  )
}

export function AssignDialog({
  rfqId,
  updatedAt,
  people,
  currentId,
  isAdmin,
}: {
  rfqId: string
  updatedAt: string
  people: Person[]
  currentId: string | null
  isAdmin: boolean
}) {
  return (
    <ActionDialog
      label={currentId ? 'Change owner' : 'Assign…'}
      title="Assign owner"
      action={A.assignAction}
      hidden={{ rfqId, expectedUpdatedAt: updatedAt }}
      submitLabel="Save owner"
      description="Owners must hold a CRM role. The open first-response follow-up moves to the new owner."
    >
      <Field name="assigneeId" label="Owner">
        {(a) => (
          <select className="c-select" {...a} defaultValue={currentId ?? ''} required={!isAdmin}>
            {isAdmin ? <option value="">No owner (admin only)</option> : <option value="" disabled>Choose an owner</option>}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </ActionDialog>
  )
}

export function QualifyDialog({
  rfqId,
  updatedAt,
  accountLinked,
  motion,
}: {
  rfqId: string
  updatedAt: string
  accountLinked: boolean
  motion: string | null
}) {
  if (!accountLinked)
    return (
      <span className="c-actions">
        <button type="button" className="c-btn is-primary" aria-disabled="true" aria-describedby="qualify-req">
          Qualify
        </button>
        <span id="qualify-req" className="c-hint">
          Link an account before qualifying.
        </span>
      </span>
    )
  return (
    <ActionDialog
      label="Qualify"
      title="Qualify inquiry"
      action={A.qualifyAction}
      hidden={{ rfqId, expectedUpdatedAt: updatedAt }}
      submitLabel="Qualify"
      buttonClassName="c-btn is-primary"
      description="Qualifying records the commercial motion. It does not create an opportunity."
    >
      <Field name="motion" label="Commercial motion">
        {(a) => (
          <select className="c-select" {...a} defaultValue={motion ?? ''}>
            <option value="" disabled>
              Choose a motion
            </option>
            {MOTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
      </Field>
    </ActionDialog>
  )
}

export function CloseDialog({ rfqId, updatedAt }: { rfqId: string; updatedAt: string }) {
  const [outcome, setOutcome] = useState('CLOSED')
  return (
    <ActionDialog label="Close…" title="Close inquiry" action={A.closeAction} hidden={{ rfqId, expectedUpdatedAt: updatedAt }} submitLabel="Close inquiry">
      <Field name="outcome" label="Outcome">
        {(a) => (
          <select className="c-select" {...a} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="CLOSED">Close</option>
            <option value="REJECTED_NON_CORE">Not core business</option>
            <option value="DUPLICATE_OF_EXISTING">Duplicate</option>
          </select>
        )}
      </Field>
      {outcome === 'DUPLICATE_OF_EXISTING' ? (
        <Field name="duplicateOfNumber" label="Duplicates RFQ number" hint="For example RFQ-20260929-ABCD1234">
          {(a) => <input className="c-input" {...a} autoComplete="off" />}
        </Field>
      ) : null}
      <Field name="reason" label="Reason (required)">
        {(a) => <input className="c-input" {...a} maxLength={240} />}
      </Field>
      <p className="c-hint">Closed inquiries can be reopened by admins only.</p>
    </ActionDialog>
  )
}

export function ReopenButton({ rfqId, updatedAt }: { rfqId: string; updatedAt: string }) {
  return <ActionForm inline action={A.reopenAction} hidden={{ rfqId, expectedUpdatedAt: updatedAt }} submitLabel="Reopen (admin)" submitClassName="c-btn" />
}

export function NoteDialog({ rfqId }: { rfqId: string }) {
  return (
    <ActionDialog label="Add note" title="Add note" action={A.noteAction} hidden={{ rfqId }} submitLabel="Save note" shortcut="note" description="Notes are internal. Nothing is sent.">
      <Field name="body" label="Note">
        {(a) => <textarea className="c-textarea" {...a} maxLength={5000} />}
      </Field>
    </ActionDialog>
  )
}

export function LogDialog({ rfqId, doNotContact }: { rfqId: string; doNotContact: boolean }) {
  return (
    <ActionDialog
      label="Log call / reference"
      title="Log what happened"
      action={A.logActivityAction}
      hidden={{ rfqId }}
      submitLabel="Log"
      description={
        doNotContact
          ? 'This contact is on do-not-contact. You can still record a past call or email for the history. Nothing is sent.'
          : 'Records a call, meeting or email that happened outside the CRM. Nothing is sent.'
      }
    >
      <Field name="type" label="What happened">
        {(a) => (
          <select className="c-select" {...a} defaultValue="CALL">
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting</option>
            <option value="EMAIL_REFERENCE">Email reference</option>
          </select>
        )}
      </Field>
      <Field name="summary" label="Summary">
        {(a) => <input className="c-input" {...a} maxLength={240} />}
      </Field>
      <Field name="occurredAt" label="When (optional)" hint="Leave empty for now.">
        {(a) => <input className="c-input" type="datetime-local" {...a} />}
      </Field>
    </ActionDialog>
  )
}

export function FollowUpDialog({
  rfqId,
  accountId,
  people,
  meId,
  label = 'Follow-up',
}: {
  rfqId?: string
  accountId?: string
  people: Person[]
  meId: string
  label?: string
}) {
  return (
    <ActionDialog label={label} title="New follow-up" action={A.followUpAction} hidden={{ rfqId, accountId }} submitLabel="Create follow-up" shortcut="follow-up">
      <Field name="title" label="Title">
        {(a) => <input className="c-input" {...a} maxLength={160} />}
      </Field>
      <div className="c-form-grid">
        <Field name="due" label="Due date">
          {(a) => <input className="c-input" type="date" {...a} defaultValue={today()} />}
        </Field>
        <Field name="priority" label="Priority">
          {(a) => (
            <select className="c-select" {...a} defaultValue="NORMAL">
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          )}
        </Field>
      </div>
      <Field name="assigneeId" label="Owner">
        {(a) => (
          <select className="c-select" {...a} defaultValue={meId}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </ActionDialog>
  )
}

export function RequestInfoDialog({ rfqId, updatedAt }: { rfqId: string; updatedAt: string }) {
  return (
    <ActionDialog
      label="Request information"
      title="Request information"
      action={A.requestInfoAction}
      hidden={{ rfqId, expectedUpdatedAt: updatedAt }}
      submitLabel="Record request"
      description="Contact the customer by phone or from your own mailbox. The CRM records what is missing as waiting for customer. Nothing is sent."
    >
      <Field name="missing" label="What is missing">
        {(a) => <input className="c-input" {...a} maxLength={160} />}
      </Field>
      <Field name="due" label="Follow up by">
        {(a) => <input className="c-input" type="date" {...a} defaultValue={today()} />}
      </Field>
    </ActionDialog>
  )
}

type AccountHit = { id: string; name: string; relationship: string; domains: Array<{ domain: string; status: string }> }

export function LinkAccountDialog({ rfqId, updatedAt, suggestion, linked = false }: { rfqId: string; updatedAt: string; suggestion: string | null; linked?: boolean }) {
  const [q, setQ] = useState(suggestion ?? '')
  const [hits, setHits] = useState<AccountHit[] | null>(null)
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      A.searchAccountsAction(q).then((r) => {
        if (live) setHits(r as AccountHit[])
      })
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <>
      <ActionDialog
        label={linked ? 'Change account' : 'Link account'}
        title="Link an existing account"
        action={A.linkAccountAction}
        hidden={{ rfqId, expectedUpdatedAt: updatedAt }}
        submitLabel="Link account"
        description="A manual link is recorded in the audit history. Records are never merged."
      >
        <label className="c-field">
          <span>Search accounts</span>
          <input className="c-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
        <fieldset className="c-fieldset">
          <legend>Accounts</legend>
          {hits === null ? <p className="c-hint">Searching…</p> : null}
          {hits && hits.length === 0 ? <p className="c-hint">No matching accounts. Create one instead.</p> : null}
          {(hits ?? []).map((h) => (
            <label key={h.id} className="c-actions">
              <input type="radio" name="accountId" value={h.id} />
              <span>
                <strong>{h.name}</strong>{' '}
                <span className="c-muted">
                  {h.domains.map((d) => `${d.domain}${d.status.startsWith('VERIFIED') ? ' (verified)' : ' (unverified)'}`).join(', ') || 'no domain'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </ActionDialog>
      <ActionDialog
        label="Create account"
        title="Create account and link"
        action={A.createAccountAction}
        hidden={{ rfqId, expectedUpdatedAt: updatedAt }}
        submitLabel="Create and link"
        description="Creates the minimum record. A domain is saved as an unverified candidate; verification is an admin act."
      >
        <Field name="name" label="Company name">
          {(a) => <input className="c-input" {...a} defaultValue={suggestion ?? ''} maxLength={160} />}
        </Field>
        <Field name="domain" label="Web domain (optional)" hint="For example example.com">
          {(a) => <input className="c-input" {...a} autoComplete="off" />}
        </Field>
      </ActionDialog>
    </>
  )
}

export function SiteDialog({
  rfqId,
  updatedAt,
  sites,
  currentId,
}: {
  rfqId: string
  updatedAt: string
  sites: Person[]
  currentId: string | null
}) {
  return (
    <ActionDialog label={currentId ? 'Change plant' : 'Associate plant'} title="Associate plant / site" action={A.associateSiteAction} hidden={{ rfqId, expectedUpdatedAt: updatedAt }} submitLabel="Save">
      <Field name="siteId" label="Plant / site of the linked account">
        {(a) => (
          <select className="c-select" {...a} defaultValue={currentId ?? ''}>
            <option value="">No plant / site</option>
            {sites.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </ActionDialog>
  )
}

export function DoNotContactDialog({ contactId }: { contactId: string }) {
  return (
    <ActionDialog
      label="Mark do not contact"
      title="Do not contact"
      action={A.doNotContactAction}
      hidden={{ contactId }}
      submitLabel="Record do-not-contact"
      buttonClassName="c-btn is-danger"
      description="Applies to every inquiry for this contact. Call and email links are disabled. Only an admin can clear it."
    >
      <Field name="note" label="Reason">
        {(a) => <input className="c-input" {...a} maxLength={500} />}
      </Field>
    </ActionDialog>
  )
}

export function ClearSuppressionDialog({ contactId, suppressions }: { contactId: string; suppressions: Array<{ id: string; reason: string }> }) {
  return (
    <ActionDialog label="Clear (admin)" title="Clear do-not-contact" action={A.clearSuppressionAction} hidden={{ contactId }} submitLabel="Clear" description="Some reasons cannot be cleared, and some need re-consent evidence.">
      <Field name="suppressionId" label="Suppression">
        {(a) => (
          <select className="c-select" {...a}>
            {suppressions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.reason}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field name="note" label="Written reason">
        {(a) => <input className="c-input" {...a} maxLength={500} />}
      </Field>
      <Field name="evidence" label="Re-consent evidence (when required)">
        {(a) => <input className="c-input" {...a} maxLength={240} />}
      </Field>
    </ActionDialog>
  )
}

export function ResolveReviewDialog({ reviewId }: { reviewId: string }) {
  return (
    <ActionDialog label="Resolve (admin)" title="Resolve identity review" action={A.resolveReviewAction} hidden={{ reviewId }} submitLabel="Resolve" buttonClassName="c-btn is-small" description="Nothing is merged. Link records manually if they belong together.">
      <Field name="state" label="Resolution">
        {(a) => (
          <select className="c-select" {...a} defaultValue="CONFIRMED_DISTINCT">
            <option value="CONFIRMED_DISTINCT">Confirmed distinct</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        )}
      </Field>
      <Field name="note" label="Reason">
        {(a) => <input className="c-input" {...a} maxLength={500} />}
      </Field>
    </ActionDialog>
  )
}

export function TaskActions({
  task,
  isAdmin,
  people,
}: {
  task: { id: string; kind: string; status: string; updatedAt: string; dueAt: string | null; assigneeId: string | null }
  isAdmin: boolean
  people: Person[]
}) {
  const finished = task.status === 'DONE' || task.status === 'CANCELLED'
  if (finished)
    return isAdmin ? (
      <ActionForm inline action={A.reopenTaskAction} hidden={{ taskId: task.id, expectedUpdatedAt: task.updatedAt }} submitLabel="Reopen (admin)" submitClassName="c-btn is-small" />
    ) : null
  return (
    <span className="c-actions">
      {task.kind === 'MISSING_INFORMATION' ? (
        <ActionForm inline action={A.customerRepliedAction} hidden={{ taskId: task.id }} submitLabel="Customer replied" submitClassName="c-btn is-small" />
      ) : (
        <ActionForm inline action={A.completeTaskAction} hidden={{ taskId: task.id }} submitLabel="Done" submitClassName="c-btn is-small" />
      )}
      <ActionDialog
        label="Change due date"
        title="Change due date"
        action={A.dueDateAction}
        hidden={{ taskId: task.id, expectedUpdatedAt: task.updatedAt }}
        submitLabel="Save"
        buttonClassName="c-btn is-small is-ghost"
      >
        <Field name="due" label="Due date">
          {(a) => <input className="c-input" type="date" {...a} defaultValue={(task.dueAt ?? '').slice(0, 10)} />}
        </Field>
      </ActionDialog>
      <ActionDialog label="Reassign" title="Reassign follow-up" action={A.reassignTaskAction} hidden={{ taskId: task.id, expectedUpdatedAt: task.updatedAt }} submitLabel="Save" buttonClassName="c-btn is-small is-ghost">
        <Field name="assigneeId" label="Owner">
          {(a) => (
            <select className="c-select" {...a} defaultValue={task.assigneeId ?? ''}>
              <option value="" disabled>
                Choose an owner
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </ActionDialog>
    </span>
  )
}
