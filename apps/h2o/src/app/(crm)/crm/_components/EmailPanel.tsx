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
}: {
  rfqId: string
  token: string
  defaultSubject: string
}) {
  return (
    <ActionForm action={A.replyAction} hidden={{ rfqId, token }} submitLabel="Send reply">
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
        {(a) => <textarea className="c-textarea" {...a} maxLength={20000} rows={10} />}
      </Field>
      <p className="c-hint">
        Plain text. Attachments can’t be sent from the CRM yet — send files separately and record them with
        “Log call / reference”. The RFQ number is added at the end if the message doesn’t mention it.
      </p>
    </ActionForm>
  )
}
