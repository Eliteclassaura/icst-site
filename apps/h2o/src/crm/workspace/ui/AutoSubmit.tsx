'use client'

import { useEffect, useRef } from 'react'

/**
 * W1-8 "apply filters instantly": submits the enclosing GET filter form whenever one of its selects changes. The
 * form's own Apply button stays as the no-JavaScript fallback. Renders an invisible marker only.
 * Polish R1: inside the phone bottom sheet (`.c-sheet`) changes wait for Apply, so the sheet doesn't close mid-choice.
 */
export function AutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const form = marker.current?.closest('form')
    if (!form) return
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null
      if (form.closest('.c-sheet') && window.matchMedia('(max-width: 767px)').matches) return
      if (t?.tagName === 'SELECT' || (t?.tagName === 'INPUT' && t.type === 'checkbox')) form.requestSubmit()
    }
    form.addEventListener('change', onChange)
    return () => form.removeEventListener('change', onChange)
  }, [])
  return <span ref={marker} hidden />
}
