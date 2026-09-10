import { defineBlock } from '../types'
import { fixtures } from './fixture'
import { SectionHead } from '../shared/SectionHead'
import { withCount } from '../shared/count'
import './faq.css'

export type FaqProps = {
  eyebrow?: string
  title?: string
  lede?: string
  items: Array<{ question: string; answer: string; anchor?: string }>
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/**
 * Visible Q/A — no disclosure widgets. Every answer is in the HTML for readers, retrievers and the
 * FAQPage JSON-LD that C5 derives from the same data. The count in any intro copy is derived, never typed.
 */
export function FaqBlock({ eyebrow, title, lede, items }: FaqProps) {
  return (
    <div className="blk-faq">
      {title && (
        <SectionHead
          eyebrow={eyebrow}
          title={withCount(title, items.length)}
          lede={withCount(lede, items.length)}
        />
      )}
      <div className="blk-faq__list">
        {items.map((it) => {
          const id = it.anchor ?? `faq-${slugify(it.question)}`
          return (
            <article key={id} className="blk-faq__item" id={id}>
              <h3 className="blk-faq__q">{it.question}</h3>
              <p className="blk-faq__a">{it.answer}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export const faq = defineBlock<FaqProps>({
  slug: 'faq',
  label: 'FAQ',
  kind: 'layout',
  Component: FaqBlock,
  a11y: [
    'Questions are h3 under the block’s h2; answers are always visible (no accordion), so nothing is hidden from keyboard or assistive-tech users and nothing depends on JavaScript.',
    'Each item has a stable id derived from the question, so deep links and the FAQPage schema share anchors.',
  ],
  fixtures,
})
