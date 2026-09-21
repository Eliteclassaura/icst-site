/**
 * H2O Phase 2D — the homepage, composed. Visual R2.
 *
 * R1 placed the accepted body into designed regions and proved the placement total. It was
 * technically sound and visually unaccepted, for a reason the evidence makes plain: the body it
 * was placing held 188 words, and the only image the homepage could reach was a 490px photograph
 * of rooftop towers on a downtown building. No amount of layout fixes a front door with nothing
 * behind it.
 *
 * R2 changes what is being placed, not just how. The body is the recovered one — 505 words drawn
 * from the LIVE and OLD_AQUAMARINE estates and remediated of every authorization, warranty,
 * guarantee, price, testimonial and unsupported figure the sources carry — and the imagery is
 * recovered ICS photography of field-erected towers, placed through the bounded media overlay.
 *
 * The section map, read from the body's own H2 partition:
 *
 *   | accepted H2                              | region                                      |
 *   |------------------------------------------|---------------------------------------------|
 *   | (lead-in, the H1)                        | hero headline                               |
 *   | What we do                               | hero lede                                   |
 *   | New cooling tower construction           | capability 1, image-led                     |
 *   | Repair, maintenance and thermal upgrade  | capability 2, image-led, reversed           |
 *   | Replacement parts                        | capability 3 + the part-family index        |
 *   | Design conditions we build for           | the duty-condition band, on dark            |
 *   | Request a quote                          | conversion band                             |
 *   | Related pages                            | discovery grid                              |
 *
 * `assertTotal` still proves the partition lost nothing, and a section the body does not carry
 * renders nothing rather than being faked.
 *
 * **The two indexes are lists, not parsed prose.** R1 derived the part-family index by splitting
 * the replacement-parts sentence on its own punctuation, with an all-or-nothing round-trip check
 * to stop it silently dropping a family. That check was doing real work, which is the tell that
 * the approach was wrong: a procurement index should not depend on how a sentence was punctuated.
 * The recovered body carries both indexes as markdown lists, so this composition reads structure
 * instead of guessing at it, and the round-trip heuristic is gone.
 */
import type { ReactNode } from 'react'
import type { CohortPage } from './cohort'
import { featureFor } from './feature-media'
import type { Block } from './markdown'
import { FeatureFigure, renderBlocks, renderInline } from './render'
import { RfqMount } from './RfqMount'
import {
  assertTotal,
  paragraphs,
  partitionByHeading,
  remaining,
  sectionTitled,
  soleList,
  type BodySection,
} from './sections'

const HERO_LEDE = 'What we do'
const CONSTRUCTION = 'New cooling tower construction'
const SERVICE = 'Repair, maintenance and thermal upgrade'
const PARTS = 'Replacement parts'
const CONDITIONS = 'Design conditions we build for'
const CONVERSION = 'Request a quote'
const DISCOVERY = 'Related pages'

/**
 * Where a capability reads on to.
 *
 * Only routes the accepted internal link plan already names for this page, so the destination is
 * evidenced rather than chosen here. A capability with no accepted destination renders no link,
 * which is honest: there is no page to send the reader to yet.
 */
const CAPABILITY_LINK: Record<string, { href: string; label: string } | undefined> = {
  [CONSTRUCTION]: undefined,
  [SERVICE]: { href: '/cooling-tower-thermal-upgrade/', label: 'Cooling tower thermal upgrade' },
  [PARTS]: { href: '/cooling-tower-parts-online/', label: 'Cooling tower parts' },
}

/** The feature image region each capability draws on, when the media overlay carries one. */
const CAPABILITY_REGION: Record<string, string | undefined> = {
  [CONSTRUCTION]: 'HOME_CAPABILITY_CONSTRUCTION',
  [SERVICE]: 'HOME_CAPABILITY_SERVICE',
  [PARTS]: 'HOME_CAPABILITY_PARTS',
}

const Capability = ({
  index,
  page,
  section,
}: {
  index: number
  page: CohortPage
  section: BodySection
}): ReactNode => {
  const link = CAPABILITY_LINK[section.title]
  const region = CAPABILITY_REGION[section.title]
  const media = region === undefined ? null : featureFor(page.routeId, region)
  const list = soleList(section)
  return (
    <article className={media === null ? 'cap' : 'cap cap-media'}>
      <div className="cap-copy">
        <span aria-hidden="true" className="cap-index">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="cap-title">{renderInline(section.heading?.text ?? [])}</h2>
        {paragraphs(section).map((para, i) => (
          <p className="cap-body" key={`cap-${index}-${i}`}>
            {renderInline(para.text)}
          </p>
        ))}
        {list === null ? null : (
          <ul className="family-grid">
            {list.items.map((item, i) => (
              <li key={`fam-${index}-${i}`}>{renderInline(item)}</li>
            ))}
          </ul>
        )}
        {link === undefined ? null : (
          <a className="cap-link" href={link.href}>
            {link.label}
          </a>
        )}
      </div>
      {media === null ? null : <FeatureFigure className="cap-figure" media={media} />}
    </article>
  )
}

export const HomeComposition = ({
  blocks,
  page,
}: {
  blocks: Block[]
  page: CohortPage
}): ReactNode => {
  const sections = partitionByHeading(blocks)
  assertTotal(blocks, sections)

  const leadIn = sections[0]
  const h1 = leadIn?.body.find(
    (block): block is Extract<Block, { kind: 'heading' }> =>
      block.kind === 'heading' && block.level === 1,
  )
  const lede = sectionTitled(sections, HERO_LEDE)
  const capabilities = [CONSTRUCTION, SERVICE, PARTS]
    .map((title) => sectionTitled(sections, title))
    .filter((section): section is BodySection => section !== null)
  const conditions = sectionTitled(sections, CONDITIONS)
  const conditionList = soleList(conditions)
  const conversion = sectionTitled(sections, CONVERSION)
  const discovery = sectionTitled(sections, DISCOVERY)
  const discoveryList = soleList(discovery)
  const hero = featureFor(page.routeId, 'HOME_HERO')

  // Anything the accepted body carries that this composition does not place explicitly, so a new
  // section appears on the page rather than disappearing from it.
  const tail = remaining(sections, [
    HERO_LEDE,
    CONSTRUCTION,
    SERVICE,
    PARTS,
    CONDITIONS,
    CONVERSION,
    DISCOVERY,
  ])

  return (
    <>
      <section className="hero-r2">
        <div className="hero-r2-copy">
          <p className="hero-eyebrow">Field-erected industrial cooling towers</p>
          <h1 className="hero-r2-title">{renderInline(h1?.text ?? [])}</h1>
          {paragraphs(lede).map((para, i) => (
            <p className={i === 0 ? 'hero-r2-lede' : 'hero-r2-sub'} key={`lede-${i}`}>
              {renderInline(para.text)}
            </p>
          ))}
          <div className="hero-r2-actions">
            <RfqMount mountId="home_hero_primary" page={page} />
            <a className="hero-secondary" href="/cooling-tower-parts-online/">
              Cooling tower parts
            </a>
          </div>
        </div>
        {hero === null ? null : <FeatureFigure className="hero-r2-media" media={hero} priority />}
      </section>

      {capabilities.length === 0 ? null : (
        <section aria-label="What we do" className="caps-r2">
          {capabilities.map((section, i) => (
            <Capability index={i} key={section.title} page={page} section={section} />
          ))}
        </section>
      )}

      {conditionList === null ? null : (
        <section aria-labelledby="conditions" className="conditions">
          <div className="conditions-inner">
            <div className="conditions-head">
              <h2 className="section-title" id="conditions">
                {renderInline(conditions?.heading?.text ?? [])}
              </h2>
              {paragraphs(conditions).map((para, i) => (
                <p className="conditions-body" key={`cond-${i}`}>
                  {renderInline(para.text)}
                </p>
              ))}
            </div>
            <ul className="condition-grid">
              {conditionList.items.map((item, i) => (
                <li key={`cond-item-${i}`}>{renderInline(item)}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {discoveryList === null ? null : (
        <section aria-labelledby="discovery" className="discovery">
          <h2 className="section-title" id="discovery">
            {renderInline(discovery?.heading?.text ?? [])}
          </h2>
          <ul className="discovery-grid">
            {discoveryList.items.map((item, i) => (
              <li key={`disc-${i}`}>{renderInline(item)}</li>
            ))}
          </ul>
        </section>
      )}

      {conversion === null ? null : (
        <section aria-labelledby="request-a-quote" className="convert">
          <div className="convert-inner">
            <h2 className="convert-title" id="request-a-quote">
              {renderInline(conversion.heading?.text ?? [])}
            </h2>
            {paragraphs(conversion).map((para, i) => (
              <p className="convert-body" key={`conv-${i}`}>
                {renderInline(para.text)}
              </p>
            ))}
            <RfqMount mountId="home_conversion_band" page={page} />
          </div>
        </section>
      )}

      {tail.length === 0 ? null : (
        <section className="article home-tail">
          {tail.map((section, i) => (
            <div key={`tail-${i}`}>
              {renderBlocks(
                section.heading === null ? section.body : [section.heading, ...section.body],
              )}
            </div>
          ))}
        </section>
      )}
    </>
  )
}
