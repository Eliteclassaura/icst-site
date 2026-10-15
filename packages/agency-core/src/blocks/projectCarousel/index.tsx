import { defineBlock, type ImageRef } from '../types'
import { SectionHead } from '../shared/SectionHead'
import { fixtures } from './fixture'
import './project-carousel.css'

export type ProjectCard = {
  title: string
  text: string
  href?: string
  image?: ImageRef
}

export type ProjectCarouselProps = {
  eyebrow?: string
  title?: string
  lede?: string
  items: ProjectCard[]
}

/**
 * Horizontal project cards on a native scroll-snap track. The track is a labelled, keyboard-focusable
 * region, so every card is reachable by scrolling without JavaScript (no arrow controls are rendered).
 */
export function ProjectCarouselBlock({ eyebrow, title, lede, items }: ProjectCarouselProps) {
  return (
    <div className="blk-projects">
      {title && <SectionHead eyebrow={eyebrow} title={title} lede={lede} />}
      <div className="blk-projects__track" role="region" aria-label={title ?? 'Projects'} tabIndex={0}>
        <ul className="blk-projects__list" role="list">
          {items.map((it, i) => (
            <li key={i} className="blk-projects__item">
              <article className="blk-projects__card">
                {it.image && (
                  <img
                    className="blk-projects__img"
                    src={it.image.url}
                    alt={it.image.decorative ? '' : it.image.alt}
                    width={it.image.width}
                    height={it.image.height}
                    loading="lazy"
                  />
                )}
                <h3 className="blk-projects__title">{it.title}</h3>
                <p className="blk-projects__text">{it.text}</p>
                {it.href && (
                  <a className="blk-projects__link" href={it.href}>
                    View project
                  </a>
                )}
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export const projectCarousel = defineBlock<ProjectCarouselProps>({
  slug: 'projectCarousel',
  label: 'Project carousel',
  kind: 'layout',
  Component: ProjectCarouselBlock,
  fixtures,
  a11y: [
    'The track is a labelled region with tabIndex 0, so keyboard users can scroll it; cards are not hidden behind controls.',
    'Each card title is a level-3 heading; the image is decorative (empty alt) unless the record gives alt text.',
    'Renders fully without JavaScript; scroll-snap is CSS only.',
  ],
})
