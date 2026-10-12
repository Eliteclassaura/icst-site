'use client'
import {useEffect} from 'react'

/**
 * F9 ANCHOR-OFFSET-1 (QA 1.2e): a jump to #request-a-quote lands on the form, which sits below the section's heading and copy (stacked at 390 px,
 * about 560 px of copy above it), so the heading was cut off. Both the first load with the hash and later in-page jumps now scroll the section's
 * heading (`headingId`) to the top with a small margin, so the heading, its copy and the form follow it.
 */
export const ANCHOR_MARGIN = 16
/** The scroll position that puts an element whose top is at `elementTop` (viewport coordinates) `margin` below the top edge. */
export const scrollTopFor = (elementTop: number, scrollY: number, margin = ANCHOR_MARGIN): number => Math.max(0, Math.round(scrollY + elementTop - margin))

export function QuoteAnchorOffset({hash, headingId}: {hash: string; headingId: string}) {
  useEffect(() => {
    const align = () => {
      if (window.location.hash !== hash) return
      const heading = document.getElementById(headingId)
      if (heading) window.scrollTo({top: scrollTopFor(heading.getBoundingClientRect().top, window.scrollY)})
    }
    // after the browser's own jump (layout settled, forms and images placed)
    const first = window.setTimeout(align, 0)
    window.addEventListener('hashchange', align)
    return () => {
      window.clearTimeout(first)
      window.removeEventListener('hashchange', align)
    }
  }, [hash, headingId])
  return null
}
