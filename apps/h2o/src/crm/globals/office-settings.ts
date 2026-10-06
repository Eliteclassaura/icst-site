import type { GlobalAfterChangeHook, GlobalBeforeChangeHook, GlobalConfig } from 'payload'
import { ADMINS, CRM_USERS, hasRole } from '@factory/agency-core/cms/kernel'
import { changedKeys, writeCrmAudit } from '../audit'
import { CrmInvariantError } from '../guards'
import { OFFICES, OFFICE_LABEL } from '../offices'
import { invalidateOfficeSettings } from '../officeSettings'
import { options } from '../vocabulary'

/**
 * Patch L1: the owner's office routing overrides and office holidays. Admin-edited data, not code: the defaults
 * live in `../offices.ts` (routing) and `../data/holidays.ts` (holiday seed, applied once by the L1 migration).
 * Every save is audited (field names and counts; no personal data exists here).
 */
type Row = Record<string, unknown>
const ISO = /^[A-Z]{2}$/
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const realDate = (s: string) => {
  const m = YMD.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

const validate: GlobalBeforeChangeHook = ({ data }) => {
  const d = data as Row
  const seenCountry = new Set<string>()
  for (const r of ((d.routing_overrides ?? []) as Row[])) {
    const code = String(r.country_code ?? '').trim().toUpperCase()
    if (!ISO.test(code)) throw new CrmInvariantError('OFFICE_ROUTE_COUNTRY', 'A routing override needs a two-letter country code (ISO 3166-1).')
    if (seenCountry.has(code)) throw new CrmInvariantError('OFFICE_ROUTE_DUPLICATE', `Country ${code} has more than one routing override.`)
    seenCountry.add(code)
    r.country_code = code
  }
  const phones = (d.phones ?? {}) as Row
  for (const o of OFFICES) {
    const v = typeof phones[o] === 'string' ? (phones[o] as string).trim() : ''
    if (v && !/^\+?[0-9 ().-]{6,40}$/.test(v)) throw new CrmInvariantError('OFFICE_PHONE_INVALID', `The ${OFFICE_LABEL[o]} phone number may contain digits, spaces, + ( ) . - only.`)
    if (d.phones) phones[o] = v || null
  }
  const seenDay = new Set<string>()
  for (const r of ((d.holidays ?? []) as Row[])) {
    const date = String(r.date ?? '').trim()
    if (!realDate(date)) throw new CrmInvariantError('OFFICE_HOLIDAY_DATE', 'A holiday date must be a real date written yyyy-mm-dd.')
    const key = `${String(r.office)}:${date}`
    if (seenDay.has(key)) throw new CrmInvariantError('OFFICE_HOLIDAY_DUPLICATE', `The ${String(r.office)} office lists ${date} twice.`)
    seenDay.add(key)
    r.date = date
  }
  return data
}

const auditAndInvalidate: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
  invalidateOfficeSettings()
  const d = doc as Row
  await writeCrmAudit(req, {
    action: 'update',
    collection: 'crm-office-settings',
    docId: 'global',
    changedKeys: changedKeys(d, previousDoc as Row),
    detail: {
      routing_overrides: ((d.routing_overrides ?? []) as Row[]).length,
      holidays: ((d.holidays ?? []) as Row[]).length,
      holidays_unconfirmed: ((d.holidays ?? []) as Row[]).filter((h) => !h.confirmed).length,
    },
  })
  return doc
}

export const CrmOfficeSettings: GlobalConfig = {
  slug: 'crm-office-settings',
  label: 'CRM offices, routing and holidays',
  admin: {
    group: 'CRM',
    description:
      'Two queues: US (Denver) and Thailand (Bangkok). By default Thailand, Southeast Asia, Japan and the rest of Asia-Pacific go to Thailand; everything else (and an unknown country) to the US. Overrides below win. Holidays are skipped when business days are counted.',
  },
  access: {
    read: ({ req }) => hasRole(req, CRM_USERS),
    update: ({ req }) => hasRole(req, ADMINS),
  },
  hooks: { beforeChange: [validate], afterChange: [auditAndInvalidate] },
  fields: [
    {
      // Patch C: each office's business number, kept for reference. Owner rule 2026-10-06: it is never put in an email.
      name: 'phones',
      type: 'group',
      label: 'Office phone numbers',
      admin: { description: 'Optional, for reference. Never shown in an email: no phone number appears in any email (owner rule 2026-10-06).' },
      fields: OFFICES.map((o) => ({ name: o, label: OFFICE_LABEL[o], type: 'text' as const, maxLength: 40 })),
    },
    {
      name: 'routing_overrides',
      type: 'array',
      labels: { singular: 'Routing override', plural: 'Routing overrides' },
      admin: { description: 'Send every inquiry from this country to this office. Applies to new inquiries; a person can still move one.' },
      fields: [
        { name: 'country_code', type: 'text', required: true, maxLength: 2, admin: { description: 'ISO 3166-1 alpha-2, e.g. JP.' } },
        { name: 'office', type: 'select', required: true, options: OFFICES.map((o) => ({ label: OFFICE_LABEL[o], value: o })) },
        { name: 'note', type: 'text', maxLength: 200 },
      ],
    },
    {
      name: 'holidays',
      type: 'array',
      labels: { singular: 'Holiday', plural: 'Holidays' },
      admin: { description: 'Office holidays (local dates). Seeded for 2026–2027 with the standard US federal and Thai public holidays (owner-approved). Add cabinet bridge days and later years here.' },
      fields: [
        { name: 'office', type: 'select', required: true, options: options(OFFICES) },
        { name: 'date', type: 'text', required: true, maxLength: 10, admin: { description: 'yyyy-mm-dd, the office’s local date.' } },
        { name: 'name', type: 'text', required: true, maxLength: 160 },
        { name: 'confirmed', type: 'checkbox', defaultValue: false },
        { name: 'note', type: 'text', maxLength: 200 },
      ],
    },
  ],
}
