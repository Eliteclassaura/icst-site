import { registryReply, toResponse } from '../../../../../crm/intake/native/handlers'

/** Native RFQ intake (contract §2): the question registry. Public, cacheable, no visitor data either way. */
export const dynamic = 'force-dynamic'
export async function GET(request: Request): Promise<Response> {
  return toResponse(registryReply(request))
}
