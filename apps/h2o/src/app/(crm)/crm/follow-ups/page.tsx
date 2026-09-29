import type { Metadata } from 'next'
import { label, TASK_KIND_LABEL, TASK_STATUS_LABEL } from '../../../../crm/workspace/labels'
import { loadFollowUps, type FollowUpFilter } from '../../../../crm/workspace/queries'
import { compactTime } from '../../../../crm/workspace/time'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { TaskActions } from '../_components/Dialogs'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Follow-ups' }

const WHEN: Array<[FollowUpFilter['when'], string]> = [
  ['due', 'Due today'],
  ['overdue', 'Overdue'],
  ['open', 'All open'],
  ['done', 'Done'],
]
const WHO: Array<[FollowUpFilter['who'], string]> = [
  ['mine', 'Mine'],
  ['team', 'Team'],
  ['unassigned', 'Unassigned'],
]

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/follow-ups/')
  const sp = await searchParams
  const f: FollowUpFilter = {
    who: sp.who === 'team' || sp.who === 'unassigned' ? sp.who : 'mine',
    when: sp.when === 'overdue' || sp.when === 'open' || sp.when === 'done' ? sp.when : 'due',
  }
  const now = new Date()
  const { rows, total, people } = await loadFollowUps(s, f, now)
  const href = (o: Partial<FollowUpFilter>) => `/crm/follow-ups/?who=${o.who ?? f.who}&when=${o.when ?? f.when}`
  return (
    <Shell active="followups" title="Follow-ups" userName={s.displayName} isAdmin={s.isAdmin}>
      <nav className="c-views" aria-label="Follow-up views">
        {WHEN.map(([k, l]) => (
          <a key={k} href={href({ when: k })} aria-current={f.when === k ? 'page' : undefined}>
            {l}
          </a>
        ))}
        <span className="c-scope" role="group" aria-label="Owner scope">
          {WHO.map(([k, l]) => (
            <a key={k} href={href({ who: k })} aria-current={f.who === k ? 'true' : undefined}>
              {l}
            </a>
          ))}
        </span>
      </nav>
      {rows.length === 0 ? (
        <div className="c-panel">
          <p className="c-empty" role="status">
            {f.when === 'done' ? 'No finished follow-ups.' : f.when === 'overdue' ? 'Nothing overdue.' : f.when === 'due' ? 'No follow-ups due today.' : 'No open follow-ups.'}
          </p>
        </div>
      ) : (
        <div className="c-table-wrap">
          <table className="c-table">
            <caption className="c-visually-hidden">Follow-ups</caption>
            <thead>
              <tr>
                <th scope="col">Due</th>
                <th scope="col">Follow-up</th>
                <th scope="col" className="hide-sm">
                  Related to
                </th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="c-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className={t.overdue ? 'c-overdue' : undefined}>
                    {t.overdue ? 'Overdue · ' : ''}
                    {t.dueAt ? compactTime(new Date(t.dueAt), now) : <span className="c-unknown">No date</span>}
                  </td>
                  <td className="two">
                    <strong title={t.title}>{t.title}</strong>
                    <span>
                      {label(TASK_KIND_LABEL, t.kind)}
                      {t.priority === 'HIGH' ? ' · High priority' : ''}
                    </span>
                  </td>
                  <td className="hide-sm">
                    {t.rfqId ? <a href={`/crm/rfqs/?rfq=${t.rfqId}`}>{t.rfqNumber ?? 'Inquiry'}</a> : null}
                    {t.accountId ? (
                      <>
                        {t.rfqId ? ' · ' : ''}
                        <a href={`/crm/accounts/${t.accountId}/`}>{t.accountName ?? 'Account'}</a>
                      </>
                    ) : null}
                  </td>
                  <td>{t.assigneeName ?? <span className="c-warn-text">Unassigned</span>}</td>
                  <td>{label(TASK_STATUS_LABEL, t.status)}</td>
                  <td>
                    <TaskActions task={t} isAdmin={s.isAdmin} people={people} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="c-pager">
            <span>
              {rows.length} of {total}
            </span>
          </div>
        </div>
      )}
    </Shell>
  )
}
