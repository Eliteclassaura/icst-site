import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

/**
 * Atomic processing claim for an intake event.
 *
 * Two deliveries of the same Typeform event can arrive at the same moment (Typeform retries, a proxy
 * replay). Only one may process it. The winner is decided by a single conditional `UPDATE … RETURNING`,
 * which Postgres executes atomically per row — no read-then-write window. A claim is a lease: if the
 * process holding it dies, the lease expires and a later retry may claim it and finish the work (every
 * processing step is idempotent, so finishing twice cannot duplicate anything).
 *
 * This is the only raw SQL in CRM-1. It touches two operational columns of `crm_intake_events` and nothing
 * else; every other write goes through Payload and its hooks.
 */
export const LEASE_MS = 5 * 60_000

type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
const db = (payload: Payload): Exec => (payload.db as unknown as { drizzle: Exec }).drizzle

export async function claimForProcessing(
  payload: Payload,
  intakeId: string,
  now = new Date(),
): Promise<boolean> {
  const until = new Date(now.getTime() + LEASE_MS).toISOString()
  const res = await db(payload).execute(
    sql`UPDATE "crm_intake_events"
        SET "processing_state" = 'PROCESSING', "processing_lease_until" = ${until}
        WHERE "id" = ${intakeId}
          AND ("processing_state" = 'FAILED_RETRYABLE'
               OR ("processing_state" = 'PROCESSING' AND ("processing_lease_until" IS NULL OR "processing_lease_until" < ${now.toISOString()})))
        RETURNING "id"`,
  )
  return (res.rows ?? []).length === 1
}

/** Diagnostic replay counter, incremented atomically (no lost updates under concurrent replays). */
export async function recordReplay(payload: Payload, intakeId: string, at: Date): Promise<void> {
  await db(payload).execute(
    sql`UPDATE "crm_intake_events" SET "replay_count" = "replay_count" + 1, "last_replay_at" = ${at.toISOString()} WHERE "id" = ${intakeId}`,
  )
}
