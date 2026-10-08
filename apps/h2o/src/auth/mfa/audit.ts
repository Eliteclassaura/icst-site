import type { Payload } from 'payload'

/**
 * Patch L2 security audit: one `audit-log` row per two-factor event. It records the action, the user id and the actor
 * id, plus counts in `detail` — never a code, secret, recovery code, email address or IP. A failed write is logged by
 * code and never blocks sign-in (the same posture as the CRM audit adapter).
 */
export type MfaAuditAction = 'mfa-enrolled' | 'mfa-verified' | 'mfa-failed' | 'mfa-locked' | 'mfa-recovery-used' | 'mfa-reset' | 'mfa-stepup'
  | 'mfa-email-sent' | 'mfa-email-verified' | 'mfa-device-remembered' | 'mfa-device-used' | 'mfa-devices-revoked'
  | 'mfa-admin-reset' | 'mfa-admin-turned-off' | 'mfa-admin-turned-on' | 'mfa-admin-notice' | 'mfa-exempt-cleared'

export async function writeSecurityAudit(
  payload: Payload,
  e: { action: MfaAuditAction; userId: string; actorId: string | null; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    await payload.create({
      collection: 'audit-log',
      data: {
        action: e.action,
        collection: 'users',
        docId: e.userId,
        changedKeys: null,
        summary: null,
        actor: e.actorId,
        actorEmail: null,
        ip: null,
        detail: { security: true, ...(e.detail ?? {}) },
      } as never,
      overrideAccess: true,
    })
  } catch (err) {
    payload.logger.error({ code: 'MFA_AUDIT_WRITE_FAILED', action: e.action, errName: (err as Error)?.name })
  }
}
