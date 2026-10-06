'use server'

import { refresh } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { discardReviewItem, linkReviewItem } from '../../../crm/inbound'
import { composeReply } from '../../../crm/reply'
import { createManualInquiry } from '../../../crm/workspace/manualInquiry'
import * as m from '../../../crm/workspace/mutations'
import {
  cookieOptions,
  isList,
  listReturnPath,
  listSearchCookie,
  SCOPE_COOKIE,
  SCOPE_TTL_SECONDS,
  scopeReturnPath,
  SEARCH_TTL_SECONDS,
} from '../../../crm/workspace/prefs'
import { globalSearch, recentItems, searchTerm, type SearchHit, type SearchResult } from '../../../crm/workspace/search'
import type { BulkOutcome } from '../../../crm/workspace/bulk'
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
      contactId: f(fd, 'contactId'),
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
  return run(fd, (s) => m.changeDueDate(s, { taskId: f(fd, 'taskId'), due: f(fd, 'due'), reason: f(fd, 'reason'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
}
export async function snoozeAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => m.snoozeTask(s, { taskId: f(fd, 'taskId'), preset: f(fd, 'preset'), reason: f(fd, 'reason'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }))
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

/** CRM email M3: admins resolve inbound email that was not linked automatically (the layer re-checks admin). */
export async function linkReviewAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => linkReviewItem(s, { reviewId: f(fd, 'reviewId'), rfqNumber: f(fd, 'rfqNumber') }))
}
export async function discardReviewAction(_: ActionState, fd: FormData) {
  return run(fd, (s) => discardReviewItem(s, { reviewId: f(fd, 'reviewId') }))
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

// ────────────────────────────────────────────── Wave 1 Patch A ──

/** Only the keys a form actually posted; an absent field means "unchanged" in the edit mutations. */
const sent = (fd: FormData, map: Record<string, string>) => {
  const out: Record<string, string> = {}
  for (const [key, field] of Object.entries(map)) {
    const v = f(fd, field)
    if (v !== undefined) out[key] = v
  }
  return out
}

export async function updateAccountAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.updateAccount(s, {
      accountId: f(fd, 'accountId'),
      expectedUpdatedAt: f(fd, 'expectedUpdatedAt'),
      ...sent(fd, { name: 'name', legalName: 'legalName', industry: 'industry', relationship: 'relationship', ownerId: 'ownerId' }),
    }),
  )
}

export async function updateContactAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.updateContact(s, {
      contactId: f(fd, 'contactId'),
      expectedUpdatedAt: f(fd, 'expectedUpdatedAt'),
      ...sent(fd, { firstName: 'firstName', lastName: 'lastName', title: 'title', contactFunction: 'contactFunction', phone: 'phone', ownerId: 'ownerId', email: 'email' }),
    }),
  )
}

export async function linkContactAccountAction(_: ActionState, fd: FormData) {
  return run(fd, (s) =>
    m.linkContactAccount(s, { contactId: f(fd, 'contactId'), accountId: f(fd, 'accountId') ?? '', confidence: f(fd, 'confidence'), expectedUpdatedAt: f(fd, 'expectedUpdatedAt') }),
  )
}

/** New account: on success, open the new profile (redirect must run outside try/catch). */
export async function newAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const out = await m.createAccount(s, { name: f(fd, 'name'), domain: f(fd, 'domain'), relationship: f(fd, 'relationship'), ownerId: f(fd, 'ownerId') })
  if (!out.ok) return { ...out, nonce: Date.now() }
  redirect(`/crm/accounts/${out.id}/?created=1`)
}

/** New contact: on success, open the new profile; an existing address returns that contact's id to link to. */
export async function newContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const out = await m.createContact(s, {
    email: f(fd, 'email'),
    firstName: f(fd, 'firstName'),
    lastName: f(fd, 'lastName'),
    title: f(fd, 'title'),
    contactFunction: f(fd, 'contactFunction'),
    phone: f(fd, 'phone'),
    accountId: f(fd, 'accountId'),
    confidence: f(fd, 'confidence'),
    ownerId: f(fd, 'ownerId'),
  })
  if (!out.ok) return { ...out, nonce: Date.now() }
  redirect(`/crm/contacts/${out.id}/?created=1`)
}

/** ⌘K / Search page. The term travels in this POST body only; nothing is logged or echoed. */
export async function globalSearchAction(q: string): Promise<SearchResult> {
  const s = await actionSession()
  if (!s) return { status: 'error' }
  return globalSearch(s, q)
}

/** Labels for the palette's recent items (kind + id references kept by the browser). */
export async function recentItemsAction(refs: unknown): Promise<SearchHit[]> {
  const s = await actionSession()
  if (!s) return []
  return recentItems(s, refs)
}

const secureCookies = () => process.env.NODE_ENV === 'production'

/**
 * List search (inbox, accounts, contacts): store the term in an HttpOnly, SameSite=Strict cookie and return to the
 * list with `s=1`. An empty term clears it. The return URL is rebuilt from validated filters only.
 */
export async function listSearchAction(fd: FormData): Promise<void> {
  const s = await actionSession()
  const list = f(fd, 'list')
  if (!s || !isList(list)) redirect('/crm/')
  const term = searchTerm(f(fd, 'q') ?? '') ?? (f(fd, 'q') ?? '').trim().slice(0, 120)
  const jar = await cookies()
  if (term) jar.set(listSearchCookie(list), term, cookieOptions(SEARCH_TTL_SECONDS, secureCookies()))
  else jar.delete({ name: listSearchCookie(list), path: '/crm/' })
  redirect(listReturnPath(list, f(fd, 'back'), Boolean(term)))
}

export async function clearListSearchAction(fd: FormData): Promise<void> {
  const list = f(fd, 'list')
  if (!(await actionSession()) || !isList(list)) redirect('/crm/')
  ;(await cookies()).delete({ name: listSearchCookie(list), path: '/crm/' })
  redirect(listReturnPath(list, f(fd, 'back'), false))
}

/** Remember Mine/Team for My Work and Follow-ups (audit finding 5). */
export async function scopeAction(fd: FormData): Promise<void> {
  const scope = f(fd, 'scope')
  if (!(await actionSession())) redirect('/crm/')
  if (scope === 'mine' || scope === 'team') (await cookies()).set(SCOPE_COOKIE, scope, cookieOptions(SCOPE_TTL_SECONDS, secureCookies()))
  redirect(scopeReturnPath(f(fd, 'back')))
}

// ────────────────────────────────────────────── Wave 1 Patch B ──

/** W1-3: undo one applied import batch (admin; a written reason is required). */
export async function undoImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const { undoImport } = await import('../../../crm/import/engine')
  const out = await undoImport(s, { batchId: f(fd, 'batchId'), note: f(fd, 'note') })
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}

/** W1-3: undo every batch of one file run. */
export async function undoRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const { undoRun } = await import('../../../crm/import/engine')
  const out = await undoRun(s, { sha: f(fd, 'sha'), note: f(fd, 'note') })
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}

/** W1-5 bulk actions: ≤ 100 rows, each through the single-record mutation (see `bulk.ts`). */
async function runBulk(fn: (s: NonNullable<Awaited<ReturnType<typeof actionSession>>>) => Promise<BulkOutcome>): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const out = await fn(s)
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}
export async function bulkAssignRfqsAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkAssignRfqs(s, { ids: f(fd, 'ids'), assigneeId: f(fd, 'assigneeId') }))
}
export async function bulkCloseRfqsAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkCloseRfqs(s, { ids: f(fd, 'ids'), outcome: f(fd, 'outcome'), reason: f(fd, 'reason') }))
}
export async function bulkFollowUpRfqsAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkFollowUpRfqs(s, { ids: f(fd, 'ids'), title: f(fd, 'title'), due: f(fd, 'due'), assigneeId: f(fd, 'assigneeId') }))
}
export async function bulkCompleteTasksAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkCompleteTasks(s, { ids: f(fd, 'ids') }))
}
export async function bulkReassignTasksAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkReassignTasks(s, { ids: f(fd, 'ids'), assigneeId: f(fd, 'assigneeId') }))
}
export async function bulkSetDueAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkSetDue(s, { ids: f(fd, 'ids'), preset: f(fd, 'preset'), due: f(fd, 'due'), reason: f(fd, 'reason') }))
}
export async function bulkAssignContactsAction(_: ActionState, fd: FormData) {
  const b = await import('../../../crm/workspace/bulk')
  return runBulk((s) => b.bulkAssignContacts(s, { ids: f(fd, 'ids'), ownerId: f(fd, 'ownerId') ?? undefined }))
}

/** W1-6 saved views. */
export async function saveViewAction(_: ActionState, fd: FormData) {
  const v = await import('../../../crm/workspace/savedViews')
  return run(fd, (s) => v.saveView(s, { list: f(fd, 'list'), name: f(fd, 'name'), query: f(fd, 'query'), shared: f(fd, 'shared'), pinned: f(fd, 'pinned') }))
}
export async function updateViewAction(_: ActionState, fd: FormData) {
  const v = await import('../../../crm/workspace/savedViews')
  return run(fd, (s) => v.updateView(s, { viewId: f(fd, 'viewId'), name: f(fd, 'name'), pinned: f(fd, 'pinned') }))
}
export async function deleteViewAction(_: ActionState, fd: FormData) {
  const v = await import('../../../crm/workspace/savedViews')
  return run(fd, (s) => v.deleteView(s, { viewId: f(fd, 'viewId') }))
}
