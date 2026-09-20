/**
 * H2O Phase 2C-min — dialog state, as a pure machine.
 *
 * R1 had this module focus elements itself, through an injected host, and the component called it
 * from inside a React state updater. Two things were wrong with that:
 *
 *   - a state updater must be pure. React may call it more than once for a single update, so a
 *     focus call or an analytics call inside one can happen twice or not at all;
 *   - on the **first** open the dialog node does not exist yet, so the ref passed in was `null` and
 *     initial focus silently did nothing. Focus belongs to the mounted dialog's lifecycle, not to
 *     the state transition that requests it.
 *
 * So this module now computes state and nothing else: no host, no focus, no side effect of any
 * kind. It reports which element focus should return to; the component performs the move in an
 * effect, once the DOM exists.
 */

/** Anything focusable. A DOM element satisfies it; so does a test double. */
export type FocusTarget = { focus: () => void }

export type DialogState = {
  /** False when the visitor prefers reduced motion; the caller skips its transition. */
  animate: boolean
  open: boolean
  /** The element focus returns to on close — captured at open, never guessed at close. */
  returnFocusTo: FocusTarget | null
}

export const initialDialogState = (): DialogState => ({
  animate: true,
  open: false,
  returnFocusTo: null,
})

export type OpenOptions = {
  /** The visitor's reduced-motion preference, read by the caller before the transition. */
  prefersReducedMotion: boolean
  /** The exact control that opened the dialog. */
  returnFocusTo: FocusTarget | null
}

/** Open. Pure: safe to call from a React state updater. */
export const openDialog = (state: DialogState, options: OpenOptions): DialogState => {
  if (state.open) return state
  return {
    animate: !options.prefersReducedMotion,
    open: true,
    returnFocusTo: options.returnFocusTo ?? state.returnFocusTo,
  }
}

/**
 * Close. Pure, and it hands back the element focus should return to rather than focusing it, so the
 * caller can restore focus after React has removed the dialog — before that, the browser would move
 * focus to the body as the focused node disappears and undo the restore.
 */
export const closeDialog = (state: DialogState): { restoreFocusTo: FocusTarget | null; state: DialogState } => {
  if (!state.open) return { restoreFocusTo: null, state }
  return {
    restoreFocusTo: state.returnFocusTo,
    state: { animate: state.animate, open: false, returnFocusTo: null },
  }
}

export type KeyEvent = { key: string; shiftKey?: boolean }

export type KeyOutcome = 'CLOSE' | 'FOCUS_FIRST' | 'FOCUS_LAST' | 'IGNORE'

/**
 * Decide what a key press means while the dialog is open.
 *
 * Tab wrapping is reported rather than performed so the caller can decide whether the event needs
 * preventing — a focus trap that always swallows Tab is as broken as one that never does.
 */
export const handleKey = (
  state: DialogState,
  event: KeyEvent,
  position: 'first' | 'last' | 'middle',
): KeyOutcome => {
  if (!state.open) return 'IGNORE'
  if (event.key === 'Escape') return 'CLOSE'
  if (event.key !== 'Tab') return 'IGNORE'
  if (event.shiftKey === true && position === 'first') return 'FOCUS_LAST'
  if (event.shiftKey !== true && position === 'last') return 'FOCUS_FIRST'
  return 'IGNORE'
}
