'use client'

import { ActionForm } from '../../../../crm/workspace/ui/ActionForm'
import * as A from '../settings/actions'

/** SHEET-SYNC-1: "Try again" for the website quote requests that did not reach the Google Sheet. */
export function SheetRetryForm() {
  return <ActionForm action={A.retrySheetRowsAction} submitLabel="Try again" submitClassName="c-btn" inline />
}
