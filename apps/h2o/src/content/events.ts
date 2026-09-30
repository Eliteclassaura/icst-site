import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

/**
 * Durable publication events (R1B).
 *
 * Every public-affecting commit (publish, republish, unpublish, delete, redirect change, site-chrome change,
 * import) inserts one row in `h2o_publication_events` **inside the same database transaction** as the
 * change, recording `pg_current_xact_id()`. The row exists iff the change committed. A release reflects the
 * event iff the event's transaction id is visible in the release's recorded `pg_snapshot` (see ./release).
 * This replaces the R1A wall-clock `startedAt > requestedAt` test.
 */
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
type Db = { drizzle: Exec; sessions?: Record<string, { db: Exec }> }

export type EventReason = 'publish' | 'unpublish' | 'delete' | 'redirect' | 'import' | 'rebuild' | 'chrome'
const WITHDRAWING: EventReason[] = ['unpublish', 'delete']

/** The executor bound to the request's open transaction, or the pool when there is none. */
export async function executorFor(payload: Payload, req?: Partial<PayloadRequest> | null): Promise<Exec> {
  const db = payload.db as unknown as Db
  const id = req?.transactionID ? await req.transactionID : null
  if (id && db.sessions?.[String(id)]?.db) return db.sessions[String(id)]!.db
  return db.drizzle
}

export async function recordPublicationEvent(payload: Payload, req: Partial<PayloadRequest> | null, reason: EventReason, routeId: string | null, routePath: string | null = null): Promise<number> {
  const ex = await executorFor(payload, req)
  const res = await ex.execute(sql`INSERT INTO h2o_publication_events (reason, route_id, route_path, xid) VALUES (${reason}, ${routeId}, ${routePath}, pg_current_xact_id()) RETURNING seq`)
  return Number(res.rows?.[0]?.seq)
}

/** Is event `seq` reflected by a release read under `snapshot`? Unknown events are reported as not covered. */
export async function eventCovered(ex: Exec, seq: number, snapshot: string): Promise<boolean> {
  const res = await ex.execute(sql`SELECT pg_visible_in_snapshot(xid, ${snapshot}::pg_snapshot) AS v FROM h2o_publication_events WHERE seq = ${seq}`)
  return Boolean(res.rows?.[0]?.v)
}

export type PendingEvents = { count: number; oldestAt: string | null; withdrawnRouteIds: string[]; changedRouteIds: string[]; paths: Record<string, string> }

/** Committed events not reflected by the release snapshot (the publication backlog). */
export async function pendingEvents(ex: Exec, snapshot: string | null): Promise<PendingEvents> {
  const res = snapshot
    ? await ex.execute(
        sql`SELECT reason, route_id, route_path, created_at FROM h2o_publication_events WHERE NOT pg_visible_in_snapshot(xid, ${snapshot}::pg_snapshot) ORDER BY seq`,
      )
    : await ex.execute(sql`SELECT reason, route_id, route_path, created_at FROM h2o_publication_events ORDER BY seq`)
  const rows = res.rows ?? []
  return {
    count: rows.length,
    oldestAt: rows[0] ? new Date(String(rows[0].created_at)).toISOString() : null,
    withdrawnRouteIds: [...new Set(rows.filter((r) => WITHDRAWING.includes(String(r.reason) as EventReason) && r.route_id).map((r) => String(r.route_id)))],
    changedRouteIds: [...new Set(rows.filter((r) => r.route_id).map((r) => String(r.route_id)))],
    paths: Object.fromEntries(rows.filter((r) => r.route_id && r.route_path).map((r) => [String(r.route_id), String(r.route_path)])),
  }
}

export async function maxVisibleSeq(ex: Exec): Promise<number> {
  const res = await ex.execute(sql`SELECT COALESCE(MAX(seq), 0) AS m FROM h2o_publication_events`)
  return Number(res.rows?.[0]?.m ?? 0)
}
