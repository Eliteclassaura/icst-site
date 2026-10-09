import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest, Where } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { amountDisplay, type Economics, type pipelineByCurrency } from './economics'
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
  /** SEND-FIX-1a.1 (owner decision), OVERVIEW-FIX-1 (review L03): admins only. `needsAttention` and the list the card opens
   * use one predicate (email/attention.ts); `handledByResend` are internal alerts whose one resend the server accepted. */
  emailUncertain: { needsAttention: number; handledByResend: number } | null
  /** SHEET-SYNC-1: admins only, and only while the Google Sheet feature is configured — website RFQs not yet in the sheet. */
  sheet: { failed: number; pending: number } | null
  /** OVERVIEW-FIX-1 (review L02): over EVERY open opportunity (not the bounded list), summed exactly in SQL. */
  pipeline: ReturnType<typeof pipelineByCurrency>
  recentActivity: Array<{ id: string; type: string; summary: string; occurredAt: string }>
  truncated: boolean
}

type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }

/**
 * OVERVIEW-FIX-1 (CRM review L02): the open pipeline over the FULL open set, per native currency, in one SQL query;
 * only the detail lists stay bounded. A value counts when its status is KNOWN with an amount and a currency (as
 * `pipelineByCurrency`); everything else is counted as unknown, never summed as 0. Sums are exact (numeric).
 * Scope: crm-opportunities is readable by every CRM user with no row or field restriction (crmCollectionAccess.read =
 * crmUser; a test pins it), and the overview is only built for CRM users, so this is the viewer's authorized set.
 */
export async function openPipeline(p: Payload): Promise<ReturnType<typeof pipelineByCurrency>> {
  const terminal = sql.join(TERMINAL_STAGES.map((s) => sql`${s}`), sql`, `)
  const res = await (p.db as unknown as { drizzle: Exec }).drizzle.execute(
    sql`WITH o AS (
          SELECT COALESCE("amount_status"::text = 'KNOWN' AND "amount" IS NOT NULL AND COALESCE("currency", '') <> '', false) AS known, "currency", "amount"
          FROM "crm_opportunities" WHERE "stage"::text NOT IN (${terminal}))
        SELECT CASE WHEN known THEN "currency" END AS currency, count(*)::int AS n,
               (sum("amount") FILTER (WHERE known))::text AS total, (count(*) FILTER (WHERE known AND "amount" = 0))::int AS zeros
        FROM o GROUP BY 1`,
  )
  const out: ReturnType<typeof pipelineByCurrency> = { byCurrency: {}, unknownValueCount: 0, explicitZeroCount: 0 }
  for (const r of res.rows ?? []) {
    if (r.currency == null) {
      out.unknownValueCount += Number(r.n)
      continue
    }
    out.byCurrency[String(r.currency)] = { total: Number(r.total), count: Number(r.n) }
    out.explicitZeroCount += Number(r.zeros)
  }
  return out
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
  let emailUncertain: Overview['emailUncertain'] = null
  if (hasRole(req, ADMINS)) {
    const { failedPermanentWhere, strandedWhere } = await import('./intake/native/sweep')
    const [stranded, spam, gaveUp] = await Promise.all([
      p.count({ collection: 'crm-intake-events', where: strandedWhere(now, true), ...asUser }),
      p.count({ collection: 'crm-intake-events', where: { and: [{ processing_state: { equals: 'QUARANTINED_SPAM' } }, { received_at: { greater_than: new Date(now.getTime() - day).toISOString() } }] }, ...asUser }),
      p.count({ collection: 'crm-intake-events', where: failedPermanentWhere, ...asUser }),
    ])
    intake = { stranded: stranded.totalDocs, spam24h: spam.totalDocs, failedPermanent: gaveUp.totalDocs }
    const ow = await import('../email/outbox-worker')
    const [needsAttention, handledByResend] = await Promise.all([ow.uncertainNeedingAttention(p), ow.uncertainHandledByResend(p)])
    emailUncertain = { needsAttention, handledByResend }
  }

  let sheet: Overview['sheet'] = null
  if (hasRole(req, ADMINS)) {
    const [{ readSheetsConfig }, { sheetStats }] = await Promise.all([import('../sheets/config'), import('../sheets/sync')])
    if (readSheetsConfig().enabled) sheet = await sheetStats(p).catch(() => null)
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
    emailUncertain,
    sheet,
    pipeline: await openPipeline(p),
    recentActivity: recent.docs.map((a) => ({
      id: String(a.id),
      type: String((a as { type?: unknown }).type),
      summary: String((a as { summary?: unknown }).summary),
      occurredAt: String((a as { occurred_at?: unknown }).occurred_at),
    })),
    truncated: openOpps.totalDocs > LIST_LIMIT,
  }
}
