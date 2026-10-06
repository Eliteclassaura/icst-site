import type { ReactNode } from 'react'
import type { RfqRow } from '../queries'
import { absoluteTime, BUSINESS_TIME_ZONE, compactTime, relativeAge } from '../time'
import { CountryFlag, QueueTag, ReplyChip, TypeBadge } from './Facets'
import { RfqStatus, RowFlags } from './Status'
import { typeFromInterest } from '../../inquiry-type'

/**
 * The inquiry list. Real table semantics; each company cell carries the row link (focusable for j/k).
 * Hashes and technical ids never appear here; the RFQ number is a business reference shown in the detail.
 */
export function RfqTable({
  rows,
  now,
  zone = BUSINESS_TIME_ZONE,
  hrefFor,
  selectedId,
  compact = false,
  caption,
  select,
}: {
  rows: RfqRow[]
  now: Date
  /** Patch L1: the viewer's display zone. */
  zone?: string
  hrefFor: (r: RfqRow) => string
  selectedId?: string | null
  compact?: boolean
  caption: string
  /** W1-5: a leading checkbox column; `header` is the "select all" control (rendered by the page). */
  select?: { header: ReactNode }
}) {
  return (
    <div className="c-table-wrap">
      <table className={`c-table c-rfq-table${compact ? ' is-compact' : ''}`}>
        <caption className="c-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {select ? (
              <th scope="col" className="sel">
                {select.header}
              </th>
            ) : null}
            <th scope="col">Received</th>
            <th scope="col">Company / contact</th>
            {compact ? null : (
              <th scope="col" className="hide-sm interest">
                Type
              </th>
            )}
            {compact ? null : (
              <th scope="col" className="hide-sm country">
                Country
              </th>
            )}
            {compact ? null : (
              <th scope="col" className="hide-sm queue">
                Queue
              </th>
            )}
            {compact ? null : <th scope="col">Owner</th>}
            <th scope="col">Status</th>
            <th scope="col" className="reply">
              Reply due
            </th>
            {compact ? null : (
              <th scope="col" className="hide-sm hide-md next">
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
            const exact = absoluteTime(received, zone)
            return (
              <tr key={r.id} className={selectedId === r.id ? 'is-selected' : undefined}>
                {select ? (
                  <td className="sel">
                    <input type="checkbox" className="c-check" data-bulk value={`${r.id}|${r.updatedAt}`} aria-label={`Select ${r.company ?? r.contactName ?? 'inquiry'}`} />
                  </td>
                ) : null}
                {/* Polish R1: relative age; the exact time is in the title and shows under it while the row has focus. */}
                <td className="received" title={exact}>
                  <time dateTime={r.receivedAt}>{relativeAge(received, now)}</time>
                  <span className="c-when-exact">{compactTime(received, now, zone)}</span>
                  {r.aged ? <span className="c-when-aged c-warn-text">Unassigned &gt; 1 business day</span> : null}
                </td>
                <td className="two who">
                  <a className="c-row-link" href={hrefFor(r)} data-row-link data-full-href={`/crm/rfqs/${r.id}/`} aria-current={selectedId === r.id ? 'true' : undefined}>
                    <strong title={r.company ?? undefined}>{r.company ?? <span className="c-unknown">Company not supplied</span>}</strong>
                    <span>
                      {r.contactName ?? 'Contact not supplied'}
                      {r.company && !r.companyLinked ? ' · unlinked' : ''}
                    </span>
                  </a>
                </td>
                {compact ? null : (
                  <td className="hide-sm interest">
                    <TypeCell r={r} />
                  </td>
                )}
                {compact ? null : (
                  <td className="hide-sm country">
                    <CountryFlag code={r.countryCode} source={r.countrySource} />
                  </td>
                )}
                {compact ? null : (
                  <td className="hide-sm queue">
                    <QueueTag office={r.office} />
                  </td>
                )}
                {/* Beside an open record (compact) the owner is in the record's header, so the list leaves it out. */}
                {compact ? null : (
                  <td className="owner">
                    {r.ownerName ? (
                      <span className="c-trunc" title={r.ownerName}>
                        {r.ownerName}
                      </span>
                    ) : (
                      <span className="c-warn-text">Unassigned</span>
                    )}
                  </td>
                )}
                <td className="status">
                  <RfqStatus value={r.status} />
                </td>
                <td className="reply">
                  <ReplyChip reply={r.reply} now={now} zone={zone} />
                </td>
                {compact ? null : (
                  <td className="hide-sm hide-md next">
                    <NextCell r={r} now={now} zone={zone} />
                  </td>
                )}
                <td className="flags">
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

/** The next open follow-up. The first-response task is already the Reply due column, so it is not repeated here. */
function NextCell({ r, now, zone }: { r: RfqRow; now: Date; zone: string }) {
  if (r.nextAction && r.nextAction.kind !== 'RFQ_FIRST_RESPONSE')
    return (
      <span className={r.nextAction.overdue ? 'c-overdue' : undefined} title={`${r.nextAction.overdue ? 'Overdue · ' : ''}${r.nextAction.title}`}>
        {r.nextAction.overdue ? 'Overdue · ' : ''}
        {r.nextAction.title}
        {r.nextAction.dueAt ? <span className="c-muted"> · {compactTime(new Date(r.nextAction.dueAt), now, zone)}</span> : null}
      </span>
    )
  if (r.nextAction) return <span className="c-muted">First reply</span>
  return r.status === 'QUALIFIED' ? <span className="c-muted">Qualified</span> : <span className="c-muted">No open follow-up</span>
}

/** Type badge, and the customer's own words when the staff classification says something else (owner request). */
function TypeCell({ r }: { r: RfqRow }) {
  const customerType = r.interestOrigin === 'CUSTOMER' ? typeFromInterest(r.interest) : null
  const differs = r.typeSource === 'STAFF_MOTION' && customerType && customerType !== r.type
  return (
    <>
      <TypeBadge type={r.type} title={r.typeSource === 'STAFF_MOTION' ? 'Classified by staff' : 'From the customer’s answer'} />
      {differs ? (
        <span className="c-sub" title={r.interest}>
          Customer: {r.interest}
        </span>
      ) : null}
    </>
  )
}
