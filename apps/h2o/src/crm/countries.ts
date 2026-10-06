/**
 * RFQ country (owner request 2026-10-05; CT ruling: never default to US).
 *
 * The live Typeform's country question (Q11 "Country of Destination") is free text, and intake never received an ISO
 * code, so the inbox derives one, recording **how** it was known:
 *
 *   SUBMITTED           an ISO code the form sent (a structured country field)
 *   DESTINATION_ANSWER  the customer's free-text destination, resolved to an ISO code by name or common alias
 *   PHONE_INFERRED      the phone's international calling code, only where that code is one country (never +1,
 *                       which is shared by the US, Canada and the Caribbean, and never +7)
 *   UNKNOWN             none of the above — shown as "Unknown", never as a guess
 *
 * Names come from the platform's ISO region data (Intl.DisplayNames), so no country table is hand-maintained.
 */

export const COUNTRY_SOURCE = ['SUBMITTED', 'DESTINATION_ANSWER', 'PHONE_INFERRED', 'UNKNOWN'] as const
export type CountrySource = (typeof COUNTRY_SOURCE)[number]

const display = new Intl.DisplayNames(['en'], { type: 'region' })
/** Not countries: EU/UN groupings, private-use codes and "Unknown Region". */
const NOT_COUNTRY = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AA', 'QM', 'QN', 'QP', 'QQ', 'QR', 'QS', 'QT', 'QU', 'QV', 'QW', 'QX', 'QY', 'QZ', 'XK'])

/** ISO 3166-1 alpha-2 → English name. Kosovo (XK, user-assigned) is kept as it is widely used. */
export const COUNTRY_NAME: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>()
  for (let a = 65; a < 91; a++)
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b)
      if (NOT_COUNTRY.has(code) && code !== 'XK') continue
      try {
        const name = display.of(code)
        if (name && name !== code && !/unknown/i.test(name)) m.set(code, name)
      } catch {
        /* not a region */
      }
    }
  return m
})()

export const countryName = (code: string | null | undefined): string | null => (code ? (COUNTRY_NAME.get(code.toUpperCase()) ?? null) : null)
export const isCountryCode = (v: unknown): v is string => typeof v === 'string' && COUNTRY_NAME.has(v.toUpperCase())

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Common ways customers write a country that the ISO name does not cover. */
const ALIASES: Record<string, string> = {
  usa: 'US', 'u s a': 'US', us: 'US', 'u s': 'US', america: 'US', 'united states of america': 'US', 'the united states': 'US',
  uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  uae: 'AE', 'u a e': 'AE', emirates: 'AE', dubai: 'AE', 'abu dhabi': 'AE',
  'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR', 'north korea': 'KP',
  russia: 'RU', 'russian federation': 'RU', 'viet nam': 'VN', vietnam: 'VN', 'czech republic': 'CZ', czechia: 'CZ',
  holland: 'NL', 'the netherlands': 'NL', ksa: 'SA', 'saudi': 'SA', 'kingdom of saudi arabia': 'SA', turkey: 'TR', turkiye: 'TR',
  'ivory coast': 'CI', "cote d ivoire": 'CI', burma: 'MM', 'hong kong': 'HK', macau: 'MO', macao: 'MO', taiwan: 'TW',
  'mainland china': 'CN', prc: 'CN', 'p r china': 'CN', 'peoples republic of china': 'CN', laos: 'LA', 'lao pdr': 'LA',
  'trinidad': 'TT', 'trinidad and tobago': 'TT', 'bosnia': 'BA', 'dominican rep': 'DO', 'dr congo': 'CD', drc: 'CD',
  mexico: 'MX', 'mejico': 'MX', brasil: 'BR', 'espana': 'ES', 'deutschland': 'DE', philippines: 'PH', 'the philippines': 'PH',
}

const BY_NAME: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [code, name] of COUNTRY_NAME) m.set(norm(name), code)
  for (const [alias, code] of Object.entries(ALIASES)) m.set(norm(alias), code)
  return m
})()

/**
 * Resolve a free-text country ("Thailand", "USA", "Houston, Texas, USA", "TH"). Exact name/alias first, then a
 * 2-letter ISO code, then the **last** comma-separated part ("City, Country"). Anything else is unresolved — a guess
 * is never made.
 */
export function resolveCountryText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t || t.length > 120) return null
  const direct = BY_NAME.get(norm(t))
  if (direct) return direct
  if (/^[A-Za-z]{2}$/.test(t) && isCountryCode(t)) return t.toUpperCase()
  const parts = t.split(/[,/;|]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    const last = BY_NAME.get(norm(parts.at(-1)!))
    if (last) return last
  }
  return null
}

/**
 * International calling codes that belong to exactly one country (ITU). Shared codes are deliberately absent:
 * +1 (NANP: US, Canada, Caribbean), +7 (Russia, Kazakhstan), +44 is GB only for our purposes (Crown dependencies are
 * GB-adjacent and not separately listed), +47 Norway (Svalbard ignored), +61 Australia, +262/+590 (French territories).
 */
const CALLING: Record<string, string> = {
  20: 'EG', 27: 'ZA', 30: 'GR', 31: 'NL', 32: 'BE', 33: 'FR', 34: 'ES', 36: 'HU', 39: 'IT', 40: 'RO', 41: 'CH', 43: 'AT', 44: 'GB',
  45: 'DK', 46: 'SE', 47: 'NO', 48: 'PL', 49: 'DE', 51: 'PE', 52: 'MX', 53: 'CU', 54: 'AR', 55: 'BR', 56: 'CL', 57: 'CO', 58: 'VE',
  60: 'MY', 61: 'AU', 62: 'ID', 63: 'PH', 64: 'NZ', 65: 'SG', 66: 'TH', 81: 'JP', 82: 'KR', 84: 'VN', 86: 'CN', 90: 'TR', 91: 'IN',
  92: 'PK', 93: 'AF', 94: 'LK', 95: 'MM', 98: 'IR', 211: 'SS', 212: 'MA', 213: 'DZ', 216: 'TN', 218: 'LY', 220: 'GM', 221: 'SN',
  233: 'GH', 234: 'NG', 237: 'CM', 244: 'AO', 249: 'SD', 251: 'ET', 254: 'KE', 255: 'TZ', 256: 'UG', 260: 'ZM', 263: 'ZW',
  351: 'PT', 352: 'LU', 353: 'IE', 354: 'IS', 355: 'AL', 356: 'MT', 357: 'CY', 358: 'FI', 359: 'BG', 370: 'LT', 371: 'LV',
  372: 'EE', 373: 'MD', 374: 'AM', 375: 'BY', 380: 'UA', 381: 'RS', 385: 'HR', 386: 'SI', 387: 'BA', 389: 'MK', 420: 'CZ',
  421: 'SK', 501: 'BZ', 502: 'GT', 503: 'SV', 504: 'HN', 505: 'NI', 506: 'CR', 507: 'PA', 591: 'BO', 593: 'EC', 595: 'PY',
  598: 'UY', 852: 'HK', 853: 'MO', 855: 'KH', 856: 'LA', 880: 'BD', 886: 'TW', 960: 'MV', 961: 'LB', 962: 'JO', 963: 'SY',
  964: 'IQ', 965: 'KW', 966: 'SA', 967: 'YE', 968: 'OM', 970: 'PS', 971: 'AE', 972: 'IL', 973: 'BH', 974: 'QA', 975: 'BT',
  976: 'MN', 977: 'NP', 992: 'TJ', 993: 'TM', 994: 'AZ', 995: 'GE', 996: 'KG', 998: 'UZ',
}

/** Country from an international number ("+66 81 234 5678" → TH). Only numbers written with "+"; never +1 or +7. */
export function countryFromPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t.startsWith('+')) return null
  const digits = t.replace(/\D/g, '')
  for (const len of [3, 2]) {
    const hit = CALLING[digits.slice(0, len)]
    if (hit) return hit
  }
  return null
}

/** The RFQ's country and how it is known. */
export function deriveCountry(input: { submittedCountry?: unknown; destination?: unknown; phone?: unknown }): { code: string | null; source: CountrySource } {
  if (isCountryCode(input.submittedCountry)) return { code: String(input.submittedCountry).toUpperCase(), source: 'SUBMITTED' }
  const stated = resolveCountryText(input.destination)
  if (stated) return { code: stated, source: 'DESTINATION_ANSWER' }
  const byPhone = countryFromPhone(input.phone)
  if (byPhone) return { code: byPhone, source: 'PHONE_INFERRED' }
  return { code: null, source: 'UNKNOWN' }
}

/** ccTLDs used as generic/vanity domains (".io", ".co", ".ai", ".tv"…): they say nothing about the country. */
const VANITY_CCTLD = new Set(['io', 'co', 'ai', 'tv', 'me', 'ly', 'fm', 'gg', 'cc', 'ws', 'to', 'la', 'am', 'im', 'is', 'it', 'so', 'sh', 'ac', 'gl', 'ms', 'nu', 'vc', 'bz', 'dj', 'tk', 'ml', 'ga', 'cf', 'gq', 'cx', 'ag', 'sc', 'mu', 'pw', 'st', 'xyz'])

/**
 * ERS readiness (CT 2026-10-05): the country suggested by an email address's ccTLD ("plant@acme.co.th" → TH), marked
 * inferred by the caller. Generic TLDs and vanity ccTLDs give nothing. ".uk" → GB.
 */
export function countryFromEmailDomain(domain: unknown): string | null {
  if (typeof domain !== 'string') return null
  const tld = domain.toLowerCase().split('.').at(-1) ?? ''
  if (tld.length !== 2 || VANITY_CCTLD.has(tld)) return null
  const code = tld === 'uk' ? 'GB' : tld.toUpperCase()
  return isCountryCode(code) ? code : null
}

/** How a contact's country is known (contacts.country_source). Only SUBMITTED is a statement by the person. */
export const CONTACT_COUNTRY_SOURCE = ['SUBMITTED', 'IMPORTED', 'PHONE_INFERRED', 'EMAIL_CCTLD_INFERRED'] as const
