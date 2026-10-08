'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  currentListUrl,
  idOf,
  isListUrl,
  onStorageReset,
  readListContext,
  signOut,
  writeListContext,
  type ListKind,
} from '../../../../crm/workspace/ui/draftStore'

const tabStorage = (): Storage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Gate B item 3: returning from a record puts the list back as it was. While a list is open this keeps its address
 * (filters, page, open pane), the scroll position and the ticked rows in this tab's `sessionStorage`. When the same
 * list address is shown again (Back, or the "back to list" link on a record), scroll and ticks are restored. Nothing
 * is stored but the page address, two scroll numbers and record ids; nothing leaves the browser.
 */
export function ListContext({ kind, scopeId }: { kind: ListKind; scopeId: string }) {
  useEffect(() => {
    const store = tabStorage()
    const scope = document.getElementById(scopeId)
    if (!scope) return
    const timers: number[] = []
    const here = currentListUrl(window.location)
    if (!isListUrl(kind, here)) return
    const paneEl = () => scope.querySelector<HTMLElement>('.c-split > div:last-child')
    const boxes = () => [...scope.querySelectorAll<HTMLInputElement>('input[data-bulk]')]

    // Restore, only when this is the very list view that was stored.
    const saved = readListContext(store, kind)
    if (saved && saved.url === here) {
      if (saved.selected.length) {
        const want = new Set(saved.selected)
        let changed = false
        for (const b of boxes())
          if (want.has(idOf(b.value)) && !b.checked) {
            b.checked = true
            changed = true
          }
        if (changed) scope.dispatchEvent(new Event('change', { bubbles: true }))
      }
      // Ticking rows shows the bulk bar, which moves the page; so put the scroll back once now and again after the
      // layout settles, unless the person has already scrolled themselves.
      let moved = false
      const stop = () => {
        moved = true
      }
      for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown'] as const) window.addEventListener(ev, stop, { once: true, passive: true })
      const place = () => {
        if (moved) return
        window.scrollTo(0, saved.windowY)
        const pane = paneEl()
        if (pane && saved.paneY) pane.scrollTop = saved.paneY
      }
      requestAnimationFrame(place)
      timers.push(window.setTimeout(place, 150), window.setTimeout(place, 500))
    }

    let timer: number | undefined
    const save = () => {
      if (signOut.started) return
      writeListContext(store, kind, {
        url: here,
        windowY: Math.round(window.scrollY),
        paneY: Math.round(paneEl()?.scrollTop ?? 0),
        selected: boxes()
          .filter((b) => b.checked)
          .map((b) => idOf(b.value))
          .filter(Boolean),
        at: Date.now(),
      })
    }
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(save, 150)
    }
    // Remember the address right away, so a record opened at once still has a list to go back to.
    save()
    window.addEventListener('scroll', later, { passive: true })
    scope.addEventListener('change', later)
    scope.addEventListener('click', save, true)
    window.addEventListener('pagehide', save)
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      window.clearTimeout(timer)
      window.removeEventListener('scroll', later)
      scope.removeEventListener('change', later)
      scope.removeEventListener('click', save, true)
      window.removeEventListener('pagehide', save)
    }
  }, [kind, scopeId])
  return null
}

/**
 * The "back to the list" link on a record. It goes to the list address that was open in this tab (same filters,
 * page and pane), and falls back to the plain list when there is none. Server-rendered as the plain list, so it works
 * without script.
 */
export function BackToList({ kind, label }: { kind: ListKind; label: string }) {
  const plain = `/crm/${kind}/`
  const href = useSyncExternalStore(
    onStorageReset,
    () => readListContext(tabStorage(), kind)?.url ?? plain,
    () => plain,
  )
  return <a href={href}>{label}</a>
}
