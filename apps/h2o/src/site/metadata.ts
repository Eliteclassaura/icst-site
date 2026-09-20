/**
 * H2O Phase 2D — metadata and structured data, from the accepted tables only.
 *
 * Title, description, canonical, indexability and the schema recommendation all come from
 * `PAGE_CONTENT_INDEX.tsv` verbatim. Nothing is composed, truncated, templated or improved.
 *
 * The forbidden-property rule is enforced rather than remembered: `buildJsonLd` filters its own
 * output against the route's `forbidden_properties` and throws if a forbidden key survives. The
 * COMPANY_OR_SERVICE routes forbid `address;telephone;email;areaServed;foundingDate;
 * numberOfEmployees;award` — none of which is held by any accepted authority — and the EDITORIAL
 * routes forbid `FAQPage;HowTo;aggregateRating;review`.
 */
import type { Metadata } from 'next'
import type { CohortPage } from './cohort'
import { robotsFor } from './robots'

export class ForbiddenSchemaPropertyError extends Error {}

/**
 * Next metadata for a cohort route.
 *
 * Robots: `index` is emitted only when the route is publication-ready, which today is never. Until
 * then every route is `noindex, nofollow`, because a preview build that can be crawled is a
 * publication nobody authorized.
 */
export const metadataFor = (page: CohortPage): Metadata => {
  const robots = robotsFor(page)
  return {
    alternates: { canonical: page.canonical },
    description: page.metaDescription,
    robots: robots.index
      ? { follow: robots.follow, index: true }
      : { follow: false, googleBot: { follow: false, index: false }, index: false },
    title: page.titleTag,
  }
}

export type JsonLd = Record<string, unknown>

const ARTICLE_CLASSES = new Set(['EDITORIAL'])

/**
 * Structured data for a route, following its accepted `schema_recommendation`.
 *
 * Editorial routes get `Article` with the **observed** headline and dates — never invented ones —
 * and every route gets a `BreadcrumbList` that matches the trail the page actually renders. A
 * property the route class forbids is not merely omitted: its presence is a thrown error, so a
 * future edit that reintroduces one fails the build rather than the review.
 */
export const buildJsonLd = (page: CohortPage): JsonLd[] => {
  const forbidden = new Set(page.forbiddenProperties)
  const graph: JsonLd[] = []

  const breadcrumb: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement:
      page.canonicalPath === '/'
        ? [{ '@type': 'ListItem', name: page.h1, position: 1 }]
        : [
            { '@type': 'ListItem', name: 'Home', position: 1 },
            { '@type': 'ListItem', name: page.h1, position: 2 },
          ],
  }

  if (ARTICLE_CLASSES.has(page.routeClass)) {
    const article: JsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.h1,
      name: page.titleTag,
    }
    // Dates and author are emitted only where the authority observed them. `NOT_HELD` is an
    // internal truth-state token and never reaches markup, structured data or a label.
    if (page.observedDatePublished !== '' && page.observedDatePublished !== 'NOT_HELD') {
      article.datePublished = page.observedDatePublished
    }
    if (page.observedDateModified !== '' && page.observedDateModified !== 'NOT_HELD') {
      article.dateModified = page.observedDateModified
    }
    const byline = observedByline(page)
    if (byline !== null) article.author = { '@type': 'Person', name: byline }
    graph.push(article)
  } else {
    graph.push({ '@context': 'https://schema.org', '@type': 'WebPage', name: page.titleTag })
  }

  graph.push(breadcrumb)

  for (const node of graph) {
    for (const key of Object.keys(node)) {
      if (forbidden.has(key)) {
        throw new ForbiddenSchemaPropertyError(
          `Route ${page.routeId} emitted forbidden schema property "${key}"`,
        )
      }
    }
    const type = node['@type']
    if (typeof type === 'string' && forbidden.has(type)) {
      throw new ForbiddenSchemaPropertyError(`Route ${page.routeId} emitted forbidden schema type "${type}"`)
    }
  }

  return graph
}

/**
 * The byline to render, or null.
 *
 * `RENDER_OBSERVED_BYLINE:<name>` renders exactly that name. `NO_BYLINE` renders nothing. No
 * credential, title, role or biography is added, because none is observed and inventing one would
 * be an authorship claim nobody made.
 */
export const observedByline = (page: CohortPage): string | null => {
  const prefix = 'RENDER_OBSERVED_BYLINE:'
  if (!page.bylineInstruction.startsWith(prefix)) return null
  const name = page.bylineInstruction.slice(prefix.length).trim()
  return name === '' ? null : name
}

/** The observed publication date, or null when the authority holds none. */
export const observedDate = (page: CohortPage): string | null => {
  const value = page.observedDatePublished
  if (value === '' || value === 'NOT_HELD' || value === 'NOT_AN_EDITORIAL_ROUTE') return null
  return value.split(' ')[0] ?? null
}
