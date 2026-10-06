import type { Metadata } from 'next'
import { MOTION_LABEL } from '../../../../crm/workspace/labels'
import { loadPipeline } from '../../../../crm/workspace/queries'
import { compactTime } from '../../../../crm/workspace/time'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { StageStatus } from '../../../../crm/workspace/ui/Status'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Pipeline' }

/**
 * Grouped pipeline table (Control Tower: GROUPED TABLE, NOT Kanban). Opportunities grouped by stage in the
 * accepted CRM-1 stage order. No totals, sums, probabilities or conversion figures: a value is shown only
 * when its amount status is KNOWN; otherwise the unknown is named.
 */
export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/pipeline/')
  const sp = await searchParams
  const owner = sp.owner === 'me' ? 'me' : null
  const includeClosed = sp.closed === '1'
  const now = new Date()
  const groups = await loadPipeline(s, { owner, includeClosed }, now)
  const any = groups.some((g) => g.count > 0)
  const q = (o: Record<string, string | null>) => {
    const u = new URLSearchParams()
    const v = { owner, closed: includeClosed ? '1' : null, ...o }
    for (const [k, x] of Object.entries(v)) if (x) u.set(k, x)
    return `/crm/pipeline/${u.toString() ? `?${u}` : ''}`
  }
  return (
    <Shell
      active="pipeline"
      title="Pipeline"
      userName={s.displayName} session={s}
      isAdmin={s.isAdmin}
      topRight={
        <span className="c-scope" role="group" aria-label="Scope">
          <a href={q({ owner: null })} aria-current={owner ? undefined : 'true'}>
            Team
          </a>
          <a href={q({ owner: 'me' })} aria-current={owner ? 'true' : undefined}>
            Mine
          </a>
        </span>
      }
    >
      <p className="c-hint">
        Opportunities grouped by stage. Values appear only where an amount has been recorded; there are no totals.{' '}
        <a href={q({ closed: includeClosed ? null : '1' })}>{includeClosed ? 'Hide won / lost / cancelled' : 'Show won / lost / cancelled'}</a>
      </p>
      {!any ? (
        <div className="c-panel">
          <p className="c-empty" role="status">
            No opportunities {owner ? 'owned by you' : 'yet'}. Opportunities are created from qualified inquiries in a later phase.
          </p>
        </div>
      ) : (
        <div className="c-table-wrap">
          <table className="c-table">
            <caption className="c-visually-hidden">Opportunities grouped by stage</caption>
            <thead>
              <tr>
                <th scope="col">Opportunity</th>
                <th scope="col">Account</th>
                <th scope="col" className="hide-sm">
                  Motion
                </th>
                <th scope="col">Owner</th>
                <th scope="col" className="hide-sm">
                  Next step
                </th>
                <th scope="col" className="hide-sm">
                  Decision expected
                </th>
                <th scope="col" className="num">
                  Value
                </th>
              </tr>
            </thead>
            {groups
              .filter((g) => g.count > 0)
              .map((g) => (
                <tbody key={g.stage}>
                  <tr className="c-group-row">
                    <th scope="colgroup" colSpan={7}>
                      <StageStatus value={g.stage} /> <span className="c-muted">· {g.count}</span>
                      {g.count > g.rows.length ? <span className="c-muted"> (showing {g.rows.length})</span> : null}
                    </th>
                  </tr>
                  {g.rows.map((o) => (
                    <tr key={o.id}>
                      <td className="two">
                        <strong title={o.name}>{o.name}</strong>
                        {o.originRfqId ? (
                          <span>
                            <a href={`/crm/rfqs/${o.originRfqId}/`}>Origin inquiry</a>
                          </span>
                        ) : null}
                      </td>
                      <td>{o.accountId ? <a href={`/crm/accounts/${o.accountId}/`}>{o.accountName ?? 'Account'}</a> : <span className="c-unknown">No account</span>}</td>
                      <td className="hide-sm">{o.motion ? MOTION_LABEL[o.motion] ?? 'Unknown' : <span className="c-unknown">Not set</span>}</td>
                      <td>{o.ownerName ?? <span className="c-warn-text">No owner</span>}</td>
                      <td className="hide-sm">
                        {o.nextStep ? (
                          <span className={o.nextStepOverdue ? 'c-overdue' : undefined}>
                            {o.nextStepOverdue ? 'Overdue · ' : ''}
                            {o.nextStep}
                            {o.nextStepDue ? <span className="c-muted"> · {compactTime(new Date(o.nextStepDue), now)}</span> : null}
                          </span>
                        ) : (
                          <span className="c-muted">No next step</span>
                        )}
                      </td>
                      <td className="hide-sm">{o.expectedDecision ? o.expectedDecision.slice(0, 10) : <span className="c-unknown">Unknown</span>}</td>
                      <td className="num">
                        {o.value.kind === 'KNOWN' ? (
                          o.value.display
                        ) : (
                          <span className="c-unknown">{o.value.kind === 'NOT_ENTERED' ? 'Not entered' : o.value.kind === 'WITHHELD' ? 'Withheld' : 'Value unknown'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
          </table>
        </div>
      )}
    </Shell>
  )
}
