/**
 * Liveness only: the process is up and serving. It deliberately does not touch the database — a
 * liveness probe that fails when Postgres blinks causes a restart loop instead of reporting a
 * degraded dependency. Readiness (which does check the database and storage) arrives with the
 * catalog increment, alongside the /api/health contract the Factory already asserts for syed-ai.
 */
export const dynamic = 'force-dynamic'
export function GET() {
  return Response.json({ status: 'live' })
}
