'use client'

import { ActionForm } from '../../../../../crm/workspace/ui/ActionForm'
import { pauseEnrollmentAction, resumeEnrollmentAction, stopEnrollmentAction } from '../actions'

/** Pause / Resume / Stop for one enrollment. Buttons only show what the viewer may do; the server checks again. */
export function EnrollmentControls({
  enrollmentId,
  canPause,
  canResume,
  canStop,
}: {
  enrollmentId: string
  canPause: boolean
  canResume: boolean
  canStop: boolean
}) {
  const hidden = { enrollmentId }
  return (
    <div className="c-actions">
      {canPause ? (
        <ActionForm inline action={pauseEnrollmentAction} hidden={hidden} submitLabel="Pause" submitClassName="c-btn" />
      ) : null}
      {canResume ? (
        <ActionForm inline action={resumeEnrollmentAction} hidden={hidden} submitLabel="Resume" submitClassName="c-btn" />
      ) : null}
      {canStop ? (
        <ActionForm inline action={stopEnrollmentAction} hidden={hidden} submitLabel="Stop" submitClassName="c-btn is-ghost" />
      ) : null}
    </div>
  )
}
