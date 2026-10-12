import config from '@payload-config'
import { getPayload } from 'payload'
import { crmSessionFor, type CrmSession } from '../workspace/session'
import { attachmentStoreFromEnv, StorageError, type AttachmentStore } from './store'

/** Shared by the attachment routes: the signed-in CRM session, the same-origin check and the configured store. */

export async function sessionFromRequest(request: Request): Promise<CrmSession | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  return user ? crmSessionFor(payload, user) : null
}

/** Browsers send Sec-Fetch-Site on every request. Cross-site requests are refused; "none" is a typed or bookmarked URL. */
export function sameOriginOnly(request: Request, allowNone = false): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (!site) return true
  return site === 'same-origin' || (allowNone && site === 'none')
}

/** The store the environment selects. A misconfigured store is a 503 with a code, never a partial write. */
export function storeFromEnv(): { store: AttachmentStore | null; error: StorageError | null } {
  try {
    return { store: attachmentStoreFromEnv(process.env), error: null }
  } catch (err) {
    return { store: null, error: err instanceof StorageError ? err : new StorageError('STORAGE_NOT_CONFIGURED') }
  }
}

export const NO_STORE = { 'cache-control': 'private, no-store' } as const

export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE } })
}
