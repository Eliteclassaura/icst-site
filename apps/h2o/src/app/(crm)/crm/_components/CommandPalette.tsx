'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isPaletteShortcut, PALETTE_OPEN_EVENT } from '../../../../crm/workspace/keyboard'
import { SearchPanel } from './SearchPanel'

/**
 * Wave 1 W1-2 ⌘K palette, mounted once by the Shell. Opens from ⌘K / Ctrl-K anywhere except inside a text field
 * (Control Tower amendment C), or from the top-bar trigger. A native modal `<dialog>` gives focus containment and
 * Esc; focus returns to whatever had it before.
 */
export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null)
  const before = useRef<Element | null>(null)
  const [open, setOpen] = useState(false)
  const show = useCallback(() => {
    if (dialog.current?.open) return
    before.current = document.activeElement
    setOpen(true)
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e as never)) return
      e.preventDefault()
      show()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener(PALETTE_OPEN_EVENT, show)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(PALETTE_OPEN_EVENT, show)
    }
  }, [show])
  const close = () => dialog.current?.close()
  return (
    <dialog
      ref={dialog}
      className="c-dialog c-palette-dialog"
      aria-label="Search and go to"
      onClose={() => {
        setOpen(false)
        if (before.current instanceof HTMLElement) before.current.focus()
      }}
    >
      {open ? <SearchPanel mode="palette" onNavigate={close} /> : null}
      <p className="c-hint c-palette-keys" aria-hidden="true">
        ↑↓ to move · Enter to open · Esc to close
      </p>
    </dialog>
  )
}
