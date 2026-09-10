import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './takeaway-list.css'

export type TakeawayListProps = {
  /** Label above the list, e.g. "The short version" */
  label: string
  items: Array<{ lead: string; text: string }>
}

export function TakeawayListBlock({ label, items }: TakeawayListProps) {
  return (
    <div className="blk-takeaways">
      <p className="blk-takeaways__label">{label}</p>
      <ul className="blk-takeaways__list">
        {items.map((it, i) => (
          <li key={i}>
            <strong>{it.lead}</strong> {it.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const takeawayList = defineBlock<TakeawayListProps>({
  slug: 'takeawayList',
  label: 'Takeaway list',
  kind: 'layout',
  Component: TakeawayListBlock,
  a11y: [
    'A real <ul>; the dash marker is CSS, so screen readers announce list length and position.',
    'The lead sentence is <strong>, which is emphasis, not a heading — the list is not a document section.',
  ],
  fixtures,
})
