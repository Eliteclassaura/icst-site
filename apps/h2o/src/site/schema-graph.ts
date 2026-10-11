/**
 * SEO-FIX-1 (CT 2026-10-07; H2O_SEO_DEEP_R1 SF-1…SF-6, SF-9; OGCS rulings 46d05c1b section 3; owner: legalName and the
 * five profiles): one consistent entity graph on every page.
 *
 * - ONE Organization (`#organization`) and ONE WebSite (`#website`) on the canonical origin, emitted by the standard head;
 *   the imported RankMath Organization/WebSite nodes ("ICS", "Industrial Cooling Solutions", the old WordPress tagline)
 *   are removed and every reference to them points at the canonical @ids.
 * - Strings are plain text: HTML entities from the stored RankMath strings are decoded (`&amp;` → `&`).
 * - Person: the public author only (/author/timbozic/, as public-author-identity credits every page; owner decision
 *   2026-10-02), one node, no self-domain sameAs; the retired /author/h2ocooling/ archive (404) is never named.
 * - One WebPage per page: the second `#richSnippet` node of a non-article page is removed; on a service route its
 *   references point at the page's `Service` (provider = #organization), emitted once by the standard head.
 * - Product: `name` is the page's H1 (not the SEO title); a "Buy the …" description reads "Request a quote for the …".
 * - `inLanguage` is the page's own language (Locale Part B), never a constant.
 */
import { PUBLIC_ORIGIN } from '../content/config'
import { PUBLIC_AUTHOR } from './public-author-identity'
import { decodeEntities } from './text-repair'

export const ORGANIZATION_ID = `${PUBLIC_ORIGIN}/#organization`
export const WEBSITE_ID = `${PUBLIC_ORIGIN}/#website`
export const AUTHOR_ID = `${PUBLIC_ORIGIN}${PUBLIC_AUTHOR.path}`
export const BRAND_NAME = 'Industrial Cooling Solutions (ICS)'

/** The company's published profiles (owner-confirmed active, CT 2026-10-07; the same URLs as the site footer). */
export const ORGANIZATION_SAME_AS = [
  'https://www.linkedin.com/company/industrial-cooling-solutions/',
  'https://www.facebook.com/Industrial-Cooling-Solutions-Inc-ICS-807464446083414/',
  'https://www.instagram.com/h2ocooling2',
  'https://www.youtube.com/@IndustrialCoolingSolution',
  'https://www.tiktok.com/@h2ocooling0',
] as const

/** A profile URL compared without scheme, `www.`, case or trailing slash. */
const companyProfileKey = (url: string): string => url.toLowerCase().replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/+$/, '')

export const organizationNode = (): Record<string, unknown> => ({
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: BRAND_NAME,
  alternateName: ['ICS', 'Industrial Cooling Solutions'],
  legalName: 'Industrial Cooling Solutions Inc',
  url: `${PUBLIC_ORIGIN}/`,
  // the approved favicon-B tile: a square ICS mark (≥ 112 px) on the canonical origin
  logo: { '@type': 'ImageObject', '@id': `${PUBLIC_ORIGIN}/#logo`, url: `${PUBLIC_ORIGIN}/icon-512.png`, contentUrl: `${PUBLIC_ORIGIN}/icon-512.png`, width: 512, height: 512, caption: BRAND_NAME },
  image: { '@id': `${PUBLIC_ORIGIN}/#logo` },
  sameAs: [...ORGANIZATION_SAME_AS],
  address: { '@type': 'PostalAddress', streetAddress: '1457 Ammons Street, Suite 206', addressLocality: 'Lakewood', addressRegion: 'CO', postalCode: '80214', addressCountry: 'US' },
  contactPoint: [
    { '@type': 'ContactPoint', contactType: 'sales', telephone: '+13034622000', areaServed: 'US' },
    { '@type': 'ContactPoint', contactType: 'sales', telephone: '+6626617723', areaServed: 'TH' },
    { '@type': 'ContactPoint', contactType: 'sales', telephone: '+819042046742', areaServed: 'JP' },
  ],
})
export const websiteNode = (): Record<string, unknown> => ({
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: BRAND_NAME,
  alternateName: 'ICS',
  url: `${PUBLIC_ORIGIN}/`,
  publisher: { '@id': ORGANIZATION_ID },
  inLanguage: 'en',
})
/** Service routes (H2O_SEO_DEEP_R1 SF-4): their page entity is a Service. */
export const SERVICE_ROUTES: ReadonlySet<string> = new Set([
  '/cooling-tower/',
  '/cooling-tower-maintenance-repair-upgrade/',
  '/thermal-upgrade/',
  '/cooling-tower-replacement/',
  '/dry-soda-blast-cleaning-services-2/',
  '/disaster-recovery/',
  '/air-coolers/',
])

export type GraphContext = {
  /** canonical path of the page */
  path: string
  /** BCP 47 language of the page */
  lang: string
  /** an article (BlogPosting) page */
  article: boolean
  /** the page's display name (H1) */
  name: string
  /** the page's served meta description */
  description?: string
}

type Node = Record<string, unknown>
const DROP = Symbol('drop')
const typesOf = (n: Node): string[] => (Array.isArray(n['@type']) ? (n['@type'] as unknown[]).map(String) : n['@type'] !== undefined ? [String(n['@type'])] : [])
const idOf = (n: Node): string | undefined => (typeof n['@id'] === 'string' ? (n['@id'] as string) : undefined)
const ORG_REF = /\/#organization$/
const SITE_REF = /\/#website$/
const PERSON = /^Person$/
const SELF_HOSTS = /^https?:\/\/(?:www\.)?h2ocooling\.com\/?$/i

/**
 * The manufacturer a catalog product title leads with ("Amarillo A Series Single Reduction Gearbox", "Brentwood XF150MAx Cellular Drift
 * Eliminator", "TUF-LITE III ..."). Listed names only, matched at the start of the title; a generic title ("FRP Angles", "Splash Fill",
 * "Counterflow Nozzles") has no brand. This is the name the page already shows, not a statement of authorization or exclusivity.
 */
export const PRODUCT_BRANDS = ['Amarillo', 'TUF-LITE', 'Addax', 'Brentwood', 'Sumitomo', 'C.E. Shepherd', 'Rexnord', 'Dyna-Fab', 'Amertech', 'TECO', 'Robertshaw', 'Baldor', 'ABB', 'Howden', 'Hudson', 'Moore', 'ICS'] as const
export const productBrand = (title: string): string | undefined =>
  PRODUCT_BRANDS.find((b) => title === b || title.startsWith(`${b} `) || title.startsWith(`${b}-`) || title.startsWith(`${b}/`))

/** One JSON-LD block (a graph or a single node) normalized for the page; null when nothing is left. */
export function normalizeGraph(block: unknown, ctx: GraphContext): Node | null {
  if (!block || typeof block !== 'object') return null
  const root = block as Node
  const context = root['@context'] ?? 'https://schema.org'
  const nodes: Node[] = Array.isArray(root['@graph']) ? (root['@graph'] as Node[]) : [Object.fromEntries(Object.entries(root).filter(([k]) => k !== '@context'))]
  const pageId = `${PUBLIC_ORIGIN}${ctx.path}#webpage`
  const dropped = new Map<string, string | null>() // removed node @id → replacement @id (null = drop the reference)
  const kept: Node[] = []
  for (const n of nodes) {
    const types = typesOf(n)
    const id = idOf(n)
    if (types.includes('Organization') || (id && ORG_REF.test(id))) { if (id) dropped.set(id, ORGANIZATION_ID); continue }
    if (types.includes('WebSite') || (id && SITE_REF.test(id))) { if (id) dropped.set(id, WEBSITE_ID); continue }
    if (types.some((t) => PERSON.test(t))) {
      // the public author (public-author-identity already retargets retired author identities): one node, on the
      // canonical archive, without a self-domain sameAs; a second Person node folds into the first
      if (id) dropped.set(id, AUTHOR_ID)
      if (kept.some((k) => typesOf(k).some((t) => PERSON.test(t)))) continue
      // the company's own profiles belong on #organization, never on a person (CT 2026-10-08); personal profiles stay
      const person: Node = { ...n, '@id': AUTHOR_ID, url: AUTHOR_ID }
      if (Array.isArray(person.sameAs)) {
        const company = new Set(ORGANIZATION_SAME_AS.map(companyProfileKey))
        const own = (person.sameAs as unknown[]).filter((x) => typeof x !== 'string' || !company.has(companyProfileKey(x)))
        if (own.length) person.sameAs = own
        else delete person.sameAs
      }
      kept.push(person)
      continue
    }
    if (id && /#richSnippet$/.test(id) && !ctx.article && !types.includes('Product')) {
      // the page's Service (service routes) is emitted once by the standard head (OrganizationWebsiteSchema)
      dropped.set(id, SERVICE_ROUTES.has(ctx.path) ? `${PUBLIC_ORIGIN}${ctx.path}#service` : pageId)
      continue
    }
    kept.push(n)
  }
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return decodeEntities(v)
    if (Array.isArray(v)) {
      const out = v.map((x) => walk(x, key)).filter((x) => x !== DROP)
      return key === 'sameAs' ? out.filter((x) => typeof x !== 'string' || !SELF_HOSTS.test(x)) : out
    }
    if (v && typeof v === 'object') {
      const o = v as Node
      const id = idOf(o)
      // a bare reference to a removed node follows it (or goes with it); a Person's own @id is the canonical author
      if (id && Object.keys(o).length === 1 && dropped.has(id)) {
        const to = dropped.get(id)
        return to ? { '@id': to } : DROP
      }
      const out: Node = {}
      for (const [k, x] of Object.entries(o)) {
        if (k === 'inLanguage') { out[k] = ctx.lang; continue }
        const w = walk(x, k)
        if (w !== DROP) out[k] = w
      }
      if (typesOf(o).includes('Product')) {
        out.name = ctx.name
        // HEAD-POLISH-1: the product's own page, and the manufacturer its title leads with (no offers, price or sku: the catalog holds none)
        out.url = `${PUBLIC_ORIGIN}${ctx.path}`
        const brand = productBrand(ctx.name)
        if (brand && !out.brand) out.brand = { '@type': 'Brand', name: brand === 'ICS' ? BRAND_NAME : brand }
        if (typeof out.description === 'string') out.description = (out.description as string).replace(/^(?:Buy|Order|Shop)\s+(?:the\s+)?/i, 'Request a quote for the ')
      }
      return out
    }
    return v
  }
  const graph = kept.map((n) => walk(n)).filter((n): n is Node => Boolean(n) && n !== DROP)
  if (!graph.length) return null
  return { '@context': context, '@graph': graph }
}
