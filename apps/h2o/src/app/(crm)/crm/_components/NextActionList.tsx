import { label, TASK_KIND_LABEL } from '../../../../crm/workspace/labels'
import type { NextAction } from '../../../../crm/workspace/nextActions'
import type { Person } from '../../../../crm/workspace/queries'
import { absoluteTime, compactTime, shortDate, startOfBusinessDay } from '../../../../crm/workspace/time'
import { StageStatus } from '../../../../crm/workspace/ui/Status'
import { TaskActions } from './Dialogs'

/**
 * OPP-2: the unified next-action queue. Every row says who it is about, what to do next and when it is due, and
 * overdue items are first. A follow-up keeps its own actions (Done, snooze, reassign). A deal's next action is
 * changed on the deal, so its row links there. Nothing here sends email.
 */
export function NextActionList({ rows, now, zone, isAdmin, people, caption, showOwner }: { rows: NextAction[]; now: Date; zone: string; isAdmin: boolean; people: Person[]; caption: string; showOwner: boolean }) {
  return (
    <div className="c-table-wrap">
      <table className="c-table c-task-table">
        <caption className="c-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="due">
              Due
            </th>
            <th scope="col">Next action</th>
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
          {rows.map((r) => {
            const due = r.dueAt ? new Date(r.dueAt) : null
            const t = r.task
            const d = r.deal
            const title = t ? t.title : (d?.nextStep ?? 'No next action')
            const company = t ? (t.accountId ? { href: `/crm/accounts/${t.accountId}/`, text: t.accountName ?? 'Account' } : t.rfqId ? { href: `/crm/rfqs/${t.rfqId}/`, text: t.rfqLabel ?? 'Unnamed inquiry' } : null) : d?.accountId ? { href: `/crm/accounts/${d.accountId}/`, text: d.accountName ?? 'Account' } : null
            const owner = t ? t.assigneeName : (d?.ownerName ?? null)
            // A deal's due date is a calendar date in the deal's own business zone, not the viewer's.
            const rowZone = d ? d.zone : zone
            return (
              <tr key={r.key}>
                <td className={`due${r.overdue ? ' c-overdue' : ''}`} title={due ? absoluteTime(due, rowZone) : undefined}>
                  {due ? (
                    <>
                      {r.overdue ? <span className="c-visually-hidden">Overdue, due </span> : null}
                      {r.overdue && due.getTime() < startOfBusinessDay(now, rowZone).getTime() - 86_400_000 ? (
                        <>
                          <span className="c-visually-hidden">Overdue, </span>
                          Overdue {shortDate(due, rowZone)}
                        </>
                      ) : (
                        <>
                          {compactTime(due, now, rowZone)}
                          {r.overdue ? (
                            <span className="c-hint">
                              <br />
                              Overdue
                            </span>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : (
                    <span className="c-unknown">No due date</span>
                  )}
                </td>
                <td className="two">
                  <strong title={title}>{title}</strong>
                  <span>
                    {t ? label(TASK_KIND_LABEL, t.kind) : 'Deal'}
                    {r.personId && r.personName ? (
                      <>
                        {' · '}
                        <a href={`/crm/contacts/${r.personId}/`}>{r.personName}</a>
                      </>
                    ) : (
                      <>
                        {' · '}
                        <span className="c-unknown">No person recorded</span>
                      </>
                    )}
                    {company ? (
                      <>
                        {' · '}
                        <a href={company.href}>{company.text}</a>
                      </>
                    ) : null}
                    {d ? (
                      <>
                        {' · '}
                        <a href={`/crm/deals/${d.id}/`}>{d.name}</a> <StageStatus value={d.stage} />
                      </>
                    ) : null}
                  </span>
                </td>
                {showOwner ? <td className="hide-sm owner">{owner ?? <span className="c-warn-text">Unassigned</span>}</td> : null}
                <td className="act">
                  {t ? (
                    <TaskActions task={t} isAdmin={isAdmin} people={people} />
                  ) : d ? (
                    <a className="c-btn is-small" href={`/crm/deals/${d.id}/`} aria-label={`Open deal ${d.name}`}>
                      Open deal
                    </a>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
