import { headers } from 'next/headers'
import { pendingSession } from '../auth/mfa/guard'
import { loadMfaUser, stepUpSecondsLeft } from '../auth/mfa/service'
import { readEmailConfig } from './config'
import { PRESET_DEFAULTS, MAIL_PRESETS } from './profiles'
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

export function emailStatus() {
  const cfg = readEmailConfig()
  return { mode: cfg.mode, modeLabel: MODE_LABEL[cfg.mode] ?? cfg.mode, configErrors: cfg.errors, keyConfigured: settingsKeyConfigured(), envProfile: Boolean(cfg.smtp) }
}
