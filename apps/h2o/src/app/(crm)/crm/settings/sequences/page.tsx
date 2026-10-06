import type { Metadata } from 'next'
import { ensureSeedSequences } from '../../../../../crm/ers/admin'
import { engineStatus, sequenceReport } from '../../../../../crm/ers/report'
import { absoluteTime } from '../../../../../crm/workspace/time'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { EngineSwitch, ResumeHealth } from '../../_components/SequenceForms'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Sequences' }

const STATE: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Running', PAUSED: 'Paused', RETIRED: 'Retired' }

/** Revenue Engine slice 1: sequences and the engine (admins). One report table (LEAN CUT 7). */
export default async function SequencesPage() {
  const s = await requireCrmSession('/crm/settings/sequences/')
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Sequences" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  await ensureSeedSequences(s.payload)
  const [st, rows] = await Promise.all([engineStatus(s.payload), sequenceReport(s.payload)])
  const h = st.settings.health
  return (
    <Shell active="settings" title="Sequences" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / Sequences
      </p>
      <section className="c-panel is-settings" aria-labelledby="eng-h">
        <div className="c-panel-head">
          <h2 id="eng-h">Revenue Engine</h2>
        </div>
        <div className="c-panel-body is-padded">
          <dl className="c-dl">
            <dt>Switch</dt>
            <dd>{st.settings.enabled ? 'On' : 'Off — no sequence runs and nothing is sent'}</dd>
            <dt>Reply detection</dt>
            <dd>
              {st.inboundLive
                ? 'Live'
                : 'Not live — inbound email is off or its last check is more than 15 minutes old. Sequences wait until it is live.'}
            </dd>
            <dt>Sending health</dt>
            <dd>
              {h.state === 'PAUSED'
                ? `Paused${h.reason === 'COMPLAINT' ? ' after a complaint' : h.reason === 'HARD_BOUNCE_RATE' ? ' — too many hard bounces' : ''}${h.changedAt ? ` (${absoluteTime(new Date(h.changedAt), s.timeZone)})` : ''}`
                : 'Normal'}
            </dd>
            <dt>Last 24 hours</dt>
            <dd>
              {st.sentLast24h} of {st.capToday} sequence emails{st.settings.compliance.warmup ? ' (warm-up cap)' : ''}
            </dd>
            <dt>Hard bounces</dt>
            <dd>
              {st.bounce.bounced} of the last {st.bounce.total} sends{st.bounce.total ? ` (${Math.round(st.bounce.ratio * 1000) / 10}%)` : ''}
              {st.bounce.warn ? ' — above the 2% warning level: check the addresses being enrolled.' : ''}
            </dd>
          </dl>
          <div className="c-actions">
            <EngineSwitch on={st.settings.enabled} />
            {h.state === 'PAUSED' ? <ResumeHealth /> : null}
          </div>
          <p className="c-hint">
            Caps, business hours, warm-up, the address footer and the signature are in the <a href="/admin/globals/crm-ers-settings">Revenue Engine settings</a>.
            Unsubscribe links and the suppression list always apply.
          </p>
        </div>
      </section>
      <section className="c-panel is-settings" aria-labelledby="rep-h">
        <div className="c-panel-head">
          <h2 id="rep-h">Sequences</h2>
        </div>
        <div className="c-panel-body is-padded">
          <div className="c-table-wrap">
            <table className="c-table">
              <thead>
                <tr>
                  <th scope="col">Sequence</th>
                  <th scope="col">State</th>
                  <th scope="col" className="num">Enrolled</th>
                  <th scope="col" className="num">Sent</th>
                  <th scope="col" className="num">Replied</th>
                  <th scope="col" className="num">Reply %</th>
                  <th scope="col">Stopped</th>
                  <th scope="col" className="num">Unsubscribed</th>
                  <th scope="col" className="num">Bounced</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const stopped = Object.entries(r.exits).filter(([k, n]) => n > 0 && !['REPLIED', 'UNSUBSCRIBED', 'BOUNCED'].includes(k))
                  return (
                    <tr key={r.id}>
                      <td>
                        <a href={`/crm/settings/sequences/${encodeURIComponent(r.id)}/`}>{r.name}</a>
                      </td>
                      <td>
                        {STATE[r.runState] ?? r.runState}
                        {r.version ? ` · v${r.version}` : ''}
                      </td>
                      <td className="num">{r.enrolled}</td>
                      <td className="num">{r.sent}</td>
                      <td className="num">{r.replied}</td>
                      <td className="num">{r.replyPct === null ? '—' : `${r.replyPct}%`}</td>
                      <td>{stopped.length ? stopped.map(([k, n]) => `${k.toLowerCase().replace(/_/g, ' ')} ${n}`).join(', ') : '—'}</td>
                      <td className="num">{r.unsubscribed}</td>
                      <td className="num">{r.bounced}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Shell>
  )
}
