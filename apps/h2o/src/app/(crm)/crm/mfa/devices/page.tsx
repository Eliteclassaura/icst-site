import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { DEVICE_COOKIE, listDevices } from '../../../../../auth/mfa/devices'
import { emailCodeEligible } from '../../../../../auth/mfa/eligibility'
import { pendingSession } from '../../../../../auth/mfa/guard'
import { forgetDeviceAction, signOutOtherDevicesAction } from '../actions'

export const metadata: Metadata = { title: 'Remembered devices' }
export const dynamic = 'force-dynamic'

const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never')

/**
 * MFA-2: the devices this person chose to remember ("Remember this device for 30 days"), with "Forget" for each and
 * "Sign out other devices". Only for a signed-in (two-factor verified) non-admin; admins never remember a device.
 */
export default async function DevicesPage() {
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending?.verified) redirect('/crm/mfa/?next=%2Fcrm%2Fmfa%2Fdevices%2F')
  const eligible = emailCodeEligible(pending.user)
  const devices = eligible ? await listDevices(payload, pending.user.id, (await cookies()).get(DEVICE_COOKIE)?.value) : []
  return (
    <div className="crm-app c-denied c-mfa">
      <main className="c-content" id="crm-main">
        <h1>Remembered devices</h1>
        {!eligible ? (
          <p className="c-hint">Admin accounts always sign in with the authenticator app, so no device is ever remembered.</p>
        ) : devices.length === 0 ? (
          <p className="c-hint">No device is remembered. You enter a code every time you sign in.</p>
        ) : (
          <>
            <p className="c-hint">These devices skip the code at sign-in until they expire. Forget any you don’t recognise.</p>
            <ul role="list" className="c-mfa-devices">
              {devices.map((d) => (
                <li key={d.id}>
                  <strong>{d.label}</strong>
                  {d.current ? ' (this device)' : ''}
                  <br />
                  <span className="c-hint">
                    Added {when(d.createdAt)} · last used {when(d.lastUsedAt)} · expires {when(d.expiresAt)}
                  </span>
                  <form action={forgetDeviceAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" className="c-btn is-small">
                      Forget
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={signOutOtherDevicesAction}>
              <button type="submit" className="c-btn">
                Sign out other devices
              </button>
            </form>
          </>
        )}
        <p>
          <a href="/crm/">Back to My Work</a>
        </p>
      </main>
    </div>
  )
}
