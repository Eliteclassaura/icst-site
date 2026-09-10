import { defineBlock } from '../types'
import { SectionHead } from '../shared/SectionHead'
import { withCount } from '../shared/count'
import { fixtures } from './fixture'
import './steps.css'

export type StepsProps = {
  eyebrow?: string
  title?: string
  lede?: string
  /** Ordered: the number carries meaning (a method, a sequence). Unordered: warnings, criteria. */
  ordered?: boolean
  items: Array<{ title: string; text: string }>
  /** When true, C5's JSON-LD builder emits a HowTo for this block (only for ordered methods). */
  howTo?: boolean
  layout?: 'split' | 'stack'
}

export function StepsBlock({ eyebrow, title, lede, ordered = true, items, layout = 'split' }: StepsProps) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <div className={`blk-steps blk-steps--${layout}`}>
      {title && (
        <SectionHead
          eyebrow={eyebrow}
          title={withCount(title, items.length)}
          lede={withCount(lede, items.length)}
        />
      )}
      <List className="blk-steps__list">
        {items.map((it, i) => (
          <li key={i} className="blk-steps__item">
            <span className="blk-steps__n num" aria-hidden="true">
              {ordered ? String(i + 1).padStart(2, '0') : '—'}
            </span>
            <div>
              <h3 className="blk-steps__title">{it.title}</h3>
              <p className="blk-steps__text">{it.text}</p>
            </div>
          </li>
        ))}
      </List>
    </div>
  )
}

export const steps = defineBlock<StepsProps>({
  slug: 'steps',
  label: 'Steps',
  kind: 'layout',
  Component: StepsBlock,
  a11y: [
    'An <ol> when order carries meaning (a method), a <ul> when it does not (warnings) — the visible number is aria-hidden because the list already conveys position.',
    'Each step title is an h3 under the block h2.',
  ],
  fixtures,
})
