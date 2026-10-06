import type { ReactNode } from 'react'
import { label, TASK_KIND_LABEL } from '../../../../crm/workspace/labels'
import type { Person, TaskRow } from '../../../../crm/workspace/queries'
import { absoluteTime, BUSINESS_TIME_ZONE, compactTime } from '../../../../crm/workspace/time'
import { TaskActions } from './Dialogs'

/**
 * W1-8 follow-up table (audit finding 3): a Due column, then the title with what it relates to, then the owner and
 * the actions (Done visible, the rest under More). A long title truncates to one line and keeps the full text in a
 * tooltip; the RFQ number is not repeated, because the related link names the company.
 */
export function TaskTable({
  rows,
  now,
  zone = BUSINESS_TIME_ZONE,
  isAdmin,
  people,
  caption,
  showOwner = true,
  showRelated = true,
  select,
}: {
  rows: TaskRow[]
  now: Date
  /** Patch L1: the viewer's display zone. */
  zone?: string
  isAdmin: boolean
  people: Person[]
  caption: string
  showOwner?: boolean
  showRelated?: boolean
  /** W1-5: a leading checkbox column; `header` is the "select all" control. */
  select?: { header: ReactNode }
}) {
  return (
    <div className="c-table-wrap">
      <table className="c-table c-task-table">
        <caption className="c-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {select ? (
              <th scope="col" className="sel">
                {select.header}
              </th>
            ) : null}
            <th scope="col" className="due">
              Due
            </th>
            <th scope="col">Follow-up</th>
            {showOwner ? (
              <th scope="col" className="owner hide-sm">
                Owner
              </th>
            ) : null}
            <th scope="col" className="act">
              <span className="c-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const due = t.dueAt ? new Date(t.dueAt) : null
            const related = t.rfqId
              ? { href: `/crm/rfqs/?rfq=${t.rfqId}`, text: t.rfqLabel ?? t.accountName ?? 'Unnamed inquiry' }
              : t.accountId
                ? { href: `/crm/accounts/${t.accountId}/`, text: t.accountName ?? 'Account' }
                : null
            return (
              <tr key={t.id}>
                {select ? (
                  <td className="sel">
                    <input type="checkbox" className="c-check" data-bulk value={`${t.id}|${t.updatedAt}`} aria-label={`Select ${t.title}`} disabled={t.status === 'DONE' || t.status === 'CANCELLED'} />
                  </td>
                ) : null}
                <td className={`due${t.overdue ? ' c-overdue' : ''}`} title={due ? absoluteTime(due, zone) : undefined}>
                  {due ? (
                    <>
                      {t.overdue ? <span className="c-visually-hidden">Overdue, due </span> : null}
                      {compactTime(due, now, zone)}
                      {t.overdue ? (
                        <span className="c-hint">
                          <br />
                          Overdue
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="c-unknown">No due date</span>
                  )}
                </td>
                <td className="two">
                  <strong title={t.title}>{t.title}</strong>
                  <span>
                    {label(TASK_KIND_LABEL, t.kind)}
                    {t.priority === 'HIGH' ? ' · High priority' : ''}
                    {showRelated && related ? (
                      <>
                        {' · '}
                        <a href={related.href}>{related.text}</a>
                      </>
                    ) : null}
                  </span>
                </td>
                {showOwner ? <td className="hide-sm owner">{t.assigneeName ?? <span className="c-warn-text">Unassigned</span>}</td> : null}
                <td className="act">
                  <TaskActions task={t} isAdmin={isAdmin} people={people} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
