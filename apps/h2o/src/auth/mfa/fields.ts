import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionAfterOperationHook, CollectionBeforeChangeHook, CollectionConfig, Field, FieldAccess } from 'payload'
import { ADMINS, hasRole, isPlatformAdminUser, tierFieldAccess } from '@factory/agency-core/cms/kernel'
import { writeSecurityAudit } from './audit'
import { revokeAllDevices } from './devices'
import { purgeUserMfaRows } from './email-code'
import { isAdminUser, rolesOf } from './eligibility'

/**
 * Patch L2: two-factor state on `users` (H2O-local wrapper; the shared collection is not edited).
 *
 *   - Every TOTP field is `hidden` (never in an API response or the admin) and has no create/update access: only
 *     server code (overrideAccess) writes them, through `service.ts`.
 *   - Visible and read-only: whether two-factor is on, and since when.
 *   - `mfa_reset` (admin only; SEC-MAIN-1: a platform-admin's only by a platform-admin): ticking it and saving clears the user's enrolment, recovery codes and verified
 *     sessions — they enrol again at their next sign-in. Audited as `mfa-reset`. This is the admin reset that, with
 *     the recovery codes and the server-side break-glass script, keeps the owner from ever being locked out.
 */
const never: FieldAccess = () => false
const hiddenField = (f: Record<string, unknown>): Field =>
  ({ ...f, hidden: true, access: { create: never, read: never, update: never } }) as unknown as Field

export const MFA_STATE_FIELDS = [
  'mfa_secret',
  'mfa_pending_secret',
  'mfa_pending_at',
  'mfa_recovery',
  'mfa_last_step',
  'mfa_sessions',
  'mfa_failures',
  'mfa_locked_until',
  'mfa_stepup',
  'mfa_email_sends',
  'mfa_email_window_start',
  'mfa_email_last_sent',
] as const

/** The values that clear an enrolment (admin reset, break-glass reset). */
export const MFA_CLEARED = {
  mfa_enabled: false,
  mfa_enrolled_at: null,
  mfa_secret: null,
  mfa_pending_secret: null,
  mfa_pending_at: null,
  mfa_recovery: null,
  mfa_last_step: null,
  mfa_sessions: [],
  mfa_failures: 0,
  mfa_locked_until: null,
  mfa_stepup: null,
} as const

const resetOnRequest: CollectionBeforeChangeHook = ({ context, data, operation, originalDoc, req }) => {
  if (operation !== 'update' || !data || (data as Record<string, unknown>).mfa_reset !== true) return data
  // Field access already limits `mfa_reset` to admins; this repeats the check for any other path.
  if (!hasRole(req, ADMINS)) throw new Error('Only an admin can reset two-factor authentication.')
  if ((originalDoc as { roles?: string[] } | undefined)?.roles?.includes('platform-admin') && !isPlatformAdminUser(req)) throw new Error('Only a platform administrator can reset a platform administrator’s two-factor authentication.')
  Object.assign(data, MFA_CLEARED, { mfa_reset: false })
  context.mfaReset = true
  return data
}

/**
 * MFA-2: remembered devices die when the account's trust changes: an admin reset of two-factor, a password change, an
 * admin ticking "sign out all devices", or the user gaining an admin role (a device remembered before a promotion must
 * not carry over). Runs for every update path, including Payload's own password reset.
 */
const devicesClearOnRequest: CollectionBeforeChangeHook = ({ context, data, operation, req }) => {
  if (operation !== 'update' || !data) return data
  // A new password in this update (Payload strips it later, so it is noted here): every remembered device goes.
  const pw = (data as Record<string, unknown>).password
  if (typeof pw === 'string' && pw) context.mfaDevicesRevoke = 'password'
  if ((data as Record<string, unknown>).mfa_devices_clear !== true) return data
  if (!hasRole(req, ADMINS)) throw new Error('Only an admin can sign a user out of all remembered devices.')
  ;(data as Record<string, unknown>).mfa_devices_clear = false
  context.mfaDevicesRevoke = 'admin'
  return data
}

/**
 * MFA-ADMIN-1: (1) a role change that leaves the account with an admin role clears any two-factor exemption (the
 * enforcement also re-checks the roles, so this is the tidy-up and the audit trail); (2) `security_epoch`, a counter
 * for anything that later needs "has this account's credentials changed since...", goes up on a password change, a role
 * change and a two-factor reset (the admin actions in admin-actions.ts bump it in SQL).
 */
const exemptionAndEpoch: CollectionBeforeChangeHook = ({ context, data, operation, originalDoc }) => {
  if (operation !== 'update' || !data || !originalDoc) return data
  const d = data as Record<string, unknown>
  const o = originalDoc as Record<string, unknown>
  const before = rolesOf(o).slice().sort().join(',')
  const after = rolesOf({ roles: d.roles ?? o.roles, role: d.role ?? o.role }).slice().sort().join(',')
  const rolesChanged = before !== after
  if (rolesChanged && o.mfa_exempt === true && isAdminUser({ roles: d.roles ?? o.roles, role: d.role ?? o.role })) {
    d.mfa_exempt = false
    d.mfa_exempt_at = null
    context.mfaExemptCleared = true
  }
  const pw = d.password
  if (rolesChanged || (typeof pw === 'string' && pw) || d.mfa_reset === true) d.security_epoch = (typeof o.security_epoch === 'number' ? o.security_epoch : 0) + 1
  return data
}

const auditReset: CollectionAfterChangeHook = async ({ context, doc, operation, previousDoc, req }) => {
  if (context.mfaReset) await writeSecurityAudit(req.payload, { action: 'mfa-reset', userId: String(doc.id), actorId: req.user ? String(req.user.id) : null, detail: { by: 'admin' } })
  if (context.mfaExemptCleared) await writeSecurityAudit(req.payload, { action: 'mfa-exempt-cleared', userId: String(doc.id), actorId: req.user ? String(req.user.id) : null, detail: { why: 'promotion', from: { exempt: true }, to: { exempt: false } } })
  if (operation === 'update') {
    const why = context.mfaReset ? 'reset' : typeof context.mfaDevicesRevoke === 'string' ? context.mfaDevicesRevoke : !isAdminUser(previousDoc as never) && isAdminUser(doc as never) ? 'promotion' : null
    if (why) {
      const n = await revokeAllDevices(req.payload, doc.id)
      if (n > 0) await writeSecurityAudit(req.payload, { action: 'mfa-devices-revoked', userId: String(doc.id), actorId: req.user ? String(req.user.id) : null, detail: { why, count: n } })
    }
  }
  return doc
}

/** MFA-2: a deleted user's emailed codes and remembered devices go with them (those tables have no foreign key). */
const purgeAfterDelete: CollectionAfterDeleteHook = async ({ id, req }) => {
  await purgeUserMfaRows(req.payload, id).catch(() => undefined)
}

/** Payload's own password reset writes the new hash straight to the database (no change hooks), so it is caught here. */
const revokeAfterPasswordReset: CollectionAfterOperationHook = async ({ operation, result, req }) => {
  if (operation !== 'resetPassword') return result
  const id = (result as { user?: { id?: string | number } } | null)?.user?.id
  if (id !== undefined) {
    const n = await revokeAllDevices(req.payload, id)
    if (n > 0) await writeSecurityAudit(req.payload, { action: 'mfa-devices-revoked', userId: String(id), actorId: null, detail: { why: 'password', count: n } })
  }
  return result
}

export function withMfa(collection: CollectionConfig): CollectionConfig {
  const hooks = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...hooks,
      beforeChange: [...(hooks.beforeChange ?? []), resetOnRequest, devicesClearOnRequest, exemptionAndEpoch],
      afterChange: [...(hooks.afterChange ?? []), auditReset],
      afterOperation: [...(hooks.afterOperation ?? []), revokeAfterPasswordReset],
      afterDelete: [...(hooks.afterDelete ?? []), purgeAfterDelete],
    },
    fields: [
      ...collection.fields,
      {
        name: 'mfa_enabled',
        label: 'Two-factor on',
        type: 'checkbox',
        defaultValue: false,
        access: { create: never, update: never },
        admin: { readOnly: true, position: 'sidebar', description: 'Two-factor authentication (authenticator app). Required for everyone; set up at the first sign-in.' },
      },
      { name: 'mfa_enrolled_at', label: 'Two-factor since', type: 'date', access: { create: never, update: never }, admin: { readOnly: true, position: 'sidebar' } },
      {
        name: 'mfa_reset',
        label: 'Reset two-factor on save',
        type: 'checkbox',
        defaultValue: false,
        access: { create: never, update: tierFieldAccess },
        admin: {
          position: 'sidebar',
          description: 'Admin: tick and save to reset this person’s two-factor (lost phone, no recovery codes). They set it up again at their next sign-in. Audited.',
        },
      },
      {
        name: 'mfa_devices_clear',
        label: 'Sign out all remembered devices on save',
        type: 'checkbox',
        defaultValue: false,
        access: { create: never, update: tierFieldAccess },
        admin: { position: 'sidebar', description: 'Admin: tick and save to forget every device this person chose to remember. They enter a code again at their next sign-in. Audited.' },
      },
      // MFA-ADMIN-1: set only by an admin action (auth/mfa/admin-actions.ts), never through a form or the REST API.
      {
        name: 'mfa_exempt',
        label: 'Two-factor turned off by an admin',
        type: 'checkbox',
        defaultValue: false,
        access: { create: never, update: never },
        admin: { readOnly: true, position: 'sidebar', description: 'Set from CRM → Settings → People and sign-in. Never possible for an admin.' },
      },
      { name: 'mfa_exempt_at', label: 'Turned off on', type: 'date', access: { create: never, update: never }, admin: { readOnly: true, position: 'sidebar' } },
      hiddenField({ name: 'security_epoch', type: 'number', defaultValue: 0 }),
      hiddenField({ name: 'mfa_secret', type: 'text' }),
      hiddenField({ name: 'mfa_pending_secret', type: 'text' }),
      hiddenField({ name: 'mfa_pending_at', type: 'date' }),
      hiddenField({ name: 'mfa_recovery', type: 'json' }),
      hiddenField({ name: 'mfa_last_step', type: 'number' }),
      hiddenField({ name: 'mfa_sessions', type: 'json' }),
      hiddenField({ name: 'mfa_failures', type: 'number', defaultValue: 0 }),
      hiddenField({ name: 'mfa_locked_until', type: 'date' }),
      // Patch C: the last step-up confirmation ({ sid, at }) — a fresh code for sensitive settings (5 minutes, this session).
      hiddenField({ name: 'mfa_stepup', type: 'json' }),
      // MFA-2: the email-code send budget (3 per 15 minutes), counted in the database (email-code.ts).
      hiddenField({ name: 'mfa_email_sends', type: 'number' }),
      hiddenField({ name: 'mfa_email_window_start', type: 'date' }),
      hiddenField({ name: 'mfa_email_last_sent', type: 'date' }),
    ],
  }
}
