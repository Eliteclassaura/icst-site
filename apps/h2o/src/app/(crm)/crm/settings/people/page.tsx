import type { Metadata } from 'next'
import { listPeople } from '../../../../../auth/mfa/admin-actions'
import { stepUpLeft } from '../../../../../email/settings-page'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { ToneChip } from '../../../../../crm/workspace/ui/Status'
import { PersonActions } from '../../_components/PeopleForms'
import { StepUpForm } from '../../_components/SettingsForms'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'People and sign-in' }

const STATE = { on: ['Two-step on', 'success'], 'not-set-up': ['Not set up yet', 'terminal'], off: ['Turned off', 'terminal'] } as const

/** MFA-ADMIN-1: reset anyone's two-step sign-in; turn it off (or back on) for a non-admin. Admins only; needs the step-up. */
export default async function PeoplePage() {
  const s = await requireCrmSession('/crm/settings/people/')
  if (!s.isAdmin)
    return (
      <Shell active="settings" title="People and sign-in" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Settings are for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const [people, left] = await Promise.all([listPeople(s), stepUpLeft(s)])
  return (
    <Shell active="settings" title="People and sign-in" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-crumbs">
        <a href="/crm/settings/">Settings</a> / People and sign-in
      </p>
      <StepUpForm secondsLeft={left} what="Resetting or turning off two-step sign-in" />
      <section className="c-panel is-settings" aria-labelledby="people-h">
        <div className="c-panel-head">
          <h2 id="people-h">Two-step sign-in</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p className="c-hint">
            Resetting makes someone set up two-step sign-in again. Turning it off is only for staff who are not admins; admins always use their authenticator app. You can’t change your own here.
          </p>
          <div className="c-table-wrap">
            <table className="c-table" aria-label="People and their two-step sign-in">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Two-step sign-in</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    <td>{p.roles.join(', ') || 'No role'}</td>
                    <td>
                      <ToneChip tone={STATE[p.mfa][1]}>{STATE[p.mfa][0]}</ToneChip>
                    </td>
                    <td>
                      <PersonActions id={p.id} name={p.name} exempt={p.exempt} admin={p.admin} isSelf={p.isSelf} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Shell>
  )
}
