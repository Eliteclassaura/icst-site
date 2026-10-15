import { defineBlock } from '../types'
import { fixtures } from './fixture'
import './phone-cta.css'

/** A public phone number from the client manifest (`client().offices[].phones[]`), passed in by the render context. */
export type PhoneRef = { display: string; tel: string }

export type PhoneCtaProps = {
  eyebrow?: string
  title: string
  text?: string
  /** Supplied by the render context, never by the page record. */
  phone?: PhoneRef | null
}

/**
 * Call-to-phone band. The number is never typed in page content: it comes from the render context
 * (the client manifest), and the block renders nothing when no number is supplied (fail closed).
 */
export function PhoneCtaBlock({ eyebrow, title, text, phone }: PhoneCtaProps) {
  if (!phone?.tel || !phone.display) return null
  const href = phone.tel.startsWith('tel:') ? phone.tel : `tel:${phone.tel}`
  return (
    <section className="blk-phone" aria-label={eyebrow ?? 'Call us'}>
      {eyebrow && <p className="blk-phone__eyebrow">{eyebrow}</p>}
      <h2 className="blk-phone__title">{title}</h2>
      {text && <p className="blk-phone__text">{text}</p>}
      <a className="blk-phone__link" href={href}>
        <span className="blk-phone__label">Call</span> {phone.display}
      </a>
    </section>
  )
}

export const phoneCta = defineBlock<PhoneCtaProps>({
  slug: 'phoneCta',
  label: 'Phone call-to-action',
  kind: 'layout',
  Component: PhoneCtaBlock,
  fixtures,
  a11y: [
    'The number is a real tel: link with its visible text; the section is labelled by its eyebrow or "Call us".',
    'The number comes from the client manifest through the render context; the block renders nothing without one.',
    'No JavaScript; no dark styles.',
  ],
})
