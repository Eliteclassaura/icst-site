import type { Metadata } from 'next'
import { overview } from '../../../../crm/ers/hub'
import { t } from '../../../../crm/library/ui-strings'
import { requireCrmSession } from '../session'
import { EmailRevenueFrame } from './_components/EmailRevenueFrame'

export const metadata: Metadata = { title: 'Email Revenue' }

const FUNNEL_LABEL: Record<string, string> = {
  contacted: 'Contacted',
  replies: 'Replied',
  qualified: 'Qualified pursuits',
  won: 'Won',
  revenue: 'Confirmed revenue',
}
const FUNNEL_NOTE: Record<string, string> = {
  contacted: 'Contacts who received at least one sequence email.',
  replies: 'Contacts whose sequence ended because they replied.',
  qualified: 'Deals that started from an inquiry these contacts sent. The origin never changes.',
  won: 'Those deals marked won.',
  revenue: 'Only won deals with a confirmed amount. Each currency is shown on its own.',
}
const ATTENTION: Record<string, string> = {
  held: 'enrollments held by the copy check or a missing value',
  dead: 'enrollments that failed and need a decision',
}

/** ERS-HUB-1: start something, what needs attention, the results funnel, the sequence table and recent activity. */
export default async function EmailRevenuePage() {
  const s = await requireCrmSession('/crm/email-revenue/')
  const o = await overview(s)
  return (
    <EmailRevenueFrame s={s} tab="overview" title="Email Revenue">
      <section className="c-panel" aria-labelledby="er-start-h">
        <div className="c-panel-head">
          <h2 id="er-start-h">Start something</h2>
        </div>
        <div className="c-panel-body is-padded">
          <ul className="er-start">
            <li>
              <a href="/crm/email-revenue/sequences/">Follow up an inquiry with a sequence</a>
            </li>
            <li>
              <a href="/crm/email-revenue/library/">Browse the Email Library</a>
            </li>
            <li>
              <a href="/crm/email-revenue/campaigns/">Send a blast to an audience</a>
              <span className="c-hint"> · not available yet</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="c-panel" aria-labelledby="er-att-h">
        <div className="c-panel-head">
          <h2 id="er-att-h">Needs attention</h2>
        </div>
        <div className="c-panel-body is-padded">
          {o.attention.length === 0 ? (
            <p className="c-hint">{t('ers.empty.attention')}</p>
          ) : (
            <ul>
              {o.attention.map((a) => (
                <li key={a.key}>
                  <a href={a.href}>
                    {a.count} {ATTENTION[a.key]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="c-panel" aria-labelledby="er-fun-h">
        <div className="c-panel-head">
          <h2 id="er-fun-h">Results</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p className="c-hint">Credit goes to the outreach a deal started from. Email opens are not counted.</p>
          <ol className="er-funnel">
            {o.funnel.map((r) => (
              <li key={r.key}>
                <span className="er-funnel-label">{FUNNEL_LABEL[r.key]}</span>
                <span className="er-funnel-n">
                  {r.key === 'revenue' ? (
                    r.money && r.money.length ? (
                      r.money.map((m) => (
                        <span key={m.currency} className="er-money">
                          {m.currency} {m.amount.toLocaleString('en-US')}
                        </span>
                      ))
                    ) : (
                      'None confirmed yet'
                    )
                  ) : r.count === null ? (
                    'Not available yet'
                  ) : (
                    r.count
                  )}
                </span>
                <span className="c-hint">{FUNNEL_NOTE[r.key]}</span>
                {r.side ? (
                  <span className="c-hint">
                    Also: {r.side.awaiting} won awaiting confirmation · {r.side.unknown} with an unknown amount ·{' '}
                    {r.side.unattributed} won deals not from outreach.
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="c-panel" aria-labelledby="er-seq-h">
        <div className="c-panel-head">
          <h2 id="er-seq-h">Sequences</h2>
        </div>
        <div className="c-panel-body is-padded">
          {o.sequences.length === 0 ? (
            <p className="c-hint">{t('ers.empty.sequences')}</p>
          ) : (
            <div className="c-table-wrap" role="region" aria-label="Sequences table" tabIndex={0}>
              <table className="c-table er-table">
                <thead>
                  <tr>
                    <th scope="col">Sequence</th>
                    <th scope="col">State</th>
                    <th scope="col" className="num">Enrolled</th>
                    <th scope="col" className="num">Sent</th>
                    <th scope="col" className="num">Replied</th>
                  </tr>
                </thead>
                <tbody>
                  {o.sequences.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Sequence">
                        <a href={`/crm/email-revenue/sequences/${encodeURIComponent(r.id)}/`}>{r.name}</a>
                      </td>
                      <td data-label="State">{r.runState === 'ACTIVE' ? 'Running' : r.runState === 'PAUSED' ? 'Paused' : r.runState === 'RETIRED' ? 'Retired' : 'Not started'}</td>
                      <td data-label="Enrolled" className="num">{r.enrolled}</td>
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

      <section className="c-panel" aria-labelledby="er-rec-h">
        <div className="c-panel-head">
          <h2 id="er-rec-h">Recent activity</h2>
        </div>
        <div className="c-panel-body is-padded">
          {o.recent.length === 0 ? (
            <p className="c-hint">{t('ers.empty.history')}</p>
          ) : (
            <ul>
              {o.recent.map((a) => (
                <li key={a.id}>
                  {a.summary} <span className="c-hint">· {new Date(a.at).toUTCString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </EmailRevenueFrame>
  )
}
