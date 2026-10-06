/** Patch L2: the two-factor form state (kept out of the 'use server' module, which may export only actions). */
export type MfaState = { ok: boolean; message: string; recoveryCodes?: string[]; next?: string; nonce?: number }
export const INITIAL_MFA_STATE: MfaState = { ok: false, message: '' }
