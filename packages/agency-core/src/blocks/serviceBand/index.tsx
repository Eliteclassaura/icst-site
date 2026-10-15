import { defineBlock } from '../types'
import { SectionHead } from '../shared/SectionHead'
import { fixtures } from './fixture'
import './service-band.css'

export type ServiceBandItem = {
  title: string
  text: string
  /** Optional destination; the card shows `label` (default "Learn more") as a link to it. */
  href?: string
  label?: string
}

export type ServiceBandProps = {
  eyebrow?: string
  title?: string
  lede?: string
  items: ServiceBandItem[]
}

/** Three-up (or fewer) service cards: each card is a heading, a short text and an optional link. */
export function ServiceBandBlock({ eyebrow, title, lede, items }: ServiceBandProps) {
  return (
    <div className="blk-services">
      {title && <SectionHead eyebrow={eyebrow} title={title} lede={lede} />}
      <ul className="blk-services__grid" role="list">
        {items.map((it, i) => (
          <li key={i} className="blk-services__item">
            <h3 className="blk-services__title">{it.title}</h3>
            <p className="blk-services__text">{it.text}</p>
            {it.href && (
              <a className="blk-services__link" href={it.href}>
                {it.label ?? 'Learn more'}
                <span aria-hidden="true"> →</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const serviceBand = defineBlock<ServiceBandProps>({
  slug: 'serviceBand',
  label: 'Service band',
  kind: 'layout',
  Component: ServiceBandBlock,
  fixtures,
  a11y: [
    'Each service is a level-3 heading under the section heading; the card text follows it in source order.',
    'The link text is the visible label and the card title is the only heading, so the link is not an unnamed arrow.',
    'Renders fully without JavaScript; there is no interactive behaviour.',
  ],
})
