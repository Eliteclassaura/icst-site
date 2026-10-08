import type { PayloadRequest, Where } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { amountDisplay, pipelineByCurrency, type Economics } from './economics'
import { OPPORTUNITY_STAGE, TERMINAL_STAGES } from './vocabulary'

/**
 * CRM Overview data. A fixed number of queries regardless of data volume (no per-row lookups):
 * counts use `count`, lists use bounded `find` with `select`, and "opportunities without a next task" is
 * one opportunity query plus one task query joined in memory.
 *
 * Every query runs **as the viewing user** (`overrideAccess: false`), so the overview can never show more
 * than that user could open record by record. A non-CRM user gets `null` and no query is made.
 *
 * Nothing here is a production metric. `dataLabel` is `NON_PRODUCTION` unless the deployment explicitly
 * declares otherwise, and the page says so on every render.
 */

export const OPEN_RFQ_STATUSES = ['RECEIVED', 'NEEDS_REVIEW', 'IN_REVIEW'] as const
/**
 * "Stalled" is a presentation filter, not a stage: an open opportunity not updated for this many days.
 * The threshold is a provisional display value pending owner input (CRM_OPEN_OWNER_INPUTS.md #OI-07); it
 * moves nothing and writes nothing.
 */
export const STALLED_AFTER_DAYS = 30
const RECENT_LIMIT = 12
const LIST_LIMIT = 100

export type Overview = {
  dataLabel: 'NON_PRODUCTION' | 'PRODUCTION'
  generatedAt: string
  rfqs: { open: number; unassigned: number; needsReview: number }
  opportunitiesByStage: Array<{ stage: string; count: number }>
  openOpportunities: number
  opportunitiesWithoutNextTask: Array<{ id: string; name: string; stage: string; amount: string }>
  stalledOpportunities: Array<{ id: string; name: string; stage: string; updatedAt: string }>
  tasks: { dueNext7Days: number; overdue: number; unassigned: number }
  installedBaseAccounts: number | null
  identityReviewsOpen: number
  /** RFQ-FIX-1 (quote-form audit R5, R6): admins only (null for others) — requests stranded part-way, and requests held
   * as spam (hidden field filled) in the last 24 hours. */
  intake: { stranded: number; spam24h: number; failedPermanent: number } | null
  pipeline: ReturnType<typeof pipelineByCurrency>
  recentActivity: Array<{ id: string; type: string; summary: string; occurredAt: string }>
  truncated: boolean
}

export const dataLabelFromEnv = (env: NodeJS.ProcessEnv = process.env): Overview['dataLabel'] =>
  env.H2O_CRM_DATA_LABEL === 'PRODUCTION' ? 'PRODUCTION' : 'NON_PRODUCTION'

export async function loadOverview(req: PayloadRequest, now: Date = new Date()): Promise<Overview | null> {
  if (!hasRole(req, CRM_USERS)) return null
  const p = req.payload
  const asUser = { overrideAccess: false as const, req, user: req.user }
  const openStage: Where = { stage: { not_in: [...TERMINAL_STAGES] } }
  const day = 86_400_000

  const [
    open,
    unassigned,
    needsReview,
    byStage,
    openOpps,
    dueSoon,
    overdue,
    unassignedTasks,
    reviews,
    recent,
  ] = await Promise.all([
    p.count({ collection: 'crm-rfqs', where: { status: { in: [...OPEN_RFQ_STATUSES] } }, ...asUser }),
    p.count({
      collection: 'crm-rfqs',
      where: { and: [{ status: { in: [...OPEN_RFQ_STATUSES] } }, { assignee: { exists: false } }] },
      ...asUser,
    }),
    p.count({ collection: 'crm-rfqs', where: { status: { equals: 'NEEDS_REVIEW' } }, ...asUser }),
    Promise.all(
      OPPORTUNITY_STAGE.map((stage) =>
        p
          .count({ collection: 'crm-opportunities', where: { stage: { equals: stage } }, ...asUser })
          .then((r) => ({ stage, count: r.totalDocs })),
      ),
    ),
    p.find({
      collection: 'crm-opportunities',
      where: openStage,
      depth: 0,
      limit: LIST_LIMIT,
      sort: 'updatedAt',
      select: {
        name: true,
        stage: true,
        amount: true,
        amount_status: true,
        currency: true,
        source_record_explicit_zero: true,
        updatedAt: true,
      },
      ...asUser,
    }),
    p.count({
      collection: 'crm-tasks',
      where: {
        and: [
          { status: { in: ['OPEN', 'IN_PROGRESS'] } },
          { due_at: { greater_than_equal: now.toISOString() } },
          { due_at: { less_than: new Date(now.getTime() + 7 * day).toISOString() } },
        ],
      },
      ...asUser,
    }),
    p.count({
      collection: 'crm-tasks',
      where: {
        and: [{ status: { in: ['OPEN', 'IN_PROGRESS'] } }, { due_at: { less_than: now.toISOString() } }],
      },
      ...asUser,
    }),
    p.count({
      collection: 'crm-tasks',
      where: { and: [{ status: { in: ['OPEN', 'IN_PROGRESS'] } }, { assignee: { exists: false } }] },
      ...asUser,
    }),
    p.count({ collection: 'crm-identity-reviews', where: { state: { equals: 'OPEN' } }, ...asUser }),
    p.find({
      collection: 'crm-activities',
      depth: 0,
      limit: RECENT_LIMIT,
      sort: '-occurred_at',
      select: { type: true, summary: true, occurred_at: true },
      ...asUser,
    }),
  ])

  let intake: Overview['intake'] = null
  if (hasRole(req, ADMINS)) {
    const { failedPermanentWhere, strandedWhere } = await import('./intake/native/sweep')
    const [stranded, spam, gaveUp] = await Promise.all([
      p.count({ collection: 'crm-intake-events', where: strandedWhere(now, true), ...asUser }),
      p.count({ collection: 'crm-intake-events', where: { and: [{ processing_state: { equals: 'QUARANTINED_SPAM' } }, { received_at: { greater_than: new Date(now.getTime() - day).toISOString() } }] }, ...asUser }),
      p.count({ collection: 'crm-intake-events', where: failedPermanentWhere, ...asUser }),
    ])
    intake = { stranded: stranded.totalDocs, spam24h: spam.totalDocs, failedPermanent: gaveUp.totalDocs }
  }

  const oppIds = openOpps.docs.map((o) => String(o.id))
  // Paged, because a non-admin page is capped (access.ts); one query per 100 open tasks, never per row.
  const withTask = new Set<string>()
  for (let page = 1; oppIds.length > 0 && page <= 50; page++) {
    const res = await p.find({
      collection: 'crm-tasks',
      where: { and: [{ opportunity: { in: oppIds } }, { status: { in: ['OPEN', 'IN_PROGRESS'] } }] },
      depth: 0,
      limit: 100,
      page,
      select: { opportunity: true },
      ...asUser,
    })
    for (const t of res.docs) withTask.add(String((t as { opportunity?: unknown }).opportunity))
    if (!res.hasNextPage) break
  }

  let installedBaseAccounts: number | null
  try {
    const distinct = await (
      p as unknown as { findDistinct?: (a: unknown) => Promise<{ values: unknown[] }> }
    ).findDistinct?.({ collection: 'crm-assets', field: 'account', limit: 10_000, ...asUser })
    installedBaseAccounts = distinct
      ? distinct.values.filter((v) => v !== null && v !== undefined).length
      : null
  } catch {
    installedBaseAccounts = null // shown as "not available", never as 0
  }

  const stalledBefore = now.getTime() - STALLED_AFTER_DAYS * day
  type Opp = { id: string | number; name?: string; stage?: string; updatedAt?: string } & Economics
  const opps = openOpps.docs as unknown as Opp[]
  return {
    dataLabel: dataLabelFromEnv(),
    generatedAt: now.toISOString(),
    rfqs: { open: open.totalDocs, unassigned: unassigned.totalDocs, needsReview: needsReview.totalDocs },
    opportunitiesByStage: byStage,
    openOpportunities: openOpps.totalDocs,
    opportunitiesWithoutNextTask: opps
      .filter((o) => !withTask.has(String(o.id)))
      .map((o) => ({
        id: String(o.id),
        name: String(o.name ?? ''),
        stage: String(o.stage ?? ''),
        amount: amountDisplay(o),
      })),
    stalledOpportunities: opps
      .filter((o) => o.updatedAt && new Date(o.updatedAt).getTime() < stalledBefore)
      .map((o) => ({
        id: String(o.id),
        name: String(o.name ?? ''),
        stage: String(o.stage ?? ''),
        updatedAt: String(o.updatedAt),
      })),
    tasks: {
      dueNext7Days: dueSoon.totalDocs,
      overdue: overdue.totalDocs,
      unassigned: unassignedTasks.totalDocs,
    },
    installedBaseAccounts,
    identityReviewsOpen: reviews.totalDocs,
    intake,
    pipeline: pipelineByCurrency(opps),
    recentActivity: recent.docs.map((a) => ({
      id: String(a.id),
      type: String((a as { type?: unknown }).type),
      summary: String((a as { summary?: unknown }).summary),
      occurredAt: String((a as { occurred_at?: unknown }).occurred_at),
    })),
    truncated: openOpps.totalDocs > LIST_LIMIT,
  }
}
