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
import { Fragment, type ReactNode } from 'react'
import { cohort, pageForSegments } from '../../../site/cohort'
import { buildJsonLd, metadataFor, observedByline, observedDate } from '../../../site/metadata'
import { correctLeadingHeadings } from '../../../site/headings'
import { parseBody, type Block, type InlineNode } from '../../../site/markdown'
import { heroFor, inlineFor, type PlacedMedia } from '../../../site/media'
import { documentsFor, type ResourceDocument } from '../../../site/resources'
import { RfqMount } from '../../../site/RfqMount'
import { SiteChrome } from '../../../site/SiteChrome'

export const dynamicParams = false

export const generateStaticParams = (): Array<{ slug: string[] }> =>
  cohort().map((page) => ({ slug: page.segments }))

type Params = { params: Promise<{ slug?: string[] }> }

export const generateMetadata = async ({ params }: Params): Promise<Metadata> => {
  const page = pageForSegments((await params).slug)
  return page === null ? {} : metadataFor(page)
}

const renderInline = (nodes: InlineNode[]): ReactNode =>
  nodes.map((node, i) => {
    const key = `${node.kind}-${i}`
    if (node.kind === 'strong') return <strong key={key}>{node.text}</strong>
    if (node.kind === 'emphasis') return <em key={key}>{node.text}</em>
    if (node.kind === 'link')
      return (
        <a href={node.href} key={key}>
          {node.text}
        </a>
      )
    return <Fragment key={key}>{node.text}</Fragment>
  })

/**
 * A recovered cohort image. Rendered at its own aspect ratio and never above its native width, so
 * there is no crop to go wrong at a narrow viewport and no upscaling at a wide one.
 */
const Figure = ({ media }: { media: PlacedMedia }): ReactNode => (
  <figure className={media.role === 'HERO' ? 'media media-hero' : 'media media-inline'}>
    <img
      alt={media.alt}
      height={media.height}
      src={media.src}
      style={{ maxWidth: `${media.renderedMaxWidthPx}px` }}
      width={media.width}
    />
  </figure>
)

/**
 * The recovered resource documents, as a plain list of links.
 *
 * Restrained on purpose: a label, a format and a page count, which are the only things about these
 * files that are evidenced. No description, date, revision or applicability is shown, because none
 * is evidenced and inventing one is not an option. The link goes to the document's own preserved
 * path, so an existing bookmark or index entry reaches the same file.
 */
const DocumentList = ({ documents }: { documents: ResourceDocument[] }): ReactNode => (
  <section aria-labelledby="documents" className="docs">
    <h2 id="documents">Documents</h2>
    <ul>
      {documents.map((doc) => (
        <li key={doc.attachmentId}>
          <a href={doc.href}>{doc.label}</a>
          <span className="docs-meta">
            PDF{doc.pageCount === null ? null : <> · {doc.pageCount} pages</>}
          </span>
        </li>
      ))}
    </ul>
  </section>
)

const renderBlocks = (blocks: Block[]): ReactNode =>
  blocks.map((block, i) => {
    const key = `${block.kind}-${i}`
    if (block.kind === 'heading') {
      // The body's own `#` is the H1 and matches the accepted `h1` value; parity is asserted by test.
      if (block.level === 1) return <h1 key={key}>{renderInline(block.text)}</h1>
      if (block.level === 2) return <h2 key={key}>{renderInline(block.text)}</h2>
      return <h3 key={key}>{renderInline(block.text)}</h3>
    }
    if (block.kind === 'list') {
      return (
        <ul key={key}>
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    }
    return <p key={key}>{renderInline(block.text)}</p>
  })

/**
 * Inline images are distributed over the body's own section boundaries: the first goes before the
 * second H2, the next before the third, and so on. A body with fewer sections than images simply
 * receives fewer; nothing is forced onto a page.
 */
const withInlineMedia = (blocks: Block[], media: PlacedMedia[]): ReactNode => {
  if (media.length === 0) return renderBlocks(blocks)
  const boundaries = blocks
    .map((block, i) => (block.kind === 'heading' && block.level === 2 ? i : -1))
    .filter((i) => i > 0)
    .slice(1, media.length + 1)
  if (boundaries.length === 0) return renderBlocks(blocks)

  const out: ReactNode[] = []
  let from = 0
  boundaries.forEach((at, n) => {
    out.push(<Fragment key={`seg-${n}`}>{renderBlocks(blocks.slice(from, at))}</Fragment>)
    const image = media[n]
    if (image !== undefined) out.push(<Figure key={`fig-${image.attachmentId}`} media={image} />)
    from = at
  })
  out.push(<Fragment key="seg-last">{renderBlocks(blocks.slice(from))}</Fragment>)
  return out
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

  return (
    <SiteChrome page={page}>
      <article className="article">
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

        {renderBlocks(blocks.slice(0, 1))}

        {byline !== null ? (
          <p className="byline">
            {byline}
            {date !== null ? <> · {date}</> : null}
          </p>
        ) : null}

        {hero !== null ? <Figure media={hero} /> : null}

        {withInlineMedia(blocks.slice(1), inline)}

        {documents.length > 0 ? <DocumentList documents={documents} /> : null}

        {/*
          The two in-page conversion surfaces. Each self-gates on its own accepted `applies_to`
          token, so exactly one of them can ever render on a given route: `editorial_inline` on the
          22 editorial routes, `rfq_page` on `/contact-us/`. Listing both here is not two CTAs on a
          page; it is the page template asking each accepted surface whether this is its route.

          `rfq_page` renders the accepted dialog rather than the contract's `EMBEDDED_IN_PAGE`
          pattern, under the bounded V1 decision recorded in the staging overlay: no accepted
          authority supplies an embedded-in-page RFQ surface, and fabricating one is exactly what
          this build refuses to do. The historical pattern is preserved in the contract.
        */}
        <RfqMount mountId="editorial_inline" page={page} />
        <RfqMount mountId="rfq_page" page={page} />
      </article>
    </SiteChrome>
  )
}

export default Page
