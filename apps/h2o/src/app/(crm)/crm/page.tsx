import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { IDENTITY_REASON_LABEL, ACTIVITY_LABEL, label } from '../../../crm/workspace/labels'
import { SCOPE_COOKIE, scopeFrom } from '../../../crm/workspace/prefs'
import { loadNextActions } from '../../../crm/workspace/nextActions'
import { loadDashboard, loadMyWork, type DashTile, type Loaded, type Scope, type WeekBucket } from '../../../crm/workspace/queries'
import { compactTime, relativeAge } from '../../../crm/workspace/time'
import { RfqStatus } from '../../../crm/workspace/ui/Status'
import { Shell } from '../../../crm/workspace/ui/Shell'
import { EmptyState } from '../../../crm/workspace/ui/States'
import { IconCheckCircle, IconInbox, IconTasks } from '../../../crm/workspace/ui/Icons'
import { AssignMe } from './_components/Dialogs'
import { ScopeSwitch } from './_components/ScopeSwitch'
import { NextActionList } from './_components/NextActionList'
import { TaskTable } from './_components/TaskTable'
import { requireCrmSession } from './session'

export const metadata: Metadata = { title: 'My Work' }

const countOf = (l: Loaded<{ count: number }>) => (l.status === 'ok' ? l.data.count : null)

/** A count tile: the number, what it counts, and whose; it links to the inbox rows it counts. */
function Tile({ t }: { t: DashTile }) {
  const hot = t.count !== null && t.count > 0 && t.tone !== 'neutral'
  return (
    <a className={`c-kpi${hot ? ` is-${t.tone}` : ''}`} href={t.href}>
      <span className="c-kpi-n">{t.count === null ? '–' : t.count}</span>
      <span className="c-kpi-l">{t.count === null ? `${t.label}: count unavailable` : t.label}</span>
      <span className="c-kpi-s">{t.scope}</span>
    </a>
  )
}

/** Labelled bars (count in text; the bar only repeats it), each linking to that slice of the inbox. */
function Bars({ rows, label }: { rows: WeekBucket[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="c-bars-group">
      <h3 className="c-bars-title">{label}</h3>
      {rows.length === 0 ? (
        <p className="c-muted">None this week.</p>
      ) : (
        <ul className="c-bars" role="list">
          {rows.map((r) => (
            <li key={r.key}>
              <a href={r.href}>
                <span className="c-bar-l">{r.label}</span>
                <span className="c-bar" aria-hidden="true">
                  <span style={{ inlineSize: `${Math.max(4, Math.round((r.count / max) * 100))}%` }} />
                </span>
                <span className="c-bar-n">{r.count}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/')
  const sp = await searchParams
  // W1-8: the remembered Mine/Team choice (shared with Follow-ups); an explicit ?scope= still wins for that view.
  const scope: Scope = sp.scope === 'team' || sp.scope === 'mine' ? sp.scope : scopeFrom((await cookies()).get(SCOPE_COOKIE)?.value, s.isAdmin)
  const now = new Date()
  const [w, dash, next] = await Promise.all([
    loadMyWork(s, scope, now),
    loadDashboard(s, scope, now),
    // OPP-2: the unified next-action queue (follow-ups and open deals), overdue first; the full list has its own page.
    loadNextActions(s, { who: scope, page: 1 }, now).then(
      (data): Loaded<typeof data> => ({ status: 'ok', data }),
      (): Loaded<never> => ({ status: 'error' }),
    ),
  ])
  const failed =
    [w.unassigned, w.assigned, w.followUps, w.waiting, w.recent, w.reviews, dash.week, dash.openFollowUps, next].filter((m) => m.status === 'error').length +
    dash.tiles.filter((t) => t.count === null).length
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
      userName={s.displayName} session={s}
      isAdmin={s.isAdmin}
      badges={{
        inbox: counts.unassigned ? { n: counts.unassigned } : undefined,
        followups: counts.overdue ? { n: counts.overdue, error: true } : undefined,
      }}
      topRight={<ScopeSwitch scope={scope} back="/crm/" />}
    >
      <section className="c-kpis" aria-label="At a glance">
        {dash.tiles.map((t) => (
          <Tile key={t.key} t={t} />
        ))}
      </section>
      {allClear ? (
        <p className="c-ok-line" role="status">
          <IconCheckCircle /> Nothing waiting. The inbox is clear.
        </p>
      ) : null}
      {failed > 0 ? (
        <p className="c-alert" role="status">
          {failed} part{failed > 1 ? 's' : ''} of this page couldn’t load, so this is not a complete picture. <a href="/crm/">Retry</a>
        </p>
      ) : null}

      <div className="c-grid-work">
        <div className="c-stack">
          <Module title="New & unassigned" tag="Team · needs an owner" loaded={w.unassigned} more="/crm/rfqs/?view=unassigned">
            {(d) =>
              d.rows.length === 0 ? (
                <EmptyState icon={<IconInbox />} title="Every inquiry has an owner">
                  New website and chat inquiries without an owner appear here.
                </EmptyState>
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
          <Module
            title="Next actions"
            tag={scopeTag}
            loaded={next}
            more="/crm/next-actions/"
            count={next.status === 'ok' ? next.data.total : undefined}
            badge={next.status === 'ok' && next.data.overdue > 0 ? `${next.data.overdue} overdue` : undefined}
          >
            {(d) =>
              d.rows.length === 0 ? (
                <EmptyState icon={<IconTasks />} title="No next actions">
                  {scope === 'mine' ? 'Your open follow-ups and the next action of each of your open deals appear here, overdue first.' : 'Open follow-ups and the next action of every open deal appear here, overdue first.'}
                </EmptyState>
              ) : (
                <>
                  <NextActionList rows={d.rows.slice(0, 8)} now={now} zone={s.timeZone} isAdmin={s.isAdmin} people={d.people} caption={scope === 'mine' ? 'My next actions' : 'Next actions'} showOwner={scope === 'team'} />
                  {d.total > 8 ? (
                    <p className="c-hint">
                      Showing 8 of {d.total}. <a href="/crm/next-actions/">See all {d.total}</a>
                    </p>
                  ) : null}
                </>
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
                      <span className="c-muted">{compactTime(new Date(a.occurredAt), now, s.timeZone)}</span>
                      <span className="grow">
                        <span className="c-trunc">
                          <strong>{label(ACTIVITY_LABEL, a.type)}</strong> · {a.actorKind === 'USER' ? (a.actorName ?? 'CRM user') : 'System'}
                          {a.rfqId ? (
                            <>
                              {' · '}
                              <a href={`/crm/rfqs/?rfq=${a.rfqId}&tab=activity`}>{a.rfqLabel ?? 'Inquiry'}</a>
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
          <Module title="This week" tag="Team · since Monday" loaded={dash.week} more="/crm/rfqs/?received=week" count={dash.week.status === 'ok' ? dash.week.data.total : undefined}>
            {(d) =>
              d.total === 0 ? (
                <p className="c-empty">No inquiries received this week yet.</p>
              ) : (
                <div className="c-bars-wrap">
                  <Bars rows={d.byType} label="By type" />
                  <Bars rows={d.byCountry} label="By country" />
                </div>
              )
            }
          </Module>
          <Module title="Waiting for customer" tag={scopeTag} loaded={w.waiting} more="/crm/rfqs/?view=waiting">
            {(d) =>
              d.rows.length === 0 ? (
                <p className="c-empty">Not waiting on any customer.</p>
              ) : (
                <TaskTable
                  rows={d.rows.map((t) => ({ ...t, title: t.title.replace(/^Waiting for customer:\s*/, '') }))}
                  now={now} zone={s.timeZone}
                  isAdmin={s.isAdmin}
                  people={w.people}
                  caption="Waiting for customer"
                  showOwner={scope === 'team'}
                />
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
                        <span className="c-trunc">
                          {r.rfqId ? (
                            <a href={`/crm/rfqs/?rfq=${r.rfqId}`}>{r.rfqLabel ?? 'Inquiry'}</a>
                          ) : (
                            <span>Record without an inquiry</span>
                          )}
                          {' · '}
                          {label(IDENTITY_REASON_LABEL, r.reason)}
                        </span>
                      </span>
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
  count: countOverride,
  badge,
  children,
}: {
  count?: number
  /** Polish R1: a short alert next to the title (e.g. "2 overdue"). */
  badge?: string
  retry?: string
  title: string
  tag: string
  loaded: Loaded<T>
  more?: string
  children: (d: T) => React.ReactNode
}) {
  const count = countOverride ?? (loaded.status === 'ok' && typeof (loaded.data as { count?: number }).count === 'number' ? (loaded.data as { count: number }).count : null)
  return (
    <section className="c-panel" aria-label={title}>
      <div className="c-panel-head">
        <h2>{title}</h2>
        {count !== null ? <span className="c-count">{count}</span> : null}
        {badge ? <span className="c-head-alert">{badge}</span> : null}
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
