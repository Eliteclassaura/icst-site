import type { Metadata } from 'next'
import { IDENTITY_REASON_LABEL, TASK_KIND_LABEL, ACTIVITY_LABEL, label } from '../../../crm/workspace/labels'
import { loadMyWork, type Loaded, type Scope } from '../../../crm/workspace/queries'
import { compactTime, relativeAge } from '../../../crm/workspace/time'
import { RfqStatus } from '../../../crm/workspace/ui/Status'
import { Shell } from '../../../crm/workspace/ui/Shell'
import { AssignMe, TaskActions } from './_components/Dialogs'
import { requireCrmSession } from './session'

export const metadata: Metadata = { title: 'My Work' }

const countOf = (l: Loaded<{ count: number }>) => (l.status === 'ok' ? l.data.count : null)

function Strip({ n, text, href, error }: { n: number | null; text: string; href: string; error?: boolean }) {
  if (n === null) return <span className="c-muted">{text}: count unavailable</span>
  if (n <= 0) return null
  return (
    <a href={href} className={error ? 'c-overdue' : undefined}>
      {n} {text}
    </a>
  )
}

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/')
  const sp = await searchParams
  const scope: Scope = sp.scope === 'team' ? 'team' : sp.scope === 'mine' ? 'mine' : s.isAdmin ? 'team' : 'mine'
  const now = new Date()
  const w = await loadMyWork(s, scope, now)
  const failed = [w.unassigned, w.assigned, w.followUps, w.waiting, w.recent, w.reviews].filter((m) => m.status === 'error').length
  const counts = {
    unassigned: countOf(w.unassigned),
    followUps: countOf(w.followUps),
    overdue: w.followUps.status === 'ok' ? w.followUps.data.overdue : null,
    waiting: countOf(w.waiting),
    reviews: countOf(w.reviews),
  }
  const allClear =
    failed === 0 && counts.unassigned === 0 && counts.followUps === 0 && counts.waiting === 0 && countOf(w.assigned) === 0 && (counts.reviews ?? 0) === 0
  const scopeTag = scope === 'mine' ? 'Mine' : 'Team'
  return (
    <Shell
      active="work"
      title="My Work"
      userName={s.displayName}
      isAdmin={s.isAdmin}
      badges={{
        inbox: counts.unassigned ? { n: counts.unassigned } : undefined,
        followups: counts.overdue ? { n: counts.overdue, error: true } : undefined,
      }}
      topRight={
        <span className="c-scope" role="group" aria-label="Scope">
          <a href="/crm/?scope=mine" aria-current={scope === 'mine' ? 'true' : undefined}>
            Mine
          </a>
          <a href="/crm/?scope=team" aria-current={scope === 'team' ? 'true' : undefined}>
            Team
          </a>
        </span>
      }
    >
      <p className="c-strip" aria-label="What needs attention">
        {allClear ? (
          <span role="status">Nothing waiting. Inbox is clear.</span>
        ) : (
          <>
            <Strip n={counts.unassigned} text="unassigned" href="/crm/rfqs/?view=unassigned" />
            <Strip n={counts.overdue} text="follow-ups overdue" href="/crm/follow-ups/?when=overdue" error />
            <Strip n={counts.followUps} text="follow-ups due today" href="/crm/follow-ups/?when=due" />
            <Strip n={counts.waiting} text="waiting for customer" href="/crm/rfqs/?view=waiting" />
            <Strip n={counts.reviews} text="identity reviews open" href="/crm/rfqs/?view=review" />
            {w.pipeline.status === 'ok' && w.pipeline.data.open > 0 ? <a href="/crm/pipeline/">{w.pipeline.data.open} open opportunities</a> : null}
            {failed > 0 ? (
              <span className="c-warn-text" role="status">
                {failed} module{failed > 1 ? 's' : ''} unavailable · this is not a complete picture
              </span>
            ) : null}
          </>
        )}
      </p>

      <div className="c-grid-work">
        <div className="c-stack">
          <Module title="New & unassigned" tag="Team · needs an owner" loaded={w.unassigned} more="/crm/rfqs/?view=unassigned">
            {(d) =>
              d.rows.length === 0 ? (
                <p className="c-empty">No unassigned inquiries.</p>
              ) : (
                <ul className="c-list" role="list">
                  {d.rows.map((r) => (
                    <li key={r.id}>
                      <span className="grow">
                        <a className="c-trunc" href={`/crm/rfqs/?rfq=${r.id}`}>
                          <strong>{r.company ?? 'Company not supplied'}</strong> · {r.contactName ?? 'Contact not supplied'}
                        </a>
                        <span className="c-hint">
                          {r.interest} · <span className={r.aged ? 'c-warn-text' : undefined}>Received {relativeAge(new Date(r.receivedAt), now)}</span>
                        </span>
                      </span>
                      <AssignMe rfqId={r.id} updatedAt={r.updatedAt} />
                    </li>
                  ))}
                </ul>
              )
            }
          </Module>
          <Module title={scope === 'mine' ? 'My assigned RFQs' : 'Assigned RFQs'} tag={scopeTag} loaded={w.assigned} more={scope === 'mine' ? '/crm/rfqs/?view=mine' : '/crm/rfqs/'}>
            {(d) =>
              d.rows.length === 0 ? (
                <p className="c-empty">{scope === 'mine' ? 'Nothing assigned to you.' : 'No assigned inquiries.'}</p>
              ) : (
                <ul className="c-list" role="list">
                  {d.rows.map((r) => (
                    <li key={r.id}>
                      <span className="grow">
                        <a className="c-trunc" href={`/crm/rfqs/?rfq=${r.id}`}>
                          <strong>{r.company ?? 'Company not supplied'}</strong>
                        </a>
                        <span className="c-hint">
                          {r.nextAction ? (
                            <span className={r.nextAction.overdue ? 'c-overdue' : undefined}>
                              {r.nextAction.overdue ? 'Overdue · ' : ''}
                              {r.nextAction.title}
                            </span>
                          ) : (
                            'No open follow-up'
                          )}
                          {scope === 'team' ? ` · ${r.ownerName ?? ''}` : ''}
                        </span>
                      </span>
                      <RfqStatus value={r.status} />
                    </li>
                  ))}
                </ul>
              )
            }
          </Module>
          <Module title="Recent activity" tag={scopeTag} loaded={w.recent}>
            {(d) =>
              d.rows.length === 0 ? (
                <p className="c-empty">No recent activity.</p>
              ) : (
                <ul className="c-list" role="list">
                  {d.rows.map((a) => (
                    <li key={a.id}>
                      <span className="c-muted">{compactTime(new Date(a.occurredAt), now)}</span>
                      <span className="grow">
                        <span className="c-trunc">
                          <strong>{label(ACTIVITY_LABEL, a.type)}</strong> · {a.actorKind === 'USER' ? (a.actorName ?? 'CRM user') : 'System'}
                          {a.rfqId ? (
                            <>
                              {' · '}
                              <a href={`/crm/rfqs/?rfq=${a.rfqId}&tab=activity`}>Open</a>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </Module>
        </div>
        <div className="c-stack">
          <Module title="Follow-ups due" tag={scopeTag} loaded={w.followUps} more="/crm/follow-ups/">
            {(d) =>
              d.rows.length === 0 ? (
                <p className="c-empty">No follow-ups due today.</p>
              ) : (
                <ul className="c-list" role="list">
                  {d.rows.map((t) => (
                    <li key={t.id}>
                      <span className="grow">
                        <span className="c-trunc">{t.title}</span>
                        <span className="c-hint">
                          {t.overdue ? <span className="c-overdue">Overdue</span> : 'Due'} {t.dueAt ? compactTime(new Date(t.dueAt), now) : ''}
                          {t.rfqId ? (
                            <>
                              {' · '}
                              <a href={`/crm/rfqs/?rfq=${t.rfqId}`}>{t.rfqNumber ? 'Inquiry' : 'Open'}</a>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <TaskActions task={t} isAdmin={s.isAdmin} people={w.people} />
                    </li>
                  ))}
                </ul>
              )
            }
          </Module>
          <Module title="Waiting for customer" tag={scopeTag} loaded={w.waiting} more="/crm/rfqs/?view=waiting">
            {(d) =>
              d.rows.length === 0 ? (
                <p className="c-empty">Not waiting on any customer.</p>
              ) : (
                <ul className="c-list" role="list">
                  {d.rows.map((t) => (
                    <li key={t.id}>
                      <span className="grow">
                        <a className="c-trunc" href={t.rfqId ? `/crm/rfqs/?rfq=${t.rfqId}` : '/crm/follow-ups/'}>
                          {t.title.replace(/^Waiting for customer:\s*/, '')}
                        </a>
                        <span className="c-hint">
                          {label(TASK_KIND_LABEL, t.kind)} · {t.overdue ? <span className="c-overdue">Overdue</span> : 'Due'} {t.dueAt ? compactTime(new Date(t.dueAt), now) : ''}
                        </span>
                      </span>
                      <TaskActions task={t} isAdmin={s.isAdmin} people={w.people} />
                    </li>
                  ))}
                </ul>
              )
            }
          </Module>
          {w.reviews.status === 'error' || (w.reviews.status === 'ok' && w.reviews.data.count > 0) ? (
            <Module title="Review queue" tag={s.isAdmin ? 'Team' : 'Team · resolved by admins'} loaded={w.reviews} more="/crm/rfqs/?view=review">
              {(d) => (
                <ul className="c-list" role="list">
                  {d.rows.map((r) => (
                    <li key={r.id}>
                      <span className="grow">
                        <span className="c-trunc">{label(IDENTITY_REASON_LABEL, r.reason)}</span>
                      </span>
                      {r.rfqId ? <a href={`/crm/rfqs/?rfq=${r.rfqId}`}>View</a> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Module>
          ) : null}
        </div>
      </div>
    </Shell>
  )
}

function Module<T>({
  title,
  tag,
  loaded,
  more,
  retry = '/crm/',
  children,
}: {
  retry?: string
  title: string
  tag: string
  loaded: Loaded<T>
  more?: string
  children: (d: T) => React.ReactNode
}) {
  const count = loaded.status === 'ok' && typeof (loaded.data as { count?: number }).count === 'number' ? (loaded.data as { count: number }).count : null
  return (
    <section className="c-panel" aria-label={title}>
      <div className="c-panel-head">
        <h2>{title}</h2>
        {count !== null ? <span className="c-count">{count}</span> : null}
        <span className="c-tag">{tag}</span>
        {more ? (
          <a className="c-more" href={more}>
            View all
          </a>
        ) : null}
      </div>
      <div className="c-panel-body">
        {loaded.status === 'error' ? (
          <p className="c-alert" role="alert">
            Couldn’t load {title.toLowerCase()}. <a href={retry}>Retry</a>
          </p>
        ) : (
          children(loaded.data)
        )}
      </div>
    </section>
  )
}
