import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { releaseReadiness } from '../../../../content/release'
import { pendingEvents } from '../../../../content/events'
import { rfqConfigState } from '../../../../content/rfq-config'
import { emailConfigState, readEmailConfig, readInboundConfig } from '../../../../email/config'
import { emailReadiness } from '../../../../email/profiles'

/**
 * Readiness (separate from liveness at /api/live). R1B (Control Tower F6): in payload content mode the
 * process is ready only when the database answers, the active **release** (content generation + search
 * generation + manifest, one pointer) validates as a coherent pair, and the RFQ adapter configuration
 * resolves. `publication` reports whether that release reflects every committed public change: `current`,
 * `backlog` (changes pending; withdrawals are already revoked per request), or `failed` (the last build
 * failed and changes are pending). A backlog/failure does not make a web replica unready — it keeps serving
 * the last coherent release with revocations applied — but it is visible to the operator. Only coarse
 * states: no hostnames, versions, counts, paths or error text.
 */
export const dynamic = 'force-dynamic'
type Exec = { execute: (q: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }> }
export async function GET() {
  const checks: Record<string, string> = {}
  let ex: Exec | null = null
  let payload: Awaited<ReturnType<typeof getPayload>> | null = null
  try {
    payload = await getPayload({ config })
    ex = (payload.db as unknown as { drizzle: Exec }).drizzle
    await ex.execute(sql`select 1`)
    checks.database = 'ok'
  } catch {
    checks.database = 'fail'
  }
  let publication: 'current' | 'backlog' | 'failed' | 'unknown' = 'unknown'
  if (process.env.H2O_CONTENT_SOURCE === 'payload') {
    const r = releaseReadiness()
    checks.release = r.ok ? 'ok' : 'fail'
    if (!r.ok) checks.releaseReason = r.reason
    checks.rfq = rfqConfigState()
    if (r.ok && ex && checks.database === 'ok') {
      try {
        const pend = await pendingEvents(ex, r.release.pgSnapshot)
        if (!pend.count) publication = 'current'
        else {
          const st = (await payload!.findGlobal({ slug: 'publication-state' as never, depth: 0, overrideAccess: true }).catch(() => null)) as { state?: string } | null
          publication = st?.state === 'FAILED' ? 'failed' : 'backlog'
        }
      } catch {
        publication = 'unknown'
      }
    }
  }
  // CRM email M1: `off` is a ready state; a requested mode that cannot be honoured (missing sender,
  // credentials, TLS name, empty allowlist…) is not — it would silently send nothing.
  // Patch C: the transport may come from the active CRM sending profile, so readiness resolves it (codes only).
  checks.email = payload ? await emailReadiness(payload, readEmailConfig()) : emailConfigState()
  // CRM email M3: inbound replies are optional (off is ready); requested but misconfigured is not.
  const inbound = readInboundConfig()
  checks.emailInbound = inbound.errors.length > 0 ? 'fail' : inbound.enabled ? 'ok' : 'off'
  const ready =
    ['database', 'release', 'rfq'].every((k) => !(k in checks) || checks[k] === 'ok') && checks.email !== 'fail' && checks.emailInbound !== 'fail'
  return Response.json(
    { status: ready ? 'ready' : 'not-ready', checks, ...(process.env.H2O_CONTENT_SOURCE === 'payload' ? { publication } : {}) },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
