import config from '@payload-config'
import { getPayload } from 'payload'
import { applyImport, planImport, planView } from '../../../../../crm/import/engine'
import { crmSessionFor } from '../../../../../crm/workspace/session'

/**
 * Wave 1 W1-3 import endpoint: `POST /crm/import/run/` with `{ mode: 'dry' | 'apply', csv, mapping, options, expected }`.
 *
 * A route handler rather than a server action because a 5 MB file exceeds the server-action body limit.
 *   - Admin only: the Payload session is verified by Payload, then the CRM role is checked; anything else is 403.
 *   - Same-origin only (CSRF): a cross-site request is refused before the body is read.
 *   - `dry` returns the plan (counts + per-row outcomes) and writes nothing.
 *   - `apply` streams NDJSON progress lines and then the result, so a long load never waits on a proxy timeout.
 *   - The body is never logged, and errors never echo a value from the file.
 */
export const dynamic = 'force-dynamic'
const MAX_BODY = 12 * 1024 * 1024 // a 5 MB CSV can roughly double when JSON-escaped

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  const site = request.headers.get('sec-fetch-site')
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if ((site && site !== 'same-origin') || (origin && host && new URL(origin).host !== host)) return json(403, { ok: false, code: 'CROSS_SITE', message: 'Refused.' })
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  const s = user ? crmSessionFor(payload, user) : null
  if (!s || !s.isAdmin) return json(403, { ok: false, code: 'FORBIDDEN', message: 'Only an admin can import contacts.' })
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > MAX_BODY) return json(413, { ok: false, code: 'TOO_LARGE', message: 'The file is larger than 5 MB.' })
  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > MAX_BODY) return json(413, { ok: false, code: 'TOO_LARGE', message: 'The file is larger than 5 MB.' })
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return json(400, { ok: false, code: 'BAD_REQUEST', message: 'The request could not be read.' })
  }
  if (typeof body.csv !== 'string') return json(400, { ok: false, code: 'BAD_REQUEST', message: 'No file content.' })

  if (body.mode === 'dry') {
    const out = await planImport(s, body.csv, body.mapping, body.options)
    if ('error' in out) return json(422, { ok: false, ...out.error })
    return json(200, { ok: true, plan: planView(out.plan) })
  }
  if (body.mode !== 'apply') return json(400, { ok: false, code: 'BAD_REQUEST', message: 'Unknown mode.' })

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (x: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(x)}\n`))
      let last = -1
      try {
        const result = await applyImport(s, body.csv as string, body.mapping, body.options, body.expected, (p) => {
          if (p.done === p.total || p.done - last >= 50) {
            last = p.done
            send({ type: 'progress', ...p })
          }
        })
        send({ type: 'result', ...result })
      } catch (err) {
        // Code only: an error object can carry a row's values.
        send({ type: 'result', ok: false, code: 'APPLY_FAILED', message: 'The import stopped. Applied batches are listed below and can be undone.', error: (err as Error)?.name ?? 'Error' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
}
