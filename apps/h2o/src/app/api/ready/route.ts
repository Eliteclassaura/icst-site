import config from '@payload-config'
import { getPayload } from 'payload'
import { readEmailConfig } from '../../../email/config'
import { migrationState } from '../../../migration-state'

/**
 * Readiness (separate from liveness at /api/live). Ready when the database answers and the requested email mode can be honoured.
 * Reports states only: no names, counts, values or error text. The migration state is reported but is not part of `ready`
 * (a rolling deploy starts web before the migrate step finishes). The container HEALTHCHECK reads this route.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  let database: 'ok' | 'error' = 'ok'
  try {
    const payload = await getPayload({ config })
    await payload.find({ collection: 'users', limit: 1, depth: 0 })
  } catch {
    database = 'error'
  }
  const email = readEmailConfig()
  const emailOk = email.errors.length === 0
  const migrations = database === 'ok' ? await migrationState() : 'unknown'
  const ready = database === 'ok' && emailOk
  return new Response(
    JSON.stringify({ ready, database, migrations, email: emailOk ? email.mode : 'invalid' }),
    { status: ready ? 200 : 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
  )
}
