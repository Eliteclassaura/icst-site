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
import type { Block, InlineNode } from './markdown'
import { FeatureFigure, renderBlocks, renderInline } from './render'
import { R4Media } from './R4Media'
import { SalmonMedia } from './SalmonMedia'
import { RfqMount } from './RfqMount'
import { Testimonials } from './HomeTestimonials'
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

/**
 * R3: the three capability blocks are three different compositions, not one template run three
 * times. Construction bleeds its image off the left edge; repair bleeds off the right and leads
 * with the image on mobile; parts is index-led, with the accepted part-family list as the subject
 * and a tall narrow plate beside it. Section rhythm is a design decision here, not an accident.
 */
const CAP_LAYOUT = ['cap--bleed-left', 'cap--bleed-right', 'cap--index'] as const

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
  const layout = CAP_LAYOUT[index] ?? 'cap--bleed-right'
  const n = String(index + 1).padStart(2, '0')

  const body = (
    <div className="cap-body">
      <span aria-hidden="true" className="cap-kicker">
        {n} — Capability
      </span>
      <h2 className="cap-title">{renderInline(section.heading?.text ?? [])}</h2>
      {paragraphs(section).map((para, i) => (
        <p key={`cap-${index}-${i}`}>{renderInline(para.text)}</p>
      ))}
      {list === null ? null : (
        <div className="tindex">
          {list.items.map((item, i) => (
            <span key={`fam-${index}-${i}`}>{renderInline(item)}</span>
          ))}
        </div>
      )}
      {link === undefined ? null : (
        <a className="cap-link" href={link.href}>
          {link.label}
        </a>
      )}
    </div>
  )

  // Image first in source order only where the layout bleeds off the left edge; the mobile order
  // for the right-bleed block is set in CSS rather than by duplicating markup.
  return (
    <article className={media === null ? `cap ${layout}` : `cap ${layout}`}>
      {media !== null && layout === 'cap--bleed-left' ? (
        <FeatureFigure className="cap-media" media={media} />
      ) : null}
      {body}
      {media !== null && layout !== 'cap--bleed-left' ? (
        <FeatureFigure className="cap-media" media={media} />
      ) : null}
    </article>
  )
}

/**
 * A discovery row. The accepted body carries these as plain list items whose text is a link, so the
 * row renders the item's own inline content and adds only the index numeral and a destination
 * label. Nothing is repointed and no destination is invented.
 */
const DiscoveryRow = ({ index, item }: { index: number; item: InlineNode[] }): ReactNode => (
  <div className="disc-row">
    <span className="disc-n">{String(index + 1).padStart(2, '0')}</span>
    <span className="disc-t">{renderInline(item)}</span>
  </div>
)

export const HomeComposition = ({
  blocks,
  page,
}: {
  blocks: Block[]
  page: CohortPage
}): ReactNode => {
  const sections = partitionByHeading(blocks)
  assertTotal(blocks, sections)

  const lede = sectionTitled(sections, HERO_LEDE)
  const capabilities = [CONSTRUCTION, SERVICE, PARTS]
    .map((title) => sectionTitled(sections, title))
    .filter((section): section is BodySection => section !== null)
  const conditions = sectionTitled(sections, CONDITIONS)
  const conditionList = soleList(conditions)
  const conversion = sectionTitled(sections, CONVERSION)
  const discovery = sectionTitled(sections, DISCOVERY)
  const discoveryList = soleList(discovery)
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

  /*
   * R3 pathway strip. Four labels, and every destination is real: two accepted cohort routes and
   * two in-page anchors to the capability blocks this page already carries. No route is invented to
   * make the strip look complete — the construction and repair service routes named by the
   * navigation contract are not in the accepted 29-route cohort, and that gap is recorded as debt
   * rather than papered over with a dead link.
   */
  const PATHWAYS: Array<{ desc: string; href: string; label: string; n: string }> = [
    {
      desc: 'Counterflow and crossflow towers designed to a specified duty.',
      href: '#capability-01',
      label: 'Construction',
      n: '01',
    },
    {
      desc: 'Structural repair, mechanical work and planned maintenance on towers in service.',
      href: '#capability-02',
      label: 'Repair & maintenance',
      n: '02',
    },
    {
      desc: 'Thermal and structural improvement on an existing tower.',
      href: '/cooling-tower-thermal-upgrade/',
      label: 'Upgrades & re-rates',
      n: '03',
    },
    {
      desc: 'Fans, fill, drift eliminators, gearboxes, nozzles and structural members.',
      href: '/cooling-tower-parts-online/',
      label: 'Parts',
      n: '04',
    },
  ]

  return (
    <>
      {/* ---------- 01 hero: dark, asymmetric, type-led ---------- */}
      <section aria-labelledby="home-h1" className="r3hero">
        <div className="r3hero-grid">
          <div className="r3hero-copy">
            <p className="r3hero-eyebrow">
              <span className="tick" /> Field-erected industrial cooling towers
            </p>
            <h1 id="home-h1">Cooling towers engineered, built, repaired and re-rated.</h1>
            {paragraphs(lede).map((para, i) => (
              <p className={i === 0 ? 'r3hero-lede' : 'r3hero-sub'} key={`lede-${i}`}>
                {renderInline(para.text)}
              </p>
            ))}
            <div className="r3hero-actions">
              <RfqMount mountId="home_hero_primary" page={page} />
              <a className="r4-rfq-link" href="/contact-us/">Discuss your tower</a>
              <a className="hero-secondary" href="/cooling-tower-parts-online/">
                Cooling tower parts
              </a>
            </div>
          </div>
          <R4Media className="r4-hero-media" kind="tower" />
          <aside aria-label="Commercial pathways" className="r3hero-panel">
            <dl className="r3hero-spec">
              {PATHWAYS.map((pw) => (
                <div key={pw.href}>
                  <dt>{pw.n}</dt>
                  <dd>
                    <a href={pw.href}>{pw.label}</a>
                  </dd>
                  <span aria-hidden="true">→</span>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      {/* ---------- 02 pathways: an indexed technical list, not a card grid ---------- */}
      <section aria-labelledby="pathways" className="band band--flush band--wash band--tight">
        <div className="shell">
          <div className="sec-head">
            <div>
              <h2 className="sec-title" id="pathways">
                Four ways ICS is engaged
              </h2>
            </div>
            <p className="sec-note">
              Every engagement is scoped against a specific tower and a specific duty before it is
              quoted.
            </p>
          </div>
          <div className="pathways">
            {PATHWAYS.map((pw) => (
              <a className="pathway" href={pw.href} key={`pw-${pw.n}`}>
                <span className="pathway-n">{pw.n}</span>
                <span className="pathway-t">{pw.label}</span>
                <span className="pathway-d">{pw.desc}</span>
                <span className="pathway-go">View</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="home-scale-statement">
        <div className="shell">
          <SalmonMedia id="tower-scale" />
          <p>
            Every tower is designed to a duty and a site rather than selected from a range, so every
            enquiry is scoped before it is quoted.
          </p>
        </div>
      </section>

      {/* ---------- 03-05 capability blocks, three different compositions ---------- */}
      {capabilities.length === 0 ? null : (
        <section aria-label="What we do">
          {capabilities.map((section, i) => (
            <div
              className={i === 0 ? 'band band--tall home-cap home-cap--construction' : `band home-cap home-cap--${i}`}
              id={`capability-${String(i + 1).padStart(2, '0')}`}
              key={section.title}
            >
              <div className="shell">
                <Capability index={i} page={page} section={section} />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---------- 06 duty conditions: dark band ---------- */}
      {conditionList === null ? null : (
        <section aria-labelledby="conditions" className="band band--dark band--tall">
          <div className="shell">
            <div className="duty">
              <div>
                <span className="tick" />
                <h2 className="cap-title" id="conditions" style={{ marginBlockStart: 'var(--s5)' }}>
                  {renderInline(conditions?.heading?.text ?? [])}
                </h2>
                {paragraphs(conditions).map((para, i) => (
                  <p className="sec-note" key={`cond-${i}`} style={{ marginBlockStart: 'var(--s5)' }}>
                    {renderInline(para.text)}
                  </p>
                ))}
              </div>
              <div className="duty-list">
                {conditionList.items.map((item, i) => (
                  <span key={`cond-item-${i}`}>{renderInline(item)}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- 07 discovery: a numbered technical index ---------- */}
      {discoveryList === null ? null : (
        <section aria-labelledby="discovery" className="band">
          <div className="shell">
            <div className="sec-head">
              <div>
                <h2 className="sec-title" id="discovery">
                  {renderInline(discovery?.heading?.text ?? [])}
                </h2>
              </div>
            </div>
            <div className="disc">
              {discoveryList.items.map((item, i) => (
                <DiscoveryRow index={i} item={item} key={`disc-${i}`} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Testimonials />

      {/* ---------- 08 conversion: dark, large, the primary commercial action ---------- */}
      {conversion === null ? null : (
        <section aria-labelledby="request-a-quote" className="band band--wash home-close">
          <div className="shell">
            <div className="conv">
              <div>
                <span className="tick" />
                <h2 id="request-a-quote" style={{ marginBlockStart: 'var(--s5)' }}>
                  {renderInline(conversion.heading?.text ?? [])}
                </h2>
                <RfqMount mountId="home_conversion_band" page={page} />
              </div>
              <div className="conv-aside">
                {paragraphs(conversion).map((para, i) => (
                  <p className="sec-note" key={`conv-${i}`}>
                    {renderInline(para.text)}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {tail.length === 0 ? null : (
        <section className="band">
          <div className="shell article home-tail">
            {tail.map((section, i) => (
              <div key={`tail-${i}`}>
                {renderBlocks(
                  section.heading === null ? section.body : [section.heading, ...section.body],
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
