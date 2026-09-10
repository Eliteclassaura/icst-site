import type { LinkRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './header.css'

export type HeaderProps = {
  brand: {
    /** Wordmark, e.g. "syed"; `accent` is the highlighted suffix, e.g. ".ai" */
    name: string
    accent?: string
    role?: string
    href: string
    /** Inline SVG path data for the monogram (from brand-settings). Optional. */
    monogramPath?: string
  }
  links: LinkRef[]
  /** Path of the current page, for aria-current */
  currentPath?: string
  cta?: LinkRef
}

export function HeaderBlock({ brand, links, currentPath, cta }: HeaderProps) {
  return (
    <header className="blk-header">
      <a
        className="blk-header__logo"
        href={brand.href}
        aria-label={`${brand.name}${brand.accent ?? ''} — home`}
      >
        {brand.monogramPath && (
          <span className="blk-header__monogram" aria-hidden="true">
            <svg viewBox="0 0 40 40" focusable="false">
              <path
                d={brand.monogramPath}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
        )}
        <span>
          <span className="blk-header__name">
            {brand.name}
            {brand.accent && <span className="blk-header__accent">{brand.accent}</span>}
          </span>
          {brand.role && <span className="blk-header__role">{brand.role}</span>}
        </span>
      </a>
      <nav className="blk-header__links" aria-label="Primary">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            aria-current={currentPath && l.href === currentPath ? 'page' : undefined}
          >
            {l.label}
          </a>
        ))}
      </nav>
      {cta && (
        <a className="ds-btn ds-btn--solid ds-btn--sm blk-header__cta" href={cta.href}>
          {cta.label}
        </a>
      )}
    </header>
  )
}

export const header = defineBlock<HeaderProps>({
  slug: 'header',
  label: 'Header',
  kind: 'chrome',
  Component: HeaderBlock,
  a11y: [
    'One <header> with a labelled <nav aria-label="Primary">; links are real <a> elements (the legacy site used buttons for hash views).',
    'aria-current="page" marks the current route; the underline is a second cue, not the only one.',
    'The logo link has an explicit aria-label because the wordmark is split across spans.',
    'The nav scrolls horizontally on narrow viewports instead of hiding items behind a JS menu, so it works without JavaScript; a disclosure menu is a Release 2 option.',
  ],
  fixtures,
})
