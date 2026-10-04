'use client'

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { INITIAL_ACTION_STATE, type ActionState } from './actionState'

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>
const FormState = createContext<{ state: ActionState; pending: boolean }>({ state: INITIAL_ACTION_STATE, pending: false })

/**
 * A form bound to a Sales Workspace server action. Shows the server's outcome: a polite status line on
 * success (no Undo in UI-1), an alert with field errors on failure, and the stale-write conflict with its
 * single action "Reload latest" (no overwrite, no "save anyway").
 */
export function ActionForm({
  action,
  hidden = {},
  children,
  submitLabel,
  submitClassName = 'c-btn is-primary',
  onSuccess,
  inline = false,
  shortcut,
}: {
  action: Action
  hidden?: Record<string, string | null | undefined>
  children?: ReactNode
  submitLabel: string
  submitClassName?: string
  onSuccess?: () => void
  inline?: boolean
  shortcut?: string
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE)
  const done = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (state.ok && state.nonce && done.current !== state.nonce) {
      done.current = state.nonce
      onSuccess?.()
    }
  }, [state, onSuccess])
  const hasFieldErrors = Boolean(state.fields && Object.keys(state.fields).length)
  return (
    <FormState.Provider value={{ state, pending }}>
      <form action={formAction} className={inline ? 'c-actions' : 'c-dialog-body'} noValidate>
        {Object.entries(hidden).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />))}
        {state.code === 'STALE' ? <StaleConflict state={state} /> : null}
        {!state.ok && state.message && state.code !== 'STALE' ? (
          <p className="c-result is-error" role="alert">
            {state.message}
            {hasFieldErrors ? ' Check the highlighted fields.' : ''}
          </p>
        ) : null}
        {children}
        <div className="c-actions">
          <button className={submitClassName} type="submit" aria-disabled={pending || undefined} disabled={pending} data-shortcut={shortcut}>
            {pending ? 'Saving…' : submitLabel}
          </button>
          {state.ok && state.message ? (
            <span role="status" className="c-muted">
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </FormState.Provider>
  )
}

function StaleConflict({ state }: { state: ActionState }) {
  const when = state.conflict?.at ? new Date(state.conflict.at) : null
  return (
    <div className="c-conflict" role="alert">
      <strong>{state.message}</strong>
      {state.conflict?.byName || state.conflict?.what ? (
        <span>
          {state.conflict.byName ?? 'Someone'} changed it{when && !Number.isNaN(when.getTime()) ? ` at ${when.toLocaleString()}` : ''}
          {state.conflict.what ? `: ${state.conflict.what}` : '.'}
        </span>
      ) : null}
      <span>Your change was not saved.</span>
      <span>
        {/* A full navigation re-reads the record from the server. */}
        <a className="c-btn is-small" href={typeof window === 'undefined' ? '#' : window.location.href}>
          Reload latest
        </a>
      </span>
    </div>
  )
}

/** A labelled field that reflects the server's field error (aria-invalid + aria-describedby). */
export function Field({
  name,
  label,
  hint,
  children,
  wide,
  required,
}: {
  name: string
  label: string
  hint?: string
  children: (a11y: {
    id: string
    name: string
    'aria-invalid'?: true
    'aria-describedby'?: string
    'aria-required'?: true
  }) => ReactNode
  wide?: boolean
  /** Shown as the word "Required" after the label (never colour alone) and announced via aria-required. */
  required?: boolean
}) {
  const { state } = useContext(FormState)
  const id = useId()
  const error = state.fields?.[name]
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined
  return (
    <label className={`c-field${wide ? ' is-wide' : ''}`} htmlFor={id}>
      <span>
        {label}
        {required ? <span className="c-req"> · Required</span> : null}
      </span>
      {children({
        id,
        name,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required ? true : undefined,
      })}
      {hint ? (
        <span id={`${id}-hint`} className="c-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-err`} className="c-error-text">
          {error}
        </span>
      ) : null}
    </label>
  )
}
