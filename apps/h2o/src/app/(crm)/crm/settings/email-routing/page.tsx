import type { Metadata } from 'next'
import { routingView } from '../../../../../email/routing-read'
import { stepUpLeft } from '../../../../../email/settings-page'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { ToneChip } from '../../../../../crm/workspace/ui/Status'
import { RoutingForm, StepUpForm, TestAlertForm } from '../../_components/SettingsForms'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Email routing' }

/** ALERTS-1: where new quote alerts go and which sales address customers see (admins). Needs the step-up to change. */
export default async function EmailRoutingPage() {
  const s = await requireCrmSession('/crm/settings/email-routing/')
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Email routing" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const [v, left] = await Promise.all([routingView(s.payload), stepUpLeft(s)])
  const lines = (a: string[]) => a.join('\n')
  return (
    <Shell active="settings" title="Email routing" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / Email routing
      </p>
      <section className="c-panel is-settings" aria-labelledby="now-h">
        <div className="c-panel-head">
          <h2 id="now-h">In effect now</h2>
        </div>
        <div className="c-panel-body is-padded">
          <dl className="c-dl">
            <dt>New quote alerts (US)</dt>
            <dd>
              {v.effective.us.join(', ') || 'Nobody'} {v.usingDefault.us ? <ToneChip tone="terminal">using default</ToneChip> : null}
            </dd>
            <dt>New quote alerts (Thailand)</dt>
            <dd>
              {v.effective.th.join(', ') || 'Nobody'} {v.usingDefault.th ? <ToneChip tone="terminal">using default</ToneChip> : null}
            </dd>
            <dt>Also a copy to</dt>
            <dd>{v.effective.cc.join(', ') || 'Nobody'}</dd>
            <dt>Sales address customers see</dt>
            <dd>
              {v.effective.sales} {v.usingDefault.sales ? <ToneChip tone="terminal">using default</ToneChip> : null}
            </dd>
          </dl>
        </div>
      </section>
      <StepUpForm secondsLeft={left} />
      <section className="c-panel is-settings" aria-labelledby="edit-h">
        <div className="c-panel-head">
          <h2 id="edit-h">Change routing</h2>
        </div>
        <div className="c-panel-body is-padded">
          <RoutingForm
            values={{ alerts_us: lines(v.stored.alerts_us), alerts_th: lines(v.stored.alerts_th), alerts_cc: lines(v.stored.alerts_cc), sales_address: v.stored.sales_address ?? '' }}
            defaults={{ alerts: v.defaultAlerts.join(', '), sales: v.defaultSales }}
          />
          <p className="c-hint">A change applies to the next quote. A customer’s browser may show the old sales address for up to 5 minutes.</p>
        </div>
      </section>
      <section className="c-panel is-settings" aria-labelledby="test-h">
        <div className="c-panel-head">
          <h2 id="test-h">Test it</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p className="c-hint">Sends one clearly marked TEST message to the alert addresses above. It never goes to a customer. One test per minute.</p>
          <TestAlertForm />
        </div>
      </section>
    </Shell>
  )
}
