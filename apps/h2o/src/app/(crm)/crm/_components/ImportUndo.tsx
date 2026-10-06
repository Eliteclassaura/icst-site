'use client'

import { ActionDialog } from '../../../../crm/workspace/ui/ActionDialog'
import { Field } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../actions'

/** W1-3 undo controls: archive what a batch (or a whole file run) created; nothing is deleted. A reason is required. */
export function UndoBatchDialog({ batchId, label }: { batchId: string; label: string }) {
  return (
    <ActionDialog
      label="Undo…"
      ariaLabel={`Undo batch ${label}`}
      title="Undo import batch"
      action={A.undoImportAction}
      hidden={{ batchId }}
      submitLabel="Undo batch"
      buttonClassName="c-btn is-small is-danger"
      description="Archives the contacts and accounts this batch created and clears fields it filled, unless someone changed them since. Nothing is deleted; suppressions recorded from the file stay."
    >
      <Field name="note" label="Reason" required>
        {(a) => <input className="c-input" {...a} maxLength={500} />}
      </Field>
    </ActionDialog>
  )
}

export function UndoRunDialog({ sha }: { sha: string }) {
  return (
    <ActionDialog
      label={`Undo every batch of file ${sha.slice(0, 12)}…`}
      title="Undo the whole import"
      action={A.undoRunAction}
      hidden={{ sha }}
      submitLabel="Undo all batches"
      buttonClassName="c-btn is-danger"
      description="Undoes every applied batch of this file. Nothing is deleted."
    >
      <Field name="note" label="Reason" required>
        {(a) => <input className="c-input" {...a} maxLength={500} />}
      </Field>
    </ActionDialog>
  )
}
