'use client'

import { PALETTE_OPEN_EVENT } from '../keyboard'
import { IconSearch } from './Icons'

/** The top-bar trigger for the ⌘K palette (mounted by the CRM layout). It looks like a search box; it is a button. */
export function PaletteTrigger() {
  return (
    <button
      type="button"
      className="c-palette-trigger"
      onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
      aria-keyshortcuts="Meta+K Control+K"
    >
      <IconSearch />
      <span className="c-trunc">Search inquiries, accounts, contacts…</span>
      <kbd>⌘K</kbd>
    </button>
  )
}
