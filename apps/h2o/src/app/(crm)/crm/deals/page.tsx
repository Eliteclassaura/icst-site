import type { Metadata } from 'next'
import { OFFICE_LABEL, OFFICES } from '../../../../crm/offices'
import { dealQuery, parseDealParams } from '../../../../crm/workspace/dealParams'
import { DEALS_PAGE_SIZE, ensureDealStages, loadBoard, loadDeals, type DealRow } from '../../../../crm/workspace/deals'
import { crmUsers } from '../../../../crm/workspace/queries'
import { shortCalendarDate } from '../../../../crm/workspace/time'
import { DueLabel } from '../../../../crm/workspace/ui/Due'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { StageStatus } from '../../../../crm/workspace/ui/Status'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Deals' }

/**
 * Deals (OPP-1): one list and one board over the same records, both opening the same deal page. Filters are applied
 * once with Apply (no reload while choosing). Counts are real totals; the list pages through every match, and a board
 * column that holds more than it shows links to the list for that stage. Overdue next actions come first.
 */
export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/deals/')
  const p = parseDealParams(await searchParams)
  const now = new Date()
  const [people, stages] = await Promise.all([crmUsers(s), ensureDealStages(s.payload)])
  const qs = (over: Record<string, string | null> = {}) => {
    const q = dealQuery(p, over)
    return `/crm/deals/${q ? `?${q}` : ''}`
  }
  const here = dealQuery(p)
  const card = (d: DealRow, hideStage = false) => <DealCard key={d.id} d={d} now={now} zone={s.timeZone} from={here} hideStage={hideStage} />
  const list = p.view === 'list' ? await loadDeals(s, p.filter, p.page, now) : null
  const board = p.view === 'board' ? await loadBoard(s, p.filter, now) : null
  const total = list ? list.total : (board ?? []).reduce((n, c) => n + c.count, 0)
  return (
    <Shell
      active="pipeline"
      title="Deals"
      userName={s.displayName}
      session={s}
      isAdmin={s.isAdmin}
      topRight={
        <span className="c-scope" role="group" aria-label="View">
          <a href={qs({ view: null, page: null })} aria-current={p.view === 'list' ? 'true' : undefined}>
            List
          </a>
          <a href={qs({ view: 'board', page: null })} aria-current={p.view === 'board' ? 'true' : undefined}>
            Board
          </a>
        </span>
      }
    >
      <form className="c-panel c-deal-filters" method="get" action="/crm/deals/" aria-label="Filter deals">
        {p.view === 'board' ? <input type="hidden" name="view" value="board" /> : null}
        <label className="c-field">
          <span>Owner</span>
          <select className="c-select" name="owner" defaultValue={p.filter.owner ?? ''}>
            <option value="">Everyone</option>
            <option value="me">Mine</option>
            {people
              .filter((x) => x.id !== s.userId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <label className="c-field">
          <span>Stage</span>
          <select className="c-select" name="stage" defaultValue={p.filter.stage ?? ''}>
            <option value="">All open stages</option>
            {stages.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="c-field">
          <span>Office</span>
          <select className="c-select" name="office" defaultValue={p.filter.office ?? ''}>
            <option value="">Both offices</option>
            {OFFICES.map((o) => (
              <option key={o} value={o}>
                {OFFICE_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="c-deal-check">
          <input className="c-check" type="checkbox" name="closed" value="1" defaultChecked={p.filter.closed} />
          <span>Include won, lost and cancelled</span>
        </label>
        <div className="c-actions">
          <button type="submit" className="c-btn is-primary">
            Apply
          </button>
          <a className="c-btn" href={p.view === 'board' ? '/crm/deals/?view=board' : '/crm/deals/'}>
            Clear filters
          </a>
        </div>
      </form>
      <p className="c-hint" role="status">
        {total === 0 ? 'No deals match these filters.' : `${total} ${total === 1 ? 'deal' : 'deals'}${list ? ` · page ${list.page} of ${list.pages}` : ''}`}
      </p>
      {list ? (
        <>
          {list.rows.length ? <ul className="c-deals" role="list" aria-label="Deals">{list.rows.map((d) => card(d))}</ul> : null}
          {list.pages > 1 ? (
            <nav className="c-pager" aria-label="Deal pages">
              <span>
                {(list.page - 1) * DEALS_PAGE_SIZE + 1}–{Math.min(list.page * DEALS_PAGE_SIZE, list.total)} of {list.total}
              </span>
              {list.page > 1 ? <a href={qs({ page: String(list.page - 1) })}>Previous</a> : null}
              {list.page < list.pages ? <a href={qs({ page: String(list.page + 1) })}>Next</a> : null}
            </nav>
          ) : null}
        </>
      ) : (
        <div className="c-board">
          {(board ?? []).map((col) => (
            <div key={col.stage.key} className="c-board-col" role="group" aria-label={`${col.stage.label}, ${col.count} deals`}>
              <h2 className="c-board-head">
                <StageStatus value={col.stage.key} /> <span className="c-muted">· {col.count}</span>
              </h2>
              {col.rows.length ? <ul className="c-deals" role="list">{col.rows.map((d) => card(d, true))}</ul> : <p className="c-hint">No deals here.</p>}
              {col.count > col.rows.length ? (
                <a className="c-board-more" href={`/crm/deals/?${dealQuery({ filter: { ...p.filter, stage: col.stage.key, closed: p.filter.closed || col.stage.terminal } })}`}>
                  Show all {col.count} (list)
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

function DealCard({ d, now, zone, from, hideStage }: { d: DealRow; now: Date; zone: string; from: string; hideStage: boolean }) {
  const href = `/crm/deals/${encodeURIComponent(d.id)}/${from ? `?from=${encodeURIComponent(from)}` : ''}`
  return (
    <li className="c-deal">
      <div className="c-deal-top">
        <a className="c-deal-name" href={href}>
          {d.name}
        </a>
        {hideStage ? null : <StageStatus value={d.stage} />}
      </div>
      <p className="c-deal-next">
        {d.nextStep ? (
          <>
            <strong>{d.nextStep}</strong> · <DueLabel dueAt={d.nextDue} overdue={d.overdue} now={now} zone={d.zone} />{d.zone !== zone ? <span className="c-muted"> ({d.zoneLabel})</span> : null}
          </>
        ) : d.stage === 'WON' || d.stage === 'LOST' || d.stage === 'CANCELLED' ? (
          <span className="c-muted">Closed</span>
        ) : (
          <span className="c-warn-text">No next action</span>
        )}
      </p>
      <p className="c-deal-meta c-muted">
        {d.ownerName ?? <span className="c-warn-text">No owner</span>}
        {d.value ? ` · ${d.value}` : ''}
        {d.expectedClose ? ` · close ${shortCalendarDate(d.expectedClose)}` : ''}
        {d.office ? ` · ${d.office}` : ''}
      </p>
    </li>
  )
}
