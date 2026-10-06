'use client'
import { useActionState } from 'react'
import { confirmEnrolAction, verifyAction } from './actions'
import { INITIAL_MFA_STATE } from './state'

/** Patch L2: the code form (enrol or sign-in). After enrolment it shows the recovery codes once. */
export function MfaForm({ mode, next }: { mode: 'enrol' | 'verify'; next: string }) {
  const [state, action, pending] = useActionState(mode === 'enrol' ? confirmEnrolAction : verifyAction, INITIAL_MFA_STATE)
  if (state.ok && state.recoveryCodes) {
    return (
      <section aria-labelledby="mfa-codes">
        <h2 id="mfa-codes">Save your recovery codes</h2>
        <p className="c-hint">
          Each code works once, if you lose your phone. Store them in your password manager or print them. They are not shown
          again.
        </p>
        <ul className="c-mono">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p>
          <a className="c-btn is-primary" href={`/crm/mfa/done/?next=${encodeURIComponent(state.next ?? next)}`}>
            I saved them. Continue
          </a>
        </p>
      </section>
    )
  }
  return (
    <form action={action} className="c-form" aria-describedby="mfa-help">
      <input type="hidden" name="next" value={next} />
      <label className="c-field">
        <span className="c-label">{mode === 'enrol' ? 'Code from the app' : 'Code from your authenticator app, or a recovery code'}</span>
        <input
          className="c-input"
          name="code"
          required
          autoComplete="one-time-code"
          inputMode={mode === 'enrol' ? 'numeric' : 'text'}
          maxLength={mode === 'enrol' ? 6 : 11}
          pattern={mode === 'enrol' ? '\\d{6}' : undefined}
        />
      </label>
      {state.message && !state.ok ? (
        <p className="c-alert is-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <button className="c-btn is-primary" type="submit" disabled={pending}>
        {mode === 'enrol' ? 'Turn on two-factor' : 'Verify'}
      </button>
    </form>
  )
}
