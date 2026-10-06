import config from '@payload-config'
import { getPayload } from 'payload'
import { tokenReply, toResponse } from '../../../../../crm/intake/native/handlers'

/** Native RFQ intake (contract §3): a signed timing token (no visitor data), rate-limited per client. */
export const dynamic = 'force-dynamic'
export async function GET(request: Request): Promise<Response> {
  return toResponse(await tokenReply(await getPayload({ config }), request))
}
