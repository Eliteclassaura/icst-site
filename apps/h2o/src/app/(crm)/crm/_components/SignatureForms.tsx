'use client'

import { useState } from 'react'
import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { ActionForm, Field } from '../../../../crm/workspace/ui/ActionForm'
import { sanitizeSignature, SIGNATURE_MAX_CHARS } from '../../../../crm/signatureText'
import * as A from '../settings/actions'

/**
 * SIGNATURES-1: one text box, a live preview, Save. The same sanitiser and the same advisory as the server (the server
 * repeats every check). Plain text. A phone number or street address gets a gentle note, never a block.
 */
function Preview({ text, fallback }: { text: string; fallback: string }) {
  const clean = sanitizeSignature(text)
  const shown = clean.ok && clean.value.text ? clean.value.text : fallback
  return (
    <div className="c-sig">
      <p className="c-hint">Preview (the end of every email):</p>
      <pre className="c-sig-preview">{shown}</pre>
      {clean.ok ? clean.value.warnings.map((w) => <p key={w} className="c-hint c-warn-text">{w}</p>) : <p className="c-hint c-warn-text">{clean.message}</p>}
    </div>
  )
}

function Box({ name, label, hint, value, onChange }: { name: string; label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field name={name} label={label} hint={hint} wide>
      {(a) => <textarea className="c-textarea" {...a} rows={5} maxLength={SIGNATURE_MAX_CHARS} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

/** Admin: the organisation's standard signature. */
export function StandardSignatureForm({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  return (
    <ActionForm action={A.saveStandardSignatureAction} submitLabel="Save the standard signature" submitClassName="c-btn is-primary">
      <Box name="text" label="Standard signature" hint="Used for sequence emails and for anyone who has not set their own. Up to 6 short lines. Leave out phone numbers and street addresses." value={text} onChange={setText} />
      <Preview text={text} fallback="ICS Sales Team" />
    </ActionForm>
  )
}

/** A person's own signature and the "use the standard" switch (their own, or an admin editing anyone's). */
export function PersonalSignatureFields({ initialText, initialUseStandard, standard }: { initialText: string; initialUseStandard: boolean; standard: string }) {
  const [text, setText] = useState(initialText)
  const [useStd, setUseStd] = useState(initialUseStandard)
  return (
    <>
      <label className="c-deal-check">
        <input className="c-check" type="checkbox" name="useStandard" checked={useStd} onChange={(e) => setUseStd(e.target.checked)} />
        <span>Use the standard signature</span>
      </label>
      {useStd ? null : <Box name="text" label="My signature" hint="Your name, your title, and at most one short line. Up to 6 short lines." value={text} onChange={setText} />}
      {useStd ? <input type="hidden" name="text" value={text} /> : null}
      <Preview text={useStd ? standard : text} fallback={standard} />
    </>
  )
}

export function MySignatureForm({ initialText, initialUseStandard, standard }: { initialText: string; initialUseStandard: boolean; standard: string }) {
  return (
    <ActionForm action={A.saveUserSignatureAction} submitLabel="Save my signature" submitClassName="c-btn is-primary">
      <PersonalSignatureFields initialText={initialText} initialUseStandard={initialUseStandard} standard={standard} />
    </ActionForm>
  )
}

/** Admin: edit one person's signature in a dialog. */
export function EditSignatureDialog({ userId, name, initialText, initialUseStandard, standard }: { userId: string; name: string; initialText: string; initialUseStandard: boolean; standard: string }) {
  return (
    <ActionDialog label="Edit" ariaLabel={`Edit the signature of ${name}`} title={`Signature of ${name}`} action={A.saveUserSignatureAction} hidden={{ userId }} submitLabel="Save" buttonClassName="c-btn is-small" announce={name}>
      <PersonalSignatureFields initialText={initialText} initialUseStandard={initialUseStandard} standard={standard} />
    </ActionDialog>
  )
}
