import type { Metadata } from 'next'
import { simulate } from '../../../../../crm/seq/simulate'
import { simulationReviewFor } from '../../../../../crm/seq/review'
import { t } from '../../../../../crm/library/ui-strings'
import { requireCrmSession } from '../../session'
import { EmailRevenueFrame } from '../_components/EmailRevenueFrame'
import { ApproveSimulation } from '../_components/SeqForms'

export const metadata: Metadata = { title: 'Simulation' }
const WHY: Record<string, string> = {
  RFQ_CLOSED: 'The inquiry is closed.',
  NO_CONTACT: 'No contact on the inquiry.',
  NO_VALID_ADDRESS: t('ers.sim.excluded_reason.address'),
  ALREADY_ENROLLED: 'Already in this sequence.',
  UNSUBSCRIBED: 'Suppressed (unsubscribed).',
  COMPLAINT: 'Suppressed (complaint).',
  BOUNCED: 'Suppressed (bounced).',
  SUPPRESSED: 'Suppressed.',
  RFQ_QUALIFIED: 'Already qualified.',
  OWNER_RESPONDED: 'A person already replied.',
  REPLIED: 'The contact already replied.',
  RFQ_SUBMITTED: 'Sent a newer inquiry.',
}
const after = (n: number) => (n === 0 ? 'Day 0' : `After ${n} business day${n === 1 ? '' : 's'}`)
const ACTION = {
  SEND: 'ers.sim.label.SEND',
  REVIEW: 'ers.sim.label.REVIEW',
  HOLD: 'ers.sim.label.HOLD',
  BLOCK: 'ers.sim.label.BLOCK',
} as const

/** SEQ-BUILD-1: simulate a sequence. Reads only; there is no Send button anywhere on this page. */
export default async function SimulatePage({ searchParams }: { searchParams: Promise<{ seq?: string }> }) {
  const sp = await searchParams
  const s = await requireCrmSession('/crm/email-revenue/simulate/')
  const seqs = (
    await s.payload.find({
      collection: 'crm-sequences',
      where: { published_version: { exists: true } } as never,
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Array<{ id: string; name: string }>
  const res = sp.seq ? await simulate(s, { sequenceId: sp.seq }) : null
  const ok = res && 'snapshotHash' in res ? res : null
  const review = ok ? await simulationReviewFor(s.payload, ok.sequenceId, ok.snapshotHash) : null
  return (
    <EmailRevenueFrame
      s={s}
      tab="advanced"
      title="Simulation"
      crumb={
        <p className="c-crumbs">
          <a href="/crm/email-revenue/advanced/">Advanced</a> / Simulation
        </p>
      }
    >
      <section className="c-panel" aria-labelledby="er-sim-h">
        <div className="c-panel-head">
          <h2 id="er-sim-h">Simulate</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p className="c-hint">{t('ers.sim.hard_rule')}</p>
          {seqs.length === 0 ? (
            <p className="c-hint">
              {t('ers.empty.simulate')} Only a sequence with a published version can be simulated. Mark one
              Ready first.
            </p>
          ) : (
            <form method="get" action="/crm/email-revenue/simulate/" className="er-filters">
              <label className="er-filter">
                <span>Sequence</span>
                <select className="c-input" name="seq" defaultValue={sp.seq ?? ''}>
                  <option value="">Choose…</option>
                  {seqs.map((q) => (
                    <option key={String(q.id)} value={String(q.id)}>
                      {String(q.name)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="c-btn" type="submit">
                {t('ers.sim.run')}
              </button>
            </form>
          )}
          <p className="c-hint">{t('ers.sim.setup_note')}</p>
        </div>
      </section>
      {res && !ok ? (
        <p className="c-alert" role="alert">
          {(res as { message: string }).message}
        </p>
      ) : null}
      {ok ? (
        <>
          <p className="c-banner is-warning" role="status">
            {t('ers.sim.banner', {
              hash: ok.snapshotHash.slice(0, 8),
              time: new Date(ok.generatedAt).toUTCString(),
            })}
          </p>
          <section className="c-panel" aria-labelledby="er-simr-h">
            <div className="c-panel-head">
              <h2 id="er-simr-h">{ok.sequenceName}</h2>
            </div>
            <div className="c-panel-body is-padded">
              <p>
                {t('ers.sim.summary', {
                  candidates: ok.counts.candidates,
                  excluded: ok.counts.excluded,
                  enter: ok.counts.wouldEnter,
                })}
              </p>
              <p>
                {(['SEND', 'REVIEW', 'HOLD', 'BLOCK'] as const).map((k) => (
                  <span key={k} className="er-sim-count" title={t(`ers.sim.tip.${k}` as never)}>
                    {t(ACTION[k] as never)} {ok.counts[k]}{' '}
                  </span>
                ))}
              </p>
              {ok.counts.SEND > 0 ? (
                <p className="c-hint">
                  Automatic sending · no per-email approval. {ok.counts.SEND} email
                  {ok.counts.SEND === 1 ? '' : 's'} would send without review once live.
                </p>
              ) : null}
              <h3>Would enroll</h3>
              {ok.enroll.length === 0 ? (
                <p className="c-hint">No one would enter right now.</p>
              ) : (
                <div className="c-table-wrap" role="region" aria-label="Would enroll table" tabIndex={0}>
                  <table className="c-table er-table">
                    <thead>
                      <tr>
                        <th scope="col">Inquiry</th>
                        <th scope="col">Prediction</th>
                        <th scope="col">First email</th>
                        {ok.enroll.some((r) => r.reasons.length) ? <th scope="col">Why</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {ok.enroll.map((r) => (
                        <tr key={r.rfqId}>
                          <td data-label="Inquiry">{r.label}</td>
                          <td data-label="Prediction">{r.action ? t(ACTION[r.action] as never) : ''}</td>
                          <td data-label="First email">{after(r.firstDay ?? 0)}</td>
                          {ok.enroll.some((x) => x.reasons.length) ? (
                            <td data-label="Why">{r.reasons.join(', ').toLowerCase().replace(/_/g, ' ')}</td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h3>Excluded</h3>
              {ok.excluded.length === 0 ? (
                <p className="c-hint">{t('ers.empty.excluded')}</p>
              ) : (
                <ul>
                  {ok.excluded.map((r) => (
                    <li key={r.rfqId}>
                      {r.label}:{' '}
                      {r.reasons.map((x) => WHY[x] ?? x.toLowerCase().replace(/_/g, ' ')).join(' ')}
                    </li>
                  ))}
                </ul>
              )}
              <h3>Timeline</h3>
              {ok.timeline.length === 0 ? (
                <p className="c-hint">Nothing would be scheduled.</p>
              ) : (
                <ul>
                  {ok.timeline.map((d) => (
                    <li key={d.day}>
                      {after(d.day)}: {d.send} would send, {d.review} need review
                    </li>
                  ))}
                </ul>
              )}
              {s.isAdmin ? (
                <>
                  {review?.state === 'CURRENT' ? (
                    <p className="c-hint">
                      Reviewed {review.hash?.slice(0, 8)}. Activation can use it until the sequence, its
                      wording or its approval mode changes.
                    </p>
                  ) : review?.state === 'STALE' ? (
                    <p className="c-hint">The last reviewed simulation is out of date.</p>
                  ) : null}
                  <ApproveSimulation sequenceId={ok.sequenceId} snapshotHash={ok.snapshotHash} />
                  <p className="c-hint">{t('ers.sim.approve_note')}</p>
                </>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </EmailRevenueFrame>
  )
}
