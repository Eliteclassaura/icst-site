/**
 * Fixture identity injection (ADR-026 §3, C5.5 workstreams B and H).
 *
 * Registry fixtures are shared across every client, so they must carry no client's identity: a
 * card rendered from a fixture and pushed into client B's design project must not name client A.
 * Fixtures therefore hold `{{brand.*}}` placeholders, and identity arrives here at render time —
 * from the client's blueprint (the fields the blueprint owns) plus a small committed overrides
 * file for the handful of strings a blueprint cannot express (a wordmark's accent split, a
 * monogram path, office hours).
 *
 * The default is the neutral "Studio Example" identity, so anything that forgets to inject a brand
 * produces a neutral artefact rather than leaking one.
 */
export type BrandLink = { label: string; href: string; external?: boolean }
export type BrandOffice = { city: string; region: string; hours: string }

export type FixtureBrand = {
  /** Client id, or `neutral` for the shared preset identity. */
  id: string
  siteName: string
  siteUrl: string
  /** Wordmark split: `wordmark` + `accent` render as one lockup. */
  wordmark: string
  accent: string
  personName: string
  role: string
  copyrightHolder: string
  heroAlt: string
  monogramPath: string
  social: BrandLink[]
  offices: BrandOffice[]
}

/** The identity every preset, every unbranded bundle and every test renders with. */
export const NEUTRAL_BRAND: FixtureBrand = {
  id: 'neutral',
  siteName: 'Studio Example',
  siteUrl: 'https://studio.example',
  wordmark: 'studio',
  accent: '.example',
  personName: 'Alex Doe',
  role: 'Studio Example · Practice',
  copyrightHolder: 'Studio Example',
  heroAlt: 'Studio Example — placeholder portrait for the hero fixture',
  // A neutral, geometric monogram: two strokes, no resemblance to any client's mark.
  monogramPath: 'M11 11h18v4H15v6h12v4H15v6h14v4H11z',
  social: [{ label: 'Profile', href: 'https://studio.example/profile', external: true }],
  offices: [{ city: 'Example City', region: 'Example Region · Practice', hours: 'Mon–Fri · 9–6 (UTC+0)' }],
}

/** Overrides a blueprint cannot express. Committed at `apps/<client>/design/fixture-brand.json`. */
export type BrandOverrides = Partial<Omit<FixtureBrand, 'id'>>

type BlueprintEntity = { type?: string; name?: string; data?: Record<string, unknown> }
type BlueprintLike = {
  site?: { name?: string; url?: string }
  schemaEntities?: BlueprintEntity[]
}

function entityOf(bp: BlueprintLike, type: string): Record<string, unknown> | undefined {
  return bp.schemaEntities?.find((e) => e.type === type)?.data
}

function splitWordmark(siteName: string): { wordmark: string; accent: string } {
  const dot = siteName.lastIndexOf('.')
  if (dot > 0 && dot < siteName.length - 1)
    return { wordmark: siteName.slice(0, dot), accent: siteName.slice(dot) }
  return { wordmark: siteName, accent: '' }
}

/**
 * Derive the identity a blueprint owns. Everything here is read from the blueprint, so it cannot
 * drift from the site's own facts; `overrides` fills the rest and is asserted against these values
 * by `brandDrift`.
 */
export function resolveBrand(
  clientId: string,
  blueprint: BlueprintLike,
  overrides: BrandOverrides = {},
): FixtureBrand {
  const siteName = blueprint.site?.name ?? NEUTRAL_BRAND.siteName
  const siteUrl = blueprint.site?.url ?? NEUTRAL_BRAND.siteUrl
  const person = entityOf(blueprint, 'Person')
  const personName = typeof person?.name === 'string' ? person.name : NEUTRAL_BRAND.personName
  const sameAs = Array.isArray(person?.sameAs) ? (person.sameAs as unknown[]) : []
  const derived: FixtureBrand = {
    id: clientId,
    siteName,
    siteUrl,
    ...splitWordmark(siteName),
    personName,
    role: typeof person?.jobTitle === 'string' ? person.jobTitle : NEUTRAL_BRAND.role,
    copyrightHolder: `${siteName} — ${personName}`,
    heroAlt: NEUTRAL_BRAND.heroAlt,
    monogramPath: NEUTRAL_BRAND.monogramPath,
    social: sameAs
      .filter((s): s is string => typeof s === 'string')
      .map((href) => ({ label: labelForSocial(href), href, external: true })),
    offices: [],
  }
  return { ...derived, ...overrides, id: clientId }
}

function labelForSocial(href: string): string {
  const host = /^https?:\/\/([^/]+)/i.exec(href)?.[1]?.replace(/^www\./, '') ?? href
  const known: Record<string, string> = {
    'linkedin.com': 'LinkedIn',
    'instagram.com': 'Instagram',
    'github.com': 'GitHub',
    'x.com': 'X',
  }
  return known[host] ?? host
}

/**
 * Fields the blueprint owns must match between an overrides file and the blueprint. Returns the
 * mismatches; a unit test turns them into a failure so a committed overrides file cannot quietly
 * assert an identity the site does not have.
 */
export const BLUEPRINT_OWNED = ['siteName', 'siteUrl', 'personName'] as const

export function brandDrift(blueprint: BlueprintLike, overrides: BrandOverrides): string[] {
  const derived = resolveBrand('drift-check', blueprint)
  const out: string[] = []
  for (const key of BLUEPRINT_OWNED) {
    const o = overrides[key]
    if (o !== undefined && o !== derived[key])
      out.push(`${key}: overrides say ${JSON.stringify(o)}, blueprint says ${JSON.stringify(derived[key])}`)
  }
  return out
}

const PLACEHOLDER = /\{\{\s*brand\.([a-zA-Z]+)\s*\}\}/g

/** True when a value still contains an uninjected placeholder. (Own regex: `PLACEHOLDER` is global and `test` is stateful.) */
export function hasBrandPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && /\{\{\s*brand\.[a-zA-Z]+\s*\}\}/.test(value)
}

function substitute(text: string, brand: FixtureBrand): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    const v = (brand as unknown as Record<string, unknown>)[key]
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    throw new Error(`unknown brand placeholder ${whole}`)
  })
}

/** `{ $brandList: 'social' | 'offices' }` inside a fixture array expands to the brand's own list. */
function brandList(value: unknown, brand: FixtureBrand): unknown[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value as Record<string, unknown>)
  if (keys.length !== 1 || keys[0] !== '$brandList') return null
  const which = (value as { $brandList: unknown }).$brandList
  if (which === 'social') return brand.social.map((s) => ({ ...s }))
  if (which === 'offices') return brand.offices.map((o) => ({ ...o }))
  throw new Error(`unknown $brandList ${JSON.stringify(which)}`)
}

/**
 * Deep-substitute `{{brand.*}}` in fixture props. Structure and types are preserved; only strings
 * change, and an unknown placeholder throws rather than rendering literally.
 */
export function applyBrand<T>(value: T, brand: FixtureBrand): T {
  if (typeof value === 'string') return substitute(value, brand) as unknown as T
  if (Array.isArray(value)) {
    // A `{ $brandList: 'social' }` element expands in place, so a fixture can ask for the brand's
    // own list of links or offices without holding any of them.
    const out: unknown[] = []
    for (const v of value) {
      const list = brandList(v, brand)
      if (list) out.push(...list)
      else out.push(applyBrand(v, brand))
    }
    return out as unknown as T
  }
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src)) out[k] = applyBrand(src[k], brand)
    return out as unknown as T
  }
  return value
}
