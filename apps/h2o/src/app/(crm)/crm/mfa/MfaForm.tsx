'use client'
import { useActionState, useEffect, useId, useState } from 'react'
import { recoveryCodesFilename, recoveryCodesText, recoveryLowWarning } from '../../../../auth/mfa/ux'
import { IconCopy, IconDownload, IconPrint } from '../../../../crm/workspace/ui/Icons'
import { confirmEnrolAction, requestCodeAction, verifyAction, verifyEmailAction } from './actions'
import { INITIAL_MFA_STATE } from './state'

/**
 * Patch L2 / MFA-UX-1: the two-factor forms. Enrolment is four numbered steps on one page (get an app → add the
 * account by QR or setup key → confirm a code → save the recovery codes); sign-in takes an app code, or a recovery
 * code behind a switch. MFA-2: users who are not admins can also ask for a code by email and tick "Remember this
 * device for 30 days"; admins see neither (the server refuses them anyway).
 *
 * The recovery codes are shown once. Download and print happen in the browser (a local text file, the print dialog);
 * the codes are never sent anywhere.
 */

const doneHref = (next: string) => `/crm/mfa/done/?next=${encodeURIComponent(next)}`

/** Copy a value; the result is announced politely. Falls back to a hint if the clipboard is not available. */
function CopyButton({ value, label, small = false }: { value: string; label: string; small?: boolean }) {
  const [said, setSaid] = useState('')
  return (
    <>
      <button
        type="button"
        className={small ? 'c-btn is-small' : 'c-btn'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setSaid('Copied.')
          } catch {
            setSaid('Copy is not available here. Select the text and copy it.')
          }
        }}
      >
        <IconCopy />
        <span>{label}</span>
      </button>
      <span className="c-mfa-said" role="status">
        {said}
      </span>
    </>
  )
}

function RecoveryCodes({ codes, account, next }: { codes: string[]; account: string; next: string }) {
  const download = () => {
    const at = new Date()
    const url = URL.createObjectURL(new Blob([recoveryCodesText(codes, account, at)], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = recoveryCodesFilename(at)
    document.body.append(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  return (
    <section aria-labelledby="mfa-codes" className="c-mfa-recovery">
      <p className="c-mfa-eyebrow">Step 4 of 4</p>
      <h2 id="mfa-codes">Save your recovery codes</h2>
      <p className="c-banner c-mfa-banner" role="status">
        Two-factor is on for {account}.
      </p>
      <p className="c-hint">
        If you lose your phone, each code signs you in once. Keep them in your password manager, or print them and store the
        page safely. If you download them, store them in a password manager and delete the downloaded file afterwards. They
        are not shown again.
      </p>
      <ol className="c-mono c-mfa-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="c-mfa-actions c-mfa-noprint">
        <button type="button" className="c-btn" onClick={download}>
          <IconDownload />
          <span>Download (.txt)</span>
        </button>
        <button type="button" className="c-btn" onClick={() => window.print()}>
          <IconPrint />
          <span>Print</span>
        </button>
        <CopyButton value={codes.join('\n')} label="Copy all" />
      </div>
      <p className="c-mfa-noprint">
        <a className="c-btn is-primary" href={doneHref(next)}>
          I saved them. Continue
        </a>
      </p>
    </section>
  )
}

/** First sign-in: the setup steps, then the recovery codes. The QR markup is drawn on the server (auth/mfa/qr.ts). */
export function EnrolFlow({
  next,
  qrHtml,
  setupKey,
  groupedKey,
  uri,
  account,
}: {
  next: string
  qrHtml: string
  setupKey: string
  groupedKey: string
  uri: string
  account: string
}) {
  const [state, action, pending] = useActionState(confirmEnrolAction, INITIAL_MFA_STATE)
  const errorId = useId()
  if (state.ok && state.recoveryCodes) return <RecoveryCodes codes={state.recoveryCodes} account={account} next={state.next ?? next} />
  const error = state.message && !state.ok ? state.message : null
  return (
    <ol className="c-mfa-steps">
      <li>
        <p className="c-mfa-eyebrow">Step 1 of 4</p>
        <h2>Get an authenticator app</h2>
        <p className="c-hint">
          Any app that shows 6-digit codes works: Google Authenticator, Microsoft Authenticator, 1Password or Authy. If you
          already have one, go to step 2.
        </p>
      </li>
      <li>
        <p className="c-mfa-eyebrow">Step 2 of 4</p>
        <h2>Add your account to the app</h2>
        <div className="c-mfa-add">
          {/* Security (MFA-UX-1 audit note): `qrHtml` is only ever the output of src/auth/mfa/qr.ts `qrSvg` (page.tsx),
              which emits fixed SVG markup from the otpauth URI's QR modules and an escaped label. Never pass request data,
              user-entered text or any other HTML here. */}
          <div className="c-qr" dangerouslySetInnerHTML={{ __html: qrHtml }} />
          <div className="c-mfa-manual">
            <p className="c-hint">In the app, scan this code. Can’t scan it? Enter this setup key instead:</p>
            <p className="c-mono c-mfa-key" aria-label="Setup key">
              {groupedKey}
            </p>
            <p className="c-mfa-copy">
              <CopyButton value={setupKey} label="Copy key" small />
            </p>
            <dl className="c-mfa-facts">
              <dt>Account</dt>
              <dd>{account}</dd>
              <dt>Type</dt>
              <dd>Time-based</dd>
              <dt>Code</dt>
              <dd>6 digits, new every 30 seconds</dd>
            </dl>
            <p className="c-hint">
              On this phone? <a href={uri}>Open it in your authenticator app</a>.
            </p>
          </div>
        </div>
      </li>
      <li>
        <p className="c-mfa-eyebrow">Step 3 of 4</p>
        <h2>Enter the code from the app</h2>
        <form action={action} className="c-form">
          <input type="hidden" name="next" value={next} />
          <label className="c-field">
            <span className="c-label">6-digit code</span>
            <input
              className="c-input c-mfa-code"
              name="code"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              pattern="\d{6}"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          {error ? (
            <p className="c-alert is-error" role="alert" id={errorId}>
              {error}
            </p>
          ) : null}
          <button className="c-btn is-primary" type="submit" disabled={pending}>
            {pending ? 'Checking…' : 'Turn on two-factor'}
          </button>
          <p className="c-hint">You’ll enter a fresh code every time you sign in. This device is not remembered.</p>
        </form>
      </li>
    </ol>
  )
}

/** MFA-2: the way to the remembered-devices page, shown to users who may remember devices. */
export function DevicesLink() {
  return (
    <p className="c-mfa-noprint">
      <a href="/crm/mfa/devices/">Remembered devices</a>
    </p>
  )
}

/** Seconds left until `until` (ms since epoch), counted down once a second; 0 when there is no wait. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const first = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}

/** Later sign-ins: an app code, a code by email (non-admins), or (behind a switch) a recovery code. */
export function VerifyForm({ next, canEmail = false }: { next: string; canEmail?: boolean }) {
  const [state, action, pending] = useActionState(verifyAction, INITIAL_MFA_STATE)
  const [emailState, emailAction, emailPending] = useActionState(verifyEmailAction, INITIAL_MFA_STATE)
  const [sendState, sendAction, sending] = useActionState(requestCodeAction, INITIAL_MFA_STATE)
  const [recovery, setRecovery] = useState(false)
  const errorId = useId()
  const byEmail = canEmail && sendState.emailSent === true
  const coolUntil = typeof sendState.cooldownSeconds === 'number' && sendState.nonce ? sendState.nonce + sendState.cooldownSeconds * 1000 : null
  const cool = useCountdown(coolUntil)
  const expires = sendState.expiresAt ? new Date(sendState.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  if (state.ok && typeof state.recoveryRemaining === 'number') {
    const warn = recoveryLowWarning(state.recoveryRemaining)
    return (
      <section aria-labelledby="mfa-recovered" className="c-mfa-recovery">
        <h2 id="mfa-recovered">Signed in with a recovery code</h2>
        <p className={warn ? 'c-banner is-warning c-mfa-banner' : 'c-hint'} role="status">
          {state.recoveryRemaining} recovery {state.recoveryRemaining === 1 ? 'code' : 'codes'} left. {warn ?? ''}
        </p>
        <p>
          <a className="c-btn is-primary" href={doneHref(state.next ?? next)}>
            Continue
          </a>
        </p>
      </section>
    )
  }
  const active = byEmail ? emailState : state
  const error = active.message && !active.ok ? active.message : sendState.message && !sendState.ok ? sendState.message : null
  return (
    <>
      <form action={byEmail ? emailAction : action} className="c-form">
        <input type="hidden" name="next" value={next} />
        <label className="c-field">
          <span className="c-label">{byEmail ? '6-digit code from your email' : recovery ? 'Recovery code' : '6-digit code from your authenticator app'}</span>
          <input
            key={byEmail ? 'email' : recovery ? 'recovery' : 'app'}
            className="c-input c-mfa-code"
            name="code"
            required
            autoComplete={recovery && !byEmail ? 'off' : 'one-time-code'}
            inputMode={recovery && !byEmail ? 'text' : 'numeric'}
            maxLength={recovery && !byEmail ? 11 : byEmail ? 12 : 6}
            pattern={recovery && !byEmail ? undefined : byEmail ? '\\s*\\d{3}\\s*\\d{3}\\s*' : '\\d{6}'}
            placeholder={recovery && !byEmail ? 'xxxxx-xxxxx' : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        {byEmail ? (
          <p className="c-hint" role="status">
            We sent a 6-digit code to <strong>{sendState.maskedEmail}</strong>.{expires ? ` It works once and expires at ${expires} (10 minutes).` : ''} You can paste it, with or without a space.
          </p>
        ) : null}
        {error ? (
          <p className="c-alert is-error" role="alert" id={errorId}>
            {error}
          </p>
        ) : null}
        {canEmail ? (
          <label className="c-check">
            <input type="checkbox" name="remember" />
            <span>Remember this device for 30 days</span>
          </label>
        ) : null}
        <button className="c-btn is-primary" type="submit" disabled={pending || emailPending}>
          {pending || emailPending ? 'Checking…' : 'Verify'}
        </button>
        <p>
          <button type="button" className="c-btn is-ghost is-small" onClick={() => setRecovery((r) => !r)}>
            {recovery ? 'Use a code from the app instead' : 'Lost your phone? Use a recovery code'}
          </button>
        </p>
      </form>
      {canEmail ? (
        <form action={sendAction} className="c-mfa-noprint">
          <button type="submit" className="c-btn is-ghost is-small" disabled={sending || cool > 0} aria-disabled={sending || cool > 0 || undefined}>
            {sending ? 'Sending…' : cool > 0 ? `Send a new code in ${cool}s` : byEmail ? 'Send a new code by email' : 'Send me a code by email'}
          </button>
        </form>
      ) : null}
    </>
  )
}
