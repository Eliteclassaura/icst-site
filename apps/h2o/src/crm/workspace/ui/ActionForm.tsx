'use client'

import { createContext, useActionState, useCallback, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { INITIAL_ACTION_STATE, type ActionState } from './actionState'
import { publishFeedback, setFlash } from './feedback'
import { clearDraft, draftable, readDraft, signOut, writeDraft, type Draft } from './draftStore'

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>
const FormState = createContext<{ state: ActionState; pending: boolean }>({ state: INITIAL_ACTION_STATE, pending: false })

const tabStorage = (): Storage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

type DraftField = HTMLInputElement | HTMLTextAreaElement
const draftFields = (form: HTMLFormElement): DraftField[] =>
  [...form.elements].filter((e): e is DraftField => (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) && draftable(e.name, e.type))

/**
 * Gate B item 3: keep what someone has typed until it is saved. The draft lives in this tab's `sessionStorage`
 * (never `localStorage`, never the server), holds only fields changed from their starting value, comes back when the
 * form is shown again, and is removed when the action succeeds, on "Discard draft", or at sign-out.
 */
function useFormDraft(scope: string | undefined, form: React.RefObject<HTMLFormElement | null>, showNote: (shown: boolean) => void, saved: boolean) {
  useEffect(() => {
    const f = form.current
    if (!scope || !f) return
    const store = tabStorage()
    const draft = readDraft(store, scope)
    let n = 0
    for (const el of draftFields(f)) {
      const v = draft[el.name]
      if (v !== undefined && el.value === el.defaultValue && v !== el.defaultValue) {
        el.value = v
        n++
      }
    }
    if (n) showNote(true)
    const save = () => {
      if (signOut.started) return
      const fields: Draft = {}
      for (const el of draftFields(f)) if (el.value !== el.defaultValue) fields[el.name] = el.value
      writeDraft(store, scope, fields)
    }
    f.addEventListener('input', save)
    return () => f.removeEventListener('input', save)
  }, [scope, form, showNote])
  useEffect(() => {
    if (saved && scope) {
      clearDraft(tabStorage(), scope)
      showNote(false)
    }
  }, [saved, scope, showNote])
}

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
  submitAriaLabel,
  submitIcon,
  draft,
  announce,
}: {
  action: Action
  hidden?: Record<string, string | null | undefined>
  children?: ReactNode
  submitLabel: string
  submitClassName?: string
  onSuccess?: () => void
  inline?: boolean
  shortcut?: string
  /** Accessible name when the visible label needs context, e.g. which task "Done" completes. */
  submitAriaLabel?: string
  submitIcon?: ReactNode
  /** A scope name (ids and fixed words only) that turns on unsent-draft keeping for this form's text fields. */
  draft?: string
  /** Keep this form's outcome on screen after the form or its dialog closes. The text says what it was about. */
  announce?: string
}) {
  // The outcome is published when the action's answer arrives, not from an effect: a successful task action
  // refreshes the page and can remove its own row (cancel, done), which unmounts this form before an effect runs.
  const [state, formAction, pending] = useActionState(
    announce === undefined
      ? action
      : async (prev: ActionState, fd: FormData) => {
          const out = await action(prev, fd)
          // A stale-write conflict is shown once, in its own panel; the page banner would repeat it.
          if (out.message && out.code !== 'STALE') publishFeedback(Boolean(out.ok), out.message, announce || undefined, Boolean(out.ok && out.warn))
          return out
        },
    INITIAL_ACTION_STATE,
  )
  const done = useRef<number | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const noteRef = useRef<HTMLParagraphElement>(null)
  const showNote = useCallback((shown: boolean) => {
    if (noteRef.current) noteRef.current.hidden = !shown
  }, [])
  useFormDraft(draft, formRef, showNote, Boolean(state.ok && state.nonce))
  const discard = () => {
    const f = formRef.current
    if (!draft || !f) return
    clearDraft(tabStorage(), draft)
    for (const el of draftFields(f)) el.value = el.defaultValue
    showNote(false)
  }
  useEffect(() => {
    if (state.ok && state.nonce && done.current !== state.nonce) {
      done.current = state.nonce
      onSuccess?.()
    }
  }, [state, onSuccess])
  const hasFieldErrors = Boolean(state.fields && Object.keys(state.fields).length)
  return (
    <FormState.Provider value={{ state, pending }}>
      <form ref={formRef} action={formAction} className={inline ? 'c-actions' : 'c-dialog-body'} noValidate>
        {Object.entries(hidden).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />))}
        {state.code === 'STALE' ? <StaleConflict state={state} /> : null}
        {!state.ok && state.message && state.code !== 'STALE' ? (
          <p className="c-result is-error" role="alert">
            {state.message}
            {hasFieldErrors ? ' Check the highlighted fields.' : ''}
          </p>
        ) : null}
        {draft ? (
          <p ref={noteRef} className="c-hint c-draft-note" role="status" hidden>
            Your unsent draft is back. It is kept in this browser tab only.{' '}
            <button type="button" className="c-btn is-ghost is-small" onClick={discard}>
              Discard draft
            </button>
          </p>
        ) : null}
        {children}
        <div className="c-actions">
          <button
            className={submitClassName}
            type="submit"
            aria-disabled={pending || undefined}
            disabled={pending}
            data-shortcut={shortcut}
            aria-label={submitAriaLabel}
          >
            {submitIcon}
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
        <a className="c-btn is-small" href={typeof window === 'undefined' ? '#' : window.location.href} onClick={() => setFlash('Updated to the latest version.')}>
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

/** The current form outcome, for a child that renders something specific to it (e.g. a link to an existing record). */
export function useFormOutcome(): ActionState {
  return useContext(FormState).state
}
