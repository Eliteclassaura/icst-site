'use client'

import { useEffect, useRef } from 'react'

/**
 * W1-8 "apply filters instantly": submits the enclosing GET filter form whenever one of its selects changes. The
 * form's own Apply button stays as the no-JavaScript fallback. Renders an invisible marker only.
 */
export function AutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const form = marker.current?.closest('form')
    if (!form) return
    const onChange = (e: Event) => {
      if ((e.target as Element | null)?.tagName === 'SELECT') form.requestSubmit()
    }
    form.addEventListener('change', onChange)
    return () => form.removeEventListener('change', onChange)
  }, [])
  return <span ref={marker} hidden />
}
