import type { LinkRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './related-links.css'

export type RelatedLinksProps = {
  label?: string
  links: Array<LinkRef & { description?: string }>
}

/** Cross-page links as a labelled list — the internal-link graph the parity gate protects (removals blocked). */
export function RelatedLinksBlock({ label = 'Related', links }: RelatedLinksProps) {
  return (
    <nav className="blk-related" aria-label={label}>
      <p className="t-label blk-related__label">{label}</p>
      <ul className="blk-related__list" role="list">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href}>{l.label}</a>
            {l.description && <span className="blk-related__desc">{l.description}</span>}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const relatedLinks = defineBlock<RelatedLinksProps>({
  slug: 'relatedLinks',
  label: 'Related links',
  kind: 'layout',
  Component: RelatedLinksBlock,
  a11y: ['A labelled <nav> with a list; link text is the destination page title, never "read more".'],
  fixtures,
})
