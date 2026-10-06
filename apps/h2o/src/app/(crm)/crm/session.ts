import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { crmSessionFor, type CrmSession } from '../../../crm/workspace/session'
import { pendingSession } from '../../../auth/mfa/guard'

/**
 * Authentication for the Sales Workspace routes. The Payload session cookie is verified by Payload itself
 * (`payload.auth`); the workspace only decides whether that user holds a CRM role (UI-1: Admin + Sales).
 *
 *   - no session  → the Payload admin login, returning here afterwards;
 *   - password-only session (two-factor not passed yet, Patch L2) → /crm/mfa/, returning here afterwards;
 *   - no CRM role → the access-denied page, which renders no CRM data.
 */
export async function currentSession(): Promise<{ signedIn: boolean; mfaPending: boolean; session: CrmSession | null }> {
  const payload = await getPayload({ config })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })
  if (user) return { signedIn: true, mfaPending: false, session: crmSessionFor(payload, user) }
  const pending = await pendingSession(payload, h)
  return { signedIn: false, mfaPending: Boolean(pending && !pending.verified), session: null }
}

export const mfaPath = (returnTo: string) => `/crm/mfa/?next=${encodeURIComponent(returnTo)}`

export async function requireCrmSession(returnTo: string): Promise<CrmSession> {
  const { signedIn, mfaPending, session } = await currentSession()
  if (!signedIn) redirect(mfaPending ? mfaPath(returnTo) : `/admin/login/?redirect=${encodeURIComponent(returnTo)}`)
  if (!session) redirect('/crm/denied/')
  return session
}

/** Server actions are reachable by direct POST: each one resolves the session again and fails closed. */
export async function actionSession(): Promise<CrmSession | null> {
  const { session } = await currentSession()
  return session
}
