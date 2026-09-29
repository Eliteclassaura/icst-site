import type { RfqRow } from '../queries'
import { absoluteTime, compactTime, relativeAge } from '../time'
import { RfqStatus, RowFlags } from './Status'

/**
 * The inquiry list. Real table semantics; each company cell carries the row link (focusable for j/k).
 * Hashes and technical ids never appear here; the RFQ number is a business reference shown in the detail.
 */
export function RfqTable({
  rows,
  now,
  hrefFor,
  selectedId,
  compact = false,
  caption,
}: {
  rows: RfqRow[]
  now: Date
  hrefFor: (r: RfqRow) => string
  selectedId?: string | null
  compact?: boolean
  caption: string
}) {
  return (
    <div className="c-table-wrap">
      <table className="c-table">
        <caption className="c-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Received</th>
            <th scope="col">Company / contact</th>
            {compact ? null : (
              <th scope="col" className="hide-sm">
                Interest
              </th>
            )}
            <th scope="col">Owner</th>
            <th scope="col">Status</th>
            {compact ? null : (
              <th scope="col" className="hide-sm">
                Next action
              </th>
            )}
            <th scope="col">
              <span className="c-visually-hidden">Flags</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const received = new Date(r.receivedAt)
            return (
              <tr key={r.id} aria-selected={selectedId === r.id ? true : undefined}>
                <td title={absoluteTime(received)}>
                  <span>{compactTime(received, now)}</span>
                  {r.aged ? (
                    <span className="c-hint">
                      <br />
                      <span className="c-warn-text">Received {relativeAge(received, now)}</span>
                    </span>
                  ) : null}
                </td>
                <td className="two">
                  <a className="c-row-link" href={hrefFor(r)} data-row-link aria-current={selectedId === r.id ? 'true' : undefined}>
                    <strong>{r.company ?? <span className="c-unknown">Company not supplied</span>}</strong>
                    <span>
                      {r.contactName ?? 'Contact not supplied'}
                      {r.company && !r.companyLinked ? ' · unlinked' : ''}
                    </span>
                  </a>
                </td>
                {compact ? null : (
                  <td className="hide-sm">
                    <span className="c-trunc" title={r.interest}>
                      {r.interest}
                    </span>
                  </td>
                )}
                <td>{r.ownerName ?? <span className="c-warn-text">Unassigned</span>}</td>
                <td>
                  <RfqStatus value={r.status} />
                </td>
                {compact ? null : (
                  <td className="hide-sm">
                    {r.nextAction ? (
                      <span className={r.nextAction.overdue ? 'c-overdue' : undefined}>
                        {r.nextAction.overdue ? 'Overdue · ' : ''}
                        {r.nextAction.title}
                        {r.nextAction.dueAt ? <span className="c-muted"> · {compactTime(new Date(r.nextAction.dueAt), now)}</span> : null}
                      </span>
                    ) : r.status === 'QUALIFIED' ? (
                      <span className="c-muted">Qualified</span>
                    ) : (
                      <span className="c-muted">No open follow-up</span>
                    )}
                  </td>
                )}
                <td>
                  <RowFlags flags={r.flags} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
