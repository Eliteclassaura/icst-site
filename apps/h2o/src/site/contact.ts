import { readFileSync } from 'node:fs'
import path from 'node:path'

const contentRoot = path.join(process.cwd(), 'content', '2d-launch-cohort')

export type ContactOffice = {
  addressLines: string[]
  city: string
  company?: string
  country: string
  countryName: string
  displayLabel: string
  officeKey: string
  postalCode: string
  region: string
  telephoneDisplay: string
  telephoneHref: string
}

type ContactAuthority = {
  authorityDate: string
  authorityId: string
  offices: ContactOffice[]
}

const authority = JSON.parse(
  readFileSync(path.join(contentRoot, 'OWNER_CONTACT_AUTHORITY_OVERRIDE_2026_09_21.json'), 'utf8'),
) as ContactAuthority

export const CONTACT_AUTHORITY_ID = authority.authorityId
export const CONTACT_AUTHORITY_DATE = authority.authorityDate
/**
 * Display spelling of a number, keyed by its unchanged tel: link. Design R3 (CT ruling 5, OGCS About row 38 and Contact rows
 * 4/31/35, 2026-10-06): the site shows each number exactly as the owner authority file publishes it (Thailand +662-661-7723),
 * superseding the Design Fixes R1 A7 regrouping. An entry here would override the authority's display for one number.
 */
export const TELEPHONE_DISPLAY: Readonly<Record<string, string>> = {}
export const contactOffices: ContactOffice[] = authority.offices.map((office) => ({ ...office, telephoneDisplay: TELEPHONE_DISPLAY[office.telephoneHref] ?? office.telephoneDisplay }))

export const postalAddressFor = (office: ContactOffice): Record<string, string> | null => {
  if (office.addressLines.length === 0) return null
  return {
    '@type': 'PostalAddress',
    addressCountry: office.countryName,
    addressLocality: office.city,
    addressRegion: office.region,
    postalCode: office.postalCode,
    streetAddress: office.addressLines.join(', '),
  }
}

export const organizationContactJsonLd = (): Record<string, unknown> => {
  const usa = contactOffices.find((office) => office.officeKey === 'usa')
  if (usa === undefined) throw new Error('Contact authority must provide the USA office')
  const address = postalAddressFor(usa)
  if (address === null) throw new Error('USA contact authority must provide a postal address')
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    address,
    contactPoint: contactOffices.map((office) => ({
      '@type': 'ContactPoint',
      telephone: office.telephoneHref.replace('tel:', ''),
    })),
    name: usa.company,
  }
}
