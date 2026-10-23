import { Pool } from 'pg'
import { migrations } from './migrations'

/**
 * Coarse migration state for readiness (port of 1.3c-9b, M7). `ok`: every migration this image ships is recorded in the database;
 * `pending`: at least one is not (the migrate step did not run); `unknown`: the check did not answer within the deadline or failed.
 * Names, counts and error text are never returned. The answer is reported, not gated on: a rolling deploy starts web before migrate finishes.
 */
export const MIGRATION_STATE_TIMEOUT_MS = 1000
export type MigrationState = 'ok' | 'pending' | 'unknown'

let pool: Pool | null = null
function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URI, max: 1 })
    pool.on('error', () => undefined) // an idle-client error must not crash the process; the next check reports `unknown`
  }
  return pool
}

export async function migrationState(timeoutMs: number = MIGRATION_STATE_TIMEOUT_MS): Promise<MigrationState> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<MigrationState>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), timeoutMs)
  })
  const check = (async (): Promise<MigrationState> => {
    const res = await db().query<{ name: string }>('select name from payload_migrations')
    const recorded = new Set(res.rows.map((r) => r.name))
    return migrations.every((m) => recorded.has(m.name)) ? 'ok' : 'pending'
  })().catch((): MigrationState => 'unknown')
  try {
    return await Promise.race([check, deadline])
  } finally {
    clearTimeout(timer)
  }
}
