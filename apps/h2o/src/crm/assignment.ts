import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { CrmInvariantError, isServerContext, relId } from './guards'

/**
 * UI-1 server-side assignment and lifecycle rules (Control Tower frozen decisions, CRM UI-1 R1.1).
 *
 * These live in collection hooks — not in the workspace UI — so that a crafted REST request, a GraphQL call
 * or the Local API with access on cannot bypass them. Hiding a control is courtesy; this is the control.
 */

/** RFQ statuses that end an inquiry. Leaving one of them (a reopen) is an admin act. */
export const TERMINAL_RFQ_STATUSES = ['REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING', 'CLOSED'] as const
/** Task statuses that end a task. Reopening one is an admin act. */
export const TERMINAL_TASK_STATUSES = ['DONE', 'CANCELLED'] as const

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles
  return Array.isArray(roles) ? roles.map(String) : []
}

/** True when the user document carries at least one CRM role (Admin or Sales). */
export const holdsCrmRole = (user: unknown): boolean => rolesOf(user).some((r) => CRM_USERS.includes(r as never))

/**
 * An assignee must be an existing user holding a CRM role. A malformed id, an unknown id and a non-CRM user
 * are refused alike (the caller learns nothing about which users exist).
 */
export async function assertCrmAssignee(req: PayloadRequest, value: unknown, code: string): Promise<void> {
  const id = relId(value)
  if (!id) return
  // Refuse a malformed id before querying: a failed query would abort the request's DB transaction.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new CrmInvariantError(code, 'The assignee must be a user with a CRM role (Admin or Sales).')
  let found: unknown
  try {
    found = await req.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, req })
  } catch {
    found = null
  }
  if (!found || !holdsCrmRole(found))
    throw new CrmInvariantError(code, 'The assignee must be a user with a CRM role (Admin or Sales).')
}

/** Admin, or trusted server code. */
export const isAdminOrServer = (req: PayloadRequest, context: unknown): boolean =>
  hasRole(req, ADMINS) || isServerContext(context)

/**
 * Wave 1 W1-1: a record owner (account, contact) is held to the same rule as an assignee — an existing user with
 * a CRM role. Checked only when the owner changes, so existing records are never re-validated by an unrelated edit.
 */
export const ownerHoldsCrmRole =
  (code: string): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    if ('owner' in data && relId(data.owner) !== relId(originalDoc?.owner)) await assertCrmAssignee(req, data.owner, code)
    return data
  }
