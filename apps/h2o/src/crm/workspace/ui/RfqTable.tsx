import type { ReactNode } from 'react'
import type { RfqRow } from '../queries'
import { absoluteTime, BUSINESS_TIME_ZONE, compactTime, relativeAge } from '../time'
import { RfqStatus, RowFlags } from './Status'
import { countryName } from '../../countries'
import { INQUIRY_TYPE_LABEL, typeFromInterest, type InquiryType } from '../../inquiry-type'

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
              <tr key={r.id} className={selectedId === r.id ? 'is-selected' : undefined}>
                {select ? (
                  <td className="sel">
                    <input type="checkbox" className="c-check" data-bulk value={`${r.id}|${r.updatedAt}`} aria-label={`Select ${r.company ?? r.contactName ?? 'inquiry'}`} />
                  </td>
                ) : null}
                <td className="received" title={absoluteTime(received, zone)}>
                  <span>{compactTime(received, now, zone)}</span>
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
                  <td className="hide-sm interest two">
                    <TypeCell r={r} />
                  </td>
                )}
                {compact ? null : (
                  <td className="hide-sm country">
                    <CountryCell code={r.countryCode} source={r.countrySource} />
                  </td>
                )}
                <td className="owner">
                  {r.ownerName ? (
                    <span className="c-trunc" title={r.ownerName}>
                      {r.ownerName}
                    </span>
                  ) : (
                    <span className="c-warn-text">Unassigned</span>
                  )}
                </td>
                <td className="status">
                  <RfqStatus value={r.status} />
                </td>
                {compact ? null : (
                  <td className="hide-sm next">
                    {r.nextAction ? (
                      <span
                        className={r.nextAction.overdue ? 'c-overdue' : undefined}
                        title={`${r.nextAction.overdue ? 'Overdue · ' : ''}${r.nextAction.title}`}
                      >
                        {r.nextAction.overdue ? 'Overdue · ' : ''}
                        {r.nextAction.title}
                        {r.nextAction.dueAt ? <span className="c-muted"> · {compactTime(new Date(r.nextAction.dueAt), now, zone)}</span> : null}
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

/** Type, and the customer's own words when the staff classification says something else (owner request). */
function TypeCell({ r }: { r: RfqRow }) {
  const label = INQUIRY_TYPE_LABEL[r.type as InquiryType] ?? 'Not stated'
  const customerType = r.interestOrigin === 'CUSTOMER' ? typeFromInterest(r.interest) : null
  const differs = r.typeSource === 'STAFF_MOTION' && customerType && customerType !== r.type
  return (
    <>
      <strong title={r.typeSource === 'STAFF_MOTION' ? 'Classified by staff' : 'From the customer’s answer'}>{label}</strong>
      <span title={r.interest}>{differs ? `Customer: ${r.interest}` : r.interestOrigin === 'CUSTOMER' ? r.interest : r.typeSource === 'STAFF_MOTION' ? 'Staff classification' : ''}</span>
    </>
  )
}

/** Country name; marked when it was inferred from the phone number rather than stated. */
function CountryCell({ code, source }: { code: string | null; source: string }) {
  if (!code) return <span className="c-unknown">Unknown</span>
  const name = countryName(code) ?? code
  return (
    <span title={source === 'PHONE_INFERRED' ? 'Inferred from the phone number' : source === 'DESTINATION_ANSWER' ? 'From the customer’s destination answer' : 'Submitted'}>
      {name}
      {source === 'PHONE_INFERRED' ? <span className="c-muted"> · from phone</span> : null}
    </span>
  )
}
