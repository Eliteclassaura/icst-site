import type { LinkRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import { SectionHead } from '../shared/SectionHead'
import { withCount } from '../shared/count'
import './glossary-list.css'

export type GlossaryListProps = {
  eyebrow?: string
  title?: string
  lede?: string
  more?: LinkRef
  /** `anchor` is the stable id used by the legacy site (`#geo`, `#aeo`, …) and by the parity gate. */
  terms: Array<{
    term: string
    definition: string
    aside?: string
    anchor: string
    notes?: Array<{ label: string; text: string }>
  }>
}

/** A real <dl>. Anchors are stable, data-supplied ids so the 12 legacy glossary anchors survive migration (C5 gate). */
export function GlossaryListBlock({ eyebrow, title, lede, more, terms }: GlossaryListProps) {
  return (
    <div className="blk-glossary">
      {title && (
        <SectionHead
          eyebrow={eyebrow}
          title={withCount(title, terms.length)}
          lede={
            <>
              {lede}
              {more && (
                <>
                  {' '}
                  <a className="blk-glossary__more" href={more.href}>
                    {more.label}
                  </a>
                </>
              )}
            </>
          }
        />
      )}
      <dl className="blk-glossary__list">
        {terms.map((t) => (
          <div key={t.anchor} className="blk-glossary__item" id={t.anchor}>
            <dt>{t.term}</dt>
            <dd>
              {t.definition}
              {t.aside && <em> {t.aside}</em>}
              {t.notes && t.notes.length > 0 && (
                <dl className="blk-glossary__notes">
                  {t.notes.map((n) => (
                    <div key={n.label}>
                      <dt>{n.label}</dt>
                      <dd>{n.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export const glossaryList = defineBlock<GlossaryListProps>({
  slug: 'glossaryList',
  label: 'Glossary list',
  kind: 'layout',
  Component: GlossaryListBlock,
  a11y: [
    'Definition list semantics (<dl>/<dt>/<dd>) so term–definition pairs are announced as such.',
    'Each pair is wrapped in a <div> carrying the stable anchor id, which is valid HTML inside <dl>.',
    'The "also called" aside is <em> styled upright and muted, not a colour-only distinction (it is inline text).',
  ],
  fixtures,
})
