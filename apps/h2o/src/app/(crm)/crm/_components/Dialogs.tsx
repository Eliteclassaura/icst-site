'use client'

import { useEffect, useState } from 'react'
import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import { IconCheck } from '../../../../crm/workspace/ui/Icons'
import { Overflow } from '../../../../crm/workspace/ui/Overflow'
import { quickDueDates, type QuickDue } from '../../../../crm/workspace/time'
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
/** Today in the business zone (America/Denver), not the browser's zone or UTC. */
const today = () => quickDueDates(new Date()).today
const MENU = 'c-menu-item'

const QUICK: Array<[QuickDue, string]> = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['next_week', 'Next week'],
]

/** W1-9 quick due dates: fill the form's date field with a business-zone day (computed when clicked). */
function QuickDates({ field = 'due' }: { field?: string }) {
  return (
    <span className="c-chips" role="group" aria-label="Quick dates">
      {QUICK.map(([k, l]) => (
        <button
          key={k}
          type="button"
          className="c-chip"
          onClick={(e) => {
            const input = e.currentTarget.form?.elements.namedItem(field)
            if (input instanceof HTMLInputElement) {
              input.value = quickDueDates(new Date())[k]
              input.focus()
            }
          }}
        >
          {l}
        </button>
      ))}
    </span>
  )
}

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
  buttonClassName,
}: {
  rfqId: string
  updatedAt: string
  people: Person[]
  currentId: string | null
  isAdmin: boolean
  buttonClassName?: string
}) {
  return (
    <ActionDialog
      buttonClassName={buttonClassName}
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

export function CloseDialog({ rfqId, updatedAt, buttonClassName }: { rfqId: string; updatedAt: string; buttonClassName?: string }) {
  const [outcome, setOutcome] = useState('CLOSED')
  return (
    <ActionDialog buttonClassName={buttonClassName} label="Close…" title="Close inquiry" action={A.closeAction} hidden={{ rfqId, expectedUpdatedAt: updatedAt }} submitLabel="Close inquiry">
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

export function ReopenButton({ rfqId, updatedAt, primary }: { rfqId: string; updatedAt: string; primary?: boolean }) {
  return <ActionForm inline action={A.reopenAction} hidden={{ rfqId, expectedUpdatedAt: updatedAt }} submitLabel="Reopen (admin)" submitClassName={primary ? 'c-btn is-primary' : 'c-btn'} />
}

export function NoteDialog({ rfqId, buttonClassName }: { rfqId: string; buttonClassName?: string }) {
  return (
    <ActionDialog buttonClassName={buttonClassName} label="Add note" title="Add note" action={A.noteAction} hidden={{ rfqId }} submitLabel="Save note" shortcut="note" description="Notes are internal. Nothing is sent.">
      <Field name="body" label="Note">
        {(a) => <textarea className="c-textarea" {...a} maxLength={5000} />}
      </Field>
    </ActionDialog>
  )
}

export function LogDialog({ rfqId, doNotContact, buttonClassName }: { rfqId: string; doNotContact: boolean; buttonClassName?: string }) {
  return (
    <ActionDialog
      buttonClassName={buttonClassName}
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
  contactId,
  people,
  meId,
  label = 'Follow-up',
  buttonClassName,
}: {
  rfqId?: string
  accountId?: string
  contactId?: string
  people: Person[]
  meId: string
  label?: string
  buttonClassName?: string
}) {
  return (
    <ActionDialog
      buttonClassName={buttonClassName}
      label={label}
      title="New follow-up"
      action={A.followUpAction}
      hidden={{ rfqId, accountId, contactId }}
      submitLabel="Create follow-up"
      shortcut="follow-up"
    >
      <Field name="title" label="Title">
        {(a) => <input className="c-input" {...a} maxLength={160} />}
      </Field>
      <div className="c-form-grid">
        <Field name="due" label="Due date">
          {(a) => <input className="c-input" type="date" {...a} defaultValue={today()} />}
        </Field>
        <QuickDates />
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

export function RequestInfoDialog({ rfqId, updatedAt, buttonClassName }: { rfqId: string; updatedAt: string; buttonClassName?: string }) {
  return (
    <ActionDialog
      buttonClassName={buttonClassName}
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
      <QuickDates />
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

type TaskLike = {
  id: string
  title: string
  kind: string
  status: string
  source: string
  updatedAt: string
  dueAt: string | null
  assigneeId: string | null
}

/**
 * W1-8 / W1-9 task row actions: one visible "Done" (or "Customer replied") and the rest under "More": snooze,
 * change due date with quick dates, reassign. A rule-set due date (D-1 first response) asks for a reason, so it
 * offers no one-click snooze.
 */
export function TaskActions({ task, isAdmin, people }: { task: TaskLike; isAdmin: boolean; people: Person[] }) {
  const finished = task.status === 'DONE' || task.status === 'CANCELLED'
  if (finished)
    return isAdmin ? (
      <ActionForm inline action={A.reopenTaskAction} hidden={{ taskId: task.id, expectedUpdatedAt: task.updatedAt }} submitLabel="Reopen (admin)" submitClassName="c-btn is-small" />
    ) : null
  const system = task.source === 'SYSTEM_RULE'
  return (
    <span className="c-actions c-task-actions">
      {task.kind === 'MISSING_INFORMATION' ? (
        <ActionForm
          inline
          action={A.customerRepliedAction}
          hidden={{ taskId: task.id }}
          submitLabel="Replied"
          submitClassName="c-btn is-small"
          submitAriaLabel={`Customer replied: ${task.title}`}
          submitIcon={<IconCheck />}
        />
      ) : (
        <ActionForm inline action={A.completeTaskAction} hidden={{ taskId: task.id }} submitLabel="Done" submitClassName="c-btn is-small" submitAriaLabel={`Mark done: ${task.title}`} submitIcon={<IconCheck />} />
      )}
      <Overflow label="⋯" ariaLabel={`More actions: ${task.title}`} className="c-btn is-small is-ghost c-icon-btn">
        {system ? null : (
          <>
            <ActionForm inline action={A.snoozeAction} hidden={{ taskId: task.id, preset: 'tomorrow', expectedUpdatedAt: task.updatedAt }} submitLabel="Snooze to tomorrow" submitClassName={MENU} />
            <ActionForm inline action={A.snoozeAction} hidden={{ taskId: task.id, preset: 'next_week', expectedUpdatedAt: task.updatedAt }} submitLabel="Snooze to next week" submitClassName={MENU} />
          </>
        )}
        <ActionDialog
          label="Change due date…"
          title="Change due date"
          action={A.dueDateAction}
          hidden={{ taskId: task.id, expectedUpdatedAt: task.updatedAt }}
          submitLabel="Save"
          buttonClassName={MENU}
          description={system ? 'This due date was set by a rule (first response by the end of the next business day). Say why it is changing; the reason is kept on the record.' : undefined}
        >
          <Field name="due" label="Due date">
            {(a) => <input className="c-input" type="date" {...a} defaultValue={(task.dueAt ? quickDueDates(new Date(task.dueAt)).today : '')} />}
          </Field>
          <QuickDates />
          {system ? (
            <Field name="reason" label="Reason" required>
              {(a) => <input className="c-input" {...a} maxLength={240} />}
            </Field>
          ) : null}
        </ActionDialog>
        <ActionDialog label="Reassign…" title="Reassign follow-up" action={A.reassignTaskAction} hidden={{ taskId: task.id, expectedUpdatedAt: task.updatedAt }} submitLabel="Save" buttonClassName={MENU}>
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
      </Overflow>
    </span>
  )
}
