import { APIError, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload'
import { readEmailConfig } from '../email/config'
import { PASSWORD_RESET_EXPIRY_MS, renderPasswordReset } from '../email/messages'

/**
 * Password reset by email (CRM email M1, Control Tower brief 2026-10-04). Replaces the CRM go-live launch
 * refusal (`no-password-email.ts`, 2026-10-02), now that an approved mail path exists.
 *
 *   - H2O_EMAIL_MODE=allowlist or live: forgot-password and reset-password work. The reset message goes
 *     through the gated H2O adapter (src/email/adapter.ts): in allowlist mode only allowlisted staff receive
 *     it; the link and token are never logged. The link expires after 1 hour.
 *   - H2O_EMAIL_MODE=off (or a configuration error): both are refused, exactly as at launch. A reset link
 *     that can never arrive would only confuse; an administrator sets a new password in the admin instead.
 *
 * The refusal and Payload's success response are the same for every address, so neither reveals which
 * addresses have accounts.
 */
export const PASSWORD_EMAIL_DISABLED_MESSAGE =
  'Password reset by email is disabled. Ask an administrator to set a new password.'

export const passwordEmailGate: CollectionBeforeOperationHook = ({ operation }) => {
  if ((operation === 'forgotPassword' || operation === 'resetPassword') && readEmailConfig().mode === 'off')
    throw new APIError(PASSWORD_EMAIL_DISABLED_MESSAGE, 403, undefined, true)
}

const serverUrl = () => (process.env.NEXT_PUBLIC_SERVER_URL ?? '').replace(/\/+$/, '')

export function withPasswordEmail(collection: CollectionConfig): CollectionConfig {
  const auth = typeof collection.auth === 'object' ? collection.auth : {}
  return {
    ...collection,
    auth: {
      ...auth,
      forgotPassword: {
        expiration: PASSWORD_RESET_EXPIRY_MS,
        generateEmailSubject: () => renderPasswordReset('').subject,
        generateEmailHTML: (args) =>
          renderPasswordReset(`${serverUrl()}/admin/reset/${encodeURIComponent(String(args?.token ?? ''))}`)
            .html,
      },
    },
    hooks: {
      ...collection.hooks,
      beforeOperation: [passwordEmailGate, ...(collection.hooks?.beforeOperation ?? [])],
    },
  }
}
