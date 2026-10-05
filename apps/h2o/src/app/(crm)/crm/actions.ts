'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { composeReply } from '../../../crm/reply'
import { createManualInquiry } from '../../../crm/workspace/manualInquiry'
import * as m from '../../../crm/workspace/mutations'
import type { ActionState } from '../../../crm/workspace/ui/actionState'
import { actionSession } from './session'

/**
 * Sales Workspace server actions. Every action:
 *   - resolves the Payload session again and refuses a non-CRM user (direct POSTs are possible);
 *   - passes untrusted FormData values to the validated mutation layer, which writes as the user;
 *   - returns a small state for the form; success refreshes the route's server data.
 * Next.js checks the request Origin against the Host for every action (CSRF).
 */

const DENIED: ActionState = { ok: false, code: 'FORBIDDEN', message: 'You don’t have access to the Sales Workspace.' }
const f = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : undefined
}

async function run(fd: FormData, fn: (s: NonNullable<Awaited<ReturnType<typeof actionSession>>>) => Promise<m.Outcome>): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const out = await fn(s)
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}

export async function assignAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.assignRfq(s, { rfqId: f(fd, 'rfqId'), assigneeId: f(fd, 'assigneeId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function startReviewAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.startReview(s, { rfqId: f(fd, 'rfqId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function qualifyAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.qualifyRfq(s, { rfqId: f(fd, 'rfqId'), motion: f(fd, 'motion'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function closeAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.closeRfq(s, {
      rfqId: f(fd, 'rfqId'),
      outcome: f(fd, 'outcome'),
      reason: f(fd, 'reason'),
      duplicateOfNumber: f(fd, 'duplicateOfNumber'),
      expectedUpdatedAt: f(fd, 'expectedUpdatedAt'),
    }),
  )
}
export async function reopenAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.reopenRfq(s, { rfqId: f(fd, 'rfqId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function linkAccountAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.linkAccount(s, { rfqId: f(fd, 'rfqId'), accountId: f(fd, 'accountId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function createAccountAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.createAccountAndLink(s, { rfqId: f(fd, 'rfqId'), name: f(fd, 'name'), domain: f(fd, 'domain'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }),
  )
}
export async function associateSiteAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.associateSite(s, { rfqId: f(fd, 'rfqId'), siteId: f(fd, 'siteId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function noteAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.addNote(s, { rfqId: f(fd, 'rfqId'), body: f(fd, 'body') }))
}
export async function logActivityAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.logActivity(s, { rfqId: f(fd, 'rfqId'), type: f(fd, 'type'), summary: f(fd, 'summary'), occurredAt: f(fd, 'occurredAt') }))
}
export async function followUpAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.createFollowUp(s, {
      rfqId: f(fd, 'rfqId'),
      accountId: f(fd, 'accountId'),
      title: f(fd, 'title'),
      due: f(fd, 'due'),
      assigneeId: f(fd, 'assigneeId'),
      priority: f(fd, 'priority'),
    }),
  )
}
export async function requestInfoAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.requestInformation(s, { rfqId: f(fd, 'rfqId'), missing: f(fd, 'missing'), due: f(fd, 'due'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function completeTaskAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.completeTask(s, { taskId: f(fd, 'taskId') }))
}
export async function reopenTaskAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.reopenTask(s, { taskId: f(fd, 'taskId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function dueDateAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.changeDueDate(s, { taskId: f(fd, 'taskId'), due: f(fd, 'due'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function reassignTaskAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.reassignTask(s, { taskId: f(fd, 'taskId'), assigneeId: f(fd, 'assigneeId'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function customerRepliedAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.customerReplied(s, { taskId: f(fd, 'taskId'), summary: f(fd, 'summary') }))
}
export async function doNotContactAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.applyDoNotContact(s, { contactId: f(fd, 'contactId'), note: f(fd, 'note') }))
}
export async function clearSuppressionAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.clearSuppression(s, { contactId: f(fd, 'contactId'), suppressionId: f(fd, 'suppressionId'), note: f(fd, 'note'), evidence: f(fd, 'evidence') }),
  )
}
export async function resolveReviewAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.resolveReview(s, { reviewId: f(fd, 'reviewId'), state: f(fd, 'state'), note: f(fd, 'note') }))
}

/**
 * CRM email M2: write to the customer from the RFQ. Attachments are refused (any file in the form counts),
 * whatever the page rendered; the compose layer re-checks role, access, address, suppression and the gate.
 */
export async function replyAction(_: ActionState, fd: FormData) {
  const attachments = [...fd.values()].filter((v) => typeof v !== 'string').length
  return run(fd, (s) => composeReply(s, { rfqId: f(fd, 'rfqId'), subject: f(fd, 'subject'), body: f(fd, 'body'), token: f(fd, 'token'), attachments }))
}

/** Manual New Inquiry: on success, go to the created RFQ (redirect must run outside try/catch). */
export async function manualInquiryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const out = await createManualInquiry(s, {
    token: f(fd, 'token'),
    firstName: f(fd, 'firstName'),
    lastName: f(fd, 'lastName'),
    company: f(fd, 'company'),
    email: f(fd, 'email'),
    phone: f(fd, 'phone'),
    message: f(fd, 'message'),
    motion: f(fd, 'motion'),
    assigneeId: f(fd, 'assigneeId'),
    followUpTitle: f(fd, 'followUpTitle'),
    followUpDue: f(fd, 'followUpDue'),
  })
  if (!out.ok) return { ...out, nonce: Date.now() }
  const notice = encodeURIComponent((out.notices ?? []).join(','))
  redirect(`/crm/rfqs/${out.id}/?created=1&notice=${notice}`)
}

/** Account picker search for Link account (read-only, as the user). */
export async function searchAccountsAction(q: string) {
  const s = await actionSession()
  if (!s) return []
  const { searchAccounts } = await import('../../../crm/workspace/queries')
  return searchAccounts(s, typeof q === 'string' ? q.slice(0, 120) : null)
}
