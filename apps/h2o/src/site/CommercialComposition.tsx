/**
 * H2O Phase 2D — the six commercial routes, composed. Visual R2.
 *
 * These six share one accepted route class, `COMPANY_OR_SERVICE`, and R1 rendered them through the
 * article template, which is why the estate read as twenty-nine of the same page. They are not the
 * same page. A parts catalogue, a technical library, a service page, a company page and a quote
 * request are five different jobs, and the directive asks for them to be differentiated without
 * hand-styling twenty-nine routes.
 *
 * So there is one template with a variant per route, chosen from the route's own canonical path —
 * not from a keyword in its copy, and not from a hand-maintained list of page numbers:
 *
 *   | route                                | variant   | what it changes                        |
 *   |--------------------------------------|-----------|----------------------------------------|
 *   | /cooling-tower-parts-online/         | catalogue | H3 sections become a part-family index |
 *   | /resources/                          | library   | documents lead, at full width          |
 *   | /cooling-tower-thermal-upgrade/      | service   | capability-led, feature image          |
 *   | /about-ics-industrial-cooling-solutions/ | company | credibility-led, feature image      |
 *   | /contact-us/                         | rfq       | conversion-led, the form is the page   |
 *   | /tech-articles/                      | index     | the article index is the page          |
 *
 * Everything else is shared: the masthead, the measure, the discovery grid, the mounts. A variant
 * changes emphasis and arrangement, never the accepted copy and never which sections exist.
 */
import type { ReactNode } from 'react'
import type { CohortPage } from './cohort'
import { featureFor } from './feature-media'
import type { Block } from './markdown'
import type { PlacedMedia } from './media'
import { DocumentList, FeatureFigure, Figure, renderBlocks, renderInline } from './render'
import type { ResourceDocument } from './resources'
import { RfqMount } from './RfqMount'
import { ContactDirectory } from './ContactDirectory'
import { R4Media } from './R4Media'
import { SalmonMedia } from './SalmonMedia'
import {
  assertTotal,
  partitionByHeading,
  sectionTitled,
  soleList,
  type BodySection,
} from './sections'

const DISCOVERY = 'Related pages'

export type CommercialVariant = 'catalogue' | 'company' | 'index' | 'library' | 'rfq' | 'service'

/** The variant for a route, by its accepted canonical path. Anything else falls back to `service`. */
export const variantFor = (canonicalPath: string): CommercialVariant => {
  switch (canonicalPath) {
    case '/cooling-tower-parts-online/':
      return 'catalogue'
    case '/resources/':
      return 'library'
    case '/about-ics-industrial-cooling-solutions/':
      return 'company'
    case '/contact-us/':
      return 'rfq'
    case '/tech-articles/':
      return 'index'
    default:
      return 'service'
  }
}

/** The feature-image region each variant draws on, when the media overlay carries one. */
const VARIANT_REGION: Record<CommercialVariant, string | undefined> = {
  catalogue: 'PARTS_FEATURE',
  company: 'ABOUT_FEATURE',
  index: 'ARTICLE_INDEX_FEATURE',
  library: 'LIBRARY_FEATURE',
  rfq: undefined,
  service: 'SERVICE_FEATURE',
}

const EYEBROW: Record<CommercialVariant, string> = {
  catalogue: 'Replacement parts',
  company: 'Company',
  index: 'Technical library',
  library: 'Technical library',
  rfq: 'Request a quote',
  service: 'Services',
}

/**
 * A body section, rendered with its own H3 subsections split out.
 *
 * On the catalogue variant each H3 is a part family and gets a card of its own, which is what
 * turns a long page of prose into something a procurement reader can scan. Everywhere else an H3
 * renders in flow, exactly as the parser produced it.
 */
const SectionBlock = ({
  catalogue,
  index,
  section,
}: {
  catalogue: boolean
  index: number
  section: BodySection
}): ReactNode => {
  const blocks = section.heading === null ? section.body : [section.heading, ...section.body]
  if (!catalogue) {
    return <div className="commercial-section">{renderBlocks(blocks)}</div>
  }

  // Split the section at each H3. The lead-in keeps the H2 and whatever precedes the first H3.
  const groups: Block[][] = [[]]
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 3) groups.push([block])
    else (groups[groups.length - 1] as Block[]).push(block)
  }
  const [lead, ...families] = groups
  return (
    <div className="commercial-section">
      {lead === undefined || lead.length === 0 ? null : renderBlocks(lead)}
      {families.length === 0 ? null : (
        <div className="catalogue-grid">
          {families.map((group, i) => (
            <article className="catalogue-card" key={`fam-${index}-${i}`}>
              {renderBlocks(group)}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export const CommercialComposition = ({
  blocks,
  documents,
  page,
  placements,
}: {
  blocks: Block[]
  documents: ResourceDocument[]
  /** The route's frozen placements. R2 adds imagery; it does not drop what the authority assigned. */
  placements: PlacedMedia[]
  page: CohortPage
}): ReactNode => {
  const sections = partitionByHeading(blocks)
  assertTotal(blocks, sections)

  const variant = variantFor(page.canonicalPath)
  const region = VARIANT_REGION[variant]
  const media = region === undefined ? null : featureFor(page.routeId, region)

  const leadIn = sections[0]
  const h1 = leadIn?.body.find(
    (block): block is Extract<Block, { kind: 'heading' }> =>
      block.kind === 'heading' && block.level === 1,
  )
  const discovery = sectionTitled(sections, DISCOVERY)
  const discoveryList = soleList(discovery)

  // The first body section leads the masthead, so the page opens on a statement rather than on a
  // heading followed by a heading.
  const body = sections.slice(1).filter((s) => !(discoveryList !== null && s.title === DISCOVERY))
  const [opening, ...rest] = body

  /*
    The first section's opening paragraph leads the masthead, so it is not repeated in the body.
    On four of the six routes that paragraph is the whole section — and the first draft of this
    template still rendered the heading, which produced a rule and a heading with nothing under
    them on /contact-us/, /resources/, /about-…/ and /cooling-tower-thermal-upgrade/. It read as a
    rendering failure because it was one. A section emptied by the hoist now renders nothing at
    all, heading included.
  */
  const firstParagraph = opening?.body.findIndex((b) => b.kind === 'paragraph') ?? -1
  const openingRemainder = ((): BodySection | null => {
    if (opening === undefined) return null
    const rest0 = opening.body.filter((_, i) => i !== firstParagraph)
    return rest0.length === 0 ? null : { ...opening, body: rest0 }
  })()

  return (
    <article className={`commercial commercial-${variant}`}>
      <header className="commercial-masthead">
        <div className="commercial-masthead-copy">
          <p className="hero-eyebrow">{EYEBROW[variant]}</p>
          <h1>{renderInline(h1?.text ?? [])}</h1>
          {opening === undefined
            ? null
            : renderBlocks(
                opening.body.filter((b) => b.kind === 'paragraph').slice(0, 1),
              )}
        </div>
        {variant === 'company' || variant === 'library' || variant === 'catalogue' ? (
          <SalmonMedia className="commercial-masthead-media" id={variant === 'company' ? 'deck-team' : variant === 'library' ? 'mechanical-deck' : 'drive-shaft'} priority />
        ) : variant === 'service' ? (
          <R4Media
            className="commercial-masthead-media"
            kind="tower"
          />
        ) : media === null ? null : <FeatureFigure className="commercial-masthead-media" media={media} priority />}
      </header>

      {variant === 'catalogue' ? <section className="component-plates" aria-label="Component identification">
        <SalmonMedia id="gearbox" /><SalmonMedia id="water-nozzle" /><SalmonMedia id="fan-assembly" />
      </section> : null}
      {variant === 'company' ? <div className="company-field-strip"><SalmonMedia id="construction" /><SalmonMedia id="structure" /></div> : null}

      <div className="commercial-body">
        {openingRemainder === null ? null : (
          <SectionBlock catalogue={variant === 'catalogue'} index={0} section={openingRemainder} />
        )}
        {rest.map((section, i) => (
          <SectionBlock
            catalogue={variant === 'catalogue'}
            index={i + 1}
            key={`sec-${i}`}
            section={section}
          />
        ))}
      </div>

      {variant === 'company' || variant === 'rfq' ? (
        <ContactDirectory variant="page" />
      ) : null}

      {placements.length === 0 ? null : (
        <section aria-label="Media" className="commercial-media">
          {placements.map((item, i) => (
            <Figure key={`m-${i}`} media={item} />
          ))}
        </section>
      )}

      {documents.length === 0 ? null : (
        <section className="commercial-documents">
          <DocumentList documents={documents} />
        </section>
      )}

      {discoveryList === null ? null : (
        <section aria-labelledby="related" className="discovery">
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
        Each mount self-gates on its own `applies_to`, so exactly one can render on a given route:
        `rfq_page` on /contact-us/, and `commercial_page_cta` on the five other commercial routes,
        which the accepted contract left with no in-page conversion action at all.
      */}
      <section className="commercial-cta">
        <RfqMount mountId="rfq_page" page={page} />
        <RfqMount mountId="commercial_page_cta" page={page} />
      </section>
    </article>
  )
}
