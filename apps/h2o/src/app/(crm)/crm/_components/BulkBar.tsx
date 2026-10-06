'use client'

import { useEffect, useState } from 'react'
import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { Field } from '../../../../crm/workspace/ui/ActionForm'
import { quickDueDates } from '../../../../crm/workspace/time'
import { useCrmCalendar } from './CalendarContext'
import * as A from '../actions'

/**
 * W1-5 bulk selection. Rows carry `<input data-bulk value="id|updatedAt">` checkboxes inside the region `scopeId`;
 * this bar counts them and offers the list's actions. Each action's confirm dialog states the count; the server applies
 * each row through the single-record mutation and reports conflicts instead of overwriting. At most 100 rows.
 */
type Person = { id: string; name: string }
const MAX = 100

function useSelection(scopeId: string) {
  const [values, setValues] = useState<string[]>([])
  useEffect(() => {
    const scope = document.getElementById(scopeId)
    if (!scope) return
    const read = () => setValues([...scope.querySelectorAll<HTMLInputElement>('input[data-bulk]:checked')].map((i) => i.value))
    scope.addEventListener('change', read)
    read()
    return () => scope.removeEventListener('change', read)
  }, [scopeId])
  return values
}

/** The "select all on this page" header checkbox. */
export function SelectAll({ scopeId, label }: { scopeId: string; label: string }) {
  return (
    <input
      type="checkbox"
      className="c-check"
      aria-label={label}
      onChange={(e) => {
        const scope = document.getElementById(scopeId)
        if (!scope) return
        const boxes = [...scope.querySelectorAll<HTMLInputElement>('input[data-bulk]')]
        boxes.forEach((b, i) => {
          b.checked = e.target.checked && i < MAX
        })
        scope.dispatchEvent(new Event('change', { bubbles: true }))
      }}
    />
  )
}

function OwnerSelect({ people, name = 'assigneeId', allowNone = false }: { people: Person[]; name?: string; allowNone?: boolean }) {
  return (
    <Field name={name} label="Owner" required>
      {(a) => (
        <select className="c-select" {...a} defaultValue="">
          <option value="" disabled={!allowNone}>
            {allowNone ? 'No owner' : 'Choose an owner'}
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function BulkBar({ scopeId, kind, people }: { scopeId: string; kind: 'rfqs' | 'tasks' | 'contacts'; people: Person[] }) {
  const values = useSelection(scopeId)
  const cal = useCrmCalendar()
  const n = values.length
  if (n === 0) return null
  const ids = values.slice(0, MAX).join(',')
  const count = `${Math.min(n, MAX)} selected`
  const noun = kind === 'rfqs' ? 'inquiries' : kind === 'tasks' ? 'follow-ups' : 'contacts'
  const q = quickDueDates(new Date(), cal)
  return (
    <div className="c-bulk-bar" role="region" aria-label="Bulk actions">
      <strong role="status" aria-live="polite">
        {count}
        {n > MAX ? ` (first ${MAX} of ${n})` : ''}
      </strong>
      {kind === 'rfqs' ? (
        <>
          <ActionDialog label="Assign…" title={`Assign ${Math.min(n, MAX)} ${noun}`} action={A.bulkAssignRfqsAction} hidden={{ ids }} submitLabel={`Assign ${Math.min(n, MAX)}`} buttonClassName="c-btn is-small">
            <OwnerSelect people={people} />
          </ActionDialog>
          <ActionDialog label="Add follow-up…" title={`Add a follow-up to ${Math.min(n, MAX)} ${noun}`} action={A.bulkFollowUpRfqsAction} hidden={{ ids }} submitLabel={`Add to ${Math.min(n, MAX)}`} buttonClassName="c-btn is-small">
            <Field name="title" label="Title" required>
              {(a) => <input className="c-input" {...a} maxLength={160} />}
            </Field>
            <Field name="due" label="Due date" required>
              {(a) => <input className="c-input" type="date" {...a} defaultValue={q.tomorrow} />}
            </Field>
          </ActionDialog>
          <ActionDialog label="Close…" title={`Close ${Math.min(n, MAX)} ${noun}`} action={A.bulkCloseRfqsAction} hidden={{ ids }} submitLabel={`Close ${Math.min(n, MAX)}`} buttonClassName="c-btn is-small" description="Closed inquiries can be reopened by admins only.">
            <Field name="outcome" label="Outcome">
              {(a) => (
                <select className="c-select" {...a} defaultValue="REJECTED_NON_CORE">
                  <option value="REJECTED_NON_CORE">Not core business</option>
                  <option value="CLOSED">Close</option>
                </select>
              )}
            </Field>
            <Field name="reason" label="Reason" required>
              {(a) => <input className="c-input" {...a} maxLength={240} />}
            </Field>
          </ActionDialog>
        </>
      ) : kind === 'tasks' ? (
        <>
          <ActionDialog label="Mark done…" title={`Mark ${Math.min(n, MAX)} ${noun} done`} action={A.bulkCompleteTasksAction} hidden={{ ids }} submitLabel={`Mark ${Math.min(n, MAX)} done`} buttonClassName="c-btn is-small" />
          <ActionDialog label="Reschedule…" title={`Reschedule ${Math.min(n, MAX)} ${noun}`} action={A.bulkSetDueAction} hidden={{ ids }} submitLabel="Reschedule" buttonClassName="c-btn is-small" description="Rule-set first-response dates need a reason.">
            <Field name="due" label="Due date" required>
              {(a) => <input className="c-input" type="date" {...a} defaultValue={q.tomorrow} />}
            </Field>
            <Field name="reason" label="Reason (needed for rule-set dates)">
              {(a) => <input className="c-input" {...a} maxLength={240} />}
            </Field>
          </ActionDialog>
          <ActionDialog label="Reassign…" title={`Reassign ${Math.min(n, MAX)} ${noun}`} action={A.bulkReassignTasksAction} hidden={{ ids }} submitLabel={`Reassign ${Math.min(n, MAX)}`} buttonClassName="c-btn is-small">
            <OwnerSelect people={people} />
          </ActionDialog>
        </>
      ) : (
        <ActionDialog label="Set owner…" title={`Set the owner of ${Math.min(n, MAX)} ${noun}`} action={A.bulkAssignContactsAction} hidden={{ ids }} submitLabel={`Update ${Math.min(n, MAX)}`} buttonClassName="c-btn is-small">
          <OwnerSelect people={people} name="ownerId" allowNone />
        </ActionDialog>
      )}
    </div>
  )
}
