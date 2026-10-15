import type { LinkRef } from '../types'
import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './footer.css'

export type FooterProps = {
  columns: Array<{ heading: string; links: LinkRef[] }>
  offices?: Array<{ city: string; region: string; hours: string }>
  copyrightHolder: string
  /** The office contact (address lines and a tel: phone), read from the client manifest by the route; absent = not shown. */
  contact?: { lines: string[]; phone?: { display: string; tel: string } }
  /** Fixed year for deterministic fixtures/tests; production omits it and the render year is used. */
  year?: number
}

export function FooterBlock({ columns, offices, copyrightHolder, contact, year }: FooterProps) {
  const y = year ?? new Date().getFullYear()
  return (
    <footer className="blk-footer">
      <div className="ds-container blk-footer__in">
        <nav className="blk-footer__grid" aria-label="Footer">
          {columns.map((c) => (
            <div key={c.heading} className="blk-footer__col">
              <p className="blk-footer__h">{c.heading}</p>
              {c.links.map((l) => (
                <a
                  key={l.href + l.label}
                  href={l.href}
                  rel={l.external ? 'noopener noreferrer me' : undefined}
                  target={l.external ? '_blank' : undefined}
                >
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        {offices && offices.length > 0 && (
          <div className="blk-footer__offices">
            <p className="blk-footer__h">Offices</p>
            <ul className="blk-footer__office-list" role="list">
              {offices.map((o) => (
                <li key={o.city} className="blk-footer__office">
                  <span className="blk-footer__city">{o.city}</span>
                  <span className="blk-footer__region">{o.region}</span>
                  <span className="blk-footer__hours">{o.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {contact && contact.lines.length > 0 && (
          <div className="blk-footer__contact">
            <p className="blk-footer__h">Contact</p>
            <address className="blk-footer__address">
              {contact.lines.map((l, i) => (
                <span key={i} className="blk-footer__address-line">
                  {l}
                </span>
              ))}
            </address>
            {contact.phone && (
              <a className="blk-footer__phone" href={contact.phone.tel.startsWith('tel:') ? contact.phone.tel : `tel:${contact.phone.tel}`}>
                {contact.phone.display}
              </a>
            )}
          </div>
        )}
        <div className="blk-footer__btm">
          <p className="t-cap blk-footer__copy">
            © {y} {copyrightHolder}
          </p>
        </div>
      </div>
    </footer>
  )
}

export const footer = defineBlock<FooterProps>({
  slug: 'footer',
  label: 'Footer',
  kind: 'chrome',
  Component: FooterBlock,
  a11y: [
    'Link columns live in one <nav aria-label="Footer"> so the primary nav and footer nav are distinguishable by name.',
    'Column headings are <p>, not headings — the footer is not part of the document outline.',
    'Offices are a real list; hours are text, not an icon.',
    'The copyright year is computed at render, never typed (ADR-023 §7).',
  ],
  fixtures,
})
