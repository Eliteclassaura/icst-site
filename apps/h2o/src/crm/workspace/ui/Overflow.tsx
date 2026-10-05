'use client'

import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'

/**
 * Wave 1 W1-8 overflow ("More") menu: one primary action stays visible and the rest live here.
 *
 * A disclosure button plus a panel of ordinary buttons (not an ARIA `menu`, whose arrow-key contract these mixed
 * items would not meet). Esc and a click outside close it and return focus to the toggle. Dialog items close it
 * themselves when they open (`ActionDialog` reads this context); inline one-click forms leave it open so their
 * result message stays visible.
 */
export const OverflowContext = createContext<{ close: () => void; toggle: RefObject<HTMLButtonElement | null> } | null>(null)

export function Overflow({
  label = 'More',
  ariaLabel,
  children,
  className = 'c-btn',
  align = 'end',
}: {
  label?: ReactNode
  ariaLabel?: string
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || toggle.current?.contains(t)) return
      // A click inside an open dialog (rendered elsewhere in the page) is not "outside" the menu's work.
      if ((t as Element).closest?.('dialog[open]')) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  const ctx = useMemo(() => ({ close, toggle }), [close])
  return (
    <OverflowContext.Provider value={ctx}>
      <span className="c-overflow">
        <button
          ref={toggle}
          type="button"
          className={className}
          aria-expanded={open}
          aria-controls={id}
          aria-label={ariaLabel}
          onClick={() => setOpen((v) => !v)}
        >
          {label}
        </button>
        <div ref={panel} id={id} className={`c-menu is-${align}`} hidden={!open}>
          {children}
        </div>
      </span>
    </OverflowContext.Provider>
  )
}
