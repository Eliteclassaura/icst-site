/**
 * H2O Phase 2D — the template every route that is not the homepage renders through.
 *
 * The staging baseline set all 28 of these pages as one 72ch column: title, byline, image, prose,
 * and a bulleted list of related links at the end. Readable, and entirely undesigned. Three things
 * were actually wrong with it, and this template fixes those three and leaves the rest alone.
 *
 * **1. The measure trapped the media.** `.article` capped everything at 72ch, so a 1120px hero
 * rendered at about 700px and every technical diagram was squeezed into the text column. Here the
 * template is a grid: prose stays on a 72ch measure, where it belongs, and media and documents are
 * allowed to break out to the full content width. Nothing is upscaled; an image simply stops being
 * prevented from reaching the width its authority already permits.
 *
 * **2. The title had no standing.** A masthead now carries the H1 and the observed byline against
 * a rule, so a technical article opens like a document rather than like a paragraph that happens
 * to be bold.
 *
 * **3. Related pages was a bullet list.** Every one of these pages ends with the accepted internal
 * link plan rendered as `<ul><li><a>`, which is the weakest possible treatment for what is in fact
 * the estate's primary discovery surface. It now renders through the same discovery grid the
 * homepage uses, from the same accepted list, with no link added, removed or relabelled.
 *
 * What this template does not do: it does not reorder sections, rename headings, change heading
 * levels, or alter a word. It partitions the accepted blocks, renders them through the shared
 * renderer, and asserts the partition was total.
 */
import type { ReactNode } from 'react'
import type { CohortPage } from './cohort'
import { featuresForRoute } from './feature-media'
import type { Block } from './markdown'
import type { PlacedMedia } from './media'
import { DocumentList, FeatureFigure, Figure, renderBlocks, renderInline } from './render'
import type { ResourceDocument } from './resources'
import { RfqMount } from './RfqMount'
import {
  assertTotal,
  partitionByHeading,
  sectionTitled,
  soleList,
  type BodySection,
} from './sections'

/** The accepted heading every cohort body uses for its internal link plan. */
const DISCOVERY = 'Related pages'

export class MediaPlacementError extends Error {}

/**
 * Split the accepted inline images into the ones the body's own section boundaries can carry and
 * the ones left over.
 *
 * A body with `n` sections has `n - 1` interior boundaries, so that is how many images can be set
 * between sections; anything beyond that is returned as the tail and rendered after the last
 * section. Exported as a pure function so a test can assert, over all 29 accepted bodies, that
 * `head.length + tail.length` equals the number of accepted inline images for that route — which
 * is the property the first draft of this template broke.
 */
export const splitMedia = <T,>(inline: T[], sectionCount: number): { head: T[]; tail: T[] } => {
  const capacity = Math.max(sectionCount - 1, 0)
  const head = inline.slice(0, capacity)
  const tail = inline.slice(capacity)
  if (head.length + tail.length !== inline.length) {
    throw new MediaPlacementError(
      `media placement is not total: ${inline.length} accepted inline images, ` +
        `${head.length + tail.length} placed`,
    )
  }
  return { head, tail }
}

export const ArticleComposition = ({
  blocks,
  byline,
  date,
  documents,
  hero,
  inline,
  page,
}: {
  blocks: Block[]
  byline: string | null
  date: string | null
  documents: ResourceDocument[]
  hero: PlacedMedia | null
  inline: PlacedMedia[]
  page: CohortPage
}): ReactNode => {
  const sections = partitionByHeading(blocks)
  assertTotal(blocks, sections)

  const leadIn = sections[0]
  const h1 = leadIn?.body.find(
    (block): block is Extract<Block, { kind: 'heading' }> =>
      block.kind === 'heading' && block.level === 1,
  )
  const discovery = sectionTitled(sections, DISCOVERY)
  const discoveryList = soleList(discovery)

  // Body sections, in accepted order, minus the discovery list when it is rendered as a grid.
  const bodySections = sections
    .slice(1)
    .filter((section) => !(discoveryList !== null && section.title === DISCOVERY))

  /**
   * Inline images are distributed over the body's own section boundaries: the first goes before
   * the second section, the next before the third, and so on.
   *
   * **It is total, and that is the point.** The first draft of this template placed image `i - 1`
   * before section `i` and stopped there, which silently dropped every image a body had no
   * boundary left for. On `/cooling-tower-performance-testing/` — a body with two sections after
   * the discovery list is lifted out, and two inline images — that dropped `17542` entirely, and
   * the 68 frozen media selections became 67 rendered. A frozen selection that does not render is
   * a content loss, not a layout decision, so any image the boundaries cannot take is rendered
   * after the last section rather than discarded, and `placed` is asserted against `inline.length`
   * by the caller.
   */
  const withMedia = (list: BodySection[]): ReactNode => {
    /*
      When a recovered feature image leads the masthead, the route's frozen hero does not vanish:
      it joins the inline distribution instead. A frozen placement is an accepted authority and R2
      adds to it rather than replacing it, so every one of the 68 still renders somewhere on the
      route it is assigned to. The 87-load QA measures that directly.
    */
    const placed = feature !== null && hero !== null ? [hero, ...inline] : inline
    const { head, tail } = splitMedia(placed, list.length)
    return (
      <>
        {list.map((section, i) => {
          const image = i > 0 ? head[i - 1] : undefined
          return (
            <div className="article-section" key={`sec-${i}`}>
              {image === undefined ? null : (
                <div className="article-wide">
                  <Figure media={image} />
                </div>
              )}
              {renderBlocks(
                section.heading === null ? section.body : [section.heading, ...section.body],
              )}
            </div>
          )
        })}
        {tail.map((image, i) => (
          <div className="article-wide" key={`tail-media-${i}`}>
            <Figure media={image} />
          </div>
        ))}
      </>
    )
  }

  /*
    A technical article opens on a feature image where the bounded media overlay carries one for
    this route, and on its frozen hero otherwise. The overlay images are recovered photographs
    cropped to their clean rectangle; the frozen heroes are, on most of these routes, branded
    editorial cards with a headline already composited into them. Where a photograph exists, it
    leads — which is the difference between a technical article and a slide deck.
  */
  const feature = featuresForRoute(page.routeId)[0] ?? null

  return (
    <article className="article">
      <header className="masthead">
        <p className="hero-eyebrow">Technical article</p>
        <h1>{renderInline(h1?.text ?? [])}</h1>
        {byline === null ? null : (
          <p className="byline">
            {byline}
            {date === null ? null : <> · {date}</>}
          </p>
        )}
      </header>

      {feature !== null ? (
        <div className="article-wide article-hero">
          <FeatureFigure media={feature} priority />
        </div>
      ) : hero === null ? null : (
        <div className="article-wide article-hero">
          <Figure media={hero} />
        </div>
      )}

      <div className="article-body">{withMedia(bodySections)}</div>

      {documents.length === 0 ? null : (
        <div className="article-wide">
          <DocumentList documents={documents} />
        </div>
      )}

      {discoveryList === null ? null : (
        <section aria-labelledby="related" className="article-wide discovery">
          <h2 className="section-title" id="related">
            {renderInline(discovery?.heading?.text ?? [])}
          </h2>
          <ul className="discovery-grid">
            {discoveryList.items.map((item, i) => (
              <li key={`disc-${i}`}>{renderInline(item)}</li>
            ))}
          </ul>
        </section>
      )}

      {/*
        The two in-page conversion surfaces. Each self-gates on its own accepted `applies_to`
        token, so exactly one can render on a given route: `editorial_inline` on the 22 editorial
        routes, `rfq_page` on `/contact-us/`.
      */}
      <RfqMount mountId="editorial_inline" page={page} />
      <RfqMount mountId="rfq_page" page={page} />
    </article>
  )
}
