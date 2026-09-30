import type { GlobalConfig, JobsConfig, Payload, TaskConfig } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { isPublishingRunner } from './config'
import { PUBLISHING_QUEUE, SYNC_TASK } from './publishing'
import { eventCovered, maxVisibleSeq, pendingEvents } from './events'
import { contentDirOf, currentRelease, fault, PROJECTION_VERSION, promoteRelease, pruneReleases, validateRelease, type ReleaseManifest } from './release'
import { buildSearchCandidate } from './search-index'
import { buildContentCandidate } from './snapshot'

/**
 * The single publishing/indexing runner (R1B coherent-release protocol; Control Tower F4).
 *
 * One queue (`publishing`), one task (`publishingSync`). Each job carries the sequence number of the committed
 * publication event it was queued with (./events). The protocol:
 *
 *   1. **Covered?** If the promoted, fully validated release's `pgSnapshot` makes the job's event transaction
 *      visible, the change is reflected: record status, return `ALREADY_REFLECTED`. Wall-clock times are not
 *      used. A partially completed earlier attempt (content built, search failed, nothing promoted) leaves the
 *      old release in place, which does not cover the event, so a retry of the same job rebuilds.
 *   2. **Serialise.** Take a transaction-scoped advisory lock and *wait* for it (bounded by `lock_timeout`; a
 *      timeout throws, so the job retries). A job that waited re-checks coverage first. R1A's `SKIPPED_LOCKED`
 *      completed without reflecting a commit that landed after the winner's read; it no longer exists.
 *   3. **One snapshot.** Open a REPEATABLE READ, read-only transaction, record `pg_current_snapshot()`, and read
 *      every input of the content candidate inside it (./snapshot).
 *   4. **Candidates, then one promotion.** Build the content candidate, then the search candidate from it, both
 *      unreferenced. `promoteRelease` validates the pair and swaps the single release pointer. Only then are
 *      generations outside the retained releases pruned.
 *   5. **Status last.** The admin-only `publication-state` global mirrors the outcome. A failed status write
 *      makes the job fail and retry; the retry finds its event covered and rewrites the status.
 *
 * A crash between any two steps leaves either the previous release (steps 1–4) or the new release (after 4)
 * serving, never a mismatched pair. Unreferenced candidate directories are removed by the next prune.
 * `reconcilePending` re-queues a job whenever committed events are unreflected and no job is outstanding
 * (for example after a job exhausted its retries).
 */
type Out = { outcome: string; release: string | null; generation: string | null; search: string | null; records: number }
const LOCK_KEY = 0x48324f31 // 'H2O1'
export const LOCK_TIMEOUT = '120s'

type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
type Tx = { transaction: <T>(fn: (tx: Exec) => Promise<T>) => Promise<T> } & Exec
type Db = {
  drizzle: Tx
  sessions: Record<string, { db: Exec }>
  beginTransaction: (o?: unknown) => Promise<string | number>
  commitTransaction: (id: string | number) => Promise<void>
  rollbackTransaction: (id: string | number) => Promise<void>
}

async function covers(ex: Exec, m: ReleaseManifest | null, eventSeq: number | null): Promise<boolean> {
  if (!m || eventSeq == null) return false
  try {
    if (!validateRelease(m).ok) return false
  } catch {
    return false // an unreadable release/configuration covers nothing; the build below reports the error
  }
  return eventCovered(ex, eventSeq, m.pgSnapshot)
}

async function writeStatus(payload: Payload, ex: Exec, m: ReleaseManifest | null, error: string | null): Promise<void> {
  const pend = await pendingEvents(ex, m?.pgSnapshot ?? null)
  fault('status-write')
  await payload.updateGlobal({
    slug: 'publication-state' as never,
    data: {
      ...(m ? { releaseId: m.id, snapshotGeneration: m.content, snapshotAt: m.builtAt, searchGeneration: m.search, searchAt: m.builtAt, searchRecords: m.searchRecords, releaseMaxEventSeq: m.maxEventSeq } : {}),
      pendingEvents: pend.count,
      state: error ? 'FAILED' : pend.count ? 'BACKLOG' : 'CURRENT',
      ...(error ? { lastError: error.slice(0, 500), lastErrorAt: new Date().toISOString() } : { lastError: null, lastErrorAt: null }),
    } as never,
    overrideAccess: true,
  })
}

export async function runPublishingSync(payload: Payload, eventSeq: number | null): Promise<Out> {
  const db = payload.db as unknown as Db
  const pool = db.drizzle
  const active = currentRelease()
  if (await covers(pool, active, eventSeq)) {
    await writeStatus(payload, pool, active, null)
    return { outcome: 'ALREADY_REFLECTED', release: active!.id, generation: active!.content, search: active!.search, records: active!.searchRecords }
  }
  return pool.transaction(async (lockTx) => {
    await lockTx.execute(sql.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`))
    await lockTx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`)
    const now = currentRelease()
    if (await covers(pool, now, eventSeq)) {
      await writeStatus(payload, pool, now, null)
      return { outcome: 'ALREADY_REFLECTED_AFTER_WAIT', release: now!.id, generation: now!.content, search: now!.search, records: now!.searchRecords }
    }
    try {
      const previous = now && validateRelease(now).ok ? now : null
      const txId = await db.beginTransaction({ isolationLevel: 'repeatable read', accessMode: 'read only' })
      let content: Awaited<ReturnType<typeof buildContentCandidate>>
      let pgSnapshot: string
      let maxEventSeq: number
      try {
        const session = db.sessions[String(txId)]!.db
        pgSnapshot = String((await session.execute(sql`SELECT pg_current_snapshot()::text AS s`)).rows?.[0]?.s)
        maxEventSeq = await maxVisibleSeq(session)
        content = await buildContentCandidate(payload, { transactionID: txId }, pgSnapshot, previous ? contentDirOf(previous) : null)
        await db.commitTransaction(txId)
      } catch (err) {
        await db.rollbackTransaction(txId).catch(() => undefined)
        throw err
      }
      fault('after-content-candidate')
      const search = await buildSearchCandidate(content.dir)
      const m = promoteRelease({
        content: content.manifest.id, search: search.id, pgSnapshot, maxEventSeq, projectionVersion: PROJECTION_VERSION,
        documents: content.manifest.documents, searchRecords: search.records,
      })
      pruneReleases()
      await writeStatus(payload, pool, m, null)
      return { outcome: 'PROMOTED', release: m.id, generation: m.content, search: m.search, records: m.searchRecords }
    } catch (err) {
      let active: ReleaseManifest | null
      try {
        active = currentRelease()
      } catch {
        active = null
      }
      await writeStatus(payload, pool, active, String((err as Error).message ?? err)).catch(() => undefined)
      throw err
    }
  })
}

/**
 * Self-healing backlog check (runner only): if committed events are not reflected by the active release and no
 * publishing job is queued or running, queue one for the newest pending event.
 */
export async function reconcilePending(payload: Payload): Promise<'NONE' | 'QUEUED' | 'OUTSTANDING'> {
  const pool = (payload.db as unknown as Db).drizzle
  const m = currentRelease()
  const pend = await pendingEvents(pool, m && validateRelease(m).ok ? m.pgSnapshot : null)
  if (!pend.count) return 'NONE'
  const open = await payload.count({
    collection: 'payload-jobs' as never,
    where: { and: [{ taskSlug: { equals: SYNC_TASK } }, { completedAt: { exists: false } }, { hasError: { not_equals: true } }] } as never,
    overrideAccess: true,
  })
  if (open.totalDocs > 0) return 'OUTSTANDING'
  const seq = await maxVisibleSeq(pool)
  await payload.jobs.queue({ task: SYNC_TASK, queue: PUBLISHING_QUEUE, input: { reason: 'rebuild', routeId: null, requestedAt: new Date().toISOString(), eventSeq: seq } } as never)
  return 'QUEUED'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const publishingSyncTask: TaskConfig<any> = {
  slug: SYNC_TASK,
  retries: 3,
  inputSchema: [
    { name: 'reason', type: 'text' },
    { name: 'routeId', type: 'text' },
    { name: 'requestedAt', type: 'text' },
    { name: 'eventSeq', type: 'number' },
  ],
  outputSchema: [
    { name: 'outcome', type: 'text' },
    { name: 'release', type: 'text' },
    { name: 'generation', type: 'text' },
    { name: 'search', type: 'text' },
    { name: 'records', type: 'number' },
  ],
  handler: async ({ input, req }: { input: unknown; req: { payload: Payload } }) => {
    const seq = (input as { eventSeq?: number | null }).eventSeq
    const out = await runPublishingSync(req.payload, typeof seq === 'number' ? seq : null)
    return { output: out }
  },
} as never

const adminsOnly = ({ req }: { req: { user?: unknown } }) => hasRole(req as never, ADMINS)

export const jobsConfig: JobsConfig = {
  tasks: [publishingSyncTask],
  // Only the queue this bridge needs. Email and every other queue remain inactive.
  autoRun: [{ cron: '*/10 * * * * *', queue: PUBLISHING_QUEUE, limit: 5 }],
  shouldAutoRun: () => isPublishingRunner(),
  deleteJobOnComplete: false,
  // The default lets any logged-in user queue/run/cancel jobs through the REST endpoints.
  access: { queue: adminsOnly as never, run: adminsOnly as never, cancel: adminsOnly as never },
  jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
    ...defaultJobsCollection,
    admin: { ...(defaultJobsCollection.admin ?? {}), hidden: false, group: 'Website' },
    access: { ...(defaultJobsCollection.access ?? {}), read: adminsOnly as never, update: () => false, delete: () => false, create: () => false },
  }),
}

/** Observable publishing state (read by admins and the readiness probe; written by the runner only). */
export const PublicationState: GlobalConfig = {
  slug: 'publication-state',
  label: 'Publishing status',
  admin: { group: 'Website', description: 'Written by the publishing runner. Read-only.' },
  access: { read: adminsOnly as never, update: () => false },
  fields: [
    { name: 'state', type: 'select', options: ['CURRENT', 'BACKLOG', 'FAILED'], admin: { readOnly: true } },
    { name: 'releaseId', type: 'text', admin: { readOnly: true } },
    { name: 'releaseMaxEventSeq', type: 'number', admin: { readOnly: true } },
    { name: 'pendingEvents', type: 'number', admin: { readOnly: true } },
    { name: 'snapshotGeneration', type: 'text', admin: { readOnly: true } },
    { name: 'snapshotAt', type: 'date', admin: { readOnly: true } },
    { name: 'searchGeneration', type: 'text', admin: { readOnly: true } },
    { name: 'searchAt', type: 'date', admin: { readOnly: true } },
    { name: 'searchRecords', type: 'number', admin: { readOnly: true } },
    { name: 'lastError', type: 'text', admin: { readOnly: true } },
    { name: 'lastErrorAt', type: 'date', admin: { readOnly: true } },
  ],
}
