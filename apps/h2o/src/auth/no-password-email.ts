import { APIError, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload'

/**
 * Launch rule (Control Tower CRM go-live, 2026-10-02): the H2O app sends no email of any kind.
 *
 * Payload's forgot-password flow emails a reset link. With no email adapter configured, Payload's fallback
 * writes that message — the recipient and the live reset link — to the server log. So both halves of the
 * flow are refused before Payload looks anything up:
 *
 *   - `forgotPassword` (POST /api/users/forgot-password, the admin "Forgot password?" form, the Local API)
 *   - `resetPassword`  (POST /api/users/reset-password; no reset token can be issued, so none can be redeemed)
 *
 * The refusal is the same for every input, so it reveals nothing about which addresses have accounts. An
 * administrator sets a new password for a user in the admin (an ordinary `update`, which is unaffected).
 * Re-enabling the flow needs an approved mail adapter and a separate owner decision.
 */
export const PASSWORD_EMAIL_DISABLED_MESSAGE =
  'Password reset by email is disabled. Ask an administrator to set a new password.'

export const refusePasswordEmail: CollectionBeforeOperationHook = ({ operation }) => {
  if (operation === 'forgotPassword' || operation === 'resetPassword')
    throw new APIError(PASSWORD_EMAIL_DISABLED_MESSAGE, 403, undefined, true)
}

export function withoutPasswordEmail(collection: CollectionConfig): CollectionConfig {
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      beforeOperation: [refusePasswordEmail, ...(collection.hooks?.beforeOperation ?? [])],
    },
  }
}
