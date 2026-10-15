import './contact-hero.css'

/**
 * ICST Contact hero (Final 1:20321): a photograph under a dark-blue scrim with the page title centred in white capitals. The picture is a
 * client media file (served from the client's media route), decorative: the title carries the meaning. Without an image the band is the
 * solid base colour, so the title stays readable.
 */
export type IntakeHeroProps = {
  eyebrow?: string
  title: string
  image?: { url: string; alt?: string; width: number; height: number; decorative?: boolean }
}

export function IntakeHero({ eyebrow, title, image }: IntakeHeroProps) {
  return (
    <section className="contact-hero" aria-labelledby="contact-hero-title">
      {image ? <img className="contact-hero__img" src={image.url} alt={image.decorative === false ? (image.alt ?? '') : ''} width={image.width} height={image.height} fetchPriority="high" decoding="async" /> : null}
      <div className="contact-hero__scrim" aria-hidden="true" />
      <div className="contact-hero__in">
        {eyebrow ? (
          <span className="contact-hero__eyebrow">
            <span className="contact-hero__dot" aria-hidden="true" />
            {eyebrow}
          </span>
        ) : null}
        <h1 className="contact-hero__title" id="contact-hero-title">{title}</h1>
      </div>
    </section>
  )
}
