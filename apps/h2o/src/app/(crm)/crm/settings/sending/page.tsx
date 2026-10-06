import type { Metadata } from 'next'
import { emailStatus, presetOptions, PRESET_LABEL, stepUpLeft, USE_LABEL } from '../../../../../email/settings-page'
import { listProfiles } from '../../../../../email/sending-settings'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { ProfileForm, StepUpForm } from '../../_components/SettingsForms'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Sending profiles' }

/** Patch C: email sending profiles (admins). Passwords are write-only and never shown. */
export default async function SendingProfilesPage() {
  const s = await requireCrmSession('/crm/settings/sending/')
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Sending profiles" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const [profiles, left] = await Promise.all([listProfiles(s.payload), stepUpLeft(s)])
  const st = emailStatus()
  const active = profiles.find((p) => p.active === true && p.use === 'TRANSACTIONAL')
  return (
    <Shell active="settings" title="Sending profiles" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / Sending profiles
      </p>
      <section className="c-panel is-settings" aria-labelledby="now-h">
        <div className="c-panel-head">
          <h2 id="now-h">Inquiry email is sent through</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p>
            {active
              ? `${String(active.name)} (${PRESET_LABEL[String(active.preset)] ?? String(active.preset)})`
              : st.envProfile
                ? 'The server’s default settings (no profile is turned on).'
                : 'Nothing — no profile is turned on and the server has no default settings.'}
          </p>
          <p className="c-hint">Sending mode: {st.modeLabel}.</p>
          {st.keyConfigured ? null : (
            <p className="c-alert" role="alert">
              H2O_SETTINGS_KEY is not set on the server, so passwords can’t be stored. Ask the operator to set it.
            </p>
          )}
        </div>
      </section>
      <StepUpForm secondsLeft={left} />
      <section className="c-panel is-settings" aria-labelledby="list-h">
        <div className="c-panel-head">
          <h2 id="list-h">Profiles</h2>
        </div>
        <div className="c-panel-body is-padded">
          {profiles.length === 0 ? (
            <p className="c-hint">No profiles yet.</p>
          ) : (
            <div className="c-table-wrap">
              <table className="c-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Provider</th>
                    <th scope="col">Sends</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last check</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={String(p.id)}>
                      <td>
                        <a href={`/crm/settings/sending/${encodeURIComponent(String(p.id))}/`}>{String(p.name)}</a>
                      </td>
                      <td>{PRESET_LABEL[String(p.preset)] ?? String(p.preset)}</td>
                      <td>{USE_LABEL[String(p.use)] ?? String(p.use)}</td>
                      <td>{p.active === true ? <span className="c-badge">On</span> : 'Off'}</td>
                      <td>{p.last_check_state === 'OK' ? 'Passed' : p.last_check_state === 'FAILED' ? `Failed (${String(p.last_check_code ?? '')})` : 'Not checked'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <section className="c-panel is-settings" aria-labelledby="add-h">
        <div className="c-panel-head">
          <h2 id="add-h">Add a profile</h2>
        </div>
        <div className="c-panel-body is-padded">
          <ProfileForm values={{}} presets={presetOptions()} />
        </div>
      </section>
    </Shell>
  )
}
