import type { Payload } from 'payload'
import { DEFAULT_SALES_ADDRESS } from '../../email/config'

/**
 * Revenue Engine slice 1: the settings as the engine and the outbox admission use them (the `crm-ers-settings`
 * global, with the ruled defaults when a value is empty). Cached briefly; a save invalidates it in this process.
 * A failed read is treated as "engine off" — fail closed.
 */
/**
 * The optional compliance controls. One-click unsubscribe is not one of them: it is the floor (CT ruling 1).
 * Owner rule 2026-10-06: no phone number and no postal address in any email, so the postal-address footer toggle, the
 * postal address and the office-phone signature option are gone from the engine (their stored settings are ignored).
 */
export type Toggle = 'business_hours' | 'warmup'
export type ErsSettings = {
  enabled: boolean
  dailyCap: number
  domainDailyCap: number
  domainHourlyCap: number
  windowStartHour: number
  windowEndHour: number
  warmupSchedule: number[]
  warmupStepBusinessDays: number
  warmupStartedOn: string | null
  compliance: Record<Toggle, boolean>
  signature: { signer: string; email: string }
  health: { state: 'ACTIVE' | 'PAUSED'; reason: string | null; changedAt: string | null }
  bouncePauseRatio: number
  bounceWarnRatio: number
  minSendsForRatio: number
  inboundLastOkAt: string | null
}

export const ERS_DEFAULTS: ErsSettings = {
  enabled: false,
  dailyCap: 55,
  domainDailyCap: 5,
  domainHourlyCap: 2,
  windowStartHour: 9,
  windowEndHour: 17,
  warmupSchedule: [10, 20, 30, 40, 50, 55],
  warmupStepBusinessDays: 5,
  warmupStartedOn: null,
  compliance: { business_hours: true, warmup: true },
  signature: { signer: 'ICS Sales Team', email: DEFAULT_SALES_ADDRESS },
  health: { state: 'ACTIVE', reason: null, changedAt: null },
  bouncePauseRatio: 0.05,
  bounceWarnRatio: 0.02,
  minSendsForRatio: 20,
  inboundLastOkAt: null,
}

type Doc = Record<string, unknown>
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

export function settingsFrom(doc: Doc | null | undefined): ErsSettings {
  const d = doc ?? {}
  const c = (d.compliance ?? {}) as Doc
  const s = (d.signature ?? {}) as Doc
  const h = (d.health ?? {}) as Doc
  const D = ERS_DEFAULTS
  const schedule = typeof d.warmup_schedule === 'string' ? d.warmup_schedule.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0) : []
  return {
    enabled: bool(d.enabled, D.enabled),
    dailyCap: num(d.daily_cap, D.dailyCap),
    domainDailyCap: num(d.domain_daily_cap, D.domainDailyCap),
    domainHourlyCap: num(d.domain_hourly_cap, D.domainHourlyCap),
    windowStartHour: num(d.window_start_hour, D.windowStartHour),
    windowEndHour: num(d.window_end_hour, D.windowEndHour),
    warmupSchedule: schedule.length ? schedule : D.warmupSchedule,
    warmupStepBusinessDays: num(d.warmup_step_business_days, D.warmupStepBusinessDays),
    warmupStartedOn: typeof d.warmup_started_on === 'string' ? d.warmup_started_on : null,
    compliance: {
      business_hours: bool(c.business_hours, true),
      warmup: bool(c.warmup, true),
    },
    signature: { signer: str(s.signer, D.signature.signer), email: str(s.email, D.signature.email) },
    health: { state: h.state === 'PAUSED' ? 'PAUSED' : 'ACTIVE', reason: typeof h.reason === 'string' ? h.reason : null, changedAt: typeof h.changed_at === 'string' ? h.changed_at : null },
    bouncePauseRatio: num(d.bounce_pause_ratio, D.bouncePauseRatio),
    bounceWarnRatio: num(d.bounce_warn_ratio, D.bounceWarnRatio),
    minSendsForRatio: num(d.min_sends_for_ratio, D.minSendsForRatio),
    inboundLastOkAt: typeof d.inbound_last_ok_at === 'string' ? d.inbound_last_ok_at : null,
  }
}

const TTL_MS = 15_000
let cached: { at: number; value: ErsSettings } | null = null
export const invalidateErsSettings = () => {
  cached = null
}

export async function ersSettings(payload: Payload, now = Date.now()): Promise<ErsSettings> {
  if (cached && now - cached.at < TTL_MS) return cached.value
  try {
    const doc = (await payload.findGlobal({ slug: 'crm-ers-settings' as never, depth: 0, overrideAccess: true })) as unknown as Doc
    cached = { at: now, value: settingsFrom(doc) }
    return cached.value
  } catch {
    return { ...ERS_DEFAULTS, enabled: false }
  }
}

/** A sequence's effective toggle: its override (ON/OFF) or the global setting (INHERIT). */
export function effectiveToggle(s: ErsSettings, sequence: Doc, t: Toggle): boolean {
  const o = ((sequence.compliance ?? {}) as Doc)[t]
  return o === 'ON' ? true : o === 'OFF' ? false : s.compliance[t]
}

export const INBOUND_FRESH_MS = 15 * 60_000
/** Ruling 3: sequences need live reply detection — inbound on and a successful poll in the last 15 minutes. */
export const inboundFresh = (s: ErsSettings, inboundEnabled: boolean, now = Date.now()): boolean =>
  inboundEnabled && s.inboundLastOkAt !== null && now - new Date(s.inboundLastOkAt).getTime() <= INBOUND_FRESH_MS

/** Today's cap: the daily cap, or the warm-up step for the business days since warm-up started (if warm-up is on). */
export function capForDay(s: ErsSettings, warmupOn: boolean, businessDaysSinceStart: number | null): number {
  if (!warmupOn || businessDaysSinceStart === null) return warmupOn ? Math.min(s.dailyCap, s.warmupSchedule[0] ?? s.dailyCap) : s.dailyCap
  const step = Math.floor(Math.max(0, businessDaysSinceStart) / Math.max(1, s.warmupStepBusinessDays))
  return Math.min(s.dailyCap, s.warmupSchedule[Math.min(step, s.warmupSchedule.length - 1)] ?? s.dailyCap)
}

export const hourlyCap = (dailyCap: number, s: ErsSettings) => Math.ceil(dailyCap / Math.max(1, s.windowEndHour - s.windowStartHour))
