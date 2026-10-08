import type { Metadata } from 'next'
import { emailStatus } from '../../../../email/settings-page'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Settings' }

/** Patch C: CRM settings (admins). Email sending profiles and email templates. */
export default async function SettingsPage() {
  const s = await requireCrmSession('/crm/settings/')
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Settings" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const st = emailStatus()
  return (
    <Shell active="settings" title="Settings" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <section className="c-panel is-settings" aria-labelledby="email-h">
        <div className="c-panel-head">
          <h2 id="email-h">Email</h2>
        </div>
        <div className="c-panel-body is-padded">
          <dl className="c-dl">
            <dt>Sending</dt>
            <dd>{st.configErrors.length ? `Not working — server settings incomplete (${st.configErrors.join(', ')})` : st.modeLabel}</dd>
          </dl>
          <ul>
            <li>
              <a href="/crm/settings/sending/">Sending profiles</a> — the mailbox the CRM sends from (Google Workspace, Stalwart).
            </li>
            <li>
              <a href="/crm/settings/email-routing/">Email routing</a>: who gets new quote alerts (US, Thailand) and the sales address customers see.
            </li>
            <li>
              <a href="/crm/settings/sequences/">Sequences</a>: the Revenue Engine, with follow-up sequences, caps and sending health.
            </li>
            <li>
              <a href="/crm/settings/templates/">Email templates</a>: the acknowledgement and the reply templates T1–T6.
            </li>
          </ul>
          <p className="c-hint">The sending mode and the allowed test recipients are server settings, set by the operator; they can’t be changed here.</p>
        </div>
      </section>
    </Shell>
  )
}
