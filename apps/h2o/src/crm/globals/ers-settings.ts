import type { GlobalAfterChangeHook, GlobalBeforeChangeHook, GlobalConfig } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { changedKeys, writeCrmAudit } from '../audit'
import { invalidateErsSettings } from '../ers/settings'
import { CrmInvariantError } from '../guards'
import { ERS_HEALTH_STATE, options } from '../vocabulary'
import { DEFAULT_SALES_ADDRESS } from '../../email/config'

/**
 * Revenue Engine slice 1 — the engine's settings (CT rulings 2026-10-05; owner decisions). Admin-edited data, audited.
 *
 *   - `enabled` is the global kill switch (default OFF). H2O_EMAIL_MODE still applies on top: off sends nothing.
 *   - Caps: 55 sequence emails a day (hourly = ceil(daily / window hours)), 5 per recipient domain a day and 2 an hour,
 *     inside each office's business window; warm-up 10/20/30/40/50/55 a day, stepping every 5 business days.
 *   - Compliance toggles (owner: optional, default ON): business hours, warm-up (no postal-address footer: owner rule 2026-10-06). The floor never relaxes:
 *     one-click unsubscribe (link and headers) is always on, recorded unsubscribes, hard bounces and complaints are never
 *     mailed, and the kill switch and caps always apply (CT ruling 1).
 *   - Signature (owner decision): "ICS Sales Team", the RFQ office's phone, the sales address — as data.
 *   - Health: PAUSED by the auto-pause (>5% hard bounces over the last 100 sends, at least 20; or any complaint) or by
 *     an admin; resumed by an admin (audited). ≥2% is a warning only.
 *   - `inbound_last_ok_at`: the inbound poller's heartbeat; nothing sends when it is older than 15 minutes (ruling 3).
 */
type Row = Record<string, unknown>
const HEARTBEAT = 'inbound_last_ok_at'

const validate: GlobalBeforeChangeHook = ({ data, originalDoc, req, context }) => {
  const d = data as Row
  // ENGINE-SCOPE-1a.1 (Auditor B1): turning the engine ON needs step-up, and step-up lives in `setEngineSwitch`, which
  // sets this context flag after it passes. A signed-in person changing the checkbox any other way (the REST route, the
  // admin form) is refused. Turning it OFF is never gated. A server script with no signed-in user stays allowed: it
  // needs shell access to run, which is a stronger credential than a session.
  const flag = (context as { crmServer?: { engineOnStepUp?: boolean } } | undefined)?.crmServer?.engineOnStepUp === true
  if (d.enabled === true && (originalDoc as Row | undefined)?.enabled !== true && req?.user && !flag)
    throw new CrmInvariantError('ERS_ENGINE_ON_VIA_SWITCH_ONLY', 'The Revenue Engine is turned on from Settings → Sequences after confirming your password, not from here.')
  const int = (k: string, min: number, max: number) => {
    if (d[k] === undefined || d[k] === null) return
    const n = Number(d[k])
    if (!Number.isInteger(n) || n < min || n > max) throw new CrmInvariantError('ERS_SETTING_INVALID', `${k.replace(/_/g, ' ')} must be a whole number from ${min} to ${max}.`)
  }
  int('daily_cap', 1, 500)
  int('domain_daily_cap', 1, 100)
  int('domain_hourly_cap', 1, 50)
  int('window_start_hour', 0, 23)
  int('window_end_hour', 1, 24)
  int('warmup_step_business_days', 1, 30)
  int('min_sends_for_ratio', 1, 1000)
  if (d.window_start_hour !== undefined && d.window_end_hour !== undefined && Number(d.window_end_hour) <= Number(d.window_start_hour))
    throw new CrmInvariantError('ERS_WINDOW_INVALID', 'The business window must end after it starts.')
  if (typeof d.warmup_schedule === 'string' && !/^\s*\d{1,3}(\s*,\s*\d{1,3})*\s*$/.test(d.warmup_schedule))
    throw new CrmInvariantError('ERS_WARMUP_INVALID', 'The warm-up schedule is daily caps separated by commas, e.g. 10,20,30,40,50,55.')
  for (const k of ['bounce_pause_ratio', 'bounce_warn_ratio'])
    if (d[k] !== undefined && d[k] !== null && !(Number(d[k]) > 0 && Number(d[k]) < 1)) throw new CrmInvariantError('ERS_RATIO_INVALID', `${k.replace(/_/g, ' ')} is a fraction between 0 and 1.`)
  return data
}

const auditAndInvalidate: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
  invalidateErsSettings()
  const keys = changedKeys(doc as Row, previousDoc as Row).filter((k) => k !== HEARTBEAT)
  // The poller's heartbeat is not a settings change; everything else is audited (names and the switch/health states).
  if (keys.length)
    await writeCrmAudit(req, {
      action: 'update',
      collection: 'crm-ers-settings',
      docId: 'global',
      changedKeys: keys,
      detail: {
        enabled: (doc as Row).enabled === true,
        ...(keys.includes('enabled')
          ? { enabled_transition: { from: (previousDoc as Row).enabled === true, to: (doc as Row).enabled === true } }
          : {}),
        health: ((doc as Row).health as Row | undefined)?.state ?? null,
        compliance: (doc as Row).compliance ?? null,
      },
    })
  return doc
}

const on = (name: string, label: string, description: string) => ({ name, label, type: 'checkbox' as const, defaultValue: true, admin: { description } })

export const CrmErsSettings: GlobalConfig = {
  slug: 'crm-ers-settings',
  label: 'Revenue Engine settings',
  admin: { group: 'CRM', description: 'Sequence sending: the switch, caps, business window, warm-up, compliance toggles, signature and health.' },
  access: { read: ({ req }) => hasRole(req, CRM_USERS), update: ({ req }) => hasRole(req, ADMINS) },
  hooks: { beforeChange: [validate], afterChange: [auditAndInvalidate] },
  fields: [
    { name: 'enabled', label: 'Revenue Engine on', type: 'checkbox', defaultValue: false, admin: { description: 'The global kill switch. Off: no sequence step runs and no sequence email is sent.' } },
    { name: 'daily_cap', type: 'number', defaultValue: 55, admin: { description: 'Sequence emails per day, all sequences (transactional mail and replies are not counted).' } },
    { name: 'domain_daily_cap', type: 'number', defaultValue: 5 },
    { name: 'domain_hourly_cap', type: 'number', defaultValue: 2 },
    { name: 'window_start_hour', type: 'number', defaultValue: 9, admin: { description: 'Office-local hour, Monday–Friday, office holidays excluded.' } },
    { name: 'window_end_hour', type: 'number', defaultValue: 17 },
    { name: 'warmup_schedule', type: 'text', defaultValue: '10,20,30,40,50,55' },
    { name: 'warmup_step_business_days', type: 'number', defaultValue: 5 },
    { name: 'warmup_started_on', type: 'date', admin: { description: 'Set when the engine is first turned on.' } },
    {
      name: 'compliance',
      type: 'group',
      admin: { description: 'Owner decision 2026-10-05: optional, default ON, each change audited. The floor always applies.' },
      fields: [
        // Owner rule 2026-10-06: no postal address in any email. Kept only as a stored column (no migration); not used.
        { ...on('address_footer', 'Postal address footer (not used)', 'Not used: no postal address appears in any email (owner rule 2026-10-06).'), admin: { hidden: true } },
        on('business_hours', 'Business-hours window', 'Off: sequence email may go out at any hour (caps still apply).'),
        on('warmup', 'Warm-up cap', 'Off: the daily cap applies from day one.'),
      ],
    },
    { name: 'postal_address', type: 'textarea', maxLength: 400, admin: { hidden: true, description: 'Not used: no postal address appears in any email (owner rule 2026-10-06).' } },
    {
      name: 'signature',
      type: 'group',
      admin: { description: 'Every email is signed by the team: the signer and the sales address only (owner decisions 2026-10-05 and 2026-10-06; no phone number, no postal address). Used by sequence emails and the reply templates T2–T6.' },
      fields: [
        { name: 'signer', type: 'text', defaultValue: 'ICS Sales Team', maxLength: 80 },
        // Owner rule 2026-10-06: no phone number in any email. Kept only as a stored column (no migration); not used.
        { name: 'include_office_phone', type: 'checkbox', defaultValue: true, admin: { hidden: true, description: 'Not used: no phone number appears in any email (owner rule 2026-10-06).' } },
        { name: 'email', type: 'text', defaultValue: DEFAULT_SALES_ADDRESS, maxLength: 120 },
      ],
    },
    {
      name: 'health',
      type: 'group',
      fields: [
        { name: 'state', type: 'select', defaultValue: 'ACTIVE', options: options(ERS_HEALTH_STATE) },
        { name: 'reason', type: 'text', maxLength: 80 },
        { name: 'changed_at', type: 'date' },
      ],
    },
    { name: 'bounce_pause_ratio', type: 'number', defaultValue: 0.05 },
    { name: 'bounce_warn_ratio', type: 'number', defaultValue: 0.02 },
    { name: 'min_sends_for_ratio', type: 'number', defaultValue: 20 },
    { name: HEARTBEAT, type: 'date', admin: { readOnly: true, description: 'Last successful inbound poll (sequences need it within 15 minutes).' } },
  ],
}
