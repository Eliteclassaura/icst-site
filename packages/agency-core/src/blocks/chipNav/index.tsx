import { defineBlock, type LinkRef } from '../types'
import { fixtures } from './fixture'
import './chip-nav.css'

export type ChipNavProps = {
  /** Visually hidden label for the group, e.g. "Parts categories". */
  label: string
  links: LinkRef[]
  /** Path of the current page; the matching chip gets aria-current. */
  currentPath?: string
}

/** A row of category chips (links). Used for the parts categories and the sub-section chips. */
export function ChipNavBlock({ label, links, currentPath }: ChipNavProps) {
  return (
    <nav className="blk-chips" aria-label={label}>
      <ul className="blk-chips__list" role="list">
        {links.map((l) => (
          <li key={l.href}>
            <a className="blk-chips__chip" href={l.href} aria-current={currentPath === l.href ? 'page' : undefined}>
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const chipNav = defineBlock<ChipNavProps>({
  slug: 'chipNav',
  label: 'Chip navigation',
  kind: 'layout',
  Component: ChipNavBlock,
  fixtures,
  a11y: [
    'A labelled nav landmark with a real list of links; the current page carries aria-current="page".',
    'Chips wrap onto new lines; nothing is hidden behind a control, so no JavaScript is needed.',
  ],
})
