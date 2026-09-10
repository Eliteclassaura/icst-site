import type { LinkRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './breadcrumb.css'

export type BreadcrumbProps = {
  /** Ancestors first; the current page is `current` and is not a link. */
  trail: LinkRef[]
  current: string
}

/** Visible breadcrumb; the BreadcrumbList JSON-LD is built from the same data in C5. */
export function BreadcrumbBlock({ trail, current }: BreadcrumbProps) {
  return (
    <nav className="blk-crumb" aria-label="Breadcrumb">
      <ol className="blk-crumb__list">
        {trail.map((t) => (
          <li key={t.href}>
            <a href={t.href}>{t.label}</a>
          </li>
        ))}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  )
}

export const breadcrumb = defineBlock<BreadcrumbProps>({
  slug: 'breadcrumb',
  label: 'Breadcrumb',
  kind: 'layout',
  Component: BreadcrumbBlock,
  a11y: [
    '<nav aria-label="Breadcrumb"> with an <ol>; the current page is text with aria-current="page", not a link; separators are CSS.',
  ],
  fixtures,
})
