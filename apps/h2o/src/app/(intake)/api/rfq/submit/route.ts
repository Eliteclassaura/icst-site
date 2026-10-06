import config from '@payload-config'
import { getPayload } from 'payload'
import { submitReply, toResponse } from '../../../../../crm/intake/native/handlers'

/**
 * Native RFQ intake (contract §4): submit. Same-origin only; persists the intake event and the RFQ on the canonical
 * path before anything is notified; idempotent per submission id. See crm/intake/native/handlers.ts.
 */
export const dynamic = 'force-dynamic'
export async function POST(request: Request): Promise<Response> {
  try {
    return toResponse(await submitReply(await getPayload({ config }), request))
  } catch (err) {
    // Code only: an error can carry submitted values. A retry with the same submission id is always safe.
    ;(await getPayload({ config })).logger.error({ scope: 'crm.intake.native', code: 'NATIVE_HANDLER_ERROR', errName: (err as Error)?.name })
    return toResponse({ status: 500, body: { ok: false, code: 'SERVER' }, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }
}
