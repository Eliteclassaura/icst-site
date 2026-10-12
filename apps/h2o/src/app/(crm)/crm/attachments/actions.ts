'use server'

import { refresh } from 'next/cache'
import { removeAttachment } from '../../../../crm/attachments/service'
import type { ActionState } from '../../../../crm/workspace/ui/actionState'
import { actionSession } from '../session'

/** CRM-ATTACH-1: remove a file (soft; the uploader or an admin; audited). Same shape as the other CRM actions. */
export async function deleteAttachmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return { ok: false, code: 'FORBIDDEN', message: 'You don’t have access to the Sales Workspace.' }
  const id = fd.get('id')
  if (typeof id !== 'string') return { ok: false, code: 'INVALID', message: 'That file reference is not valid.' }
  const out = await removeAttachment(s, id)
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}
