'use client'

import { useCallback, useRef, type ReactNode } from 'react'
import type { ActionState } from './actionState'
import { ActionForm } from './ActionForm'

/**
 * A button that opens a modal `<dialog>` containing an action form. Native `showModal()` gives focus
 * containment, Esc to close and a backdrop; focus returns to the opening button when the dialog closes.
 */
export function ActionDialog({
  label,
  title,
  action,
  hidden,
  submitLabel,
  children,
  buttonClassName = 'c-btn',
  submitClassName,
  shortcut,
  description,
}: {
  label: string
  title: string
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  hidden?: Record<string, string | null | undefined>
  submitLabel: string
  children?: ReactNode
  buttonClassName?: string
  submitClassName?: string
  shortcut?: string
  description?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    dialog.current?.close()
    opener.current?.focus()
  }, [])
  return (
    <>
      <button ref={opener} type="button" className={buttonClassName} data-shortcut={shortcut} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className="c-dialog" aria-label={title} onClose={() => opener.current?.focus()}>
        <div className="c-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="c-btn is-ghost is-small" onClick={close} aria-label="Close dialog">
            Close
          </button>
        </div>
        {description ? <p className="c-hint c-dialog-note">{description}</p> : null}
        <ActionForm action={action} hidden={hidden} submitLabel={submitLabel} submitClassName={submitClassName} onSuccess={close}>
          {children}
        </ActionForm>
      </dialog>
    </>
  )
}
