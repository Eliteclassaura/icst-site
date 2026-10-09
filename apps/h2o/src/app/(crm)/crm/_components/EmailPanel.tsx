'use client'

import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../actions'

/**
 * CRM email M2 — the compose form on the RFQ's Email tab. Plain text only: the HTML part is generated on the
 * server from these words. There is no file input; attachments are refused by the server as well.
 */
export function ReplyComposer({
  rfqId,
  token,
  defaultSubject,
  defaultBody = '',
}: {
  rfqId: string
  token: string
  defaultSubject: string
  /** Patch C: the merged template text, when the person started from a template (still editable). */
  defaultBody?: string
}) {
  return (
    <ActionForm action={A.replyAction} hidden={{ rfqId, token }} submitLabel="Send reply" draft={`reply:${rfqId}`}>
      <Field name="subject" label="Subject">
        {(a) => (
          <input
            className="c-input"
            {...a}
            defaultValue={defaultSubject}
            maxLength={200}
            autoComplete="off"
          />
        )}
      </Field>
      <Field name="body" label="Message">
        {(a) => <textarea className="c-textarea" {...a} defaultValue={defaultBody} maxLength={20000} rows={defaultBody ? 16 : 10} />}
      </Field>
      <p className="c-hint">
        Plain text. Attachments can’t be sent from the CRM yet — send files separately and record them with
        “Log call or email”. The RFQ number is added at the end if the message doesn’t mention it.
      </p>
    </ActionForm>
  )
}

/** CRM email M3 — admin actions on one review-queue item. */
export function ReviewActions({ reviewId }: { reviewId: string }) {
  return (
    <div className="c-actions">
      <ActionForm
        action={A.linkReviewAction}
        hidden={{ reviewId }}
        submitLabel="Link to RFQ"
        submitClassName="c-btn"
      >
        <Field name="rfqNumber" label="RFQ number">
          {(a) => <input className="c-input" {...a} placeholder="RFQ-…" maxLength={48} autoComplete="off" />}
        </Field>
      </ActionForm>
      <ActionForm
        inline
        action={A.discardReviewAction}
        hidden={{ reviewId }}
        submitLabel="Discard"
        submitClassName="c-btn is-ghost"
      />
    </div>
  )
}
