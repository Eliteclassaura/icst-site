/**
 * R2.4 (Control Tower 2026-10-05; SEO Checker baseline items a, b, d): the standard head every public page carries.
 *
 * - og:title / og:description / twitter:title / twitter:description mirror the SERVED title and meta description (the
 *   values search sees), on every page — an imported page whose source carried no social tags gets them too.
 * - og:url is the canonical URL; twitter:card is `summary_large_image`; og:site_name is ICS (the imported WordPress site
 *   title is not the brand); og:type is kept from the source when present.
 * - og:image: the page's own held image (R2.3 public-urls) or, where it has none, the site default — a verified ICS
 *   project photo cropped to 1200×630 (content/design/og-default.json).
 * - Organization and WebSite JSON-LD nodes with stable @ids on the canonical origin, where the page's own structured data
 *   lacks them.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PUBLIC_ORIGIN } from '../content/config'
import { servedOrigin } from './public-urls'

export type Meta = { name: string; value: string }
/** `defaultImage: false`: no site default og:image (a project page shows only its own verified photo — Design Fixes A1). */
export type HeadFacts = { title: string; description: string; url: string; type?: 'article' | 'website'; defaultImage?: boolean }

type OgDefault = { file: string; width: number; height: number; type: string; alt: string }
let ogDefaultCache: OgDefault | undefined
export const ogDefault = (): OgDefault =>
  (ogDefaultCache ??= JSON.parse(readFileSync(path.join(process.cwd(), 'content/design/og-default.json'), 'utf8')).image as OgDefault)

export const SITE_NAME = 'ICS'
export const ORGANIZATION_ID = `${PUBLIC_ORIGIN}/#organization`
export const WEBSITE_ID = `${PUBLIC_ORIGIN}/#website`

/**
 * The page's meta tags with the standard social set in place. `meta` is the page's own (already public-urls rewritten)
 * list; social title/description/url are replaced by the served values, missing tags are added.
 */
export function standardSocialMeta(meta: ReadonlyArray<Meta>, facts: HeadFacts): Meta[] {
  const MIRRORED = new Set(['og:title', 'og:description', 'og:url', 'og:site_name', 'twitter:title', 'twitter:description'])
  const out = meta.filter((m) => !MIRRORED.has(m.name))
  const has = (name: string) => out.some((m) => m.name === name)
  const add: Meta[] = [{ name: 'og:title', value: facts.title }, { name: 'og:url', value: facts.url }, { name: 'twitter:title', value: facts.title }]
  if (facts.description) add.push({ name: 'og:description', value: facts.description }, { name: 'twitter:description', value: facts.description })
  if (!has('og:type')) add.push({ name: 'og:type', value: facts.type ?? 'website' })
  add.push({ name: 'og:site_name', value: SITE_NAME })
  if (!has('twitter:card')) add.push({ name: 'twitter:card', value: 'summary_large_image' })
  if (!has('og:image') && facts.defaultImage !== false) {
    const d = ogDefault()
    const url = servedOrigin() + d.file
    add.push(
      { name: 'og:image', value: url },
      { name: 'og:image:width', value: String(d.width) },
      { name: 'og:image:height', value: String(d.height) },
      { name: 'og:image:type', value: d.type },
      { name: 'og:image:alt', value: d.alt },
    )
    if (!has('twitter:image')) add.push({ name: 'twitter:image', value: url })
  }
  return [...out, ...add]
}

/** The Organization / WebSite nodes the page's own structured data lacks (by @id), as one JSON-LD graph, or null. */
export function organizationWebsiteGraph(schemaJson: ReadonlyArray<string>): Record<string, unknown> | null {
  const all = schemaJson.join('\n')
  const nodes: Array<Record<string, unknown>> = []
  if (!all.includes(`"${ORGANIZATION_ID}"`)) nodes.push({ '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'Industrial Cooling Solutions', alternateName: SITE_NAME, url: `${PUBLIC_ORIGIN}/` })
  if (!all.includes(`"${WEBSITE_ID}"`)) nodes.push({ '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE_NAME, url: `${PUBLIC_ORIGIN}/`, publisher: { '@id': ORGANIZATION_ID } })
  return nodes.length ? { '@context': 'https://schema.org', '@graph': nodes } : null
}

const tag = (m: Meta, i: number) =>
  m.name.startsWith('og:') || m.name.startsWith('article:') ? <meta key={`s${i}`} property={m.name} content={m.value} /> : <meta key={`s${i}`} name={m.name} content={m.value} />

/** The meta tags, rendered (og:/article: as `property`, the rest as `name`). */
export const MetaTags = ({ meta }: { meta: ReadonlyArray<Meta> }) => <>{meta.map(tag)}</>

/** JSON-LD for the Organization / WebSite nodes a page lacks. */
export function OrganizationWebsiteSchema({ schemaJson = [] }: { schemaJson?: ReadonlyArray<string> }) {
  const graph = organizationWebsiteGraph(schemaJson)
  return graph ? <script type="application/ld+json" data-standard-schema="" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replaceAll('<', '\\u003c') }} /> : null
}

/** The whole standard head for a template with no imported document (English services, /search/). */
export function StandardHead({ facts }: { facts: HeadFacts }) {
  return <>
    <MetaTags meta={standardSocialMeta([], facts)} />
    <OrganizationWebsiteSchema />
  </>
}
