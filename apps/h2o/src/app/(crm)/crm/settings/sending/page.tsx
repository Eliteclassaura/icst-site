import { ToneChip } from '../../../../../crm/workspace/ui/Status'
import type { Metadata } from 'next'
import { DEFAULT_SENDER_NAME } from '../../../../../email/config'
import { activeSender, emailStatus, presetOptions, PRESET_LABEL, stepUpLeft, USE_LABEL, type ActiveSender } from '../../../../../email/settings-page'
import { listProfiles } from '../../../../../email/sending-settings'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { MakeActiveButton, ProfileForm, StepUpForm } from '../../_components/SettingsForms'
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
  return (
    <Shell active="settings" title="Sending profiles" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / Sending profiles
      </p>
      <section className="c-panel is-settings" aria-labelledby="now-h">
        <div className="c-panel-head">
          <h2 id="now-h">Active sender</h2>
        </div>
        <div className="c-panel-body is-padded">
          <SenderLine label="Inquiry and system email" sender={activeSender(profiles, 'TRANSACTIONAL', st.envProfile)} />
          <SenderLine label="Revenue Engine email" sender={activeSender(profiles, 'REVENUE', st.envProfile)} />
          <p className="c-hint">Sending mode: {st.modeLabel}.</p>
          {st.keyConfigured ? null : (
            <p className="c-alert" role="alert">
              The server has no settings key, so passwords can’t be stored. Ask the operator to set one.
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
                    <th scope="col">
                      <span className="c-visually-hidden">Action</span>
                    </th>
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
                      <td>{p.active === true ? <ToneChip tone="success">On</ToneChip> : <ToneChip tone="terminal">Off</ToneChip>}</td>
                      <td>{p.last_check_state === 'OK' ? 'Passed' : p.last_check_state === 'FAILED' ? `Failed (${String(p.last_check_code ?? '')})` : 'Not checked'}</td>
                      <td className="act">{p.active === true ? null : <MakeActiveButton id={String(p.id)} />}</td>
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
          <ProfileForm values={{ from_name: DEFAULT_SENDER_NAME }} presets={presetOptions()} />
        </div>
      </section>
    </Shell>
  )
}

/** One line of the Active sender card: who it sends as, how it signs in (never the password), and whether it was checked. */
function SenderLine({ label, sender }: { label: string; sender: ActiveSender }) {
  if (sender.source === 'none')
    return (
      <p>
        <strong>{label}:</strong> nothing. No profile is turned on and the server has no default settings.
      </p>
    )
  if (sender.source === 'env')
    return (
      <p>
        <strong>{label}:</strong> the server’s default settings (no profile is turned on).
      </p>
    )
  return (
    <div>
      <p>
        <strong>{label}:</strong> {sender.fromName ? `${sender.fromName} ` : ''}&lt;{sender.fromAddress}&gt; through{' '}
        {sender.name} ({sender.presetLabel}
        {sender.viaFallback ? '; shared with inquiry email' : ''})
      </p>
      <p className="c-hint">
        Signs in to {sender.host} as {sender.login}. Last check:{' '}
        {sender.check === 'passed' ? `passed ${sender.checkedAt}` : sender.check === 'failed' ? `failed (${sender.checkCode}) ${sender.checkedAt}` : 'not checked'}.{' '}
        <a href={`/crm/settings/sending/${encodeURIComponent(sender.id)}/`}>Open profile</a>
      </p>
      {sender.warning ? (
        <p className="c-banner is-warning" role="status">
          {sender.warning}
        </p>
      ) : null}
    </div>
  )
}
