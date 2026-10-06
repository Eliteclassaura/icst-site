import config from '@payload-config'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { pendingSession } from '../../../../auth/mfa/guard'
import { safeNext } from '../../../../auth/mfa/next'
import { qrSvg } from '../../../../auth/mfa/qr'
import { beginEnrolment } from '../../../../auth/mfa/service'
import { MfaForm } from './MfaForm'

export const metadata: Metadata = { title: 'Two-factor sign-in' }

type SP = Record<string, string | string[] | undefined>

/**
 * Patch L2: the second sign-in step, for everyone (CRM and admin). It serves a password-only session: first time,
 * enrolment (setup key + first code + recovery codes); afterwards, a code from the app or a recovery code.
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
          <h1>Two-factor sign-in is complete</h1>
          <p>
            <a className="c-btn is-primary" href={`/crm/mfa/done/?next=${encodeURIComponent(next)}`}>
              Continue
            </a>
          </p>
        </main>
      </div>
    )
  const enrolled = pending.user.mfa_enabled === true
  const setup = enrolled ? null : await beginEnrolment(payload, pending.user)
  const key = setup && 'secret' in setup ? setup : null
  return (
    <div className="crm-app c-denied">
      <main className="c-content" id="crm-main">
        <h1>{key ? 'Set up two-factor sign-in' : 'Two-factor sign-in'}</h1>
        {key ? (
          <>
            <p className="c-hint" id="mfa-help">
              Two-factor is required for everyone who signs in. Use an authenticator app (Google Authenticator, Microsoft
              Authenticator, 1Password, Authy).
            </p>
            <ol>
              <li>
                In the app, scan this code:
                <div
                  className="c-qr"
                  // Patch C: drawn on the server from the setup link (auth/mfa/qr.ts); no image request leaves the page.
                  dangerouslySetInnerHTML={{ __html: qrSvg(key.uri, 'QR code for the authenticator setup link', { moduleSize: 4 }) }}
                />
                Or add an account with this setup key (time-based):
                <p className="c-mono" aria-label="Setup key">
                  {key.secret.match(/.{1,4}/g)?.join(' ')}
                </p>
                <p>
                  On this phone? <a href={key.uri}>Open it in your authenticator app</a>.
                </p>
              </li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <MfaForm mode="enrol" next={next} />
          </>
        ) : (
          <>
            <p className="c-hint" id="mfa-help">
              Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your recovery codes, or ask an
              admin to reset your two-factor.
            </p>
            <MfaForm mode="verify" next={next} />
          </>
        )}
        <p>
          <a href="/admin/logout/">Sign out</a>
        </p>
      </main>
    </div>
  )
}
