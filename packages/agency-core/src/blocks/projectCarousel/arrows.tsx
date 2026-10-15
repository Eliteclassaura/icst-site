'use client'

import { useSyncExternalStore } from 'react'

/**
 * Previous and next controls for the project track. They are enhancements: the server markup renders them
 * hidden (CSS shows them only once `data-enhanced` is set after mount), so without JavaScript the track still
 * scrolls natively and every card stays reachable.
 */
export function CarouselArrows({ trackId }: { trackId: string }) {
  // Server snapshot is false (hidden); the client snapshot is true once hydrated.
  const enhanced = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const step = (dir: 1 | -1) => {
    const track = document.getElementById(trackId)
    if (!track) return
    const card = track.querySelector<HTMLElement>('li')
    const distance = card ? card.offsetWidth + 24 : track.clientWidth
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    track.scrollBy({ left: dir * distance, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="blk-projects__arrows" data-enhanced={enhanced ? '' : undefined}>
      <button type="button" className="blk-projects__arrow" aria-label="Previous projects" onClick={() => step(-1)}>
        <span aria-hidden="true">←</span>
      </button>
      <button type="button" className="blk-projects__arrow" aria-label="Next projects" onClick={() => step(1)}>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  )
}
