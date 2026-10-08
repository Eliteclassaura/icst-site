import { ADMINS } from '@factory/agency-core/cms/kernel'

/**
 * MFA-2: who may use an email one-time code and "remember this device".
 *
 * Rule: eligible ONLY if the user has at least one role and NONE of their roles is an admin role (the shared ADMINS
 * list: platform-admin, client-admin). Multi-role: sales + client-admin is NOT eligible. Fail closed: no roles → no.
 * There is no setting, field or flag that can change this; admins stay on the authenticator app.
 */
export const ADMIN_ROLES: readonly string[] = Object.freeze([...ADMINS])

type RoleUser = Record<string, unknown> | null | undefined

export function rolesOf(u: RoleUser): string[] {
  if (!u) return []
  const raw: unknown[] = Array.isArray(u.roles) ? [...u.roles] : []
  if (typeof u.role === 'string') raw.push(u.role)
  return raw.filter((r): r is string => typeof r === 'string').map((r) => r.trim().toLowerCase()).filter(Boolean)
}

export function isAdminUser(u: RoleUser): boolean {
  return rolesOf(u).some((r) => ADMIN_ROLES.includes(r))
}

export function emailCodeEligible(u: RoleUser): boolean {
  const roles = rolesOf(u)
  return roles.length > 0 && !roles.some((r) => ADMIN_ROLES.includes(r))
}

/**
 * MFA-ADMIN-1: who an admin may exempt from two-factor. Same rule as the email-code eligibility: at least one role and
 * no admin role. Checked when the exemption is granted AND every time a session is judged (service.ts), so an account
 * that is later promoted to an admin role stops being exempt even if the stored flag is somehow still set.
 */
export function mayBeExempt(u: RoleUser): boolean {
  return emailCodeEligible(u)
}

/** True when this account is currently exempt from two-factor: the flag is set AND the account is still eligible. */
export function isExempt(u: RoleUser): boolean {
  return Boolean(u) && (u as Record<string, unknown>).mfa_exempt === true && mayBeExempt(u)
}
