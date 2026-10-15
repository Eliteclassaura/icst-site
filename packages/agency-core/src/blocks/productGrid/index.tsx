import { defineBlock, type ImageRef } from '../types'
import { SectionHead } from '../shared/SectionHead'
import { fixtures } from './fixture'
import './product-grid.css'

export type ProductCard = {
  title: string
  text: string
  /** Product or category page. */
  href?: string
  image?: ImageRef
}

export type ProductGridProps = {
  eyebrow?: string
  title?: string
  lede?: string
  /** Action label on every card. RFQ-only: the default is a quote request, never a price. */
  actionLabel?: string
  items: ProductCard[]
}

/** Product cards: image (optional), title, text and one action. No prices are rendered. */
export function ProductGridBlock({ eyebrow, title, lede, actionLabel = 'Request a quote', items }: ProductGridProps) {
  return (
    <div className="blk-products">
      {title && <SectionHead eyebrow={eyebrow} title={title} lede={lede} />}
      <ul className="blk-products__grid" role="list">
        {items.map((it, i) => (
          <li key={i} className="blk-products__item">
            <article className="blk-products__card">
              {it.image && (
                <img
                  className="blk-products__img"
                  src={it.image.url}
                  alt={it.image.decorative ? '' : it.image.alt}
                  width={it.image.width}
                  height={it.image.height}
                  loading="lazy"
                />
              )}
              <h3 className="blk-products__title">{it.title}</h3>
              <p className="blk-products__text">{it.text}</p>
              {it.href && (
                <a className="blk-products__action" href={it.href}>
                  {actionLabel} <span aria-hidden="true">→</span>
                </a>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const productGrid = defineBlock<ProductGridProps>({
  slug: 'productGrid',
  label: 'Product grid',
  kind: 'layout',
  Component: ProductGridBlock,
  fixtures,
  a11y: [
    'Each card is an article with a level-3 title; the action is a link with the visible label and the card title is its heading context.',
    'RFQ-only: no price is rendered anywhere in this block; the action is a quote request.',
    'Images are optional; decorative images get an empty alt.',
    'No JavaScript.',
  ],
})
