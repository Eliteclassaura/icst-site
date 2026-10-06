'use client'

import { useEffect } from 'react'
import { shouldHandleShortcut } from '../keyboard'

/**
 * Focus-scoped shortcuts (Control Tower amendment C). The listener is attached to one region element, so
 * a key press only counts while focus is inside that region, and `shouldHandleShortcut` refuses every
 * text-entry target (inputs, textareas, selects, search, contenteditable, textbox/combobox roles) and any
 * modified key. Actions are performed by clicking the visible control that carries `data-shortcut`, so a
 * shortcut can never do something the user could not do — and never something the server would not allow.
 */
export function Shortcuts({ scopeId }: { scopeId: string }) {
  useEffect(() => {
    const scope = document.getElementById(scopeId)
    if (!scope) return
    const rows = () => [...scope.querySelectorAll<HTMLElement>('[data-row-link]')]
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleShortcut(e as never, scope)) return
      const list = rows()
      const at = list.findIndex((el) => el === document.activeElement)
      const click = (name: string) => {
        const el = scope.querySelector<HTMLElement>(`[data-shortcut="${name}"]`)
        if (!el) return false
        el.click()
        return true
      }
      let handled = false
      switch (e.key) {
        case 'j':
          if (list.length) {
            list[Math.min(list.length - 1, at + 1)]?.focus()
            handled = true
          }
          break
        case 'k':
          if (list.length) {
            list[Math.max(0, at - 1)]?.focus()
            handled = true
          }
          break
        case '/': {
          const search = document.getElementById('crm-search')
          if (search) {
            search.focus()
            handled = true
          }
          break
        }
        case 'x': {
          // W1-5: select / unselect the focused row for a bulk action.
          const box = (document.activeElement as HTMLElement | null)?.closest('tr')?.querySelector<HTMLInputElement>('input[data-bulk]')
          if (box && !box.disabled) {
            box.checked = !box.checked
            box.dispatchEvent(new Event('change', { bubbles: true }))
            handled = true
          }
          break
        }
        case 'a':
          handled = click('assign-me')
          break
        case 'r':
          handled = click('start-review')
          break
        case 'n':
          handled = click('note')
          break
        case 't':
          handled = click('follow-up')
          break
      }
      if (handled) e.preventDefault()
    }
    scope.addEventListener('keydown', onKey)
    return () => scope.removeEventListener('keydown', onKey)
  }, [scopeId])
  return null
}
