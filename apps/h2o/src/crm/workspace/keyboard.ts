/**
 * Focus-scoped keyboard shortcuts (Control Tower UI-1 amendment C).
 *
 * A shortcut must NEVER fire while the user is typing: not in an input, textarea, select, search field,
 * contenteditable editor, or any element that presents itself as a text-entry control. It also never fires
 * while an IME composition is in progress or when a modifier (other than Shift) is held, so browser and OS
 * shortcuts keep working, and it only fires when focus is inside the region that owns the shortcut.
 */

export type ShortcutTarget = {
  tagName?: string
  isContentEditable?: boolean
  type?: string
  getAttribute?: (name: string) => string | null
  closest?: (selector: string) => unknown
}

export type ShortcutEvent = {
  key: string
  target: ShortcutTarget | null
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  repeat?: boolean
}

/** Input types that do not accept typed text; everything else counts as text entry. */
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'image', 'file', 'range', 'color'])
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton'])

/** True when the event target is a place where a key press is text, not a command. */
export function isTextEntryTarget(target: ShortcutTarget | null): boolean {
  if (!target) return false
  const tag = (target.tagName ?? '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has(String(target.type ?? 'text').toLowerCase())
  if (target.isContentEditable) return true
  const role = target.getAttribute?.('role')
  if (role && TEXT_ROLES.has(role)) return true
  // Inside an editor or a dialog's form field wrapper.
  if (target.closest?.('[contenteditable=""],[contenteditable="true"],[role="textbox"],[data-crm-text-entry]'))
    return true
  return false
}

/**
 * Decide whether a keydown is a workspace shortcut. `scope` is the region element that owns the shortcuts
 * (e.g. the RFQ list); when given, focus must be inside it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shouldHandleShortcut(e: ShortcutEvent, scope?: { contains: (n: any) => boolean } | null): boolean {
  if (e.defaultPrevented || e.isComposing) return false
  if (e.altKey || e.ctrlKey || e.metaKey) return false
  if (!e.key || e.key.length !== 1) return false
  if (isTextEntryTarget(e.target)) return false
  if (scope && !scope.contains(e.target)) return false
  return true
}

/** Window event that opens the ⌘K palette (fired by the top-bar trigger). */
export const PALETTE_OPEN_EVENT = 'crm:palette'

/**
 * Wave 1 W1-2: is this keydown the palette shortcut? ⌘K or Ctrl-K, with no Alt/Shift, not during IME composition,
 * and never inside a text-entry control (the same rule as every other workspace shortcut).
 */
export function isPaletteShortcut(e: Omit<ShortcutEvent, 'repeat'> & { shiftKey?: boolean }): boolean {
  if (e.isComposing || e.altKey || e.shiftKey) return false
  if (!(e.metaKey || e.ctrlKey)) return false
  if ((e.key ?? '').toLowerCase() !== 'k') return false
  return !isTextEntryTarget(e.target)
}

/** The UI-1 shortcut map (single keys), plus ⌘K for the palette. */
export const SHORTCUTS: Record<string, string> = {
  j: 'Next row',
  k: 'Previous row',
  a: 'Assign to me',
  r: 'Start review',
  n: 'Add note',
  t: 'New follow-up',
  '/': 'Search',
  '⌘K': 'Search and go to (palette)',
}
