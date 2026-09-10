import { defineBlock } from '../types'
import { SectionHead } from '../shared/SectionHead'
import { withCount } from '../shared/count'
import { fixtures } from './fixture'
import './offices.css'

export type OfficesProps = {
  eyebrow?: string
  title?: string
  lede?: string
  offices: Array<{ city: string; region: string; hours: string }>
}

/** Offices as an in-page block; the footer shows the same data from the same collection. */
export function OfficesBlock({ eyebrow, title, lede, offices }: OfficesProps) {
  return (
    <div className="blk-offices">
      {title && (
        <SectionHead
          eyebrow={eyebrow}
          title={withCount(title, offices.length)}
          lede={withCount(lede, offices.length)}
        />
      )}
      <ul className="blk-offices__list" role="list">
        {offices.map((o) => (
          <li key={o.city} className="blk-offices__office">
            <span className="blk-offices__city">{o.city}</span>
            <span className="blk-offices__region">{o.region}</span>
            <span className="blk-offices__hours">{o.hours}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const offices = defineBlock<OfficesProps>({
  slug: 'offices',
  label: 'Offices',
  kind: 'layout',
  Component: OfficesBlock,
  a11y: [
    'A list of offices; hours are text. Data comes from the Offices collection, so the footer and this block cannot disagree.',
  ],
  fixtures,
})
