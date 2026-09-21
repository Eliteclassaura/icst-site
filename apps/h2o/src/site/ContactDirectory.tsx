import { contactOffices } from './contact'

export const ContactDirectory = ({ variant = 'page' }: { variant?: 'footer' | 'page' }) => (
  <section className={`contact-directory contact-directory--${variant}`}>
    <h2>{variant === 'footer' ? 'Offices' : 'Contact offices'}</h2>
    <div className="contact-directory-list">
      {contactOffices.map((office) => (
        <address className="contact-office" key={office.officeKey}>
          <strong>{office.displayLabel}</strong>
          {office.company === undefined ? null : <span>{office.company}</span>}
          {office.addressLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
          {office.city === '' ? null : (
            <span>
              {office.city}{office.region === '' ? '' : `, ${office.region}`} {office.postalCode}
            </span>
          )}
          {office.addressLines.length === 0 ? null : <span>{office.countryName}</span>}
          <a href={office.telephoneHref}>{office.telephoneDisplay}</a>
        </address>
      ))}
    </div>
  </section>
)
