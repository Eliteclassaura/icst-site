import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { crmAdminField } from '../access'
import { recordActivity } from '../activity'
import { assertCrmAssignee, isAdminOrServer, TERMINAL_RFQ_STATUSES } from '../assignment'
import { crmCollection } from '../collection'
import { countryCodeField, userRelation } from '../fields'
import { CrmInvariantError, isServerContext, merged, relId, writeOnce } from '../guards'
import { rfqNumberFor } from '../ids'
import { ensureSystemTask } from '../tasks'
import { firstResponseDueAt, parseDate } from '../workspace/time'
import {
  ACCOUNT_MATCH_STATE,
  CONTACT_MATCH_STATE,
  NOTIFICATION_STATE,
  OPPORTUNITY_MOTION,
  RFQ_FOLLOW_UP_STATE,
  RFQ_QUALIFICATION_STATE,
  RFQ_STATUS,
  SOURCE_SYSTEM,
  options,
} from '../vocabulary'

type Doc = Record<string, unknown>

/**
 * Receipt identity. Frozen H2O RFQ rules (Sprint 4P R1 `access_control_invariant`, 2A boundary analysis):
 * stable identity, stable `rfq_number`, client fields never trusted, create-only semantics for what was
 * submitted, the same model on REST, GraphQL and the Local API. Enforced here in hooks, not in access, so
 * that the Local API's `overrideAccess` cannot bypass them.
 */
export const RFQ_WRITE_ONCE = [
  'rfq_number',
  'received_at',
  'submitted_at',
  'source_system',
  'source_form_id',
  'source_event_id',
  'client_submission_id',
  'submission_key',
  'raw_payload_hash',
  'content_fingerprint',
  'intake_event',
  'submitted',
  'attribution',
  'notification_state',
] as const

const SERVER_ONLY_ON_CREATE = [
  'rfq_number',
  'received_at',
  'submitted_at',
  'source_form_id',
  'source_event_id',
  'client_submission_id',
  'submission_key',
  'raw_payload_hash',
  'content_fingerprint',
  'intake_event',
  'attribution',
  'notification_state',
  'contact_match_state',
  'account_match_state',
] as const

/**
 * On create the server decides every receipt field. Trusted intake code supplies them through
 * `context.crmServer`; a person creating an RFQ by hand (a phone enquiry) gets `MANUAL_ENTRY`, `now`, and
 * whatever they typed into `submitted` — and nothing they put in the other receipt fields survives.
 */
const stampReceipt: CollectionBeforeValidateHook = ({ context, data, operation }) => {
  if (!data || operation !== 'create') return data
  const d = data as Doc
  const server = isServerContext(context) ? ((context as { crmServer: Doc }).crmServer ?? {}) : {}
  for (const f of SERVER_ONLY_ON_CREATE) {
    if (f in server) d[f] = server[f]
    else delete d[f]
  }
  if (!isServerContext(context)) {
    d.source_system = 'MANUAL_ENTRY'
    d.contact_match_state = 'MANUAL'
    d.account_match_state = 'MANUAL'
  }
  const receivedAt = typeof d.received_at === 'string' ? new Date(d.received_at) : new Date()
  d.received_at = receivedAt.toISOString()
  d.rfq_number = rfqNumberFor(String(d.canonical_id), receivedAt)
  d.notification_state = 'NOT_SENT_DISABLED_IN_CRM1'
  d.follow_up_state = 'TASK_OPEN'
  if (!d.status) d.status = 'RECEIVED'
  return data
}

/** Links must stay inside one account; a status that asserts something must say why. */
const linkAndStatusRules: CollectionBeforeChangeHook = async ({
  context,
  data: incoming,
  operation,
  originalDoc,
  req,
}) => {
  const data = merged(incoming, originalDoc) as Doc
  const accountId = relId(data.account)
  const siteId = relId(data.site)
  const oppId = relId(data.opportunity)
  if (siteId) {
    const site = await req.payload.findByID({
      collection: 'crm-sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (!accountId || relId((site as unknown as Doc).account) !== accountId)
      throw new CrmInvariantError('RFQ_SITE_OTHER_ACCOUNT', 'The site must belong to the RFQ’s account.')
  }
  if (oppId) {
    const opp = await req.payload.findByID({
      collection: 'crm-opportunities',
      id: oppId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (!accountId || relId((opp as unknown as Doc).account) !== accountId)
      throw new CrmInvariantError(
        'RFQ_OPPORTUNITY_OTHER_ACCOUNT',
        'An RFQ can only join an opportunity of the same account (no cross-project evidence).',
      )
  }
  const status = String(data.status)
  // UI-1 (Control Tower frozen): leaving a terminal status is a reopen, and reopening is an admin act.
  if (
    operation === 'update' &&
    originalDoc &&
    (TERMINAL_RFQ_STATUSES as readonly string[]).includes(String(originalDoc.status)) &&
    'status' in incoming &&
    String(incoming.status) !== String(originalDoc.status) &&
    !isAdminOrServer(req, context)
  )
    throw new CrmInvariantError('RFQ_REOPEN_PRIVILEGED', 'Closed RFQs can be reopened by admins only.', 403)
  // UI-1: the assignee must hold a CRM role; clearing an existing owner is an admin act.
  if ('assignee' in incoming && relId(incoming.assignee) !== relId(originalDoc?.assignee))
    await assertCrmAssignee(req, incoming.assignee, 'RFQ_ASSIGNEE_NOT_CRM_USER')
  if (
    operation === 'update' &&
    originalDoc &&
    'assignee' in incoming &&
    relId(originalDoc.assignee) !== null &&
    relId(incoming.assignee) === null &&
    !hasRole(req, ADMINS) &&
    !isServerContext(context)
  )
    throw new CrmInvariantError('RFQ_UNASSIGN_PRIVILEGED', 'Only an admin can remove an RFQ owner.', 403)
  // UI-1: qualification needs a linked account (the UI disabling Qualify is not the control).
  if (status === 'QUALIFIED' && String(originalDoc?.status ?? '') !== 'QUALIFIED' && !accountId)
    throw new CrmInvariantError(
      'RFQ_QUALIFIED_WITHOUT_ACCOUNT',
      'Link an account before qualifying an RFQ.',
    )
  if (status === 'DUPLICATE_OF_EXISTING' && !relId(data.duplicate_of))
    throw new CrmInvariantError(
      'RFQ_DUPLICATE_TARGET_REQUIRED',
      'Name the RFQ this one duplicates. Duplicates are marked by people, never automatically.',
    )
  if (status === 'QUALIFIED' && !data.motion)
    throw new CrmInvariantError(
      'RFQ_QUALIFIED_WITHOUT_MOTION',
      'Record the commercial motion when qualifying an RFQ.',
    )
  if (
    ['REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING', 'CLOSED'].includes(status) &&
    !String(data.status_reason ?? '').trim()
  )
    throw new CrmInvariantError('RFQ_STATUS_REASON_REQUIRED', `${status} needs a reason.`)
  if (
    operation === 'update' &&
    originalDoc &&
    'assignee' in incoming &&
    relId(incoming.assignee) !== relId(originalDoc.assignee)
  )
    incoming.assigned_at = new Date().toISOString()
  if (operation === 'create' && relId(data.assignee)) incoming.assigned_at = new Date().toISOString()
  // Match states describe what automation did. A person cannot rewrite them; a person relinking a record
  // makes the link MANUAL.
  if (operation === 'update' && originalDoc && isServerContext(context)) {
    for (const f of ['contact', 'account'] as const)
      if (relId(originalDoc[f]) !== null && relId(data[f]) !== relId(originalDoc[f]))
        throw new CrmInvariantError(
          'SERVER_RELINK_FORBIDDEN',
          `Automation cannot replace an RFQ's existing ${f}.`,
        )
  }
  if (operation === 'update' && originalDoc && !isServerContext(context)) {
    incoming.contact_match_state =
      relId(data.contact) !== relId(originalDoc.contact) ? 'MANUAL' : originalDoc.contact_match_state
    incoming.account_match_state =
      relId(data.account) !== relId(originalDoc.account) ? 'MANUAL' : originalDoc.account_match_state
  }
  return incoming
}

/**
 * UI-1 (Control Tower frozen): the open first-response task follows the RFQ owner, so the previous owner's
 * My Work never keeps a stale task. Only OPEN / IN_PROGRESS `RFQ_FIRST_RESPONSE` tasks move; completed ones
 * keep their history. Written as trusted server code (the RFQ update already passed access).
 */
async function firstResponseFollowsOwner(
  req: Parameters<CollectionAfterChangeHook>[0]['req'],
  rfqId: string,
  assignee: string | null,
): Promise<void> {
  const open = await req.payload.find({
    collection: 'crm-tasks',
    where: {
      and: [
        { rfq: { equals: rfqId } },
        { kind: { equals: 'RFQ_FIRST_RESPONSE' } },
        { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      ],
    },
    depth: 0,
    limit: 10,
    overrideAccess: true,
    req,
  })
  for (const t of open.docs)
    if (relId((t as unknown as Doc).assignee) !== assignee)
      await req.payload.update({
        collection: 'crm-tasks',
        id: t.id,
        data: { assignee } as never,
        depth: 0,
        overrideAccess: true,
        context: { crmServer: {} },
        req,
      })
}

const timeline: CollectionAfterChangeHook = async ({ doc, operation, previousDoc, req }) => {
  const d = doc as Doc
  const base = {
    rfq: String(d.id),
    account: relId(d.account),
    contact: relId(d.contact),
    site: relId(d.site),
    opportunity: relId(d.opportunity),
  }
  if (operation === 'create') {
    // E0.1: `ics.rfq.persisted` is emitted after persistence. Notification is a separate, later action —
    // disabled in CRM-1 — and its failure could never roll this back.
    await recordActivity(req, {
      ...base,
      type: 'RFQ_CREATED',
      event_name: 'ics.rfq.persisted',
      summary: `RFQ ${String(d.rfq_number)} persisted (${String(d.source_system)})`,
      idempotency_key: `rfq-persisted:${String(d.canonical_id)}`,
      detail: { rfq_number: d.rfq_number, source_system: d.source_system },
      actor_kind: req.user ? 'USER' : 'INTEGRATION',
    })
    // E1.1 ICS_RFQ_RECEIPT_FIRST_RESPONSE step 2 — the accepted rule, not a dashboard filler.
    await ensureSystemTask(req, {
      kind: 'RFQ_FIRST_RESPONSE',
      title: `First response: ${String(d.rfq_number)}`,
      priority: 'HIGH',
      assignee: relId(d.assignee),
      rfq: String(d.id),
      contact: relId(d.contact),
      account: relId(d.account),
      idempotency_key: `rfq-first-response:${String(d.canonical_id)}`,
      source_rule: 'E1_1_ICS_RFQ_RECEIPT_FIRST_RESPONSE_STEP_2',
      // D-1 (owner decision 2026-10-02): due at the end of the next Denver business day after receipt.
      due_at: firstResponseDueAt(parseDate(d.received_at) ?? new Date()).toISOString(),
    })
    return doc
  }
  const p = previousDoc as Doc
  if (relId(p.assignee) !== relId(d.assignee)) await firstResponseFollowsOwner(req, String(d.id), relId(d.assignee))
  if (p.status !== d.status)
    await recordActivity(req, {
      ...base,
      type: 'RFQ_STATUS_CHANGED',
      event_name:
        d.status === 'QUALIFIED'
          ? 'ics.rfq.qualified'
          : d.status === 'REJECTED_NON_CORE'
            ? 'ics.rfq.rejected_non_core'
            : null,
      summary: `RFQ status ${String(p.status)} → ${String(d.status)}`,
      idempotency_key: `rfq-status:${String(d.canonical_id)}:${String(d.updatedAt)}`,
      detail: { from: p.status, to: d.status },
    })
  if (relId(p.assignee) !== relId(d.assignee))
    await recordActivity(req, {
      ...base,
      type: 'RFQ_ASSIGNED',
      event_name: 'ics.sales.owner_assigned',
      summary: 'RFQ assignee changed',
      idempotency_key: `rfq-assignee:${String(d.canonical_id)}:${String(d.updatedAt)}`,
      detail: { from: relId(p.assignee), to: relId(d.assignee) },
    })
  return doc
}

export const CrmRfqs: CollectionConfig = crmCollection(
  {
    slug: 'crm-rfqs',
    // Duplicating one of these would fabricate a second record of something that happened once.
    disableDuplicate: true,
    labels: { singular: 'RFQ', plural: 'RFQs' },
    admin: {
      useAsTitle: 'rfq_number',
      description:
        'Every RFQ is persisted before anything else happens. Receipt fields are write-once. No pricing, no quote generation, no notification in CRM-1.',
      defaultColumns: [
        'rfq_number',
        'received_at',
        'status',
        'assignee',
        'account',
        'contact',
        'follow_up_state',
        'contact_match_state',
      ],
      listSearchableFields: [
        'rfq_number',
        'submitted.company',
        'submitted.last_name',
        'attribution.page_path',
      ],
    },
    defaultSort: '-received_at',
    hooks: {
      beforeValidate: [stampReceipt],
      beforeChange: [writeOnce('crm-rfqs', RFQ_WRITE_ONCE), linkAndStatusRules],
      afterChange: [timeline],
    },
    fields: [
      {
        name: 'rfq_number',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { readOnly: true, description: 'Stable customer reference. Never changes.' },
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'RECEIVED',
        options: options(RFQ_STATUS),
        index: true,
      },
      { name: 'status_reason', type: 'text' },
      {
        name: 'qualification_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(RFQ_QUALIFICATION_STATE),
      },
      {
        name: 'motion',
        type: 'select',
        options: options(OPPORTUNITY_MOTION),
        admin: { description: 'Set by a person on qualification. Never inferred from the form.' },
      },
      userRelation('assignee', 'Who owns the response. Empty = assignment queue.'),
      { name: 'assigned_at', type: 'date', admin: { readOnly: true } },
      {
        name: 'follow_up_state',
        type: 'select',
        required: true,
        defaultValue: 'NOT_STARTED',
        options: options(RFQ_FOLLOW_UP_STATE),
        index: true,
      },
      { name: 'contact', type: 'relationship', relationTo: 'crm-contacts', index: true },
      {
        name: 'contact_match_state',
        type: 'select',
        required: true,
        defaultValue: 'NOT_ATTEMPTED',
        options: options(CONTACT_MATCH_STATE),
        admin: { readOnly: true },
      },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', index: true },
      {
        name: 'account_match_state',
        type: 'select',
        required: true,
        defaultValue: 'NOT_ATTEMPTED',
        options: options(ACCOUNT_MATCH_STATE),
        admin: { readOnly: true },
      },
      { name: 'site', type: 'relationship', relationTo: 'crm-sites', index: true },
      {
        name: 'opportunity',
        type: 'relationship',
        relationTo: 'crm-opportunities',
        index: true,
        admin: { description: 'Optional. Same account only.' },
      },
      {
        name: 'duplicate_of',
        type: 'relationship',
        relationTo: 'crm-rfqs',
        admin: { description: 'Marked by a person.' },
      },
      {
        name: 'notification_state',
        type: 'select',
        required: true,
        defaultValue: 'NOT_SENT_DISABLED_IN_CRM1',
        options: options(NOTIFICATION_STATE),
        admin: { readOnly: true },
      },
      {
        type: 'collapsible',
        label: 'Receipt (write-once)',
        fields: [
          {
            name: 'received_at',
            type: 'date',
            required: true,
            index: true,
            admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
          },
          {
            name: 'submitted_at',
            type: 'date',
            admin: { readOnly: true, description: 'Source-reported submission time.' },
          },
          {
            name: 'source_system',
            type: 'select',
            required: true,
            options: options(SOURCE_SYSTEM),
            admin: { readOnly: true },
          },
          { name: 'source_form_id', type: 'text', admin: { readOnly: true } },
          {
            name: 'source_event_id',
            type: 'text',
            index: true,
            admin: { readOnly: true, description: 'Typeform event_id — a source identity, not the RFQ id.' },
          },
          {
            name: 'client_submission_id',
            type: 'text',
            access: { read: crmAdminField },
            admin: { readOnly: true, description: 'Typeform response token.' },
          },
          {
            name: 'submission_key',
            type: 'text',
            // UI-1 (I-32): anti-abuse / identity material is admin-only at the API, not merely hidden.
            access: { read: crmAdminField },
            unique: true,
            index: true,
            admin: {
              readOnly: true,
              description: 'form_id:client_submission_id — one RFQ per submission (E0.1).',
            },
          },
          { name: 'raw_payload_hash', type: 'text', access: { read: crmAdminField }, admin: { readOnly: true } },
          {
            name: 'content_fingerprint',
            type: 'text',
            access: { read: crmAdminField },
            index: true,
            admin: {
              readOnly: true,
              description: 'Flags a possible duplicate inquiry for review; never discards one.',
            },
          },
          {
            name: 'intake_event',
            type: 'relationship',
            relationTo: 'crm-intake-events',
            admin: { readOnly: true },
          },
        ],
      },
      {
        name: 'submitted',
        type: 'group',
        admin: {
          description:
            'Exactly what the requester submitted. Never edited; corrections go on the contact/account.',
        },
        fields: [
          { name: 'first_name', type: 'text' },
          { name: 'last_name', type: 'text' },
          { name: 'email', type: 'text' },
          { name: 'phone', type: 'text' },
          { name: 'company', type: 'text' },
          countryCodeField('country_code'),
          { name: 'message', type: 'textarea' },
          {
            name: 'other_answers',
            type: 'json',
            admin: { description: 'Mapped answers not modelled above, by field ref.' },
          },
        ],
      },
      {
        name: 'attribution',
        type: 'group',
        admin: {
          description:
            'Source context from the accepted adapter allowlist. Attribution evidence only — an RFQ is not revenue.',
        },
        fields: [
          { name: 'page_path', type: 'text', index: true },
          { name: 'cta_placement', type: 'text', index: true },
          { name: 'utm_source', type: 'text' },
          { name: 'utm_medium', type: 'text' },
          { name: 'utm_campaign', type: 'text' },
          { name: 'utm_term', type: 'text' },
          { name: 'utm_content', type: 'text' },
        ],
      },
      { name: 'items', type: 'join', collection: 'crm-rfq-items', on: 'rfq' },
      { name: 'tasks', type: 'join', collection: 'crm-tasks', on: 'rfq' },
      {
        name: 'activity',
        type: 'join',
        collection: 'crm-activities',
        on: 'rfq',
        defaultSort: '-occurred_at',
      },
    ],
  },
  {
    deleteAlternative:
      'An RFQ is never erased (E0.1 persistence-first). Set status to CLOSED or DUPLICATE_OF_EXISTING with a reason.',
  },
)
