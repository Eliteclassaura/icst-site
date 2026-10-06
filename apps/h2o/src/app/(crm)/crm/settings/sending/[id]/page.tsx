import { ToneChip } from '../../../../../../crm/workspace/ui/Status'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { presetOptions, PRESET_LABEL, stepUpLeft, USE_LABEL } from '../../../../../../email/settings-page'
import { listProfiles } from '../../../../../../email/sending-settings'
import { compactTime } from '../../../../../../crm/workspace/time'
import { Shell } from '../../../../../../crm/workspace/ui/Shell'
import { ProfileActions, ProfileForm, StepUpForm } from '../../../_components/SettingsForms'
import { requireCrmSession } from '../../../session'

export const metadata: Metadata = { title: 'Sending profile' }

/** Patch C: one sending profile — check, test, turn on/off, edit, delete. The password is never shown. */
export default async function SendingProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await requireCrmSession(`/crm/settings/sending/${encodeURIComponent(id)}/`)
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="Sending profile" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const [profiles, left] = await Promise.all([listProfiles(s.payload), stepUpLeft(s)])
  const p = profiles.find((x) => String(x.id) === id)
  if (!p) notFound()
  const checked = typeof p.last_check_at === 'string' ? compactTime(new Date(p.last_check_at), new Date(), s.timeZone) : null
  return (
    <Shell active="settings" title={String(p.name)} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / <a href="/crm/settings/sending/">Sending profiles</a> / {String(p.name)}
      </p>
      <section className="c-panel is-settings" aria-labelledby="sum-h">
        <div className="c-panel-head">
          <h2 id="sum-h">{String(p.name)}</h2>
          {p.active === true ? <ToneChip tone="success">On: new email is sent through this profile</ToneChip> : <ToneChip tone="terminal">Off</ToneChip>}
        </div>
        <div className="c-panel-body is-padded">
          <dl className="c-dl">
            <dt>Provider</dt>
            <dd>{PRESET_LABEL[String(p.preset)] ?? String(p.preset)}</dd>
            <dt>Mailbox</dt>
            <dd>{String(p.username ?? '')}</dd>
            <dt>Password</dt>
            <dd>{p.password_set === true ? 'Stored (encrypted)' : 'Not stored'}</dd>
            <dt>Send as</dt>
            <dd>
              {p.from_name ? `${String(p.from_name)} · ` : ''}
              {String(p.from_address ?? '')}
            </dd>
            <dt>Sends</dt>
            <dd>{USE_LABEL[String(p.use)] ?? String(p.use)}</dd>
            <dt>Last check</dt>
            <dd>
              {p.last_check_state === 'OK' ? `Passed${checked ? `, ${checked}` : ''}` : p.last_check_state === 'FAILED' ? `Failed (${String(p.last_check_code ?? '')})` : 'Not checked since the last change'}
            </dd>
          </dl>
          <ProfileActions id={String(p.id)} active={p.active === true} />
          <p className="c-hint">A profile can be turned on only after a successful check. Tests go to your own address and follow the sending mode.</p>
        </div>
      </section>
      <StepUpForm secondsLeft={left} />
      <section className="c-panel is-settings" aria-labelledby="edit-h">
        <div className="c-panel-head">
          <h2 id="edit-h">Edit</h2>
        </div>
        <div className="c-panel-body is-padded">
          <ProfileForm
            presets={presetOptions()}
            values={{
              id: String(p.id),
              name: String(p.name ?? ''),
              preset: String(p.preset ?? ''),
              use: String(p.use ?? ''),
              host: String(p.host ?? ''),
              port: Number(p.port ?? 587),
              tls_servername: String(p.tls_servername ?? ''),
              username: String(p.username ?? ''),
              from_address: String(p.from_address ?? ''),
              from_name: String(p.from_name ?? ''),
              password_set: p.password_set === true,
            }}
          />
        </div>
      </section>
    </Shell>
  )
}
