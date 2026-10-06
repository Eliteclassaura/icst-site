import { DEFAULT_CALENDAR, type BusinessCalendar } from './workspace/time'

/**
 * Offices and RFQ routing (Patch L1; owner decisions 2026-10-05).
 *
 *   - Two queues only: US (America/Denver) and TH (Asia/Bangkok). The Japan office exists on the website but has no
 *     queue: Japanese inquiries go to Thailand.
 *   - Default rule: Thailand, Southeast Asia, Japan and the rest of Asia-Pacific → TH; everything else, including an
 *     unknown country, → US. The owner adjusts it with per-country overrides in `crm-office-settings`.
 *   - Each office's business calendar is its zone plus its holidays (data, also in `crm-office-settings`).
 */
export const OFFICES = ['US', 'TH'] as const
export type Office = (typeof OFFICES)[number]
export const isOffice = (v: unknown): v is Office => typeof v === 'string' && (OFFICES as readonly string[]).includes(v)

export const OFFICE_TIME_ZONE: Record<Office, string> = { US: 'America/Denver', TH: 'Asia/Bangkok' }
export const OFFICE_LABEL: Record<Office, string> = { US: 'US (Denver)', TH: 'Thailand (Bangkok)' }

/** How an RFQ's office was decided. MANUAL (a person moved it) is never overwritten by a later derivation. */
export const OFFICE_SOURCE = ['COUNTRY_RULE', 'OWNER_OVERRIDE', 'DEFAULT', 'MANUAL'] as const
export type OfficeSource = (typeof OFFICE_SOURCE)[number]

/**
 * Default TH queue: Thailand; Southeast Asia; Japan; the rest of Asia-Pacific (East Asia, South Asia, Oceania).
 * Owner decision 2026-10-05; adjust with overrides in the admin rather than by editing this list.
 */
export const DEFAULT_TH_COUNTRIES: ReadonlySet<string> = new Set([
  // Thailand and Southeast Asia
  'TH', 'BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TL', 'VN',
  // Japan
  'JP',
  // East Asia
  'CN', 'HK', 'MO', 'TW', 'KR', 'KP', 'MN',
  // South Asia
  'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
  // Oceania
  'AU', 'NZ', 'PG', 'FJ', 'SB', 'VU', 'NC', 'PF', 'WS', 'TO', 'KI', 'FM', 'MH', 'PW', 'NR', 'TV', 'CK', 'NU', 'GU', 'MP', 'AS',
])

/** The office for a country: an owner override wins, then the default rule; an unknown country goes to US. */
export function officeForCountry(
  country: string | null | undefined,
  overrides: ReadonlyMap<string, Office> = new Map(),
): { office: Office; source: Exclude<OfficeSource, 'MANUAL'> } {
  const code = typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null
  if (!code) return { office: 'US', source: 'DEFAULT' }
  const o = overrides.get(code)
  if (o) return { office: o, source: 'OWNER_OVERRIDE' }
  return { office: DEFAULT_TH_COUNTRIES.has(code) ? 'TH' : 'US', source: 'COUNTRY_RULE' }
}

/** Office settings as the server uses them (loaded from `crm-office-settings`, see `officeSettings.ts`). */
export type OfficeSettings = {
  overrides: ReadonlyMap<string, Office>
  holidays: Readonly<Record<Office, ReadonlySet<string>>>
  /** Patch C: office phone numbers for email signatures ({{office_phone}}). */
  phones: Record<Office, string | null>
}
export const EMPTY_OFFICE_SETTINGS: OfficeSettings = { overrides: new Map(), holidays: { US: new Set(), TH: new Set() }, phones: { US: null, TH: null } }

/** The business calendar of an office: its zone and its holidays. */
export function officeCalendar(office: unknown, settings: OfficeSettings = EMPTY_OFFICE_SETTINGS): BusinessCalendar {
  if (!isOffice(office)) return DEFAULT_CALENDAR
  return { zone: OFFICE_TIME_ZONE[office], holidays: settings.holidays[office] }
}

/** Time zones a user may choose (blank = their office's zone). */
export const USER_TIME_ZONES = [
  'America/Denver',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Asia/Singapore',
  'UTC',
] as const
