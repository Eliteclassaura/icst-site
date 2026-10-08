'use client'

import { useEffect } from 'react'
import { clearAllCrmStorage, notifyStorageReset, reconcileOwner, signOut } from './draftStore'

/**
 * Sign-out wipes this tab's saved drafts and list context, so nothing is left for the next person on the device.
 * And whenever a page opens for a different person than the one the saved state belongs to (the session ended
 * another way), that state is wiped first (see `reconcileOwner`).
 */
export function SignOutClear({ userId }: { userId?: string }) {
  useEffect(() => {
    try {
      if (reconcileOwner(window.sessionStorage, userId)) notifyStorageReset()
    } catch {
      /* storage blocked */
    }
  }, [userId])
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href="/admin/logout/"]')
      if (!a) return
      signOut.started = true
      try {
        clearAllCrmStorage(window.sessionStorage)
      } catch {
        /* storage blocked: nothing to clear */
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
