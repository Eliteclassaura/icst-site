'use client'

import { useEffect, useRef } from 'react'
import { IconClose } from './Icons'

/** The phone breakpoint used by crm.css (bottom bar, card rows, bottom sheets). */
export const PHONE_QUERY = '(max-width: 767px)'

/**
 * Polish R1 (CT brief must-have 3): on a phone, tapping an inquiry opens the full RFQ page instead of the split
 * pane. Progressive: the row link's own href (the pane) still works without JavaScript, and the pane hides the
 * list on a phone (crm.css), so nothing ever stacks.
 */
export function PhoneRecordLinks({ scopeId }: { scopeId: string }) {
  useEffect(() => {
    const scope = document.getElementById(scopeId)
    if (!scope) return
    const mq = window.matchMedia(PHONE_QUERY)
    const onClick = (e: MouseEvent) => {
      if (!mq.matches || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-full-href]')
      const full = a?.dataset.fullHref
      if (!a || !full || !full.startsWith('/crm/rfqs/')) return
      e.preventDefault()
      window.location.assign(full)
    }
    scope.addEventListener('click', onClick)
    return () => scope.removeEventListener('click', onClick)
  }, [scopeId])
  return null
}

/**
 * Polish R1: the filter popover is a bottom sheet on a phone. This adds the sheet's Close button and closes it on
 * Escape or a tap on the backdrop, returning focus to the Filters button. Without JavaScript the Filters button
 * itself toggles the sheet.
 */
export function SheetClose({ label = 'Close filters' }: { label?: string }) {
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const details = btn.current?.closest('details')
    if (!details) return
    const close = () => {
      details.open = false
      details.querySelector<HTMLElement>('summary')?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && details.open) {
        e.preventDefault()
        close()
      }
    }
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.classList.contains('c-sheet-backdrop')) close()
    }
    details.addEventListener('keydown', onKey)
    details.addEventListener('click', onClick)
    const button = btn.current
    button?.addEventListener('click', close)
    return () => {
      details.removeEventListener('keydown', onKey)
      details.removeEventListener('click', onClick)
      button?.removeEventListener('click', close)
    }
  }, [])
  return (
    <button ref={btn} type="button" className="c-btn is-ghost c-icon-btn c-sheet-close" aria-label={label}>
      <IconClose />
    </button>
  )
}
