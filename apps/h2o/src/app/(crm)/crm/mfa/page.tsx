import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { DEVICE_COOKIE, isRememberedDevice } from '../../../../auth/mfa/devices'
import { emailCodeEligible } from '../../../../auth/mfa/eligibility'
import { pendingSession } from '../../../../auth/mfa/guard'
import { safeNext } from '../../../../auth/mfa/next'
import { qrSvg } from '../../../../auth/mfa/qr'
import { beginEnrolment, verifySessionByDevice } from '../../../../auth/mfa/service'
import { groupKey } from '../../../../auth/mfa/ux'
import { DevicesLink, EnrolFlow, VerifyForm } from './MfaForm'
import { ADMIN_BRAND_ALT, ADMIN_LOGO } from '../../../../brand/admin-brand'

/** BRAND-ADMIN-1's logo; DARK-1 (R17 rebase): the white logo on the dark theme (crm.css shows one of the two). */
const MfaLogo = () => (
  <>
    <img className="c-mfa-logo is-light" src={ADMIN_LOGO.light} width={200} height={51} alt={ADMIN_BRAND_ALT} />
    <img className="c-mfa-logo is-dark" src={ADMIN_LOGO.dark} width={200} height={51} alt={ADMIN_BRAND_ALT} />
  </>
)

export const metadata: Metadata = { title: 'Two-factor sign-in' }

type SP = Record<string, string | string[] | undefined>

/**
 * Patch L2: the second sign-in step, for everyone (CRM and admin). It serves a password-only session: first time,
 * enrolment (setup key + first code + recovery codes); afterwards, a code from the app or a recovery code.
 * MFA-UX-1: enrolment as four numbered steps (EnrolFlow); sign-in names the account and offers the recovery code
 * behind a switch (VerifyForm). Same server checks as before (auth/mfa/service.ts).
 */
export default async function MfaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next)
  const payload = await getPayload({ config })
  const pending = await pendingSession(payload, await headers())
  if (!pending) redirect(`/admin/login/?redirect=${encodeURIComponent(next)}`)
  if (pending.verified)
    return (
      <div className="crm-app c-denied">
        <main className="c-content" id="crm-main">
          {/* BRAND-ADMIN-1: the same ICS logo as the admin login. */}
          <MfaLogo />
          <h1>Two-factor sign-in is complete</h1>
          <p>
            <a className="c-btn is-primary" href={`/crm/mfa/done/?next=${encodeURIComponent(next)}`}>
              Continue
            </a>
          </p>
          {emailCodeEligible(pending.user) ? <DevicesLink /> : null}
        </main>
      </div>
    )
  const enrolled = pending.user.mfa_enabled === true
  // MFA-2: a device this person chose to remember (non-admins only) passes the second step without a code. The check
  // re-reads the account's roles, so a device remembered before a promotion to admin no longer works.
  if (enrolled && (await isRememberedDevice(payload, pending.user, (await cookies()).get(DEVICE_COOKIE)?.value))) {
    await verifySessionByDevice(payload, pending.user, pending.sid)
    redirect(`/crm/mfa/done/?next=${encodeURIComponent(next)}`)
  }
  const setup = enrolled ? null : await beginEnrolment(payload, pending.user)
  const key = setup && 'secret' in setup ? setup : null
  const account = String(pending.user.email ?? '')
  return (
    <div className="crm-app c-denied c-mfa">
      <main className="c-content" id="crm-main">
          {/* BRAND-ADMIN-1: the same ICS logo as the admin login. */}
          <MfaLogo />
        <h1>{key ? 'Set up two-factor sign-in' : 'Two-factor sign-in'}</h1>
        {key ? (
          <>
            <p className="c-hint">
              Two-factor is required for everyone who signs in to the CRM and the admin. Setup takes about two minutes.
            </p>
            <EnrolFlow
              next={next}
              // Patch C: drawn on the server from the setup link (auth/mfa/qr.ts); no image request leaves the page.
              qrHtml={qrSvg(key.uri, 'QR code for the authenticator setup link', { moduleSize: 4 })}
              setupKey={key.secret}
              groupedKey={groupKey(key.secret)}
              uri={key.uri}
              account={account}
            />
          </>
        ) : (
          <>
            <p className="c-hint">
              Signing in as <strong>{account}</strong>. Enter the 6-digit code your authenticator app shows now. Lost your phone?
              Use one of your recovery codes, or ask an admin to reset your two-factor.
            </p>
            <VerifyForm next={next} canEmail={enrolled && emailCodeEligible(pending.user)} />
          </>
        )}
        <p className="c-mfa-noprint">
          <a href="/admin/logout/">Sign out</a>
        </p>
      </main>
    </div>
  )
}
