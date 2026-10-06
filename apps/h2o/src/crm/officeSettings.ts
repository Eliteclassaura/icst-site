import type { Payload } from 'payload'
import { EMPTY_OFFICE_SETTINGS, isOffice, type Office, type OfficeSettings } from './offices'

/**
 * Patch L1: the office settings (routing overrides + holidays) as the server uses them, read from the
 * `crm-office-settings` global with a short cache. A save invalidates the cache in this process; other processes
 * pick the change up within `TTL_MS`. A failed read falls back to "no overrides, no holidays" — the default rule and
 * plain weekdays — and is logged by code, so routing and due dates never stop because settings could not be read.
 */
const TTL_MS = 60_000
let cached: { at: number; value: OfficeSettings } | null = null

export function invalidateOfficeSettings(): void {
  cached = null
}

export function settingsFromDoc(doc: unknown): OfficeSettings {
  const d = (doc ?? {}) as Record<string, unknown>
  const overrides = new Map<string, Office>()
  for (const r of ((d.routing_overrides ?? []) as Array<Record<string, unknown>>)) {
    const code = String(r.country_code ?? '').toUpperCase()
    if (/^[A-Z]{2}$/.test(code) && isOffice(r.office)) overrides.set(code, r.office)
  }
  const holidays: Record<Office, Set<string>> = { US: new Set(), TH: new Set() }
  for (const h of ((d.holidays ?? []) as Array<Record<string, unknown>>))
    if (isOffice(h.office) && typeof h.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date)) holidays[h.office].add(h.date)
  return { overrides, holidays }
}

export async function officeSettings(payload: Payload, now: number = Date.now()): Promise<OfficeSettings> {
  if (cached && now - cached.at < TTL_MS) return cached.value
  try {
    const doc = await payload.findGlobal({ slug: 'crm-office-settings' as never, depth: 0, overrideAccess: true })
    cached = { at: now, value: settingsFromDoc(doc) }
  } catch (err) {
    payload.logger.error({ code: 'CRM_OFFICE_SETTINGS_READ_FAILED', errName: (err as Error)?.name })
    return EMPTY_OFFICE_SETTINGS
  }
  return cached.value
}
