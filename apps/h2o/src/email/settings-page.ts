import { headers } from 'next/headers'
import { pendingSession } from '../auth/mfa/guard'
import { loadMfaUser, stepUpAppSecondsLeft, stepUpSecondsLeft } from '../auth/mfa/service'
import { readEmailConfig } from './config'
import { fromMismatchWarning, PRESET_DEFAULTS, MAIL_PRESETS } from './profiles'
import { settingsKeyConfigured } from './settings-key'
import type { CrmSession } from '../crm/workspace/session'

/** Patch C: what the settings pages show around the forms (no secrets; the mode and switches are environment-only). */
export const PRESET_LABEL: Record<string, string> = { GMAIL: 'Google Workspace (Gmail)', STALWART: 'Stalwart', CUSTOM: 'Other SMTP service' }
export const USE_LABEL: Record<string, string> = { TRANSACTIONAL: 'Inquiry email', REVENUE: 'Revenue Engine' }
export const MODE_LABEL: Record<string, string> = {
  off: 'Off — nothing is sent',
  allowlist: 'Allowlist — only listed staff addresses receive email',
  live: 'Live — email is sent to customers',
}

export const presetOptions = () => MAIL_PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p]!, hint: PRESET_DEFAULTS[p].hint }))

export async function stepUpLeft(s: CrmSession): Promise<number> {
  const pending = await pendingSession(s.payload, await headers())
  const u = await loadMfaUser(s.payload, s.user.id)
  return u && pending ? stepUpSecondsLeft(u, pending.sid) : 0
}

/** STEP-UP-1.1: seconds left on the authenticator step-up (the people page; everything else uses the password one). */
export async function stepUpAppLeft(s: CrmSession): Promise<number> {
  const pending = await pendingSession(s.payload, await headers())
  const u = await loadMfaUser(s.payload, s.user.id)
  return u && pending ? stepUpAppSecondsLeft(u, pending.sid) : 0
}

export function emailStatus() {
  const cfg = readEmailConfig()
  return { mode: cfg.mode, modeLabel: MODE_LABEL[cfg.mode] ?? cfg.mode, configErrors: cfg.errors, keyConfigured: settingsKeyConfigured(), envProfile: Boolean(cfg.smtp) }
}

/**
 * SENDER-UX-1: what the "Active sender" card shows for one kind of email. Pure; never a password. The Revenue Engine uses
 * its own active profile, else the inquiry-email one (the same order the sender uses), else the server default.
 */
export type ActiveSender =
  | { source: 'profile'; viaFallback: boolean; id: string; name: string; presetLabel: string; fromName: string; fromAddress: string; host: string; login: string; check: 'passed' | 'failed' | 'unchecked'; checkCode: string; checkedAt: string; warning: string | null }
  | { source: 'env' }
  | { source: 'none' }

export function activeSender(profiles: Array<Record<string, unknown>>, use: 'TRANSACTIONAL' | 'REVENUE', envProfile: boolean): ActiveSender {
  const live = (u: string) => profiles.find((p) => p.active === true && p.use === u)
  const own = live(use)
  const p = own ?? (use === 'REVENUE' ? live('TRANSACTIONAL') : undefined)
  if (!p) return envProfile ? { source: 'env' } : { source: 'none' }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const state = p.last_check_state === 'OK' ? 'passed' : p.last_check_state === 'FAILED' ? 'failed' : 'unchecked'
  const at = str(p.last_check_at)
  return {
    source: 'profile',
    viaFallback: !own,
    id: String(p.id),
    name: str(p.name),
    presetLabel: PRESET_LABEL[str(p.preset)] ?? str(p.preset),
    fromName: str(p.from_name),
    fromAddress: str(p.from_address),
    host: str(p.host),
    login: str(p.username),
    check: state,
    checkCode: str(p.last_check_code),
    checkedAt: at ? `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '',
    warning: fromMismatchWarning(str(p.preset), p.username, p.from_address),
  }
}
