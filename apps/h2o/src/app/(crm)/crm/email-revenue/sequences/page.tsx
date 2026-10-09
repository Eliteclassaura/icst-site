import type { Metadata } from 'next'
import { sequenceReport } from '../../../../../crm/ers/report'
import { t } from '../../../../../crm/library/ui-strings'
import { requireCrmSession } from '../../session'
import { EmailRevenueFrame } from '../_components/EmailRevenueFrame'

export const metadata: Metadata = { title: 'Sequences' }
const STATE: Record<string, string> = { ACTIVE: 'Running', PAUSED: 'Paused', RETIRED: 'Retired', DRAFT: 'Not started' }

export default async function SequencesPage() {
  const s = await requireCrmSession('/crm/email-revenue/sequences/')
  const rows = await sequenceReport(s.payload)
  return (
    <EmailRevenueFrame s={s} tab="sequences" title="Sequences">
      <section className="c-panel" aria-labelledby="er-sl-h">
        <div className="c-panel-head">
          <h2 id="er-sl-h">Sequences</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p>
            <a className="c-btn" href="/crm/email-revenue/sequences/new/">
              Start from a prebuilt sequence
            </a>
          </p>
          {rows.length === 0 ? (
            <p className="c-hint">{t('ers.empty.sequences')}</p>
          ) : (
            <div className="c-table-wrap" role="region" aria-label="Sequences table" tabIndex={0}>
              <table className="c-table er-table">
                <thead>
                  <tr>
                    <th scope="col">Sequence</th>
                    <th scope="col">State</th>
                    <th scope="col" className="num">Enrolled</th>
                    <th scope="col" className="num">Running</th>
                    <th scope="col" className="num">Held</th>
                    <th scope="col" className="num">Sent</th>
                    <th scope="col" className="num">Replied</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Sequence">
                        <a href={`/crm/email-revenue/sequences/${encodeURIComponent(r.id)}/`}>{r.name}</a>
                      </td>
                      <td data-label="State">{STATE[r.runState] ?? 'Unknown'}</td>
                      <td data-label="Enrolled" className="num">{r.enrolled}</td>
                      <td data-label="Running" className="num">{r.live}</td>
                      <td data-label="Held" className="num">{r.held}</td>
                      <td data-label="Sent" className="num">{r.sent}</td>
                      <td data-label="Replied" className="num">{r.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </EmailRevenueFrame>
  )
}
