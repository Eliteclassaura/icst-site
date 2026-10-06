'use client'

import { IconAlert } from '../../../crm/workspace/ui/Icons'

/**
 * Polish R1: a designed error state for any CRM page that fails to render. It says what happened in plain words,
 * offers a retry (re-renders the page) and a way back; no technical detail or error id is shown.
 */
export default function CrmError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="crm-app">
      <div className="c-side" aria-hidden="true" />
      <main className="c-content" id="crm-main">
        <div className="c-panel">
          <div className="c-empty-state" role="alert">
            <span className="c-empty-icon is-error" aria-hidden="true">
              <IconAlert />
            </span>
            <p className="c-empty-title">This page couldn’t load</p>
            <p className="c-empty-body">Nothing was changed. Try again; if it keeps happening, tell an admin which page it was.</p>
            <div className="c-empty-action c-actions">
              <button type="button" className="c-btn is-primary" onClick={() => reset()}>
                Try again
              </button>
              <a className="c-btn" href="/crm/">
                Back to My Work
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
