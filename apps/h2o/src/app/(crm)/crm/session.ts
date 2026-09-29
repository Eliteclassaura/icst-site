import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { crmSessionFor, type CrmSession } from '../../../crm/workspace/session'

/**
 * Authentication for the Sales Workspace routes. The Payload session cookie is verified by Payload itself
 * (`payload.auth`); the workspace only decides whether that user holds a CRM role (UI-1: Admin + Sales).
 *
 *   - no session  → the Payload admin login, returning here afterwards;
 *   - no CRM role → the access-denied page, which renders no CRM data.
 */
export async function currentSession(): Promise<{ signedIn: boolean; session: CrmSession | null }> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  return { signedIn: Boolean(user), session: user ? crmSessionFor(payload, user) : null }
}

export async function requireCrmSession(returnTo: string): Promise<CrmSession> {
  const { signedIn, session } = await currentSession()
  if (!signedIn) redirect(`/admin/login/?redirect=${encodeURIComponent(returnTo)}`)
  if (!session) redirect('/crm/denied/')
  return session
}

/** Server actions are reachable by direct POST: each one resolves the session again and fails closed. */
export async function actionSession(): Promise<CrmSession | null> {
  const { session } = await currentSession()
  return session
}
