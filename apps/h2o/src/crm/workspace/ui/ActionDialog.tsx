'use client'

import { useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ActionState } from './actionState'
import { ActionForm } from './ActionForm'
import { OverflowContext } from './Overflow'

const noSubscribe = () => () => {}

/**
 * A button that opens a modal `<dialog>` containing an action form. Native `showModal()` gives focus
 * containment, Esc to close and a backdrop; focus returns to the opening button when the dialog closes.
 *
 * Wave 1 W1-8: the dialog is rendered into `document.body`, so a dialog opened from an overflow menu still shows
 * after the menu hides. When the opener is inside a closed menu, focus returns to that menu's toggle instead.
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
  ariaLabel,
}: {
  label: ReactNode
  title: string
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  hidden?: Record<string, string | null | undefined>
  submitLabel: string
  children?: ReactNode
  buttonClassName?: string
  submitClassName?: string
  shortcut?: string
  description?: string
  /** Accessible name when `label` is an icon or needs context (e.g. which task). */
  ariaLabel?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const menu = useContext(OverflowContext)
  // True only in the browser (the portal target exists there); false during server rendering and hydration.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false)
  const returnFocus = useCallback(() => {
    const o = opener.current
    if (o && o.offsetParent !== null) o.focus()
    else menu?.toggle.current?.focus()
  }, [menu])
  const close = useCallback(() => {
    dialog.current?.close()
    returnFocus()
  }, [returnFocus])
  const open = useCallback(() => {
    menu?.close()
    dialog.current?.showModal()
  }, [menu])
  const body = (
    <dialog ref={dialog} className="c-dialog crm-portal" aria-label={title} onClose={returnFocus}>
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
  )
  return (
    <>
      <button ref={opener} type="button" className={buttonClassName} data-shortcut={shortcut} onClick={open} aria-label={ariaLabel}>
        {label}
      </button>
      {mounted ? createPortal(<div className="crm-app crm-portal-host">{body}</div>, document.body) : null}
    </>
  )
}
