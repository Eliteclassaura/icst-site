import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, Field, FieldAccess } from 'payload'
import { ADMINS, hasRole } from '@factory/agency-core/cms/kernel'
import { writeSecurityAudit } from './audit'

/**
 * Patch L2: two-factor state on `users` (H2O-local wrapper; the shared collection is not edited).
 *
 *   - Every TOTP field is `hidden` (never in an API response or the admin) and has no create/update access: only
 *     server code (overrideAccess) writes them, through `service.ts`.
 *   - Visible and read-only: whether two-factor is on, and since when.
 *   - `mfa_reset` (admin only): ticking it and saving clears the user's enrolment, recovery codes and verified
 *     sessions — they enrol again at their next sign-in. Audited as `mfa-reset`. This is the admin reset that, with
 *     the recovery codes and the server-side break-glass script, keeps the owner from ever being locked out.
 */
const never: FieldAccess = () => false
const adminOnly: FieldAccess = ({ req }) => hasRole(req, ADMINS)
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
} as const

const resetOnRequest: CollectionBeforeChangeHook = ({ context, data, operation, req }) => {
  if (operation !== 'update' || !data || (data as Record<string, unknown>).mfa_reset !== true) return data
  // Field access already limits `mfa_reset` to admins; this repeats the check for any other path.
  if (!hasRole(req, ADMINS)) throw new Error('Only an admin can reset two-factor authentication.')
  Object.assign(data, MFA_CLEARED, { mfa_reset: false })
  context.mfaReset = true
  return data
}

const auditReset: CollectionAfterChangeHook = async ({ context, doc, req }) => {
  if (context.mfaReset) await writeSecurityAudit(req.payload, { action: 'mfa-reset', userId: String(doc.id), actorId: req.user ? String(req.user.id) : null, detail: { by: 'admin' } })
  return doc
}

export function withMfa(collection: CollectionConfig): CollectionConfig {
  const hooks = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...hooks,
      beforeChange: [...(hooks.beforeChange ?? []), resetOnRequest],
      afterChange: [...(hooks.afterChange ?? []), auditReset],
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
        access: { create: never, update: adminOnly },
        admin: {
          position: 'sidebar',
          description: 'Admin: tick and save to reset this person’s two-factor (lost phone, no recovery codes). They set it up again at their next sign-in. Audited.',
        },
      },
      hiddenField({ name: 'mfa_secret', type: 'text' }),
      hiddenField({ name: 'mfa_pending_secret', type: 'text' }),
      hiddenField({ name: 'mfa_pending_at', type: 'date' }),
      hiddenField({ name: 'mfa_recovery', type: 'json' }),
      hiddenField({ name: 'mfa_last_step', type: 'number' }),
      hiddenField({ name: 'mfa_sessions', type: 'json' }),
      hiddenField({ name: 'mfa_failures', type: 'number', defaultValue: 0 }),
      hiddenField({ name: 'mfa_locked_until', type: 'date' }),
    ],
  }
}
