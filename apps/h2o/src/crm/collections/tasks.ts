import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { recordActivity } from '../activity'
import { assertCrmAssignee, isAdminOrServer, TERMINAL_TASK_STATUSES } from '../assignment'
import { crmCollection } from '../collection'
import { userRelation } from '../fields'
import { CrmInvariantError, isServerContext, merged, relId, sameValue, serverOwned } from '../guards'
import { TASK_KIND, TASK_PRIORITY, TASK_SOURCE, TASK_STATUS, options } from '../vocabulary'

type Doc = Record<string, unknown>

/** A task is about something: at least one CRM record. Completion is stamped by the server. */
const taskRules: CollectionBeforeChangeHook = async ({ context, data: incoming, operation, originalDoc, req }) => {
  const data = merged(incoming, originalDoc) as Doc
  // UI-1 (Control Tower frozen): reopening a finished task is an admin act; assignees hold a CRM role.
  if (
    operation === 'update' &&
    originalDoc &&
    (TERMINAL_TASK_STATUSES as readonly string[]).includes(String(originalDoc.status)) &&
    'status' in incoming &&
    String(incoming.status) !== String(originalDoc.status) &&
    !isAdminOrServer(req, context)
  )
    throw new CrmInvariantError('TASK_REOPEN_PRIVILEGED', 'Finished follow-ups can be reopened by admins only.', 403)
  // Wave 1 W1-9: a rule-set due date (D-1 first response) is never moved silently. A person changing it must
  // record why in the same write (the workspace appends the reason to `notes`); trusted server code is exempt.
  if (
    operation === 'update' &&
    originalDoc?.source === 'SYSTEM_RULE' &&
    'due_at' in incoming &&
    !sameValue(incoming.due_at, originalDoc.due_at) &&
    !isServerContext(context) &&
    (typeof incoming.notes !== 'string' || !incoming.notes.trim() || sameValue(incoming.notes, originalDoc.notes))
  )
    throw new CrmInvariantError('SYSTEM_DUE_REASON_REQUIRED', 'Changing a rule-set due date needs a recorded reason.')
  if ('assignee' in incoming && relId(incoming.assignee) !== relId(originalDoc?.assignee))
    await assertCrmAssignee(req, incoming.assignee, 'TASK_ASSIGNEE_NOT_CRM_USER')
  const subjects = ['account', 'contact', 'site', 'asset', 'opportunity', 'rfq', 'identity_review'].filter(
    (f) => relId(data[f]) !== null,
  )
  if (subjects.length === 0)
    throw new CrmInvariantError('TASK_WITHOUT_SUBJECT', 'A task must relate to at least one CRM record.')
  if (operation === 'create' && !incoming.source) incoming.source = 'MANUAL'
  const wasDone = originalDoc?.status === 'DONE'
  if (data.status === 'DONE' && !wasDone) {
    incoming.completed_at = new Date().toISOString()
    incoming.completed_by = req.user ? req.user.id : null
  } else if (data.status !== 'DONE') {
    incoming.completed_at = null
    incoming.completed_by = null
  }
  return incoming
}

const timeline: CollectionAfterChangeHook = async ({ doc, operation, previousDoc, req }) => {
  const d = doc as Doc
  const base = {
    task: String(d.id),
    rfq: relId(d.rfq),
    opportunity: relId(d.opportunity),
    account: relId(d.account),
    contact: relId(d.contact),
    site: relId(d.site),
    asset: relId(d.asset),
  }
  if (operation === 'create') {
    await recordActivity(req, {
      ...base,
      type: 'TASK_CREATED',
      summary: `Task created (${String(d.kind)})`,
      idempotency_key: `task-created:${String(d.canonical_id)}`,
      detail: { kind: d.kind, source: d.source },
    })
    return doc
  }
  const p = previousDoc as Doc
  if (p.status !== 'DONE' && d.status === 'DONE')
    await recordActivity(req, {
      ...base,
      type: 'TASK_COMPLETED',
      summary: `Task completed (${String(d.kind)})`,
      idempotency_key: `task-done:${String(d.canonical_id)}:${String(d.completed_at)}`,
    })
  if (relId(p.assignee) !== relId(d.assignee))
    await recordActivity(req, {
      ...base,
      type: 'TASK_REASSIGNED',
      summary: 'Task reassigned',
      idempotency_key: `task-assignee:${String(d.canonical_id)}:${String(d.updatedAt)}`,
      detail: { from: relId(p.assignee), to: relId(d.assignee) },
    })
  return doc
}

export const CrmTasks: CollectionConfig = crmCollection(
  {
    slug: 'crm-tasks',
    labels: { singular: 'Task', plural: 'Tasks' },
    admin: {
      useAsTitle: 'title',
      description:
        'Human follow-up. System tasks exist only where an accepted rule creates them (RFQ first response, reviews). Cancel instead of delete.',
      defaultColumns: ['title', 'kind', 'status', 'priority', 'assignee', 'due_at', 'rfq', 'opportunity'],
      listSearchableFields: ['title'],
    },
    defaultSort: 'due_at',
    hooks: {
      beforeValidate: [serverOwned('crm-tasks', ['source', 'source_rule', 'idempotency_key'])],
      beforeChange: [taskRules],
      afterChange: [timeline],
    },
    fields: [
      { name: 'title', type: 'text', required: true },
      {
        name: 'kind',
        type: 'select',
        required: true,
        defaultValue: 'GENERAL',
        options: options(TASK_KIND),
        index: true,
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'OPEN',
        options: options(TASK_STATUS),
        index: true,
      },
      { name: 'priority', type: 'select', options: options(TASK_PRIORITY) },
      userRelation('assignee', 'Empty = queue.'),
      {
        name: 'due_at',
        type: 'date',
        index: true,
        admin: { description: 'Only when a real deadline exists. No SLA is invented.' },
      },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', index: true },
      { name: 'site', type: 'relationship', relationTo: 'crm-sites', index: true },
      { name: 'asset', type: 'relationship', relationTo: 'crm-assets', index: true },
      { name: 'opportunity', type: 'relationship', relationTo: 'crm-opportunities', index: true },
      { name: 'rfq', type: 'relationship', relationTo: 'crm-rfqs', index: true },
      { name: 'identity_review', type: 'relationship', relationTo: 'crm-identity-reviews', index: true },
      { name: 'notes', type: 'textarea' },
      {
        name: 'source',
        type: 'select',
        required: true,
        defaultValue: 'MANUAL',
        options: options(TASK_SOURCE),
        admin: { readOnly: true },
      },
      { name: 'source_rule', type: 'text', admin: { readOnly: true } },
      { name: 'idempotency_key', type: 'text', unique: true, index: true, admin: { readOnly: true } },
      { name: 'completed_at', type: 'date', admin: { readOnly: true } },
      { name: 'completed_by', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    ],
  },
  { deleteAlternative: 'Set status to CANCELLED.' },
)
