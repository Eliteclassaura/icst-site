'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { dismissFeedback, feedbackSnapshot, noFeedback, publishFeedback, subscribeFeedback, takeFlash } from './feedback'

/** Where a task action's outcome stays on screen (see feedback.ts). Success is polite; a failure is an alert. */
export function FeedbackHost() {
  const f = useSyncExternalStore(subscribeFeedback, feedbackSnapshot, noFeedback)
  useEffect(() => {
    const flash = takeFlash()
    if (flash) publishFeedback(true, flash)
  }, [])
  return (
    <div className="c-feedback">
      {f ? (
        <div key={f.id} className={`c-banner${f.ok ? '' : ' is-error'}`} role={f.ok ? 'status' : 'alert'}>
          <span className="c-feedback-text">
            {f.message}
            {f.subject ? <span className="c-hint"> {f.subject}</span> : null}
          </span>
          <button type="button" className="c-btn is-ghost is-small" onClick={dismissFeedback}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}
