import { defineBlock } from '../types'
import { fixtures } from './fixture'
import { SectionHead } from '../shared/SectionHead'
import { withCount } from '../shared/count'
import './evidence-grid.css'

export type EvidenceItem = {
  /** The figure exactly as shown, e.g. "90%", "4.4×", "−34.5%", "45:1" */
  figure: string
  claim: string
  detail?: string
  source: { publisher: string; title: string; href: string; date: string }
}

export type EvidenceGridProps = {
  eyebrow?: string
  title?: string
  lede?: string
  items: EvidenceItem[]
}

export function EvidenceGridBlock({ eyebrow, title, lede, items }: EvidenceGridProps) {
  return (
    <div className="blk-evidence">
      {title && (
        <SectionHead
          eyebrow={eyebrow}
          title={withCount(title, items.length)}
          lede={withCount(lede, items.length)}
        />
      )}
      <ul className="blk-evidence__grid" role="list">
        {items.map((it, i) => (
          <li key={i} className="blk-evidence__item">
            <article>
              <p className="blk-evidence__fig num">{it.figure}</p>
              <h3 className="blk-evidence__claim">{it.claim}</h3>
              {it.detail && <p className="blk-evidence__detail">{it.detail}</p>}
              <p className="blk-evidence__src">
                {it.source.publisher},{' '}
                <a href={it.source.href} rel="noopener noreferrer nofollow" target="_blank">
                  {it.source.title}
                </a>
                , {it.source.date}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const evidenceGrid = defineBlock<EvidenceGridProps>({
  slug: 'evidenceGrid',
  label: 'Evidence grid',
  kind: 'layout',
  Component: EvidenceGridBlock,
  a11y: [
    'Every figure is followed by its claim as an h3 and a linked, dated source — a stat without a citation is not allowed by the Payload config (source fields required).',
    'Figures are static text on the server; the animated counter (Release 2) is progressive and reduced-motion aware — the DOM always holds the final value.',
    'External links open in a new tab and say so via rel; the visible text is the study title, not "here".',
  ],
  fixtures,
})
