/**
 * H2O Phase 2D — the 29 accepted launch-cohort routes.
 *
 * One catch-all, `generateStaticParams` over the accepted table, and `dynamicParams = false`. That
 * combination is what makes the exposure guarantees structural rather than procedural:
 *
 *   - the route set **is** `CONTENT_IMPLEMENTATION_READY.tsv`, so the 16 remediation-hold routes and
 *     the 210 blocked product routes have no page to reach, not merely no link;
 *   - any other path 404s at build time, so no route can be reached by guessing a URL;
 *   - it is statically exportable, because every route is enumerated ahead of time.
 *
 * The body is the accepted `FINAL_BODY_<ROUTE_ID>.md`, hash-verified on load and parsed by a
 * renderer that refuses any construct outside the accepted subset. It is never passed through
 * `dangerouslySetInnerHTML`.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cohort, pageForSegments } from '../../../site/cohort'
import { buildJsonLd, metadataFor, observedByline, observedDate } from '../../../site/metadata'
import { correctLeadingHeadings } from '../../../site/headings'
import { parseBody } from '../../../site/markdown'
import { heroFor, inlineFor, mediaFor } from '../../../site/media'
import { documentsFor } from '../../../site/resources'
import { ArticleComposition } from '../../../site/ArticleComposition'
import { CommercialComposition } from '../../../site/CommercialComposition'
import { HomeComposition } from '../../../site/HomeComposition'
import { SiteChrome } from '../../../site/SiteChrome'

export const dynamicParams = false

export const generateStaticParams = (): Array<{ slug: string[] }> =>
  cohort().map((page) => ({ slug: page.segments }))

type Params = { params: Promise<{ slug?: string[] }> }

export const generateMetadata = async ({ params }: Params): Promise<Metadata> => {
  const page = pageForSegments((await params).slug)
  return page === null ? {} : metadataFor(page)
}

const Page = async ({ params }: Params) => {
  const page = pageForSegments((await params).slug)
  if (page === null) notFound()

  // The accepted body is parsed verbatim and hash-verified; the only thing PV-02 changes is the
  // level of the leading heading run, and only where the document's own structure makes that
  // unambiguous. See src/site/headings.ts.
  const blocks = correctLeadingHeadings(parseBody(page.bodyMarkdown, page.routeId)).blocks
  const hero = heroFor(page.routeId)
  const inline = inlineFor(page.routeId)
  const documents = documentsFor(page.routeId)
  const byline = observedByline(page)
  const date = observedDate(page)
  const jsonLd = buildJsonLd(page)

  // The homepage is composed rather than rendered as one column: its accepted sections are placed
  // into designed regions by `HomeComposition`, from the same parsed blocks, with no text changed.
  // Every other route keeps the article template, which the visual pass restyles rather than
  // restructures.
  if (page.canonicalPath === '/') {
    return (
      <SiteChrome bleed page={page}>
        {jsonLd.map((node, i) => (
          <script
            dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
            key={`ld-${i}`}
            type="application/ld+json"
          />
        ))}
        {/*
          The homepage takes no frozen placement. Its imagery comes from the bounded media
          overlay, which HomeComposition reads directly by region. The frozen placement for this
          route — attachment 3452, 490x384 rooftop towers on a downtown building — is still loaded
          and hash-verified by `media.ts`; it is simply not shown here, for the reason the media
          overlay records: it cannot drive a hero without upscaling a frozen asset, and its subject
          argues for the commercial-building positioning this estate excludes.
        */}
        <HomeComposition blocks={blocks} page={page} />
      </SiteChrome>
    )
  }

  /*
    The six other COMPANY_OR_SERVICE routes. They share the homepage's accepted class but not its
    job, so they render through the commercial template with a per-route variant rather than
    through the article template, which is what made the estate read as one page twenty-nine times.
  */
  if (page.routeClass === 'COMPANY_OR_SERVICE') {
    return (
      <SiteChrome page={page}>
        {jsonLd.map((node, i) => (
          <script
            dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
            key={`ld-${i}`}
            type="application/ld+json"
          />
        ))}
        <CommercialComposition
          blocks={blocks}
          documents={documents}
          placements={mediaFor(page.routeId)}
          page={page}
        />
      </SiteChrome>
    )
  }

  return (
    <SiteChrome page={page}>
      {/*
        JSON-LD is data, not script: it is `application/ld+json` and is not governed by
        script-src. Its content is built from accepted values and filtered against the route's
        forbidden properties, which throws rather than omits if one ever reappears.
      */}
      {jsonLd.map((node, i) => (
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
          key={`ld-${i}`}
          type="application/ld+json"
        />
      ))}
      <ArticleComposition
        blocks={blocks}
        byline={byline}
        date={date}
        documents={documents}
        hero={hero}
        inline={inline}
        page={page}
      />
    </SiteChrome>
  )
}

export default Page
