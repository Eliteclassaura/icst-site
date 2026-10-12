import type { Metadata } from 'next'
import { ACTIVITY_LABEL, MOTION_LABEL, label } from '../../../../../crm/workspace/labels'
import { OFFICE_LABEL } from '../../../../../crm/offices'
import { dealQuery, parseDealParams } from '../../../../../crm/workspace/dealParams'
import { dealCalendar, loadDeal, selectableStages } from '../../../../../crm/workspace/deals'
import { absoluteTime, shortCalendarDate } from '../../../../../crm/workspace/time'
import { DueLabel } from '../../../../../crm/workspace/ui/Due'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { StageStatus } from '../../../../../crm/workspace/ui/Status'
import { EditDealDialog, MoveStageDialog } from '../../_components/Dialogs'
import { requireCrmSession } from '../../session'
import { AttachmentsPanel } from '../../_components/AttachmentsPanel'

export const metadata: Metadata = { title: 'Deal' }

type Doc = Record<string, unknown>

/**
 * Deal page (OPP-1): the same destination from the list and the board. The next action sits at the top, so a phone
 * shows it without scrolling. Edit and Move stage re-check the user on the server; this page only hides what a
 * role cannot use. Nothing here sends email.
 */
export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const s = await requireCrmSession(`/crm/deals/${encodeURIComponent(id)}/`)
  const now = new Date()
  const d = await loadDeal(s, id, now)
  // The list the person came from: only validated filter keys are re-used.
  const fromRaw = typeof sp.from === 'string' ? sp.from : ''
  const back = parseDealParams(Object.fromEntries(new URLSearchParams(fromRaw.slice(0, 400))))
  const backQuery = dealQuery(back)
  const backHref = `/crm/deals/${backQuery ? `?${backQuery}` : ''}`
  if (!d)
    return (
      <Shell active="pipeline" title="Deal" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          This deal doesn’t exist or you don’t have access. <a href="/crm/deals/">Back to deals</a>
        </p>
      </Shell>
    )
  const { deal, row } = d
  const closed = ['WON', 'LOST', 'CANCELLED'].includes(row.stage)
  const change = (deal.last_stage_change ?? {}) as Doc
  const stages = selectableStages(d.stages, row.stage)
  // The deal's own office calendar (zone and holidays) for every date default and quick control on this page.
  const cal = await dealCalendar(s, row.office)
  const calendar = { zone: cal.zone, holidays: [...cal.holidays] }
  return (
    <Shell active="pipeline" title={row.name} crumb={<a href={backHref}>Deals</a>} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <div className="c-stack">
        <section className="c-panel c-deal-hero" aria-labelledby="deal-next">
          <div className="c-panel-head">
            <h2 id="deal-next">{closed ? 'Closed' : 'Next action'}</h2>
            <StageStatus value={row.stage} />
          </div>
          <div className="c-panel-body">
            {closed ? (
              <p className="c-muted">This deal is closed, so it has no next action.</p>
            ) : (
              <p className="c-deal-next is-large">
                {row.nextStep ? <strong>{row.nextStep}</strong> : <span className="c-warn-text">No next action. Add one.</span>}
                {row.nextStep ? (
                  <>
                    {' · '}
                    <DueLabel dueAt={row.nextDue} overdue={row.overdue} now={now} zone={row.zone} />
                    <span className="c-muted"> ({row.zoneLabel})</span>
                  </>
                ) : null}
              </p>
            )}
            <div className="c-actions">
              <EditDealDialog
                dealId={row.id}
                updatedAt={String(deal.updatedAt ?? '')}
                people={d.people}
                owner={row.ownerId ?? s.userId}
                amount={deal.amount_status === 'KNOWN' && typeof deal.amount === 'number' ? String(deal.amount) : ''}
                currency={typeof deal.currency === 'string' ? deal.currency : ''}
                amountIsZero={deal.source_record_explicit_zero === true && deal.amount === 0}
                expectedClose={row.expectedClose ?? ''}
                nextStep={row.nextStep ?? ''}
                nextDue={row.nextDueDate ?? ''}
                open={!closed}
                zoneNote={`Dates are in ${row.zoneLabel}, the deal’s office.`}
                calendar={calendar}
                buttonClassName="c-btn is-primary"
              />
              <MoveStageDialog
                dealId={row.id}
                updatedAt={String(deal.updatedAt ?? '')}
                stages={stages.map((x) => ({ key: x.key, label: x.label, terminal: x.terminal }))}
                current={row.stage}
                currentIsClosed={closed}
                zoneNote={`Dates are in ${row.zoneLabel}, the deal’s office.`}
                calendar={calendar}
                buttonClassName="c-btn"
              />
            </div>
          </div>
        </section>
        <section className="c-panel" aria-labelledby="deal-details">
          <div className="c-panel-head">
            <h2 id="deal-details">Details</h2>
          </div>
          <div className="c-panel-body">
            <dl className="c-dl">
              <dt>Company</dt>
              <dd>{row.accountId ? <a href={`/crm/accounts/${row.accountId}/`}>{row.accountName ?? 'Account'}</a> : <span className="c-unknown">No account</span>}</dd>
              <dt>Person</dt>
              <dd>
                {d.origin?.contactId ? <a href={`/crm/contacts/${d.origin.contactId}/`}>{d.origin.contactName ?? 'Contact'}</a> : <span className="c-unknown">Not recorded</span>}
              </dd>
              <dt>Inquiry</dt>
              <dd>{d.origin ? <a href={`/crm/rfqs/${d.origin.id}/`}>{d.origin.number || 'Open the inquiry'}</a> : <span className="c-unknown">None</span>}</dd>
              <dt>Owner</dt>
              <dd>{row.ownerName ?? <span className="c-warn-text">No owner</span>}</dd>
              <dt>Work type</dt>
              <dd>{label(MOTION_LABEL, deal.motion)}</dd>
              <dt>Value</dt>
              <dd>{row.value ?? <span className="c-unknown">Not entered</span>}</dd>
              <dt>Expected close</dt>
              <dd>{row.expectedClose ? shortCalendarDate(row.expectedClose) : <span className="c-unknown">Not set</span>}</dd>
              <dt>Office</dt>
              <dd>{row.office ? (OFFICE_LABEL as Record<string, string>)[row.office] : <span className="c-unknown">Not set</span>}</dd>
              <dt>Last stage move</dt>
              <dd>
                {change.at ? (
                  <>
                    {absoluteTime(new Date(String(change.at)), s.timeZone)}
                    {change.reason ? ` · ${String(change.reason)}` : ''}
                  </>
                ) : (
                  <span className="c-unknown">None yet</span>
                )}
              </dd>
            </dl>
          </div>
        </section>
        <section className="c-panel" aria-labelledby="deal-history">
          <div className="c-panel-head">
            <h2 id="deal-history">History</h2>
            <span className="c-count">{d.activityTotal}</span>
          </div>
          <div className="c-panel-body">
            {d.activity.length === 0 ? (
              <p className="c-empty">No history yet.</p>
            ) : (
              <ul className="c-list" role="list">
                {d.activity.map((a) => (
                  <li key={a.id}>
                    <span className="grow">
                      {a.summary || label(ACTIVITY_LABEL, a.type)}
                      <span className="c-muted"> · {a.at ? absoluteTime(new Date(a.at), s.timeZone) : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d.activityTotal > d.activity.length ? <p className="c-hint">Showing the latest {d.activity.length} of {d.activityTotal}.</p> : null}
          </div>
        </section>
        <AttachmentsPanel s={s} kind="OPPORTUNITY" recordId={id} />
      </div>
    </Shell>
  )
}
