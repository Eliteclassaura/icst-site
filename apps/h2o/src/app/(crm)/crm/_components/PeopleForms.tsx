'use client'

import { useRef } from 'react'
import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../settings/actions'

/**
 * MFA-ADMIN-1: the per-person actions. Each opens a confirm dialog that names the person and the action and asks for the
 * reason; the server repeats every check (admin, fresh code, reason, not yourself, never turn off for an admin).
 */
type Action = 'reset' | 'turn-off' | 'turn-on'
const COPY: Record<Action, { button: string; title: (n: string) => string; body: string; submit: string }> = {
  reset: {
    button: 'Reset two-step sign-in',
    title: (n) => `Reset two-step sign-in for ${n}?`,
    body: 'They are signed out everywhere and set up two-step sign-in again at their next sign-in. They get an email telling them.',
    submit: 'Reset two-step sign-in',
  },
  'turn-off': {
    button: 'Turn off',
    title: (n) => `Turn off two-step sign-in for ${n}?`,
    body: 'They are signed out everywhere and then sign in with their password alone. They get an email telling them. You can turn it back on at any time.',
    submit: 'Turn off two-step sign-in',
  },
  'turn-on': {
    button: 'Turn back on',
    title: (n) => `Turn two-step sign-in back on for ${n}?`,
    body: 'They are signed out everywhere and set up two-step sign-in at their next sign-in. They get an email telling them.',
    submit: 'Turn back on',
  },
}

function ActionButton({ id, name, action }: { id: string; name: string; action: Action }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const c = COPY[action]
  return (
    <>
      <button ref={opener} type="button" className={`c-btn is-small${action === 'turn-off' ? '' : ' is-ghost'}`} onClick={() => dialog.current?.showModal()} aria-label={`${c.button}: ${name}`}>
        {c.button}
      </button>
      <dialog ref={dialog} className="c-dialog" aria-label={c.title(name)} onClose={() => opener.current?.focus()}>
        <div className="c-dialog-head">
          <h2>{c.title(name)}</h2>
          <button type="button" className="c-btn is-ghost is-small" onClick={() => dialog.current?.close()} aria-label="Close dialog">
            Close
          </button>
        </div>
        <div className="c-dialog-body">
          <p>{c.body}</p>
          <ActionForm action={A.peopleMfaAction} hidden={{ userId: id, action }} submitLabel={c.submit} onSuccess={() => dialog.current?.close()} announce="">
            <Field name="reason" label="Why are you doing this?" hint="Kept with the record. Not shown to them." required>
              {(a) => <textarea className="c-input" {...a} rows={3} maxLength={300} />}
            </Field>
          </ActionForm>
          <button type="button" className="c-btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </dialog>
    </>
  )
}

export function PersonActions({ id, name, exempt, admin, isSelf }: { id: string; name: string; exempt: boolean; admin: boolean; isSelf: boolean }) {
  if (isSelf) return <span className="c-hint">This is you. Ask another admin.</span>
  return (
    <span className="c-actions">
      {exempt ? <ActionButton id={id} name={name} action="turn-on" /> : <ActionButton id={id} name={name} action="reset" />}
      {admin ? <span className="c-hint">Always on for admins</span> : exempt ? null : <ActionButton id={id} name={name} action="turn-off" />}
    </span>
  )
}
