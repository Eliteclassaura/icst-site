/**
 * Gate B item 4: an outcome that stays visible. A dialog closes itself when its action succeeds and an overflow
 * menu hides its forms, so a message shown inside either would vanish. Task actions publish their outcome here and
 * the host in the page shell keeps it on screen until it is dismissed or replaced by the next one. Errors stay in
 * their form as well.
 */
export type Feedback = { id: number; ok: boolean; message: string; subject?: string; /** a success with something a person must do (shown as a warning, announced assertively) */ warn?: boolean }

let current: Feedback | null = null
let seq = 0
const listeners = new Set<() => void>()

export const subscribeFeedback = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const feedbackSnapshot = (): Feedback | null => current
export const noFeedback = (): Feedback | null => null

function set(next: Feedback | null) {
  current = next
  for (const fn of listeners) fn()
}

export function publishFeedback(ok: boolean, message: string, subject?: string, warn?: boolean): void {
  const text = message.trim()
  if (!text) return
  set({ id: ++seq, ok, message: text.slice(0, 300), subject: subject?.slice(0, 120), ...(warn ? { warn: true } : {}) })
}

export const dismissFeedback = (): void => set(null)

/**
 * A message that has to survive a full page load (after "Reload latest"). It is kept in this tab's sessionStorage
 * under the `crm.` prefix (so sign-out and a change of person wipe it) and shown once by the host, then removed.
 */
export const FLASH_KEY = 'crm.flash'

export function setFlash(message: string): void {
  try {
    window.sessionStorage.setItem(FLASH_KEY, message.slice(0, 200))
  } catch {
    /* storage blocked: the page still reloads, only the notice is lost */
  }
}

export function takeFlash(): string | null {
  try {
    const m = window.sessionStorage.getItem(FLASH_KEY)
    if (m) window.sessionStorage.removeItem(FLASH_KEY)
    return m
  } catch {
    return null
  }
}
