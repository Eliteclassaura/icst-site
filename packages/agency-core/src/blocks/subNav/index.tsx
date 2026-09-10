import type { LinkRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './sub-nav.css'

export type SubNavProps = {
  /** Section links within the page (hash) or sibling pages. */
  links: LinkRef[]
  currentHref?: string
  label?: string
}

/** The legacy "subbar": a horizontal section navigation under the header. */
export function SubNavBlock({ links, currentHref, label = 'On this page' }: SubNavProps) {
  return (
    <nav className="blk-subnav" aria-label={label}>
      <ul className="blk-subnav__list" role="list">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} aria-current={currentHref === l.href ? 'page' : undefined}>
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const subNav = defineBlock<SubNavProps>({
  slug: 'subNav',
  label: 'Section navigation',
  kind: 'layout',
  Component: SubNavBlock,
  a11y: [
    'A second labelled <nav> distinct from Primary; scrolls horizontally rather than hiding items; current item marked with aria-current.',
  ],
  fixtures,
})
