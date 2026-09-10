import type { CtaPair, ImageRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import { Picture } from '../shared/Picture'
import { Actions } from '../shared/Actions'
import './hero.css'

export type HeroProps = {
  title: string
  lede?: string
  status?: string
  /** Small label above the title without the live dot (sub-page heroes: "Pricing, published"). */
  eyebrow?: string
  cta?: CtaPair
  /** `media` = full-bleed photo with scrim (legacy home) · `plain` = type only on canvas */
  variant?: 'media' | 'plain'
  image?: ImageRef
  /** Heading level: the page's single h1 unless the page already has one (then `h2`). */
  as?: 'h1' | 'h2'
}

export function HeroBlock({
  title,
  lede,
  status,
  eyebrow,
  cta,
  variant = 'media',
  image,
  as = 'h1',
}: HeroProps) {
  const H = as
  const withMedia = variant === 'media' && image
  return (
    <section
      className={`blk-hero blk-hero--${withMedia ? 'media' : 'plain'}`}
      aria-labelledby="blk-hero-title"
    >
      {withMedia && (
        <>
          <div className="blk-hero__media">
            <Picture image={image} loading="eager" fetchPriority="high" sizes="100vw" />
          </div>
          <div className="blk-hero__scrim" role="presentation" />
        </>
      )}
      <div className="blk-hero__in">
        {eyebrow && !status && <span className="t-label blk-hero__eyebrow">{eyebrow}</span>}
        {status && (
          <span className="blk-hero__status">
            <span className="blk-hero__dot" aria-hidden="true" />
            {status}
          </span>
        )}
        <H className="t-d1 blk-hero__title" id="blk-hero-title">
          {title}
        </H>
        {lede && <p className="blk-hero__lede">{lede}</p>}
        <Actions cta={cta} />
      </div>
    </section>
  )
}

export const hero = defineBlock<HeroProps>({
  slug: 'hero',
  label: 'Hero',
  kind: 'layout',
  Component: HeroBlock,
  a11y: [
    'Renders the page h1 by default; set `as: "h2"` when the page already has one.',
    'The photo carries a real alt text (it shows a person); the scrim is presentational.',
    'Text sits on the scrim at ≥ 4.5:1 across the whole gradient range — the compile-time contrast report covers text-on-canvas, the scrim ends in canvas.',
    'Status dot animation is decorative and stops under prefers-reduced-motion.',
    'CTAs are links (navigation), not buttons.',
  ],
  fixtures,
})
