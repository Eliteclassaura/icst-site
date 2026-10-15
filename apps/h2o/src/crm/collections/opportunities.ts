import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { adminOnlyValues } from '../access'
import { OFFICES } from '../offices'
import { recordActivity } from '../activity'
import { crmCollection, stampProvenance } from '../collection'
import { provenanceGroup, userRelation } from '../fields'
import { CrmInvariantError, merged, relId, serverOwned, writeOnce } from '../guards'
import { amountDisplay, economicsProblems, outcomeFor, revenueTruthFor, type Economics } from '../economics'
import {
  AMOUNT_STATUS,
  MOTION_DETAIL,
  MOTION_DETAIL_TO_MOTION,
  OPPORTUNITY_MOTION,
  OPPORTUNITY_STAGE,
  OUTCOME_STATUS,
  PROJECT_STAGE,
  PROJECT_STATE,
  PROJECT_TYPE,
  REVENUE_TRUTH_STATE,
  REVENUE_VERIFICATION_STATE,
  SOURCE_CATEGORY,
  VERIFIED_PROJECT_STATES,
  options,
} from '../vocabulary'

type Doc = Record<string, unknown>

const PROJECT_TYPE_MOTION: Record<string, string> = {
  NEW_TOWER: 'NEW_TOWER',
  MAJOR_REBUILD_REPLACEMENT: 'REBUILD_REPLACEMENT',
}

/**
 * Scope binding — the guard against cross-project contamination (E1.4 `no_cross_project_evidence`,
 * E1.2 same-scope evidence):
 *
 *   - the site, if any, belongs to the opportunity's account;
 *   - an asset needs a site, and every asset is on that site (so on that account);
 *   - a NEW_TOWER project has **no** existing asset: E1.4 "NOT_REQUIRED_AND_MUST_NOT_BE_INVENTED";
 *   - `motion_detail` and `project_type` must agree with the frozen E0.1 `motion`;
 *   - a VERIFIED_* project state cites its project evidence.
 */
const scopeBinding: CollectionBeforeChangeHook = async ({ data: incoming, originalDoc, req }) => {
  const data = merged(incoming, originalDoc)
  const accountId = relId(data.account)
  if (!accountId)
    throw new CrmInvariantError('OPPORTUNITY_ACCOUNT_REQUIRED', 'An opportunity belongs to an account.')
  const siteId = relId(data.site)
  if (siteId) {
    const site = await req.payload.findByID({
      collection: 'crm-sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (relId((site as unknown as Doc).account) !== accountId)
      throw new CrmInvariantError(
        'OPPORTUNITY_SITE_OTHER_ACCOUNT',
        'That site belongs to a different account.',
      )
  }
  const assetIds = ((data.assets ?? []) as unknown[]).map(relId).filter((x): x is string => x !== null)
  if (assetIds.length > 0) {
    if (data.motion === 'NEW_TOWER')
      throw new CrmInvariantError(
        'NEW_TOWER_HAS_NO_EXISTING_ASSET',
        'A new-tower opportunity is not bound to an existing asset (E1.4). Use REBUILD_REPLACEMENT for work on an existing tower.',
      )
    if (!siteId)
      throw new CrmInvariantError(
        'OPPORTUNITY_ASSET_WITHOUT_SITE',
        'Choose the site before binding its towers.',
      )
    const assets = await req.payload.find({
      collection: 'crm-assets',
      where: { id: { in: assetIds } },
      depth: 0,
      limit: assetIds.length,
      overrideAccess: true,
      req,
    })
    if (assets.docs.length !== new Set(assetIds).size)
      throw new CrmInvariantError('OPPORTUNITY_ASSET_NOT_FOUND', 'An asset does not exist.')
    for (const a of assets.docs)
      if (relId((a as unknown as Doc).site) !== siteId)
        throw new CrmInvariantError(
          'OPPORTUNITY_ASSET_OTHER_SITE',
          'Every tower on an opportunity must be on the opportunity’s site.',
        )
  }
  const detail = data.motion_detail as keyof typeof MOTION_DETAIL_TO_MOTION | null | undefined
  if (detail && MOTION_DETAIL_TO_MOTION[detail] !== data.motion)
    throw new CrmInvariantError(
      'MOTION_DETAIL_MISMATCH',
      `${detail} belongs to motion ${MOTION_DETAIL_TO_MOTION[detail]}.`,
    )
  const pt = data.project_type as string | null | undefined
  if (pt && PROJECT_TYPE_MOTION[pt] && PROJECT_TYPE_MOTION[pt] !== data.motion)
    throw new CrmInvariantError(
      'PROJECT_TYPE_MOTION_MISMATCH',
      `${pt} requires motion ${PROJECT_TYPE_MOTION[pt]}.`,
    )
  if (
    (VERIFIED_PROJECT_STATES as readonly string[]).includes(String(data.project_state)) &&
    !String(data.project_evidence_ref ?? '').trim()
  )
    throw new CrmInvariantError(
      'PROJECT_STATE_WITHOUT_EVIDENCE',
      `${String(data.project_state)} needs project evidence bound to this opportunity.`,
    )
  return incoming
}

/** E3 economics + derived states. UNKNOWN is never coerced to 0 or USD. */
const economics: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const e = merged(data, originalDoc) as Economics
  if (e.amount === undefined) e.amount = null
  const problems = economicsProblems(e)
  if (problems.length > 0)
    throw new CrmInvariantError(
      problems[0]!,
      `Opportunity economics are inconsistent: ${problems.join(', ')}.`,
    )
  const d = data as Doc
  d.outcome_status = outcomeFor(e.stage)
  d.revenue_truth_state = revenueTruthFor(e)
  d.amount_display = amountDisplay(e)
  return data
}

/**
 * Stage transitions are evidence-driven: a change of stage on an existing opportunity requires a stated
 * reason, and the transition is stamped server-side. Nothing in CRM-1 moves a stage because time passed —
 * there is no scheduler, job or hook that writes `stage`.
 */
const stageTransition: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  const d = data as Doc
  const reason = typeof d.stage_change_reason === 'string' ? d.stage_change_reason.trim() : ''
  delete d.stage_change_reason
  if (operation === 'create') {
    d.last_stage_change = {
      from: null,
      to: d.stage,
      at: new Date().toISOString(),
      by: req.user?.id ?? null,
      reason: reason || 'Created',
    }
    return data
  }
  if (originalDoc && d.stage !== undefined && d.stage !== originalDoc.stage) {
    if (!reason)
      throw new CrmInvariantError(
        'STAGE_CHANGE_REASON_REQUIRED',
        'Say what evidence moved this opportunity to a new stage.',
      )
    d.last_stage_change = {
      from: originalDoc.stage,
      to: d.stage,
      at: new Date().toISOString(),
      by: req.user?.id ?? null,
      reason,
    }
  } else if (originalDoc) d.last_stage_change = originalDoc.last_stage_change
  return data
}


/**
 * OPP-1: one deal per qualified inquiry. `qualify_key` is `qualify:<rfq id>`, unique, and server-owned (OPP-1.1): the
 * qualify step passes it through `context.crmServer`, REST and the admin UI cannot set or change it, and it must name
 * this opportunity's own origin inquiry.
 */
const qualifyKey: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  const d = data as Doc
  if (operation === 'update') {
    if ('qualify_key' in d && d.qualify_key !== (originalDoc as Doc | undefined)?.qualify_key)
      throw new CrmInvariantError('WRITE_ONCE_FIELD', 'crm-opportunities.qualify_key is write-once and cannot change.')
    return data
  }
  if (d.qualify_key === undefined || d.qualify_key === null || d.qualify_key === '') {
    d.qualify_key = null
    return data
  }
  const origin = relId(d.origin_rfq)
  if (!origin || d.qualify_key !== `qualify:${origin}`)
    throw new CrmInvariantError('QUALIFY_KEY_MISMATCH', 'The deal key must name its own inquiry.')
  return data
}

const timeline: CollectionAfterChangeHook = async ({ doc, operation, previousDoc, req }) => {
  const d = doc as Doc
  const base = { opportunity: String(d.id), account: relId(d.account), site: relId(d.site) }
  if (operation === 'create') {
    await recordActivity(req, {
      ...base,
      type: 'OPPORTUNITY_CREATED',
      event_name: 'crm.opportunity.created',
      summary: `Opportunity created (${String(d.motion)})`,
      idempotency_key: `opportunity-created:${String(d.canonical_id)}`,
      detail: { motion: d.motion, stage: d.stage },
    })
    return doc
  }
  const p = previousDoc as Doc
  if (p.stage !== d.stage)
    await recordActivity(req, {
      ...base,
      type: 'OPPORTUNITY_STAGE_CHANGED',
      event_name: 'crm.opportunity.stage_changed',
      summary: `Stage ${String(p.stage)} → ${String(d.stage)}`,
      idempotency_key: `opportunity-stage:${String(d.canonical_id)}:${String((d.last_stage_change as Doc | undefined)?.at)}`,
      detail: { from_stage: p.stage, to_stage: d.stage },
    })
  if (relId(p.owner) !== relId(d.owner))
    await recordActivity(req, {
      ...base,
      type: 'OPPORTUNITY_OWNER_CHANGED',
      event_name: 'crm.sales.owner_assigned',
      summary: 'Opportunity owner changed',
      idempotency_key: `opportunity-owner:${String(d.canonical_id)}:${String(d.updatedAt)}`,
      detail: { from_owner: relId(p.owner), to_owner: relId(d.owner) },
    })
  return doc
}

export const CrmOpportunities: CollectionConfig = crmCollection(
  {
    slug: 'crm-opportunities',
    labels: { singular: 'Opportunity', plural: 'Opportunities' },
    admin: {
      useAsTitle: 'name',
      description:
        'Commercial pursuits: Account → Site → (optional) towers. Unknown value is shown as unknown, never $0. Stages move on evidence, never on time.',
      defaultColumns: [
        'name',
        'account',
        'site',
        'motion',
        'stage',
        'owner',
        'amount_display',
        'next_step_due_at',
        'updatedAt',
      ],
      listSearchableFields: ['name'],
    },
    hooks: {
      beforeValidate: [stampProvenance, serverOwned('crm-opportunities', ['qualify_key'])],
      // An opportunity never moves to another account: its RFQs, buying group and evidence are bound to it.
      beforeChange: [writeOnce('crm-opportunities', ['account']), qualifyKey, scopeBinding, stageTransition, economics],
      afterChange: [timeline],
    },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
        index: true,
        admin: { description: 'Short human label for the pursuit.' },
      },
      { name: 'account', type: 'relationship', relationTo: 'crm-accounts', required: true, index: true },
      {
        name: 'site',
        type: 'relationship',
        relationTo: 'crm-sites',
        index: true,
        admin: { description: 'Only when verified. Greenfield projects may have no site yet.' },
      },
      {
        name: 'assets',
        type: 'relationship',
        relationTo: 'crm-assets',
        hasMany: true,
        admin: { description: 'Existing towers in scope. Never set for NEW_TOWER.' },
      },
      { name: 'motion', type: 'select', required: true, options: options(OPPORTUNITY_MOTION), index: true },
      { name: 'motion_detail', type: 'select', options: options(MOTION_DETAIL), index: true },
      {
        name: 'project_type',
        type: 'select',
        options: options(PROJECT_TYPE),
        admin: { description: 'E1.4 capital-project type, when this is a project.' },
      },
      {
        name: 'stage',
        type: 'select',
        required: true,
        defaultValue: 'NEW',
        options: options(OPPORTUNITY_STAGE),
        index: true,
      },
      {
        name: 'stage_change_reason',
        type: 'text',
        virtual: true,
        admin: { description: 'Required when you change the stage: what evidence moved it?' },
      },
      {
        name: 'last_stage_change',
        type: 'group',
        admin: { readOnly: true },
        fields: [
          { name: 'from', type: 'text' },
          { name: 'to', type: 'text' },
          { name: 'at', type: 'date' },
          { name: 'by', type: 'relationship', relationTo: 'users' },
          { name: 'reason', type: 'text' },
        ],
      },
      {
        name: 'project_stage',
        type: 'select',
        options: options(PROJECT_STAGE),
        index: true,
        admin: { description: 'E1.4 project dimension (separate from the commercial stage).' },
      },
      {
        name: 'project_state',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN_PROJECT_STATUS',
        options: options(PROJECT_STATE),
      },
      {
        name: 'project_evidence_ref',
        type: 'text',
        admin: { description: 'Evidence bound to THIS project. Required for VERIFIED_* states.' },
      },
      {
        name: 'outcome_status',
        type: 'select',
        options: options(OUTCOME_STATUS),
        index: true,
        admin: { readOnly: true },
      },
      userRelation('owner', 'Sales owner (required by E0.1). No default owner is invented.', true),
      {
        type: 'collapsible',
        label: 'Economics (E3) — unknown is not zero',
        fields: [
          {
            name: 'amount_status',
            type: 'select',
            required: true,
            defaultValue: 'NOT_ENTERED',
            options: options(AMOUNT_STATUS),
          },
          {
            name: 'amount',
            type: 'number',
            min: 0,
            admin: { description: 'Native-currency pipeline value. Empty unless amount_status is KNOWN.' },
          },
          {
            name: 'currency',
            type: 'text',
            maxLength: 3,
            admin: { description: 'ISO 4217 (e.g. USD, JPY). No default — unknown is not USD.' },
          },
          {
            name: 'source_record_explicit_zero',
            type: 'checkbox',
            defaultValue: false,
            admin: { description: 'Tick only when the source explicitly records 0.' },
          },
          {
            name: 'probability',
            type: 'number',
            min: 0,
            max: 100,
            admin: { description: 'Forecast only. Empty means unknown, not 0 %.' },
          },
          {
            name: 'revenue_verification_state',
            type: 'select',
            required: true,
            defaultValue: 'UNVERIFIED',
            options: options(REVENUE_VERIFICATION_STATE),
            access: {
              create: adminOnlyValues('revenue_verification_state', ['CONFIRMED', 'CORRECTED']),
              update: adminOnlyValues('revenue_verification_state', ['CONFIRMED', 'CORRECTED']),
            },
          },
          {
            name: 'revenue_truth_state',
            type: 'select',
            options: options(REVENUE_TRUTH_STATE),
            index: true,
            admin: { readOnly: true, description: 'Derived (E3). Only WON_REVENUE_CONFIRMED is revenue.' },
          },
          { name: 'amount_display', type: 'text', admin: { readOnly: true } },
        ],
      },
      {
        type: 'collapsible',
        label: 'Dates — only when known',
        fields: [
          { name: 'expected_decision_date', type: 'date' },
          { name: 'outage_window', type: 'text' },
          { name: 'project_window', type: 'text' },
          { name: 'won_date', type: 'date' },
          { name: 'closed_at', type: 'date' },
        ],
      },
      { name: 'next_step', type: 'text' },
      { name: 'next_step_due_at', type: 'date', index: true },
      {
        name: 'source_category',
        type: 'select',
        required: true,
        defaultValue: 'UNKNOWN',
        options: options(SOURCE_CATEGORY),
      },
      {
        name: 'source_event_id',
        type: 'text',
        admin: { description: 'Event that sourced this opportunity, when known.' },
      },
      {
        name: 'origin_rfq',
        type: 'relationship',
        relationTo: 'crm-rfqs',
        admin: { description: 'The RFQ this opportunity was qualified from, if any.' },
      },
      {
        name: 'qualify_key',
        type: 'text',
        unique: true,
        index: true,
        admin: { readOnly: true, description: 'Makes qualifying idempotent: one deal per inquiry.' },
      },
      {
        name: 'office',
        type: 'select',
        options: OFFICES.map((o) => ({ label: o, value: o })),
        index: true,
        admin: { description: 'Office queue of the inquiry this deal came from.' },
      },
      provenanceGroup(),
      { name: 'buying_group', type: 'join', collection: 'crm-buying-group-members', on: 'opportunity' },
      { name: 'rfqs', type: 'join', collection: 'crm-rfqs', on: 'opportunity' },
      { name: 'tasks', type: 'join', collection: 'crm-tasks', on: 'opportunity' },
      {
        name: 'activity',
        type: 'join',
        collection: 'crm-activities',
        on: 'opportunity',
        defaultSort: '-occurred_at',
      },
    ],
  },
  { deleteAlternative: 'Move the stage to CANCELLED or LOST, with a reason.' },
)
