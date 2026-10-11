'use client'

import { useRef, useState } from 'react'
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
  signature = '',
}: {
  rfqId: string
  token: string
  defaultSubject: string
  /** Patch C: the merged template text, when the person started from a template (still editable). */
  defaultBody?: string
  /** SIGNATURES-1: this person's signature (their own, else the standard), added to a message that does not carry it yet. */
  signature?: string
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  // A message started from a template already ends with the signature; a blank one gets it added automatically.
  const startsWith = signature && !defaultBody.includes(signature) ? (defaultBody ? `${defaultBody.trimEnd()}\n\n${signature}` : `\n\n${signature}`) : defaultBody
  const [has, setHas] = useState(Boolean(signature) && startsWith.includes(signature))
  const toggle = () => {
    const el = box.current
    if (!el || !signature) return
    const value = el.value
    // Insert / remove: one click. Removing takes the signature (and the blank line before it) off the end of the text.
    el.value = value.includes(signature) ? value.replace(`\n\n${signature}`, '').replace(signature, '').trimEnd() : `${value.trimEnd()}\n\n${signature}`
    el.dispatchEvent(new Event('input', { bubbles: true }))
    setHas(el.value.includes(signature))
  }
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
        {(a) => <textarea className="c-textarea" {...a} ref={box} defaultValue={startsWith} maxLength={20000} rows={startsWith ? 16 : 10} />}
      </Field>
      {signature ? (
        <p className="c-actions">
          <button type="button" className="c-btn is-small" onClick={toggle} aria-pressed={has}>
            {has ? 'Remove signature' : 'Insert signature'}
          </button>
          <span className="c-hint">
            Your signature is added to the end. <a href="/crm/settings/signatures/">Change it</a>.
          </span>
        </p>
      ) : null}
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
