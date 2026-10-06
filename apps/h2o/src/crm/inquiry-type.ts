/**
 * RFQ type for the inbox (owner request 2026-10-05): All · Parts · New tower · Repair/Service.
 *
 * The staff-classified motion wins when it is set. Before that, the customer's own interest answer (Typeform Q5) is
 * classified by keywords. Where the two differ the inbox shows both; the derived type never overwrites either source.
 */
export const INQUIRY_TYPE = ['PARTS', 'NEW_TOWER', 'REPAIR_SERVICE', 'OTHER', 'UNKNOWN'] as const
export type InquiryType = (typeof INQUIRY_TYPE)[number]
export const INQUIRY_TYPE_SOURCE = ['STAFF_MOTION', 'CUSTOMER_INTEREST', 'NONE'] as const
export type InquiryTypeSource = (typeof INQUIRY_TYPE_SOURCE)[number]

export const INQUIRY_TYPE_LABEL: Record<InquiryType, string> = {
  PARTS: 'Parts',
  NEW_TOWER: 'New tower',
  REPAIR_SERVICE: 'Repair / service',
  OTHER: 'Other',
  UNKNOWN: 'Not stated',
}

/** Motion → type. Repair/Service groups Repair, Maintenance/inspection, Upgrade/retrofit and Rebuild/replacement. */
export const MOTION_TYPE: Record<string, InquiryType> = {
  PARTS: 'PARTS',
  NEW_TOWER: 'NEW_TOWER',
  REPAIR: 'REPAIR_SERVICE',
  MAINTENANCE_INSPECTION: 'REPAIR_SERVICE',
  UPGRADE_RETROFIT: 'REPAIR_SERVICE',
  REBUILD_REPLACEMENT: 'REPAIR_SERVICE',
  OTHER_APPROVED: 'OTHER',
}

/** The motions in each type (for the multi-select Motion filter and the type chips). */
export const TYPE_MOTIONS: Record<Exclude<InquiryType, 'UNKNOWN'>, string[]> = {
  PARTS: ['PARTS'],
  NEW_TOWER: ['NEW_TOWER'],
  REPAIR_SERVICE: ['REPAIR', 'MAINTENANCE_INSPECTION', 'UPGRADE_RETROFIT', 'REBUILD_REPLACEMENT'],
  OTHER: ['OTHER_APPROVED'],
}

export function typeFromInterest(raw: unknown): InquiryType {
  if (typeof raw !== 'string' || !raw.trim()) return 'UNKNOWN'
  const t = raw.toLowerCase()
  if (/\bparts?\b|spare|replacement part|fan blade|fill media|drift elim|nozzle|gearbox/.test(t)) return 'PARTS'
  if (/new (cooling )?tower|new build|new construction|new installation|turnkey/.test(t)) return 'NEW_TOWER'
  if (/repair|service|maint|inspect|rebuild|retrofit|upgrade|refurb|overhaul|emergency/.test(t)) return 'REPAIR_SERVICE'
  return 'OTHER'
}

export function deriveType(input: { motion?: unknown; interest?: unknown }): { type: InquiryType; source: InquiryTypeSource } {
  const m = typeof input.motion === 'string' ? MOTION_TYPE[input.motion] : undefined
  if (m) return { type: m, source: 'STAFF_MOTION' }
  const fromInterest = typeFromInterest(input.interest)
  if (fromInterest !== 'UNKNOWN') return { type: fromInterest, source: 'CUSTOMER_INTEREST' }
  return { type: 'UNKNOWN', source: 'NONE' }
}
