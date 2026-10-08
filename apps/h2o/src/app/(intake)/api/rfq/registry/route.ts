import config from '@payload-config'
import { getPayload } from 'payload'
import { registryReply, toResponse } from '../../../../../crm/intake/native/handlers'
import { resolveSalesAddressLive } from '../../../../../email/routing-read'

/** Native RFQ intake (contract §2): the question registry. Public, cacheable, no visitor data either way. */
export const dynamic = 'force-dynamic'
export async function GET(request: Request): Promise<Response> {
  // ALERTS-1: the sales address in the confirmation line is the Settings → Email routing value (else the server default).
  const salesAddress = await resolveSalesAddressLive(await getPayload({ config }))
  return toResponse(registryReply(request, process.env, salesAddress))
}
