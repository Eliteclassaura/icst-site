import { client, type ClientConfig } from '../client'
import { DEFAULT_CALENDAR, type BusinessCalendar } from './workspace/time'

/**
 * Offices and RFQ routing (Patch L1; owner decisions 2026-10-05; KIT-0 H3).
 *
 *   - Two stored queue SLOTS, `US` and `TH`: opaque ids that are written to the database (select enums, migration history). They
 *     do not change, and no migration is needed to use them: a client maps its offices onto them (a one-office client uses only `TH`).
 *   - What a slot is called, its time zone, and which countries go to which slot come from the client's manifest (`client()`),
 *     not from this file. The default client's manifest reproduces what was hard-coded here: the Denver office, the Bangkok office, and the
 *     Thailand/Southeast Asia/Japan/rest-of-Asia-Pacific rule; everything else, including an unknown country, goes to the manifest's
 *     `routing.unknownCountry` (US for the default client). The owner adjusts it with per-country overrides in `crm-office-settings`, which win.
 *   - Each office's business calendar is its zone plus its holidays (data, also in `crm-office-settings`).
 */
export const OFFICES = ['US', 'TH'] as const
export type Office = (typeof OFFICES)[number]
export const isOffice = (v: unknown): v is Office => typeof v === 'string' && (OFFICES as readonly string[]).includes(v)

/** What the office code needs from a client, derived from its manifest (pure: tests build it from any manifest). */
export type OfficeModel = {
  zone: Record<Office, string>
  label: Record<Office, string>
  /** Countries the manifest routes to the `TH` slot. */
  thCountries: ReadonlySet<string>
  /** The slot for a country (the manifest's first matching rule, else its `unknownCountry`). */
  slotForCountry: (code: string) => Office
  /** The slot for a missing or malformed country. */
  unknownSlot: Office
}
/**
 * Fails closed: a manifest office or routing target that is not one of the stored slots would write a value the database
 * cannot hold, so building the model throws instead of guessing. A slot the client does not use gets its own id as the label and
 * the client's first office zone (never shown or chosen in practice).
 */
export function buildOfficeModel(c: Pick<ClientConfig, 'offices' | 'office' | 'officeKeyForCountry' | 'manifest'>): OfficeModel {
  for (const o of c.offices) if (!isOffice(o.key)) throw new Error(`client office "${o.key}" is not a stored office slot (${OFFICES.join(', ')})`)
  const slot = (key: string): Office => {
    if (!isOffice(key)) throw new Error(`client routing target "${key}" is not a stored office slot (${OFFICES.join(', ')})`)
    return key
  }
  const fallbackZone = c.offices[0]?.timeZone ?? 'UTC'
  const zone = { US: c.office('US')?.timeZone ?? fallbackZone, TH: c.office('TH')?.timeZone ?? fallbackZone }
  const label = { US: c.office('US')?.label ?? 'US', TH: c.office('TH')?.label ?? 'TH' }
  const unknownSlot = slot(c.manifest.routing.unknownCountry)
  const thCountries = new Set<string>()
  for (const r of c.manifest.routing.rules) if (slot(r.office) === 'TH') for (const code of r.countries) thCountries.add(code)
  return { zone, label, thCountries, slotForCountry: (code) => slot(c.officeKeyForCountry(code)), unknownSlot }
}
const model = buildOfficeModel(client())

export const OFFICE_TIME_ZONE: Record<Office, string> = model.zone
export const OFFICE_LABEL: Record<Office, string> = model.label

/** How an RFQ's office was decided. MANUAL (a person moved it) is never overwritten by a later derivation. */
export const OFFICE_SOURCE = ['COUNTRY_RULE', 'OWNER_OVERRIDE', 'DEFAULT', 'MANUAL'] as const
export type OfficeSource = (typeof OFFICE_SOURCE)[number]

/**
 * Default TH queue, from the client's routing rule. For the default client (owner decision 2026-10-05): Thailand; Southeast Asia; Japan; the rest
 * of Asia-Pacific (East Asia, South Asia, Oceania). Adjust with overrides in the admin rather than by editing the manifest.
 */
export const DEFAULT_TH_COUNTRIES: ReadonlySet<string> = model.thCountries

/** The office for a country: an owner override wins, then the client's rule; an unknown country goes to the client's `unknownCountry` slot. */
export function officeForCountry(
  country: string | null | undefined,
  overrides: ReadonlyMap<string, Office> = new Map(),
): { office: Office; source: Exclude<OfficeSource, 'MANUAL'> } {
  const code = typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null
  if (!code) return { office: model.unknownSlot, source: 'DEFAULT' }
  const o = overrides.get(code)
  if (o) return { office: o, source: 'OWNER_OVERRIDE' }
  return { office: model.slotForCountry(code), source: 'COUNTRY_RULE' }
}

/** Office settings as the server uses them (loaded from `crm-office-settings`, see `officeSettings.ts`). */
export type OfficeSettings = {
  overrides: ReadonlyMap<string, Office>
  holidays: Readonly<Record<Office, ReadonlySet<string>>>
  /** Patch C: office phone numbers, optional, for reference only; never put in an email (owner rule 2026-10-06). */
  phones: Record<Office, string | null>
}
export const EMPTY_OFFICE_SETTINGS: OfficeSettings = { overrides: new Map(), holidays: { US: new Set(), TH: new Set() }, phones: { US: null, TH: null } }

/** The business calendar of an office: its zone and its holidays. */
export function officeCalendar(office: unknown, settings: OfficeSettings = EMPTY_OFFICE_SETTINGS): BusinessCalendar {
  if (!isOffice(office)) return DEFAULT_CALENDAR
  return { zone: OFFICE_TIME_ZONE[office], holidays: settings.holidays[office] }
}

/** Time zones a user may choose (blank = their office's zone): today's list, in its order, plus the client's own office zones when missing. */
const BASE_USER_TIME_ZONES = ['America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Singapore', 'UTC'] as const
export const USER_TIME_ZONES: readonly string[] = [...BASE_USER_TIME_ZONES, ...client().offices.map((o) => o.timeZone).filter((z) => !(BASE_USER_TIME_ZONES as readonly string[]).includes(z))]
