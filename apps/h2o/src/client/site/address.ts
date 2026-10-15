/** The full postal address of an office as display lines: the street lines, then "City Postcode", then the country name. All from the manifest. */
export function addressLines(office: { country: string; address: { lines: readonly string[]; city: string; postalCode: string } }): string[] {
  const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(office.country) ?? office.country
  const cityLine = [office.address.city, office.address.postalCode].filter(Boolean).join(' ')
  return [...office.address.lines, cityLine, country].filter(Boolean)
}
