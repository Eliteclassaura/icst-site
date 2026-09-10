import type { Metadata } from 'next'
import type { Page, SeoDefault, SiteSetting } from '../payload-types'

/**
 * Metadata from the page's SEO group + seo-defaults + site-settings. Values are data, not templates:
 * when an editor sets an explicit SEO title it is used verbatim (the legacy titles are exact), otherwise
 * the template applies. Robots come from the page's directive fields or the site default.
 */
export type SiteMeta = { origin: string; siteName: string; defaults: SeoDefault | null }

export function absolute(origin: string, path: string) {
  return path.startsWith('http') ? path : origin.replace(/\/$/, '') + path
}

export function pagePath(page: Pick<Page, 'slug' | 'parent'>): string {
  if (page.slug === 'home') return '/'
  const parent = page.parent && typeof page.parent === 'object' ? (page.parent as Page).slug : null
  return parent ? `/${parent}/${page.slug}/` : `/${page.slug}/`
}

export function buildMetadata(page: Page, site: SiteMeta, path: string): Metadata {
  const d = site.defaults
  const seo = page.seo ?? {}
  const title =
    seo.title ||
    (d?.titleTemplate ?? '{title} | {siteName}')
      .replace('{title}', page.title)
      .replace('{siteName}', site.siteName)
  const description = seo.description || d?.defaultDescription || undefined
  const canonical = seo.canonical || absolute(site.origin, path)
  const noindex = Boolean(seo.noindex)
  const robots = noindex ? 'noindex,nofollow' : d?.robotsDirectives || 'index,follow'
  const ogImageDoc =
    seo.ogImage && typeof seo.ogImage === 'object'
      ? seo.ogImage
      : d?.defaultOgImage && typeof d.defaultOgImage === 'object'
        ? d.defaultOgImage
        : null
  const ogImage = seo.ogImageUrl
    ? absolute(site.origin, seo.ogImageUrl)
    : ogImageDoc?.url
      ? absolute(site.origin, ogImageDoc.url)
      : absolute(site.origin, '/assets/img/og.jpg')
  const ogTitle = seo.ogTitle || title
  const ogDescription = seo.ogDescription || description
  const ogImageAlt = seo.ogImageAlt || `${site.siteName} — ${ogTitle}`
  const twitterImageAlt = seo.twitterImageAlt || ogImageAlt
  const twitterDescription = seo.twitterDescription || ogDescription
  const isArticle = ['article', 'pricing', 'comparison', 'case-study', 'build', 'glossary'].includes(
    page.pageType,
  )
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      type: isArticle ? 'article' : 'website',
      siteName: site.siteName,
      url: canonical,
      title: ogTitle,
      description: ogDescription,
      locale: 'en_US',
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogImageAlt, type: 'image/jpeg' }],
    },
    twitter: {
      card: 'summary_large_image',
      site: d?.twitterSite || undefined,
      creator: d?.twitterSite || undefined,
      title: ogTitle,
      description: twitterDescription,
      images: [{ url: ogImage, alt: twitterImageAlt }],
    },
  }
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────────────────────────
type Node = Record<string, unknown> & { '@type': string | string[]; '@id'?: string }
type Block = Record<string, unknown> & { blockType: string }

const ref = (id: string) => ({ '@id': id })

/**
 * Composable JSON-LD (master prompt §Technical SEO). Stable @ids follow the legacy convention
 * (`<origin>/#website`, `<url>#webpage`, `<url>#breadcrumb`, `<url>#faq`, `<url>#term-<id>` …) so the
 * parity gate can diff id sets. Site entities come from `schema-entities` (emitOn all/home); page nodes
 * are generated from blocks (FAQ, breadcrumb, glossary, steps, pricing) with legacy extras merged in.
 */
export function buildJsonLd(opts: {
  page: Page
  path: string
  site: SiteMeta & {
    entities: Array<{ schemaId: string; type: string; data: unknown; emitOn?: string | null }>
  }
  layout: Block[]
  siteSettings: SiteSetting | null
}): { '@context': 'https://schema.org'; '@graph': Node[] } {
  const { page, path, site, layout } = opts
  const origin = site.origin.replace(/\/$/, '')
  const url = origin + path
  const isHome = path === '/'
  const graph: Node[] = []
  const extra = (page.seo?.schemaExtra ?? {}) as Record<string, Record<string, unknown> | undefined>

  // Site entities
  for (const e of site.entities) {
    if (e.emitOn === 'none' || (e.emitOn === 'home' && !isHome)) continue
    const types = e.type.split(',').map((t) => t.trim())
    graph.push({
      '@type': types.length > 1 ? types : types[0]!,
      '@id': e.schemaId,
      ...(e.data as Record<string, unknown>),
    })
  }
  const personId = site.entities.find((e) => e.schemaId.endsWith('#person'))?.schemaId
  const orgId = site.entities.find((e) => e.schemaId.endsWith('#service'))?.schemaId
  const websiteId = site.entities.find((e) => e.schemaId.endsWith('#website'))?.schemaId

  // WebPage
  const wp = extra.webpage ?? {}
  const { '@type': wpType, ...wpRest } = wp as { '@type'?: string | string[] }
  graph.push({
    '@type': (wpType as string | string[]) ?? 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: page.seo?.title || page.title,
    description: page.seo?.description || undefined,
    isPartOf: websiteId ? ref(websiteId) : undefined,
    breadcrumb: ref(`${url}#breadcrumb`),
    inLanguage: 'en',
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${origin}/assets/img/og.jpg`,
      width: 1200,
      height: 630,
    },
    ...wpRest,
  })

  // BreadcrumbList — from the breadcrumb block, or the single home item.
  const crumb = layout.find((b) => b.blockType === 'breadcrumb') as
    (Block & { trail?: Array<{ label: string; href: string }>; current?: string }) | undefined
  const items = crumb
    ? [
        ...(crumb.trail ?? []).map((t) => ({ name: t.label, item: absolute(origin, t.href) })),
        { name: crumb.current ?? page.title, item: url },
      ]
    : [{ name: site.siteName, item: origin + '/' }]
  graph.push({
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  })

  // Article (article-like page types)
  if (extra.article || ['article', 'pricing', 'comparison', 'case-study', 'build'].includes(page.pageType)) {
    graph.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: page.seo?.title || page.title,
      description: page.seo?.description || undefined,
      mainEntityOfPage: ref(`${url}#webpage`),
      author: personId ? ref(personId) : undefined,
      publisher: orgId ? ref(orgId) : undefined,
      image: `${origin}/assets/img/og.jpg`,
      inLanguage: 'en',
      datePublished: page.createdAt,
      dateModified: page.updatedAt,
      ...(extra.article ?? {}),
    })
  }

  for (const b of layout) {
    if (b.blockType === 'faq') {
      const faq = b as Block & { items?: Array<{ question: string; answer: string }> }
      graph.push({
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: (faq.items ?? []).map((q) => ({
          '@type': 'Question',
          name: q.question,
          acceptedAnswer: { '@type': 'Answer', text: q.answer },
        })),
      })
    }
    if (b.blockType === 'glossaryList') {
      const g = b as Block & {
        schemaSetId?: string
        title?: string
        lede?: string
        terms?: Array<{ term: string; definition: string; anchor: string; schemaId?: string }>
      }
      const setId = `${url}#${g.schemaSetId || 'glossary'}`
      const termId = (t: { anchor: string; schemaId?: string }) =>
        t.schemaId === 'geo' && !isHome ? `${origin}/#term-geo` : `${url}#term-${t.schemaId || t.anchor}`
      graph.push({
        '@type': 'DefinedTermSet',
        '@id': setId,
        name: g.title,
        description: g.lede,
        url: `${url}#${isHome ? 'glossary' : ''}`.replace(/#$/, ''),
        hasDefinedTerm: (g.terms ?? []).map((t) => ref(termId(t))),
      })
      for (const t of g.terms ?? [])
        graph.push({
          '@type': 'DefinedTerm',
          '@id': termId(t),
          name: t.term,
          description: t.definition,
          inDefinedTermSet: ref(setId),
          url: `${url}#${t.anchor}`,
        })
    }
    if (b.blockType === 'steps') {
      const s = b as Block & {
        ordered?: boolean
        howTo?: boolean
        title?: string
        lede?: string
        items?: Array<{ title: string; text: string }>
        schemaExtra?: Record<string, unknown>
      }
      if (s.ordered && (s.howTo || s.schemaExtra)) {
        graph.push({
          '@type': 'HowTo',
          '@id': `${url}#howto`,
          name: s.title,
          description: s.lede,
          inLanguage: 'en',
          author: personId ? ref(personId) : undefined,
          ...(s.schemaExtra ?? {}),
          step: (s.items ?? []).map((it, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: it.title,
            text: it.text,
            url: `${url}#s-steps-${i}`,
          })),
        })
      }
    }
    if (b.blockType === 'dataTable') {
      const t = b as Block & { variant?: string; schemaExtra?: Record<string, unknown> }
      if (t.variant === 'price' && t.schemaExtra)
        graph.push({ '@type': 'OfferCatalog', '@id': `${url}#rates`, ...t.schemaExtra })
    }
  }
  if (extra.howTo && !graph.some((n) => n['@type'] === 'HowTo'))
    graph.push({ '@type': 'HowTo', '@id': `${url}#howto`, ...extra.howTo })
  if (extra.offerCatalog && !graph.some((n) => n['@type'] === 'OfferCatalog'))
    graph.push({ '@type': 'OfferCatalog', '@id': `${url}#rates`, ...extra.offerCatalog })

  const out = { '@context': 'https://schema.org' as const, '@graph': graph.map(strip) }
  // Carried legacy nodes reference the production origin; on staging the whole graph must agree with the page URL.
  const legacyOrigin = (opts.siteSettings?.siteUrl ?? '').replace(/\/$/, '')
  if (legacyOrigin && legacyOrigin !== origin)
    return JSON.parse(JSON.stringify(out).split(legacyOrigin).join(origin))
  return out
}

function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T
}
