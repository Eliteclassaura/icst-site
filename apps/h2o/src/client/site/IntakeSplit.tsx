import type { ReactNode } from 'react'
import './intake-split.css'

/**
 * ICST native intake skin (WP-27): the Contact page's two-column section. The LEFT column is a card around the native quote form (the
 * intake engine, passed in as `form`); the RIGHT column is a card with the hotline and the office, read from the client manifest through the
 * page (never typed in page content). Page text (title, lede, labels) comes from the page record. On a phone the columns stack: the form first,
 * then the contact card. No JavaScript here: the form is a client component the page hands in.
 */
export type IntakeContact = {
  phone?: { display: string; tel: string } | null
  address?: { lines: string[]; city: string; region: string; postalCode: string; country: string } | null
}
export type IntakeSplitProps = {
  title: string
  lede?: string
  asideTitle: string
  hotlineLabel: string
  officeLabel: string
}

export function IntakeSplit({ title, lede, asideTitle, hotlineLabel, officeLabel, form, contact }: IntakeSplitProps & { form: ReactNode; contact: IntakeContact }) {
  const a = contact.address
  const tel = contact.phone?.tel
  return (
    <section className="intake" aria-labelledby="intake-title">
      <div className="ds-container intake__grid">
        <div className="intake__card">
          <h2 className="intake__title" id="intake-title">{title}</h2>
          {lede ? <p className="intake__lede">{lede}</p> : null}
          <div className="intake__form">{form}</div>
        </div>
        <aside className="intake__aside" aria-labelledby="intake-aside-title">
          <h2 className="intake__aside-title" id="intake-aside-title">{asideTitle}</h2>
          {contact.phone ? (
            <div className="intake__fact">
              <span className="intake__icon" aria-hidden="true">✆</span>
              <div>
                <strong>{hotlineLabel}</strong>
                <a href={tel?.startsWith('tel:') ? tel : `tel:${tel}`}>{contact.phone.display}</a>
              </div>
            </div>
          ) : null}
          {a ? (
            <div className="intake__fact">
              <span className="intake__icon" aria-hidden="true">⌖</span>
              <div>
                <strong>{officeLabel}</strong>
                <address>
                  {a.lines.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                  <span>{`${a.city}${a.postalCode ? ` ${a.postalCode}` : ''}`}</span>
                  <span>{a.country}</span>
                </address>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
