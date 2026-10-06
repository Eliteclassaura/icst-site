/**
 * Native RFQ: the country picker (ISO 3166-1 alpha-2). The visitor picks a country; the code travels (it drives routing in
 * the CRM adapter); the name is the runtime's own region name in the registry locale (Intl.DisplayNames), so no name table is shipped.
 * COUNTRY_CODES seeds the fixture registry; the client always renders the registry's own `countries`.
 */
export const COUNTRY_CODES: readonly string[] = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')

const names = new Map<string, Intl.DisplayNames | null>()
/** The country's name in the registry locale (the code itself if the runtime has no name for it). */
export const countryName = (code: string, locale = 'en'): string => {
  if (!names.has(locale))
    try {
      names.set(locale, new Intl.DisplayNames([locale, 'en'], { type: 'region' }))
    } catch {
      names.set(locale, null)
    }
  return names.get(locale)?.of(code) ?? code
}

/** The registry's countries matching a search, by name or code, alphabetical by name. */
export function searchCountries(codes: readonly string[], query: string, locale = 'en'): Array<{ code: string; name: string }> {
  const q = query.trim().toLowerCase()
  return codes.map((code) => ({ code, name: countryName(code, locale) }))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
    .sort((a, b) => a.name.localeCompare(b.name, locale))
}
