/** Patch L2: the two-factor form state (kept out of the 'use server' module, which may export only actions). */
export type MfaState = {
  ok: boolean
  message: string
  recoveryCodes?: string[]
  /** MFA-UX-1: set after a sign-in with a recovery code — how many are left (the page says so before going on). */
  recoveryRemaining?: number
  next?: string
  nonce?: number
  /** MFA-2: the code was sent by email (the form switches to the email-code field). */
  emailSent?: boolean
  /** MFA-2: when the emailed code stops working (ISO) and how long until another can be requested. */
  expiresAt?: string
  cooldownSeconds?: number
  maskedEmail?: string
}
export const INITIAL_MFA_STATE: MfaState = { ok: false, message: '' }
