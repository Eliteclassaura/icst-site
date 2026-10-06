import * as m from './mutations'
import { quickDueDates, QUICK_DUE, type QuickDue } from './time'
import type { CrmSession } from './session'
import { line, oneOf } from './validate'

/**
 * Wave 1 W1-5 bulk actions: at most `BULK_MAX` records per action, each written through the **same single-record
 * mutation** the row buttons use (access control, hooks, row locks, stale-write checks), so a bulk action can do
 * nothing a person couldn't do one row at a time, and every record gets its own audit entry. A row that changed since
 * the list was loaded is reported as a conflict, never overwritten; the others still apply.
 */
export const BULK_MAX = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type BulkItem = { id: string; updatedAt: string | null }
export type BulkOutcome =
  | { ok: true; message: string; done: number; failures: Array<{ id: string; code: string }> }
  | { ok: false; code: string; message: string; fields?: Record<string, string> }

/** "id:updatedAt,id:updatedAt" from the bulk form → validated, de-duplicated items (at most BULK_MAX). */
export function parseBulk(raw: unknown): { ok: true; items: BulkItem[] } | { ok: false; message: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, message: 'Select at least one row.' }
  const seen = new Set<string>()
  const items: BulkItem[] = []
  for (const part of raw.split(',')) {
    const [id, at] = part.split('|')
    if (!id || !UUID.test(id)) return { ok: false, message: 'The selection contains an invalid reference.' }
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ id: key, updatedAt: at && !Number.isNaN(Date.parse(at)) ? at : null })
  }
  if (items.length > BULK_MAX) return { ok: false, message: `Select at most ${BULK_MAX} rows at a time.` }
  return { ok: true, items }
}

async function each(items: BulkItem[], fn: (item: BulkItem) => Promise<m.Outcome>, verb: string): Promise<BulkOutcome> {
  const failures: Array<{ id: string; code: string }> = []
  let done = 0
  for (const item of items) {
    const out = await fn(item)
    if (out.ok) done++
    else failures.push({ id: item.id, code: out.code })
  }
  const stale = failures.filter((f) => f.code === 'STALE').length
  const other = failures.length - stale
  const parts = [`${done} ${verb}`]
  if (stale) parts.push(`${stale} changed by someone else since you loaded the list (not changed)`)
  if (other) parts.push(`${other} could not be changed`)
  return { ok: true, message: `${parts.join('; ')}.`, done, failures }
}

const items = (raw: unknown) => parseBulk(raw)

export async function bulkAssignRfqs(s: CrmSession, input: { ids: unknown; assigneeId: unknown }): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  if (!input.assigneeId) return { ok: false, code: 'VALIDATION', message: 'Choose an owner.', fields: { assigneeId: 'Required' } }
  return each(p.items, (i) => m.assignRfq(s, { rfqId: i.id, assigneeId: input.assigneeId, expectedUpdatedAt: i.updatedAt ?? undefined }), 'assigned')
}

export async function bulkCloseRfqs(s: CrmSession, input: { ids: unknown; outcome: unknown; reason: unknown }): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  // "Duplicate of" names one other RFQ per record, so it is not offered in bulk.
  const outcome = oneOf(input.outcome, ['CLOSED', 'REJECTED_NON_CORE'] as const)
  const reason = line(input.reason, 240)
  if (!outcome || !reason) return { ok: false, code: 'VALIDATION', message: 'Choose an outcome and give a reason.', fields: { ...(outcome ? {} : { outcome: 'Required' }), ...(reason ? {} : { reason: 'Required' }) } }
  return each(p.items, (i) => m.closeRfq(s, { rfqId: i.id, outcome, reason, expectedUpdatedAt: i.updatedAt ?? undefined }), 'closed')
}

export async function bulkFollowUpRfqs(s: CrmSession, input: { ids: unknown; title: unknown; due: unknown; assigneeId?: unknown }): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  return each(p.items, (i) => m.createFollowUp(s, { rfqId: i.id, title: input.title, due: input.due, assigneeId: input.assigneeId }), 'follow-ups added')
}

export async function bulkCompleteTasks(s: CrmSession, input: { ids: unknown }): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  return each(p.items, (i) => m.completeTask(s, { taskId: i.id }), 'marked done')
}

export async function bulkReassignTasks(s: CrmSession, input: { ids: unknown; assigneeId: unknown }): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  if (!input.assigneeId) return { ok: false, code: 'VALIDATION', message: 'Choose an owner.', fields: { assigneeId: 'Required' } }
  return each(p.items, (i) => m.reassignTask(s, { taskId: i.id, assigneeId: input.assigneeId, expectedUpdatedAt: i.updatedAt ?? undefined }), 'reassigned')
}

/** Set follow-up dates in bulk: a quick date or a calendar date. Rule-set (D-1) dates still need the reason. */
export async function bulkSetDue(s: CrmSession, input: { ids: unknown; preset?: unknown; due?: unknown; reason?: unknown }, now: Date = new Date()): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  const preset = oneOf(input.preset, QUICK_DUE) as QuickDue | null
  const due = preset ? quickDueDates(now)[preset] : input.due
  if (!due) return { ok: false, code: 'VALIDATION', message: 'Choose a date.', fields: { due: 'Required' } }
  const out = await each(p.items, (i) => m.changeDueDate(s, { taskId: i.id, due, reason: input.reason, expectedUpdatedAt: i.updatedAt ?? undefined }, now), 'rescheduled')
  if (out.ok && out.failures.some((f) => f.code === 'VALIDATION'))
    return { ...out, message: `${out.message} Rule-set due dates need a reason.` }
  return out
}

export async function bulkAssignContacts(s: CrmSession, input: { ids: unknown; ownerId: unknown }): Promise<BulkOutcome> {
  const p = items(input.ids)
  if (!p.ok) return { ok: false, code: 'VALIDATION', message: p.message }
  if (input.ownerId === undefined) return { ok: false, code: 'VALIDATION', message: 'Choose an owner.', fields: { ownerId: 'Required' } }
  return each(p.items, (i) => m.updateContact(s, { contactId: i.id, ownerId: input.ownerId, expectedUpdatedAt: i.updatedAt ?? undefined }), 'updated')
}
