import type { Payload, PayloadRequest } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { isOffice, OFFICE_TIME_ZONE, type Office } from '../offices'
import { officeSettings } from '../officeSettings'
import { isTimeZone, type BusinessCalendar } from './time'

/**
 * The Sales Workspace session: an authenticated Payload user holding a CRM role (UI-1: Admin + Sales).
 *
 * Every workspace read and write runs **as this user** with `overrideAccess: false`, so Payload access
 * control and the CRM-1 hooks remain the authority. The workspace adds checks; it never replaces them.
 */
export type CrmSession = {
  payload: Payload
  user: Record<string, unknown> & { id: string | number }
  userId: string
  isAdmin: boolean
  displayName: string
  /** Patch L1: the user's office (queue and quick-date calendar) and the zone their times are shown in. */
  office: Office
  timeZone: string
}

const asReq = (user: unknown) => ({ user }) as unknown as PayloadRequest

export function crmSessionFor(payload: Payload, user: unknown): CrmSession | null {
  if (!user || typeof user !== 'object' || !('id' in user)) return null
  const req = asReq(user)
  if (!hasRole(req, CRM_USERS)) return null
  const u = user as CrmSession['user']
  const office: Office = isOffice(u.crm_office) ? u.crm_office : 'US'
  return {
    payload,
    user: u,
    userId: String(u.id),
    isAdmin: hasRole(req, ADMINS),
    displayName: displayNameOf(u),
    office,
    timeZone: isTimeZone(u.time_zone) ? (u.time_zone as string) : OFFICE_TIME_ZONE[office],
  }
}

/** The viewer's business calendar: their display zone, with their office's holidays. */
export async function viewerCalendar(s: CrmSession): Promise<BusinessCalendar> {
  return { zone: s.timeZone, holidays: (await officeSettings(s.payload)).holidays[s.office] }
}

/** Access-on options for Local API calls made on the user's behalf. */
export const asUser = (s: CrmSession) => ({ user: s.user as never, overrideAccess: false as const })

/** A person's name as shown in the workspace. Emails are never used as a display fallback. */
export function displayNameOf(user: unknown): string {
  const name = (user as { name?: unknown } | null)?.name
  if (typeof name === 'string' && name.trim()) return name.trim()
  const id = String((user as { id?: unknown } | null)?.id ?? '')
  return id ? `CRM user ${id.slice(0, 4)}` : 'CRM user'
}
